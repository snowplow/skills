#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "httpx>=0.27",
#     "numpy>=1.26",
#     "pandas>=2.2",
#     "scikit-learn>=1.4",
#     "snowplow-signals>=0.4.9",
# ]
# ///
"""Evaluate a decision model call (such as a Jev call) on past traffic, before it goes live.

Each step is a subcommand that reads and writes files in a working directory:

  call-from-attribute  turn a Signals agentic attribute into call.json + anchors.json
  request              anchors + context + outcomes -> a Signals dataset request
  variant-request      the same anchors as a finished run, with different context
  dataset              submit a request to Signals, wait, download the rows
  render               dataset rows -> the states the model receives (built in, or your own builder)
  ask                  states -> answers to the call's questions (Jev, or any command), cached
  check                answers -> label-free checks, outcome checks, variant comparisons
  history              every run so far, version by version, from the runs ledger
  judge                sample answers for an LLM judge to label, then score agreement

dataset, render, ask and check append what they did to runs.jsonl (--ledger), with hashes of the
call and the state builder and a copy of each under versions/, so any answers file can be traced
back to what produced it.

call.json is the call being evaluated: {"model": "jev", "questions": {...}} with the questions
exactly as the application sends them.

Signals credentials come from the environment: SIGNALS_API_URL plus either
SIGNALS_SANDBOX_TOKEN, or SIGNALS_API_KEY, SIGNALS_API_KEY_ID and SIGNALS_ORG_ID.
Jev: AI_GATEWAY_API_KEY (Vercel AI Gateway) or TYPESAFE_API_KEY.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import math
import os
import random
import re
import shlex
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Runs ledger


def _sha(data: str | bytes) -> str:
    return hashlib.sha256(data.encode() if isinstance(data, str) else data).hexdigest()[:12]


def _keep_version(ledger: Path, path: Path) -> str:
    """Hash a call or state builder file and keep a copy under versions/, so an edit made in
    place later does not lose the version earlier answers came from."""
    data = path.read_bytes()
    digest = _sha(data)
    copy = ledger.parent / "versions" / f"{path.stem}.{digest}{path.suffix}"
    if not copy.exists():
        copy.parent.mkdir(parents=True, exist_ok=True)
        copy.write_bytes(data)
    return digest


def _record(args, step: str, **entry):
    ledger = Path(args.ledger)
    ledger.parent.mkdir(parents=True, exist_ok=True)
    with ledger.open("a") as f:
        f.write(json.dumps({"at": datetime.now().isoformat(timespec="seconds"), "step": step, **entry}, default=str) + "\n")


def _read_ledger(path) -> list[dict]:
    path = Path(path)
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


def _latest(entries: list[dict], step: str, key: str) -> dict[str, dict]:
    """The latest entry of a step for each value of `key`, such as the last ask that wrote a file."""
    found = {}
    for e in entries:
        if e["step"] == step:
            found[e[key]] = e
    return found


# ---------------------------------------------------------------------------
# Signals API


class SignalsClient:
    """Calls the Signals API. Authentication is the Signals SDK's; requests get a longer
    timeout than the SDK's 30 seconds, since submitting a run checks tables in the warehouse."""

    def __init__(self):
        from snowplow_signals.api_client import ApiClient

        url = os.environ.get("SIGNALS_API_URL")
        if not url:
            sys.exit("Set SIGNALS_API_URL (and credentials) to call Signals.")
        if os.environ.get("SIGNALS_SANDBOX_TOKEN"):
            self.auth = ApiClient(api_url=url, auth_mode="sandbox", sandbox_token=os.environ["SIGNALS_SANDBOX_TOKEN"])
        else:
            self.auth = ApiClient(
                api_url=url,
                api_key=os.environ.get("SIGNALS_API_KEY"),
                api_key_id=os.environ.get("SIGNALS_API_KEY_ID"),
                org_id=os.environ.get("SIGNALS_ORG_ID"),
            )

    def request(self, method: str, endpoint: str, params: dict | None = None, data: dict | None = None):
        self.auth.token = self.auth._check_token(self.auth.token)
        response = httpx.request(
            method,
            f"{self.auth.api_url}/api/v1/{endpoint}",
            headers=self.auth._get_headers(self.auth.token),
            params=params,
            json=data,
            timeout=300,
        )
        if response.status_code >= 400:
            sys.exit(f"Signals returned {response.status_code} for {method} {endpoint}: {response.text[:1000]}")
        return response.json()


# Server-managed fields on registry responses that a dataset request does not accept.
RESPONSE_ONLY_FIELDS = {
    "is_published", "has_published_version", "created_at", "updated_at", "fields_hash", "feast_name", "full_name",
}


def _definition(obj: dict) -> dict:
    return {k: v for k, v in obj.items() if k not in RESPONSE_ONLY_FIELDS and v is not None}


def _read_definitions(files: list[str]) -> list[dict]:
    found = []
    for path in files:
        data = json.loads(Path(path).read_text())
        found.extend(data if isinstance(data, list) else [data])
    return found


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9_]", "_", name.lower())


# ---------------------------------------------------------------------------
# The call being evaluated


def load_call(path) -> dict:
    call = json.loads(Path(path).read_text())
    for name, question in call["questions"].items():
        if question["type"] == "noul":  # TypeSafe's name for a yes/no question
            question["type"] = "boolean"
        if question["type"] not in ("choice", "boolean"):
            print(f"Question '{name}' is a {question['type']} question; it will be asked but not checked.")
    return call


def cmd_call_from_attribute(args):
    """An agentic attribute as call.json (its question) and anchors.json (its triggers)."""
    attribute = SignalsClient().request("GET", f"registry/agentic_attributes/{args.name}")
    if attribute["output_type"] == "enum":
        question = {"type": "choice", "instructions": attribute["goal"],
                    "criteria": {v["name"]: v["description"] for v in attribute["values"]}}
    elif attribute["output_type"] == "boolean":
        question = {"type": "boolean", "instructions": attribute["goal"],
                    "criteria": {"true": "Yes.", "false": "No."}}
    else:
        sys.exit("Only enum and boolean agentic attributes can be evaluated with these checks.")
    Path(args.out_call).write_text(json.dumps({"model": "jev", "questions": {attribute["name"]: question}}, indent=2) + "\n")
    anchors = {"mode": "trigger", "triggers": attribute["triggers"], "evaluation_policy": attribute["evaluation_policy"]}
    Path(args.out_anchors).write_text(json.dumps(anchors, indent=2) + "\n")
    print(f"Wrote {args.out_call} and {args.out_anchors}. Agentic contexts used: {attribute['contexts']}. "
          "For boolean questions, describe the true and false answers in call.json.")


# ---------------------------------------------------------------------------
# Datasets


def cmd_request(args):
    client = SignalsClient() if (args.service or args.groups or args.agentic_contexts) else None
    groups = _read_definitions(args.groups_file or [])
    names = list(args.groups or [])
    if args.service:
        service = client.request("GET", f"registry/services/{args.service}")
        for ref in service["attribute_groups"]:
            groups.append(_definition(client.request(
                "GET", f"registry/attribute_groups/{ref['name']}/versions/{ref['version']}")))
    for name in names:
        groups.append(_definition(client.request("GET", f"registry/attribute_groups/{name}")))
    # The registry still calls agentic context definitions event logs.
    contexts = _read_definitions(args.agentic_contexts_file or [])
    for name in args.agentic_contexts or []:
        contexts.append(_definition(client.request("GET", f"registry/event_logs/{name}")))

    anchors = json.loads(Path(args.anchors).read_text())
    slug = _slug(args.name)
    if anchors["mode"] in ("event", "trigger"):
        anchors["training_span"] = {"start_time": args.start, "end_time": args.end}
        if args.sample:
            anchors["sample"] = {"max_sessions": args.sample, "seed": args.seed}
        anchors["output"] = {"table": f"{slug}_anchors"}
    request = {
        "anchors": anchors,
        "attributes": {"table_prefix": f"{slug}_attributes", "attribute_groups": groups},
        "agentic_contexts": contexts,
        "outcomes": json.loads(Path(args.outcomes).read_text()) if args.outcomes else [],
        "dataset": {"table": f"{slug}_dataset"},
    }
    Path(args.out).write_text(json.dumps(request, indent=2) + "\n")
    print(f"Wrote {args.out}: {anchors['mode']} anchors, {len(groups)} attribute groups, {len(contexts)} agentic contexts, "
          f"{len(request['outcomes'])} outcomes. Review it before running.")


def cmd_variant_request(args):
    """Same anchors as a finished run, different context: only attributes and agentic contexts are rebuilt."""
    base = json.loads((Path(args.base) / "run.json").read_text())
    request = json.loads(Path(args.request).read_text())
    slug = _slug(args.name)
    base_anchors = base["request"]["anchors"]
    request["anchors"] = {"mode": "user_supplied", "source": base["anchors_table"], "has_label": False}
    if base_anchors.get("mode") in ("trigger", "event"):
        print("Note: the base run's anchor-event setting does not carry over; user-supplied anchors exclude the "
              "anchor event from context.")
    request["attributes"]["table_prefix"] = f"{slug}_attributes"
    request["dataset"] = {"table": f"{slug}_dataset"}
    Path(args.out).write_text(json.dumps(request, indent=2) + "\n")
    print(f"Wrote {args.out}: anchors from {base['anchors_table']['table']}")


def _decode(value):
    # Snowflake VARIANT values (arrays, objects, first/last) come back JSON-encoded.
    if isinstance(value, str) and value[:1] in '[{"':
        try:
            return json.loads(value)
        except ValueError:
            return value
    return value


def cmd_dataset(args):
    client = SignalsClient()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    request = json.loads(Path(args.request).read_text())
    started = time.time()
    run = client.request("POST", "datasets/runs", data=request)
    print(f"Submitted run {run['id']} -> {run['dataset']['table']}")
    while True:
        status = client.request("GET", f"datasets/runs/{run['id']}")
        if status["status"] != "pending":
            break
        time.sleep(args.poll_seconds)
    if status["status"] != "success":
        sys.exit(f"Run failed: {status.get('error')}")
    preview = client.request("GET", f"datasets/runs/{run['id']}/preview", params={"limit": args.limit})
    columns = [c.lower() for c in preview["columns"]]
    rows = [{c: _decode(v) for c, v in zip(columns, values)} for values in preview["data"]]
    with (out / "rows.jsonl").open("w") as f:
        for row in rows:
            f.write(json.dumps(row, default=str) + "\n")
    if request["anchors"]["mode"] == "user_supplied":
        anchors_table = request["anchors"]["source"]
    else:
        anchors_table = run["dataset"] | {"table": request["anchors"]["output"]["table"]}
    meta = {
        "run_id": run["id"],
        "dataset_table": run["dataset"],
        "anchors_table": anchors_table,
        "request": request,
        "rows": len(rows),
        "truncated": len(rows) >= args.limit,
        "seconds": round(time.time() - started, 1),
    }
    (out / "run.json").write_text(json.dumps(meta, indent=2) + "\n")
    _record(args, "dataset", dataset=str(out), run_id=run["id"], anchors_table=anchors_table,
            dataset_table=run["dataset"], rows=len(rows), truncated=meta["truncated"],
            request_sha=_sha(json.dumps(request, sort_keys=True)))
    print(f"{len(rows)} rows in {meta['seconds']}s -> {out / 'rows.jsonl'}"
          + (" (truncated: raise --limit or sample fewer sessions)" if meta["truncated"] else ""))


def load_dataset(path) -> tuple[pd.DataFrame, dict]:
    path = Path(path)
    meta = json.loads((path / "run.json").read_text())
    rows = pd.read_json(path / "rows.jsonl", lines=True, dtype=False)
    rows["anchor_ts"] = pd.to_datetime(rows["anchor_ts"])
    keys = sorted({g["attribute_key"]["name"] for g in meta["request"]["attributes"]["attribute_groups"]}
                  & set(rows.columns))
    rows["row_id"] = rows[keys].astype(str).agg("|".join, axis=1) + "|" + rows["anchor_ts"].astype(str)
    return rows, meta


def column_roles(meta: dict) -> dict:
    request = meta["request"]
    return {
        "attributes": [a["name"] for g in request["attributes"]["attribute_groups"] for a in g.get("attributes", [])],
        "agentic_contexts": [e["name"] for e in request.get("agentic_contexts", [])],
        "outcomes": [o["name"] for o in request.get("outcomes", [])],
    }


# ---------------------------------------------------------------------------
# States


def _clean(value):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, list) and not value:
        return None
    return value


def _shape_entries(entries: list[dict], anchor: datetime, collapse_repeats: bool) -> list[dict]:
    shaped = []
    for entry in entries:
        item = {"event": entry.get("action") or entry.get("event_name")}
        ts = entry.get("derived_tstamp")
        if ts:
            seen = datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
            item["seconds_ago"] = max(0, int((anchor - seen).total_seconds()))
        for key, value in entry.items():
            if key not in {"event_id", "event_name", "derived_tstamp", "action", "page_urlpath"}:
                item[key] = value
        if entry.get("page_urlpath"):
            item["page"] = entry["page_urlpath"]
        comparable = {k: v for k, v in item.items() if k != "seconds_ago"}
        if collapse_repeats and shaped and {k: v for k, v in shaped[-1].items() if k != "seconds_ago"} == comparable:
            continue
        shaped.append(item)
    return shaped


def _builtin_state(row: dict, args, attributes: list[str], contexts: list[str]) -> dict:
    profile = {a: _clean(row.get(a)) for a in attributes}
    state = {"profile": {k: v for k, v in profile.items() if v is not None}}
    for name in contexts:
        entries = row.get(name) or []
        if args.style == "shaped":
            entries = _shape_entries(entries, row["anchor_ts"].to_pydatetime(), args.collapse_repeats)
        state[name] = entries
    return state


def cmd_render(args):
    rows, meta = load_dataset(args.dataset)
    roles = column_roles(meta)
    if args.command:
        # Your own state builder: dataset rows as JSONL on stdin, {"row_id", "state"} JSONL on stdout.
        payload = rows.assign(anchor_ts=rows.anchor_ts.astype(str)).to_json(orient="records", lines=True)
        result = subprocess.run(shlex.split(args.command), input=payload, capture_output=True, text=True)
        if result.returncode != 0:
            sys.exit(f"State builder failed:\n{result.stderr[-2000:]}")
        states = {s["row_id"]: s["state"] for s in map(json.loads, result.stdout.splitlines())}
        missing = set(rows.row_id) - set(states)
        if missing:
            sys.exit(f"State builder returned no state for {len(missing)} rows, e.g. {sorted(missing)[:3]}")
    else:
        attributes = args.attributes.split(",") if args.attributes else roles["attributes"]
        contexts = [] if args.no_agentic_contexts else (
            args.agentic_contexts.split(",") if args.agentic_contexts else roles["agentic_contexts"])
        states = {row["row_id"]: _builtin_state(row, args, attributes, contexts)
                  for row in (r._asdict() for r in rows.itertuples(index=False))}
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    sizes = []
    with out.open("w") as f:
        for row_id in rows.row_id:
            sizes.append(len(json.dumps(states[row_id])))
            f.write(json.dumps({"row_id": row_id, "variant": args.variant, "state": states[row_id]}) + "\n")
    if args.command:
        # The builder's own files (the script, not the interpreter) are the version that matters.
        files = [Path(t) for t in shlex.split(args.command) if Path(t).is_file()]
        builder = {"command": args.command, "files": {str(f): _keep_version(Path(args.ledger), f) for f in files}}
    else:
        builder = {"builtin": args.style, "attributes": args.attributes, "agentic_contexts": args.agentic_contexts,
                   "no_agentic_contexts": args.no_agentic_contexts, "collapse_repeats": args.collapse_repeats}
    _record(args, "render", states=str(out), states_sha=_sha(out.read_bytes()), dataset=str(args.dataset),
            run_id=meta["run_id"], variant=args.variant, builder=builder, median_chars=int(np.median(sizes)))
    print(f"{len(sizes)} states -> {out}; median {int(np.median(sizes))} characters, max {max(sizes)}")


# ---------------------------------------------------------------------------
# Models

JEV_ROUTES = {
    "gateway": {"url": "https://ai-gateway.vercel.sh/v1/evaluate", "model": "typesafe-ai/jev", "key": "AI_GATEWAY_API_KEY"},
    "typesafe": {"url": "https://api.typesafe.ai/v1/systemone", "model": "jev-latest", "key": "TYPESAFE_API_KEY"},
}
JEV_PRICE_PER_M_INPUT_TOKENS = 0.042


def _normalize_answer(answer: dict) -> dict:
    if answer["type"] in ("boolean", "noul"):
        p = answer.get("probability", answer.get("noul"))
        return {"answer": p >= 0.5, "probability_true": p, "confidence": max(p, 1 - p)}
    if answer["type"] == "choice":
        return {"answer": answer["choice"], "probabilities": answer["probabilities"], "confidence": answer["confidence"]}
    return {"answer": answer.get("score", answer), "raw": answer}


def _normalize_jev(route: str, body: dict) -> dict:
    tokens = body["usage"]["inputTokens"] if route == "gateway" else body["usage"]["input_tokens"]
    cost = tokens / 1e6 * JEV_PRICE_PER_M_INPUT_TOKENS
    if route == "gateway":
        cost = float(body.get("providerMetadata", {}).get("gateway", {}).get("cost", 0)) or cost
    return {"model": body.get("model"), "input_tokens": tokens, "cost_usd": cost,
            "answers": {name: _normalize_answer(a) for name, a in body["answers"].items()}}


class AnswerCache:
    def __init__(self, path: Path):
        self.path = path
        self.entries = {}
        if path.exists():
            for line in path.read_text().splitlines():
                entry = json.loads(line)
                self.entries[entry["key"]] = entry["response"]

    @staticmethod
    def key(*parts) -> str:
        return hashlib.sha256(json.dumps(parts, sort_keys=True).encode()).hexdigest()

    def put(self, key: str, response: dict):
        self.entries[key] = response
        with self.path.open("a") as f:
            f.write(json.dumps({"key": key, "response": response}) + "\n")


async def _ask_jev(items, questions, route, cache, concurrency):
    config = JEV_ROUTES[route]
    api_key = os.environ.get(config["key"])
    if not api_key:
        sys.exit(f"Set {config['key']} to call Jev.")
    wire = {name: dict(q, type="noul") if route == "typesafe" and q["type"] == "boolean" else q
            for name, q in questions.items()}
    semaphore = asyncio.Semaphore(concurrency)

    async def one(http, key, item):
        if key in cache.entries:
            return cache.entries[key]
        body = {"state": item["state"], "model": config["model"], "questions": wire}
        async with semaphore:
            for attempt in range(8):
                started = time.perf_counter()
                try:
                    response = await http.post(config["url"], json=body)
                except httpx.TransportError:
                    await asyncio.sleep(min(30, 2 ** attempt) + random.random())
                    continue
                if response.status_code in (429, 529) or response.status_code >= 500:
                    await asyncio.sleep(min(30, 2 ** attempt) + random.random())
                    continue
                if response.status_code >= 400:
                    raise RuntimeError(f"Jev returned {response.status_code}: {response.text[:300]}")
                result = _normalize_jev(route, response.json())
                result["latency_s"] = round(time.perf_counter() - started, 3)
                cache.put(key, result)
                return result
        raise RuntimeError("Jev kept failing")

    # Identical states are asked once. Jev can answer the same input differently, and the cache
    # keeps one answer per state, so asking twice would make a cached rerun disagree with this one.
    keys = [cache.key("jev", route, config["model"], item["state"], questions) for item in items]
    unique = dict(zip(keys, items))
    async with httpx.AsyncClient(headers={"Authorization": f"Bearer {api_key}"}, timeout=90) as http:
        answers = dict(zip(unique, await asyncio.gather(*(one(http, k, i) for k, i in unique.items()))))
    return [answers[k] for k in keys]


def _ask_command(items, questions, command, cache):
    """Your model: JSONL {id, state, questions} on stdin; JSONL {id, answers: {question: {answer,
    confidence?, probabilities?, probability_true?}}, input_tokens?, cost_usd?} on stdout."""
    keys = [cache.key("command", command, item["state"], questions) for item in items]
    todo = list({k: item for k, item in zip(keys, items) if k not in cache.entries}.items())
    if todo:
        payload = "".join(json.dumps({"id": k, "state": item["state"], "questions": questions}) + "\n"
                          for k, item in todo)
        result = subprocess.run(shlex.split(command), input=payload, capture_output=True, text=True)
        if result.returncode != 0:
            sys.exit(f"Model command failed:\n{result.stderr[-2000:]}")
        for line in result.stdout.splitlines():
            response = json.loads(line)
            cache.put(response.pop("id"), response)
    return [cache.entries[k] for k in keys]


def cmd_ask(args):
    call = load_call(args.call)
    items = [json.loads(line) for line in Path(args.states).read_text().splitlines()]
    cache = AnswerCache(Path(args.cache))
    cached_before = set(cache.entries)
    model = args.model or call.get("model", "jev")
    if model.startswith("jev"):
        route = model.split(":", 1)[1] if ":" in model else (
            "gateway" if os.environ.get("AI_GATEWAY_API_KEY") else "typesafe")
        resolved = f"jev:{route}"
        keys = [cache.key("jev", route, JEV_ROUTES[route]["model"], i["state"], call["questions"]) for i in items]
        new_calls = len({k for k in keys if k not in cache.entries})
        responses = asyncio.run(_ask_jev(items, call["questions"], route, cache, args.concurrency))
    elif model.startswith("command:"):
        resolved = model
        keys = [cache.key("command", model.split(":", 1)[1], i["state"], call["questions"]) for i in items]
        new_calls = len({k for k in keys if k not in cache.entries})
        responses = _ask_command(items, call["questions"], model.split(":", 1)[1], cache)
    else:
        sys.exit("The model must be jev, jev:gateway, jev:typesafe or command:<your command>")
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with Path(args.out).open("w") as f:
        for item, response in zip(items, responses):
            f.write(json.dumps({"row_id": item["row_id"], "variant": item["variant"], **response}) + "\n")
    cost = sum(r.get("cost_usd") or 0 for r in responses)
    spent = sum((r.get("cost_usd") or 0) for k, r in dict(zip(keys, responses)).items() if k not in cached_before)
    states_path = Path(args.states)
    _record(args, "ask", name=args.name or Path(args.out).stem, note=args.note, answers=str(args.out),
            states=str(states_path), states_sha=_sha(states_path.read_bytes()),
            variants=sorted({i["variant"] for i in items}), model=resolved, call=str(args.call),
            call_sha=_keep_version(Path(args.ledger), Path(args.call)), questions=call["questions"],
            calls=len(responses), new_calls=new_calls, cost_usd=round(cost, 4), spent_usd=round(spent, 4))
    print(f"{len(responses)} calls ({new_calls} new) -> {args.out}" + (f"; cost ${cost:.4f}" if cost else ""))


# ---------------------------------------------------------------------------
# Checks

CONFIDENT_AT = 0.6
CLOSE_CALL_GAP = 0.2


def _auc(y, p) -> float | None:
    from sklearn.metrics import roc_auc_score

    y = np.asarray(y, dtype=float)
    return float(roc_auc_score(y, p)) if 0 < y.sum() < len(y) else None


def _ece(p, y, bins=10) -> float:
    frame = pd.DataFrame({"p": p, "y": np.asarray(y, dtype=float)})
    frame["bin"] = np.minimum((frame.p * bins).astype(int), bins - 1)
    return float(sum(len(g) / len(frame) * abs(g.p.mean() - g.y.mean()) for _, g in frame.groupby("bin")))


def _table(frame: pd.DataFrame) -> str:
    header = "| " + " | ".join(map(str, frame.columns)) + " |"
    rule = "|" + "---|" * len(frame.columns)
    body = ["| " + " | ".join("" if pd.isna(v) else str(v) for v in row) + " |" for row in frame.itertuples(index=False)]
    return "\n".join([header, rule, *body])


def _question_frame(responses: pd.DataFrame, question: str) -> pd.DataFrame:
    answers = responses.answers.map(lambda a: a.get(question, {}))
    frame = responses.drop(columns=["answers"]).copy()
    for field in ("answer", "confidence", "probabilities", "probability_true"):
        frame[field] = answers.map(lambda a, f=field: a.get(f))
    return frame


def _paired_auc_delta(a, b, outcome, n, seed):
    y = a[outcome].astype(bool).to_numpy()
    pa, pb = a.probability_true.to_numpy(float), b.probability_true.to_numpy(float)
    if _auc(y, pa) is None or _auc(y, pb) is None:
        return None, None, None
    rng = np.random.default_rng(seed)
    deltas = []
    for _ in range(n):
        idx = rng.integers(0, len(y), len(y))
        da, db = _auc(y[idx], pa[idx]), _auc(y[idx], pb[idx])
        if da is not None and db is not None:
            deltas.append(db - da)
    return _auc(y, pb) - _auc(y, pa), float(np.percentile(deltas, 2.5)), float(np.percentile(deltas, 97.5))


def _check_question(name, qtype, frame, roles, outcomes, args) -> tuple[list[str], dict]:
    lines = [f"## {name} ({qtype})", ""]
    summary, by_answer = [], []
    for variant, g in frame.groupby("variant", sort=False):
        s = {"variant": variant, "calls": len(g), "confident_share": round(float((g.confidence >= CONFIDENT_AT).mean()), 3)}
        if qtype == "choice":
            gaps = g.probabilities.map(lambda p: (lambda v: v[0] - v[1])(sorted(p.values(), reverse=True)))
            s["close_call_share"] = round(float((gaps < CLOSE_CALL_GAP).mean()), 3)
        if qtype == "boolean":
            s["mean_p_true"] = round(float(g.probability_true.mean()), 3)
            for outcome in outcomes:
                y = g[outcome].astype(bool)
                auc = _auc(y, g.probability_true)
                s[f"{outcome}_rate"] = round(float(y.mean()), 3)
                s[f"{outcome}_auc"] = round(auc, 3) if auc is not None else None
                s[f"{outcome}_ece"] = round(_ece(g.probability_true, y), 3)
        summary.append(s)
        for answer, a in g.groupby("answer"):
            row = {"variant": variant, "answer": answer, "share": round(len(a) / len(g), 3),
                   "median_confidence": round(float(a.confidence.median()), 2)}
            for outcome in outcomes:
                base = g[outcome].astype(bool).mean()
                rate = a[outcome].astype(bool).mean()
                row[f"{outcome}_rate"] = round(float(rate), 3)
                row[f"{outcome}_lift"] = round(float(rate / base), 2) if base else None
            numeric = [c for c in roles["attributes"] if c in a and pd.api.types.is_numeric_dtype(g[c])]
            for col in numeric[: args.fingerprint_columns]:
                row[f"mean_{col}"] = round(float(a[col].fillna(0).mean()), 2)
            by_answer.append(row)
    # The same numbers, structured, for the runs ledger and `history`.
    structured = {
        s["variant"]: {**{k: v for k, v in s.items() if k != "variant"},
                       "by_answer": {str(r["answer"]): {k: v for k, v in r.items() if k not in ("variant", "answer")}
                                     for r in by_answer if r["variant"] == s["variant"]}}
        for s in summary
    }
    lines += [_table(pd.DataFrame(summary)), "", "By answer: share, the model's confidence, what those moments led to "
              "against the average (lift), and what their attributes looked like.", "",
              _table(pd.DataFrame(by_answer)), ""]

    variants = list(frame.variant.unique())
    base = frame[frame.variant == variants[0]].set_index("row_id")
    for other in variants[1:]:
        o = frame[frame.variant == other].set_index("row_id")
        shared = base.index.intersection(o.index)
        agree = float((base.loc[shared, "answer"] == o.loc[shared, "answer"]).mean())
        lines += [f"**{variants[0]} vs {other}**: {len(shared)} shared anchors, same answer on {agree:.1%}.", ""]
        if qtype == "boolean":
            for outcome in outcomes:
                delta, low, high = _paired_auc_delta(base.loc[shared], o.loc[shared], outcome, args.bootstrap, args.seed)
                if delta is not None:
                    lines.append(f"- {outcome} AUC, {other} minus {variants[0]}: {delta:+.3f} "
                                 f"(95% bootstrap interval {low:+.3f} to {high:+.3f})")
            lines.append("")
        else:
            crosstab = pd.crosstab(base.loc[shared, "answer"].rename(variants[0]), o.loc[shared, "answer"])
            lines += [_table(crosstab.reset_index()), ""]
    return lines, structured


def cmd_check(args):
    rows, meta = load_dataset(args.dataset)
    roles = column_roles(meta)
    call = load_call(args.call)
    # Each answers file is one run, named as `ask` recorded it. Grouping by run rather than by the
    # states' variant keeps two calls asked on the same states apart.
    asks = _latest(_read_ledger(args.ledger), "ask", "answers")
    labels = [asks.get(str(p), {}).get("name") or Path(p).stem for p in args.answers]
    if len(set(labels)) < len(labels):
        labels = [Path(p).stem for p in args.answers]
    responses = pd.concat([pd.read_json(p, lines=True, dtype=False).assign(variant=label)
                           for p, label in zip(args.answers, labels)], ignore_index=True)
    responses = responses.merge(rows, on="row_id", how="left", validate="many_to_one")
    outcomes = args.outcomes.split(",") if args.outcomes else roles["outcomes"]
    report = [f"# Checks: {', '.join(call['questions'])}", "",
              f"Dataset run `{meta['run_id']}`: {meta['rows']} anchors ({meta['request']['anchors']['mode']} anchors)"
              + (", truncated" if meta.get("truncated") else "") + ".", ""]
    cost = responses.groupby("variant", sort=False).agg(
        calls=("row_id", "size"),
        median_input_tokens=("input_tokens", "median"),
        cost_per_1k_calls_usd=("cost_usd", lambda c: round(c.mean() * 1000, 3)),
    ) if "input_tokens" in responses else None
    if cost is not None:
        report += ["## Cost per variant", "", _table(cost.reset_index()), ""]
    results = {}
    for name, question in call["questions"].items():
        if question["type"] in ("choice", "boolean"):
            lines, results[name] = _check_question(name, question["type"], _question_frame(responses, name), roles, outcomes, args)
            report += lines
    report += ["## Reading these numbers", "",
               "- Outcomes say what happened next, not whether an answer was right. Lift is evidence, not accuracy.",
               "- Confidence is the model's own; check it against outcomes before trusting it.",
               "- A comparison is only a difference if its interval excludes zero.",
               "- One dataset and time span: rerun on another span before generalising.", ""]
    Path(args.out).write_text("\n".join(report))
    _record(args, "check", report=str(args.out), dataset=str(args.dataset), run_id=meta["run_id"],
            runs={label: {"answers": str(p), **{q: r.get(label) for q, r in results.items()}}
                  for p, label in zip(args.answers, labels)})
    print(f"Report -> {args.out}")


# ---------------------------------------------------------------------------
# History


def _changed(prev: dict | None, ask: dict, renders: dict, datasets: dict) -> str:
    """What kind of change a run made against the one before it."""
    if prev is None:
        return "first run"
    parts = []
    if renders.get(ask["states"], {}).get("run_id") != renders.get(prev["states"], {}).get("run_id"):
        parts.append("Signals data")
    if ask["states_sha"] != prev["states_sha"] and not parts:
        parts.append("state")
    if ask["call_sha"] != prev["call_sha"]:
        parts.append("question")
    if ask["model"] != prev["model"]:
        parts.append("model")
    return ", ".join(parts) or "nothing"


def cmd_history(args):
    entries = _read_ledger(args.ledger)
    if not entries:
        sys.exit(f"No runs recorded in {args.ledger} yet.")
    renders, datasets = _latest(entries, "render", "states"), _latest(entries, "dataset", "dataset")
    # One row per answers file, at its latest ask, in the order the runs were first made.
    asks = list(_latest(entries, "ask", "answers").values())
    first = {e["answers"]: i for i, e in reversed(list(enumerate(entries))) if e["step"] == "ask"}
    asks.sort(key=lambda e: first[e["answers"]])
    checks = {}
    for e in entries:
        if e["step"] == "check":
            for label, run in e["runs"].items():
                checks[run["answers"]] = run

    lines = ["# Runs", ""]
    table, prev = [], None
    for n, ask in enumerate(asks, 1):
        render = renders.get(ask["states"], {})
        builder = render.get("builder", {})
        builder_v = ", ".join(f"{Path(f).name}@{h}" for f, h in builder.get("files", {}).items()) or builder.get("builtin", "")
        table.append({"#": n, "run": ask["name"], "changed": _changed(prev, ask, renders, datasets),
                      "note": ask.get("note") or "", "dataset run": (render.get("run_id") or "")[:8],
                      "state builder": builder_v, "call": f"{Path(ask['call']).name}@{ask['call_sha']}",
                      "model": ask["model"], "calls": ask["calls"], "spent_usd": ask["spent_usd"]})
        prev = ask
    lines += [_table(pd.DataFrame(table)), ""]

    questions = [q for q in asks[-1]["questions"] if not args.question or q == args.question]
    for q in questions:
        runs = [(a["name"], (checks.get(a["answers"]) or {}).get(q)) for a in asks]
        if not any(r for _, r in runs):
            lines += [f"## {q}", "", "No checks recorded yet: run `check` on these answers.", ""]
            continue
        answers = list(dict.fromkeys(ans for _, r in runs if r for ans in r["by_answer"]))
        lines += [f"## {q}: median confidence per answer", ""]
        grid = [{"answer": ans, **{name: (r["by_answer"].get(ans, {}).get("median_confidence") if r else None)
                                   for name, r in runs}} for ans in answers]
        overall = {"answer": "_confident share_", **{name: r.get("confident_share") if r else None for name, r in runs}}
        close = {"answer": "_close calls_", **{name: r.get("close_call_share") if r else None for name, r in runs}}
        lines += [_table(pd.DataFrame(grid + [overall] + ([close] if any(close[n] is not None for n, _ in runs) else []))), ""]
        last_name, last = next(((n, r) for n, r in reversed(runs) if r), (None, None))
        rates = sorted({k for v in last["by_answer"].values() for k in v if k.endswith("_rate")})
        if rates:
            lines += [f"## {q}: outcomes per answer in {last_name}", ""]
            lines += [_table(pd.DataFrame([{"answer": ans, "share": v.get("share"), **{k: v.get(k) for k in rates}}
                                           for ans, v in last["by_answer"].items()])), ""]
    text = "\n".join(lines)
    if args.out:
        Path(args.out).write_text(text)
        print(f"History -> {args.out}")
    else:
        print(text)


# ---------------------------------------------------------------------------
# LLM judge


def cmd_judge(args):
    responses = {r["row_id"]: r for r in map(json.loads, Path(args.answers).read_text().splitlines())}
    if args.score:
        items = [json.loads(line) for line in Path(args.score).read_text().splitlines()]
        labelled = [i for i in items if i.get("judge_answer") is not None]
        if not labelled:
            sys.exit("No judge_answer filled in yet.")
        frame = pd.DataFrame([
            {"judge": str(i["judge_answer"]),
             "model": str(responses[i["row_id"]]["answers"][args.question]["answer"]),
             "confidence": responses[i["row_id"]]["answers"][args.question].get("confidence")}
            for i in labelled
        ])
        frame["agree"] = frame.judge == frame.model
        frame["bucket"] = pd.cut(frame.confidence, [0, 0.6, 0.8, 1.0001], labels=["<0.6", "0.6-0.8", ">=0.8"])
        print(f"{len(frame)} judged; agreement {frame.agree.mean():.1%}; "
              f"Cohen's kappa {_cohen_kappa(frame.model, frame.judge):.2f}")
        print(frame.groupby("bucket", observed=True).agree.agg(["mean", "size"]).round(3).to_string())
        return
    states = {s["row_id"]: s for s in map(json.loads, Path(args.states).read_text().splitlines())}
    picked = sorted(responses)
    random.Random(args.seed).shuffle(picked)
    with Path(args.out).open("w") as f:
        for row_id in picked[: args.sample]:
            f.write(json.dumps({"row_id": row_id, "question": args.question, "state": states[row_id]["state"],
                                "judge_answer": None, "judge_reason": None}) + "\n")
    print(f"Wrote {min(args.sample, len(picked))} items to {args.out} (model answers left out). Fill in "
          f"judge_answer and judge_reason, then run: judge --question {args.question} --answers {args.answers} "
          f"--score {args.out}")


def _cohen_kappa(a: pd.Series, b: pd.Series) -> float:
    labels = sorted(set(a) | set(b))
    observed = float((a == b).mean())
    expected = sum(float((a == l).mean()) * float((b == l).mean()) for l in labels)
    return (observed - expected) / (1 - expected) if expected < 1 else 1.0


# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("call-from-attribute", help="turn an agentic attribute into call.json and anchors.json")
    p.add_argument("--name", required=True)
    p.add_argument("--out-call", default="call.json")
    p.add_argument("--out-anchors", default="anchors.json")
    p.set_defaults(func=cmd_call_from_attribute)

    p = sub.add_parser("request", help="build a dataset request")
    p.add_argument("--anchors", required=True, help="anchors JSON: event, trigger or user_supplied mode")
    p.add_argument("--service", help="Signals service whose attribute groups are the context")
    p.add_argument("--groups", nargs="*", help="attribute group names to fetch from the registry")
    p.add_argument("--groups-file", nargs="*", help="attribute group definition files")
    p.add_argument("--agentic-contexts", nargs="*", help="agentic context names to fetch from the registry")
    p.add_argument("--agentic-contexts-file", nargs="*", help="agentic context definition files")
    p.add_argument("--outcomes", help="outcomes JSON file")
    p.add_argument("--start", help="span start (event and trigger anchors)")
    p.add_argument("--end", help="span end (event and trigger anchors)")
    p.add_argument("--sample", type=int, default=2000, help="sessions to use (0 = all)")
    p.add_argument("--seed", default="signals")
    p.add_argument("--name", required=True, help="prefix for the warehouse tables")
    p.add_argument("--out", required=True)
    p.set_defaults(func=cmd_request)

    p = sub.add_parser("variant-request", help="reuse a finished run's anchors with a different context")
    p.add_argument("--base", required=True, help="directory of the finished base run")
    p.add_argument("--request", required=True, help="request with the changed attribute groups / agentic contexts")
    p.add_argument("--name", required=True)
    p.add_argument("--out", required=True)
    p.set_defaults(func=cmd_variant_request)

    p = sub.add_parser("dataset", help="run a dataset request and download the rows")
    p.add_argument("--request", required=True)
    p.add_argument("--out", required=True, help="directory for rows.jsonl and run.json")
    p.add_argument("--limit", type=int, default=10000)
    p.add_argument("--poll-seconds", type=float, default=5)
    p.add_argument("--ledger", default="runs.jsonl", help="runs ledger to append to")
    p.set_defaults(func=cmd_dataset)

    p = sub.add_parser("render", help="turn dataset rows into model states")
    p.add_argument("--dataset", required=True)
    p.add_argument("--variant", required=True, help="name for this context variant")
    p.add_argument("--command", help="your state builder: dataset rows JSONL on stdin, {row_id, state} JSONL out")
    p.add_argument("--style", choices=["signals", "shaped"], default="signals",
                   help="built-in states. signals: attributes and agentic context entries as Signals serves them; "
                        "shaped: relative times and compact entries")
    p.add_argument("--attributes", help="comma-separated attributes to include (default: all)")
    p.add_argument("--agentic-contexts", help="comma-separated agentic contexts to include (default: all)")
    p.add_argument("--no-agentic-contexts", action="store_true")
    p.add_argument("--collapse-repeats", action="store_true", help="drop consecutive identical entries (shaped)")
    p.add_argument("--out", required=True)
    p.add_argument("--ledger", default="runs.jsonl", help="runs ledger to append to")
    p.set_defaults(func=cmd_render)

    p = sub.add_parser("ask", help="ask the call's questions for every state")
    p.add_argument("--states", required=True)
    p.add_argument("--call", required=True, help="call.json: model and questions")
    p.add_argument("--model", help="override call.json's model: jev, jev:gateway, jev:typesafe, command:<cmd>")
    p.add_argument("--cache", default="answers_cache.jsonl")
    p.add_argument("--concurrency", type=int, default=12)
    p.add_argument("--name", help="name for this run in the ledger (default: the answers file name)")
    p.add_argument("--note", help="what this run changed and why, for the ledger")
    p.add_argument("--out", required=True)
    p.add_argument("--ledger", default="runs.jsonl", help="runs ledger to append to")
    p.set_defaults(func=cmd_ask)

    p = sub.add_parser("check", help="label-free and outcome checks, plus variant comparison")
    p.add_argument("--dataset", required=True)
    p.add_argument("--call", required=True)
    p.add_argument("--answers", nargs="+", required=True, help="one answers file per variant")
    p.add_argument("--outcomes", help="comma-separated outcome columns (default: all)")
    p.add_argument("--fingerprint-columns", type=int, default=6)
    p.add_argument("--bootstrap", type=int, default=1000)
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--out", required=True)
    p.add_argument("--ledger", default="runs.jsonl", help="runs ledger to append to")
    p.set_defaults(func=cmd_check)

    p = sub.add_parser("history", help="every run so far, version by version, from the runs ledger")
    p.add_argument("--ledger", default="runs.jsonl")
    p.add_argument("--question", help="only this question (default: all)")
    p.add_argument("--out", help="write markdown here instead of printing it")
    p.set_defaults(func=cmd_history)

    p = sub.add_parser("judge", help="sample answers for an LLM judge, or score its labels")
    p.add_argument("--question", required=True)
    p.add_argument("--answers", required=True)
    p.add_argument("--states")
    p.add_argument("--sample", type=int, default=50)
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--out")
    p.add_argument("--score", help="score a filled-in judge file")
    p.set_defaults(func=cmd_judge)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
