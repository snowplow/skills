# Spec: snowplow/skills repo hygiene

Baseline: `main` at `1f20eaa` (12 Nov 2026).

This spec is written to be executed by a coding agent without design discussion. Every decision is already made below. If something here turns out to be impossible, stop and report; do not improvise an alternative.

## Scope

Three tasks, one pull request each, in this order. None depends on the others.

1. Settle the version scheme and fix the docs that contradict it.
2. Pin `mcp-remote`.
3. Add CI validation.

## Non-goals

Do not do any of these, even if they look like obvious improvements:

- Edit the prose of any `SKILL.md` or any file under `references/`.
- Rename, move, split, merge or delete a skill.
- Touch `snowplow-cli` or any other repository.
- Change the MCP transport, port (`3334`) or OAuth client ID in `.mcp.json`.
- Add a changelog, git tags or a release workflow.
- Add any dependency other than the one named in Task 3.

## Rules for the agent

- One branch and one PR per task: `chore/version-scheme`, `chore/pin-mcp-remote`, `chore/ci-validate`.
- Never push to `main`.
- If an existing file fails a check you are adding, stop and report the failure. Do not edit skill content to make it pass.
- Each PR description lists what changed, how it was verified, and any manual check a human still needs to do.

---

## Task 1: version scheme

### Decision

The plugin is **rolling**. The commit SHA is the version, so every merge to `main` reaches existing installs. This was already done for the Claude manifest in commit `3b97bc2`; this task makes the rest of the repo agree with it.

`server.json` keeps its own `version`. It is the MCP Registry entry, changes only when the registry entry is republished, and is unrelated to the plugin.

### Changes

1. Remove the `"version"` field from `plugins/snowplow/.plugin/plugin.json`.
2. Run `npx plugins discover .` from the repo root.
   - If it succeeds, continue.
   - If it fails because `version` is required, restore the field exactly as it was (`"0.2.0"`), and record in the PR description that the open-plugin manifest must keep a version. Task 3 has a matching fallback.
3. In `DEVELOPMENT.md`, section "Make a change":
   - Delete the bullet that begins "Bump `version` in both `plugin.json` files".
   - In the sentence listing metadata examples ("such as the description, version, or keywords"), remove "version".
   - Add one short paragraph headed "Versioning" stating the decision above in plain words: the plugin has no version field, the commit SHA is the version, every merge to `main` ships to users, and `server.json` is versioned separately for the MCP Registry.
4. In `DEVELOPMENT.md`, last line: remove ", without a version bump".

### Acceptance

- `diff plugins/snowplow/.claude-plugin/plugin.json plugins/snowplow/.plugin/plugin.json` prints nothing (or, under the step 2 fallback, only the `version` line).
- `grep -n "Bump" DEVELOPMENT.md` prints nothing.
- `npx plugins discover .` succeeds and lists 8 skills and 1 MCP server.

---

## Task 2: pin mcp-remote

### Decision

Pin an exact version. Change nothing else in the file.

### Changes

1. Run `npm view mcp-remote version` and use the value returned. On 18 Nov 2026 this was `0.16.6`.
2. In `plugins/snowplow/.mcp.json`, change the argument `"mcp-remote"` to `"mcp-remote@<that version>"`.
3. In `DEVELOPMENT.md`, add a section "Updating mcp-remote" with two sentences: the version is pinned in `plugins/snowplow/.mcp.json` so that installs do not execute an unreviewed release, and to update it, change the version, run the manual check below, and open a PR.

### Acceptance

- `.mcp.json` parses as JSON and differs from the baseline in that one argument only.
- `npx -y mcp-remote@<version> https://console.snowplowanalytics.com/api/agent/mcp 3334 --static-oauth-client-info '{"client_id":"NxCcdyu13Cr4umnIYw70evvUyRXRvyWf"}'` starts and reaches the browser login step.
- Manual check for a human, listed in the PR description: install the branch with `npx plugins add /path/to/checkout --target claude-code`, log in, and confirm one Snowplow tool call works.

---

## Task 3: CI validation

### Decision

One workflow, one script, one dependency. Python, because the frontmatter uses YAML folded scalars and needs a real parser.

### Files to add

- `.github/workflows/validate.yml`: runs on `pull_request` and on `push` to `main`. Steps: checkout, set up Python 3.12, `pip install pyyaml==6.0.3`, `python scripts/validate.py`.
- `scripts/validate.py`: runs every check below, prints one line per failure in the form `FAIL <check-id> <path>: <reason>`, and exits non-zero if any check failed. It must run all checks before exiting, not stop at the first failure.
- `tools.snapshot.json`: see check C7.

### Checks

| ID | Check |
| --- | --- |
| C1 | Every directory under `plugins/snowplow/skills/` contains a `SKILL.md` that starts with YAML frontmatter. |
| C2 | Frontmatter `name` equals the directory name and matches `^[a-z0-9]+(-[a-z0-9]+)*$`, at most 64 characters. |
| C3 | Frontmatter `description` is a non-empty string of at most 1024 characters. |
| C4 | Each `SKILL.md` is at most 500 lines. |
| C5 | Every relative Markdown link in a `SKILL.md`, in a file under `references/`, and in `README.md` points to a file that exists. Links starting with `http`, `#` or `mailto:` are skipped. |
| C6 | The set of skill names in the `README.md` "Skills" table equals the set of skill directories. |
| C7 | Tool names: see below. |
| C8 | `.claude-plugin/marketplace.json` and `.plugin/marketplace.json` are byte-identical. |
| C9 | The two `plugin.json` files are identical after parsing. If Task 1 used its fallback, compare them after removing the `version` key from both. |
| C10 | `server.json`, `.mcp.json` and all four manifests parse as JSON. `server.json` `title` and `description` are each at most 100 characters. |
| C11 | In `.mcp.json`, exactly one argument matches `^mcp-remote@\d+\.\d+\.\d+$`, and no argument equals `mcp-remote`. |

### C7 in detail

Purpose: catch a skill that names an MCP tool the server does not have.

**Extraction rule.** In each `SKILL.md`, take the section that starts at the line `## Tools` and ends at the next line starting with `## ` or at end of file. For each line in it that starts with `- `, take the text before the first ` — ` (space, em dash, space). Every backticked token in that text matching `^[a-z]+(_[a-z0-9]+)+$` is a tool name. Ignore everything else in the file. A skill with no `## Tools` section contributes no names and passes.

**Snapshot.** `tools.snapshot.json` is a JSON object: `{"source": "<how it was obtained>", "captured": "<YYYY-MM-DD>", "tools": ["...", "..."]}` with `tools` sorted.

The snapshot must come from the live server's tool list. Obtain it one of two ways:

- If the Snowplow MCP server is connected in this session, list its tool names from the session's available tools, stripping any client prefix (for example `mcp__plugin_snowplow_snowplow__`).
- Otherwise ask the human to supply the output of the server's `tools/list`.

**Never build the snapshot from the skill files.** That would make the check pass by construction. If neither source is available, implement C7 so that it is skipped with a printed `SKIP C7 no snapshot` when the file is absent, ship the other checks, and say so in the PR description.

**Check.** Every extracted tool name must appear in `tools`. Names in the snapshot that no skill mentions are fine.

Expected extraction counts at baseline, to confirm the rule is implemented correctly: console-operations 21, implementation-guidance 12, onboarding 0, pipeline-infrastructure 8, signals 37, signals-setup 26, tracking-design 18, troubleshooting 9.

### Docs

Add a section "Validation" to `DEVELOPMENT.md`: how to run `python scripts/validate.py` locally, and that `tools.snapshot.json` must be refreshed from the live server whenever the MCP server adds, renames or removes a tool.

### Acceptance

- `python scripts/validate.py` exits 0 on the branch.
- Each check is shown to fail when it should. For each of C2, C5, C7, C8 and C11, make a temporary breaking edit, confirm the script reports that check ID, and revert. List the results in the PR description. Do not commit the breaking edits.
- The workflow passes on the PR.

### Known limits, accepted for now

- C7 only looks at `## Tools` sections. Tool names mentioned elsewhere in a skill or under `references/` are not checked.
- The snapshot is refreshed by hand. A scheduled job that refreshes it needs a Console credential in CI and is out of scope.
- Nothing checks the `snowplow-cli` commands that `signals-setup` and `onboarding` rely on. That belongs to the later migration.
