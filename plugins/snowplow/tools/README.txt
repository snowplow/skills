# Tools — filename-is-tool contract

The basename of each `.md` file in this folder, **without `.md`, is the exact Snowplow MCP tool name**. `list_destinations.md` → `list_destinations`. No frontmatter, registry, manifest, or local MCP server maps names.

## Contract

- One file per tool: `plugins/snowplow/tools/<mcp_tool_name>.md`. The name matches the remote MCP tool verbatim (`get_pipeline_metrics`, never `get-pipeline-metrics`).
- Body: 1–2 lines of argument notes only, e.g. `Args: pipeline_id from the progress file.` The remote MCP owns the JSON schema and validates arguments; do not copy the schema here.
- Call: the agent sends the basename as `name` in an MCP `tools/call` JSON-RPC request over the existing remote connection (`https://console.snowplowanalytics.com/api/agent/mcp`). Nothing is started locally.

## Add a tool

1. Add `plugins/snowplow/tools/<tool>.md` with its argument note.
2. Add one line in the relevant `SKILL.md` that points at `tools/<tool>.md` (or names the tool) so the agent knows when to emit the JSON-RPC MCP call.

No code, config, or manifest changes. A tool with no file is not callable; a file not referenced from `SKILL.md` is not used.

## Limits

- Remote MCP tools only. No local stdio server, no `.env`, no credentials in files.
- The file set can drift from the remote MCP's real tool list; a stale name fails at call time with an MCP error. There is no sync step.
