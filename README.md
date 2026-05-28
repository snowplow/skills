# Snowplow plugin

A vendor-neutral [open-plugin](https://github.com/vercel-labs/plugins) bundle of the [Snowplow MCP server](https://docs.snowplow.io/docs/llms-support/snowplow-mcp/) and Snowplow skills. Installs into Claude Code, Cursor, or Codex.

## Install

```bash
npx plugins add snowplow/skills
```

The CLI auto-detects which agent tools are on your machine and installs to all of them. To target one:

```bash
npx plugins add snowplow/skills --target claude-code
```

The first time you use a Snowplow MCP tool, a browser window opens to authenticate via your Snowplow Console account. Permissions follow your account access level.

## What's included

**MCP server** — `snowplow`, connected to `https://console.snowplowanalytics.com/api/agent/mcp` via `mcp-remote`.

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
├── .plugin/
│   └── marketplace.json          # marketplace catalog (this repo)
└── plugins/
    └── snowplow/
        ├── .plugin/
        │   └── plugin.json       # plugin manifest
        ├── .mcp.json             # Snowplow MCP server
        └── skills/               # six bundled SKILL.md files
```

The `.plugin/` directories use the vendor-neutral [open-plugin format](https://github.com/vercel-labs/plugins). The `plugins` CLI translates them into target-specific formats (`.claude-plugin/`, `.cursor-plugin/`, `.codex-plugin/`) at install time.

## Local development

To test changes without publishing:

```bash
npx plugins add /path/to/snowplow-skills
```

Inspect without installing:

```bash
npx plugins discover snowplow/skills
```
