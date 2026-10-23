# Snowplow plugin

The Snowplow MCP server and skills for coding agents. One command installs them into Claude Code, Cursor, or Codex:

```bash
npx plugins add snowplow/skills
```

Then ask the agent for what you want tracked, for example: "Design a tracking plan for the checkout flow, create the schemas in Snowplow Console, add the tracker to this app, and send a test event for each." The agent designs the events and entities, creates the schemas, writes the tracking code, and reads the failed events if validation rejects anything.

You need a Snowplow Console account. The [free trial](https://snowplow.io/get-started/snowplow-free-trial) and the [Signals free tier](https://signals.snowplow.io/start) are hosted by Snowplow, need no credit card, and are provisioned in around 20 minutes. See the [Snowplow MCP server documentation](https://docs.snowplow.io/docs/ai/snowplow-mcp/) for the full install options and authentication.

This repository is a vendor-neutral [open-plugin](https://github.com/vercel-labs/plugins) bundle: the MCP server configuration plus six skills.

## Install

### Claude Code (native marketplace)

```text
/plugin marketplace add snowplow/skills
/plugin install snowplow@snowplow
```

Claude Code reads the committed `.claude-plugin/` files directly from the repo.

### Any agent (vendor-neutral open-plugin)

```bash
npx plugins add snowplow/skills
```

The CLI auto-detects which agent tools are on your machine and installs to all of them. To target one:

```bash
npx plugins add snowplow/skills --target claude-code
```

The first time you use a Snowplow MCP tool, a browser window opens to authenticate via your Snowplow Console account. Permissions follow your account access level.

## What's included

**MCP server** — `snowplow`, connected to `https://console.snowplowanalytics.com/api/agent/mcp` via `mcp-remote`. It exposes the same tools as the Snowplow Assistant in Console: schemas and tracking plans, pipeline health and failed events, enrichments, Signals, and documentation search. Actions run with the permissions of the Console account you log in with.

**Skills:**
- `tracking-design` — design event schemas, entities, and event specifications
- `implementation-guidance` — instrument Snowplow trackers in applications
- `signals` — manage real-time customer attributes, services, and interventions
- `pipeline-infrastructure` — collector, enrichment, pipeline metrics, mini pipelines
- `console-operations` — pipelines, enrichments, tracking plans, alerts, source apps
- `troubleshooting` — diagnose failed events, schema errors, enrichment problems

## Layout

```
.
├── .claude-plugin/
│   └── marketplace.json          # Claude Code native catalog
├── .plugin/
│   └── marketplace.json          # open-plugin catalog
└── plugins/
    └── snowplow/
        ├── .claude-plugin/
        │   └── plugin.json       # Claude Code native manifest
        ├── .plugin/
        │   └── plugin.json       # open-plugin manifest
        ├── .mcp.json             # Snowplow MCP server (shared)
        └── skills/               # six bundled SKILL.md files (shared)
```

Two manifest formats coexist so the repo works as both a native Claude Code marketplace and a vendor-neutral [open-plugin](https://github.com/vercel-labs/plugins) bundle:

- **`.claude-plugin/`** — read directly by Claude Code's `/plugin marketplace add`. Keep these in sync by hand when metadata changes.
- **`.plugin/`** — the vendor-neutral [open-plugin format](https://github.com/vercel-labs/plugins). The `plugins` CLI translates them into target-specific formats (`.claude-plugin/`, `.cursor-plugin/`, `.codex-plugin/`) at install time for Claude Code, Cursor, or Codex.

The `.mcp.json` and `skills/` are shared by both — no duplication there.

## Local development

To test changes without publishing:

```bash
npx plugins add /path/to/snowplow-skills
```

Inspect without installing:

```bash
npx plugins discover snowplow/skills
```
