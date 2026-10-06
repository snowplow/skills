---
name: evaluate-decision-context
description: "Evaluate a decision model call (a System One model such as TypeSafe's Jev, or an LLM call) on past Snowplow traffic before it goes live or before changing it: rebuild the moments the application would have made the call, the Signals attributes and event logs it would have sent, and what happened next; ask the model; check the answers; and compare context variants on the same moments. Use when someone wants to test, backtest, replay or tune a Jev call, a decision prompt, an agentic attribute, or the context sent to a decision model. Triggers: evaluate decisions, backtest, replay sessions, offline evaluation, context engineering, Jev, System One, what would the model have said."
compatibility: Needs uv (the script declares its own dependencies), a Signals API with dataset runs on Snowflake, and credentials for the model being evaluated.
---

# Evaluate decision context

You help someone find out how a decision model call behaves on their real traffic, and which context (attributes, event logs, how the state is built) makes its answers better. Signals rebuilds the past; the model answers; you run the checks and explain them honestly.

Start from the call the user already makes. Most have code like this, and that is what's being evaluated:

```python
state = build_state(signals.get_attributes(...), signals.get_event_log("recent_activity", session_id))
answers = jev.evaluate(state=state, questions={"shopping_stage": {...}, "show_discount": {...}})
```

The loop:

1. **Find the call**: its questions, where in the application it's made, and how the state is built.
2. **Build the dataset**: the moments the call would have happened, with attributes and event logs as they stood, and outcome columns.
3. **Render states** the way the application builds them, plus any variants to compare.
4. **Ask the model** for every state, with the questions exactly as the application sends them. Answers are cached.
5. **Check**: label-free checks, outcome checks, optionally an LLM judge on a sample.
6. **Change one thing and rerun on the same moments**, then compare.
7. **Report** the numbers, what they do and don't show, and the versions used.

All steps run through `scripts/decision_eval.py` (run it directly; `uv` installs its dependencies). Work in a directory of the user's choosing and keep every file there: it is the record of the evaluation.

## Before you start

- **Ask before anything that writes or costs money.** A dataset run creates tables in the user's warehouse (named by `--name`) and uses warehouse compute; model calls cost money (Jev is a few cents per 1,000 calls with small states). Say what will be created and roughly what it costs, and wait for a yes.
- **Never publish or change** attribute groups, event logs, services or agentic attributes as part of an evaluation.
- Credentials come from the environment (`SIGNALS_API_URL` plus `SIGNALS_SANDBOX_TOKEN`, or `SIGNALS_API_KEY`, `SIGNALS_API_KEY_ID`, `SIGNALS_ORG_ID`; `AI_GATEWAY_API_KEY` or `TYPESAFE_API_KEY` for Jev). Never print them or write them to files.
- Dataset runs need Snowflake.

## 1. Find the call

Ask the user to point you at the code that makes the call, and read it. You need three things.

**The questions** → `call.json`, copied exactly as the application sends them:

```json
{"model": "jev", "questions": {"shopping_stage": {"type": "choice", "instructions": "...", "criteria": {"browsing": "...", "ready_to_buy": "..."}}}}
```

Choice and yes/no (`boolean`, or TypeSafe's `noul`) questions get full checks; other types are asked but not checked. If the decision is a Signals agentic attribute instead, `decision_eval.py call-from-attribute --name <attribute>` writes `call.json` and `anchors.json` from it.

**When the call happens** → `anchors.json`. In order of preference:

- **Logs of past calls** (session ID and timestamp, ideally the answers too). Load them into a warehouse table with `domain_sessionid` and `anchor_ts` columns and use `{"mode": "user_supplied", "source": {"database": "...", "schema": "...", "table": "..."}, "has_label": false}`. This is the most faithful option, and any extra columns (past answers, request IDs) come through to the dataset.
- **An event in their tracking**, when the application calls the model in response to one (a product page view, an add to cart): `{"mode": "event", "criteria": {...}, "max_per_session": 2, "pick": "random", "include_anchor_event": false}`. Set `include_anchor_event` to true only if the call happens after Signals has processed that event.
- **An attribute condition**, for agentic attributes: `{"mode": "trigger", "triggers": [...], "evaluation_policy": {...}}`.

The moment matters more than people expect: a call made at the first page of a session has little to go on. Discuss it with the user. Examples and details: `references/dataset-request.md`.

**How the state is built** → which Signals data it reads, and a state builder. Note the service or attribute groups and the event logs the code reads, and copy the state-building logic into a small script that reads dataset rows (JSONL on stdin: attribute columns, event log arrays, `row_id`, `anchor_ts`) and prints `{"row_id": ..., "state": ...}` per row. Keep it as close to the application's code as possible; `examples/ga4/build_state.py` shows the shape. If the state uses data Signals doesn't have (the user's own database), tell the user that part won't be in the replay, or bring it in as extra columns on logged anchors.

**What success looks like** → `outcomes.json`: events after the moment that the decision is meant to predict or change ("purchased later in the session", "added to cart within 10 minutes"). Propose them from the user's tracking; they're optional, but without them only label-free checks and the judge are possible.

## 2. Build the dataset

```bash
decision_eval.py request --anchors anchors.json --service shopping --event-logs recent_activity \
  --outcomes outcomes.json --start 2026-01-01T00:00:00Z --end 2026-01-15T00:00:00Z \
  --sample 3000 --seed eval-v1 --name stage_eval --out request.json
decision_eval.py dataset --request request.json --out base
```

- Context comes from a service (`--service`), attribute group names (`--groups`) or files (`--groups-file`, `--event-logs-file`).
- `--sample` uses a deterministic sample of sessions; the same seed and span give the same sessions. The download is capped at 10,000 rows.
- Show the user `request.json` before running it. `base/run.json` records the run; `base/rows.jsonl` has one row per moment.

## 3. Render states

```bash
decision_eval.py render --dataset base --variant app --command "python build_state.py" --out states/app.jsonl
decision_eval.py render --dataset base --variant signals --out states/signals.jsonl
decision_eval.py render --dataset base --variant attributes_only --no-event-logs --out states/attributes_only.jsonl
```

- `app` (your state builder) is the baseline: what the application sends today.
- Built-in variants are useful comparisons: `signals` (all attributes and event log entries as Signals serves them), `--style shaped` (relative times, compact entries; `--collapse-repeats` drops consecutive duplicates), `--no-event-logs`, `--attributes a,b`, `--event-logs x`.
- To test a change to the application's state, copy the builder, change one thing, and render it as another variant.

## 4. Ask the model

```bash
decision_eval.py ask --states states/app.jsonl --call call.json --out answers/app.jsonl
```

- `jev` uses the Vercel AI Gateway if `AI_GATEWAY_API_KEY` is set, otherwise TypeSafe (`--model jev:gateway` or `jev:typesafe` to choose). All questions go in one request, as the application sends them.
- `--model "command:python my_model.py"` runs any model: it reads JSONL `{id, state, questions}` on stdin and writes JSONL `{id, answers: {question: {answer, confidence?, probabilities?, probability_true?}}}`. Use it for the user's own prompt or classifier.
- Answers are cached in `answers_cache.jsonl`, so reruns are free.

## 5. Check

```bash
decision_eval.py check --dataset base --call call.json \
  --answers answers/app.jsonl answers/signals.jsonl answers/attributes_only.jsonl --out report.md
```

Per variant: cost and tokens. Per question: how often the model is confident, close calls (choice), for each outcome AUC and calibration (yes/no) or each answer's outcome rate and lift (choice), and attribute fingerprints per answer. With several variants: how often answers change on the same moments, and AUC differences with bootstrap intervals. How to read it: `references/checks.md`.

### Optional: LLM judge

When no outcome fits a question, you (the agent) can judge a blind sample:

```bash
decision_eval.py judge --question shopping_stage --states states/app.jsonl --answers answers/app.jsonl --sample 50 --out judge.jsonl
```

Read each item's `state` and the question in `call.json`, and fill in `judge_answer` (one of the allowed answers) and a one-line `judge_reason`, without looking at the model's answers. Then score agreement, overall and by the model's confidence:

```bash
decision_eval.py judge --question shopping_stage --answers answers/app.jsonl --score judge.jsonl
```

Agreement isn't accuracy: you and the model can share blind spots. Offer a human review of 20–50 disagreements before anyone relies on it. If nearly every sampled moment looks the same, say so: the moments, not the model, may be the problem.

## 6. Change one thing and rerun

- **Rendering, questions or model**: render or ask again on the same dataset; no new run needed.
- **Different Signals data** (attributes, event log settings): keep the anchors and rebuild only the context:

```bash
decision_eval.py variant-request --base base --request request_with_changes.json --name stage_eval_v2 --out request_v2.json
decision_eval.py dataset --request request_v2.json --out v2
```

- **Different moments** (another event or trigger): a new dataset; results aren't directly comparable with the old moments.

Change one thing at a time, so a comparison says what it changed.

## 7. Report

Give the user a short summary with:

- What was evaluated: the call (questions), when it's made (anchors), span, sample and seed, variants, model and route.
- The key numbers from `report.md`, with intervals for comparisons, and what you'd change next.
- What the numbers don't show (below).
- Where the files are: `run.json`, `call.json`, the state builder, states and answers reproduce it.

## Be honest about what this shows

- Outcomes say what happened next, not whether an answer was right. Lift is evidence for an answer, not its accuracy.
- A difference between variants is only real if its interval excludes zero; with rare outcomes, intervals are wide. Say "no clear difference" when that's the result.
- The replay follows the streaming engine's rules but isn't byte-identical to production (events at the same moment, values that change only with time, data from outside Signals). Treat it as a close rebuild, not a recording.
- One site, one span and one call don't generalise. Suggest another span before a launch decision.
