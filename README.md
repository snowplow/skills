# Snowplow plugin for AI coding agents

Connect your coding agent to your Snowplow account. This plugin bundles the [Snowplow MCP server](https://docs.snowplow.io/docs/ai/snowplow-mcp/) with Snowplow skills, so the agent can design your tracking, create the schemas, add the tracker to your app, and fix failed events.

```bash
npx plugins add snowplow/skills
```

Then ask. For example: "Design a tracking plan for the checkout flow, create the schemas in Console, add the tracker to this app, and send a test event for each." The agent designs the events and entities, creates the schemas, writes the tracking code, and reads the failed events if anything is wrong.

For a guided first session, see [Snowplow quickstart with your coding agent](https://docs.snowplow.io/docs/get-started/quickstart/). For more prompts to try, such as checking pipeline status or reviewing recent failed events, see [Example prompts](https://docs.snowplow.io/docs/ai/snowplow-mcp/#example-prompts).

## Before you start

You need:

- **A Snowplow account.** [Sign up](https://snowplow.io/get-started/sign-up) for the Snowplow Free Trial, or for the [Signals Free Tier](https://signals.snowplow.io/start). Either one is ready within minutes, with no credit card and no infrastructure to run. If you already use Snowplow, log in with your existing Console account.
- **Node.js 18 or later**, which runs the installer and the MCP connector (`mcp-remote`) through `npx`. To install it, follow [Download Node.js](https://nodejs.org/en/download) on the official Node.js site.
- **A coding agent**, such as Claude Code, Cursor, or Codex.

## Install

### Any agent (recommended)

The [plugins CLI](https://www.npmjs.com/package/plugins) detects the coding agents on your machine, including Claude Code, Cursor, and Codex, and installs the plugin into each of them:

```bash
npx plugins add snowplow/skills
```

To install into one agent only, pass `--target`:

```bash
npx plugins add snowplow/skills --target claude-code
```

Run `npx plugins targets` to list the agents the CLI detects.

### Claude Code marketplace

In Claude Code, you can also add this repository as a plugin marketplace and install from it:

```text
/plugin marketplace add snowplow/skills
/plugin install snowplow@snowplow
```

### Other MCP clients

To connect only the Snowplow MCP server, without the skills, in a client such as Claude.ai or Claude Desktop, follow [Configure the MCP server](https://docs.snowplow.io/docs/ai/snowplow-mcp/#configure-the-mcp-server).

## Log in

The first time the agent uses a Snowplow tool, a browser window opens so you can log in to Snowplow Console. The agent then works with the permissions of your Console account: it can see and change only what you can.

If the browser doesn't open in Claude Code, run `/mcp`, select the Snowplow server, and choose **Authenticate**. To work in a different organization, or to use a Console API key instead of a browser login, see [Authentication](https://docs.snowplow.io/docs/ai/snowplow-mcp/#authentication).

## Update or remove

If you installed with the `plugins` CLI, run the install command again to update:

```bash
npx plugins add snowplow/skills
```

If you installed from the Claude Code marketplace, update from your shell:

```bash
claude plugin update snowplow@snowplow
```

Claude Code doesn't auto-update third-party marketplaces by default. To turn it on, run `/plugin`, open the **Marketplaces** tab, select `snowplow`, and choose **Enable auto-update**.

To remove the plugin from Claude Code, run:

```text
/plugin uninstall snowplow@snowplow
```

In other agents, remove the plugin from the agent's plugin or MCP settings.

## What's included

The plugin has one MCP server and a set of Snowplow skills.

### MCP server

The `snowplow` MCP server connects to `https://console.snowplowanalytics.com/api/agent/mcp` through `mcp-remote`. It exposes the same tools as the Snowplow Assistant in Console: schemas, event specifications, and tracking plans; source applications; pipeline configuration, health metrics, and failed events; enrichments and data quality alerts; the data catalog; Signals; and Snowplow documentation search.

### Skills

You don't need to call a skill by name. The agent loads the matching skill when your request needs it.

| Skill | What it does |
| --- | --- |
| [`tracking-design`](plugins/snowplow/skills/tracking-design/SKILL.md) | Designs event and entity schemas, event specifications, and tracking plans, and creates them in Console once you approve the design |
| [`implementation-guidance`](plugins/snowplow/skills/implementation-guidance/SKILL.md) | Adds Snowplow trackers to web, mobile, and server-side apps, and guides you through testing with Snowplow Micro and the rollout from DEV to PROD |
| [`troubleshooting`](plugins/snowplow/skills/troubleshooting/SKILL.md) | Diagnoses missing events, failed events, schema validation errors, and enrichment failures, and suggests a fix |
| [`pipeline-infrastructure`](plugins/snowplow/skills/pipeline-infrastructure/SKILL.md) | Inspects pipelines, collector configuration, enrichments, and health metrics, plus mini pipelines and Micro instances, without changing anything |
| [`console-operations`](plugins/snowplow/skills/console-operations/SKILL.md) | Creates, updates, or deletes Console resources: enrichment configuration, data quality alerts, source applications, and tracking plans |
| [`signals`](plugins/snowplow/skills/signals/SKILL.md) | Manages Signals attribute keys, attribute groups, services, interventions, and Agentic Context, and publishes them |

## Get help

For questions about the plugin or your Snowplow account, contact [Snowplow Support](https://support.snowplow.io/). If you'd like to see how Snowplow fits your use case, you can also [Book a Demo](https://snowplow.io/get-started/book-a-demo-of-snowplow-bdp).

## Contributing

To change the plugin, test it locally, or see how the repository is laid out, read [DEVELOPMENT.md](DEVELOPMENT.md).

## License

[Apache License 2.0](LICENSE)
