# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A plugin for AI coding agents (Claude Code, Cursor, Codex) that bundles the remote Snowplow MCP server with a set of Snowplow skills. There is no application code, build step, linter, or test suite: the repository is Markdown skill files plus JSON manifests. Users install it with `npx plugins add snowplow/skills` or via the Claude Code marketplace. See [README.md](README.md) for the user-facing story and [DEVELOPMENT.md](DEVELOPMENT.md) for contributor details.

## Commands

Test a local checkout without publishing:

```bash
npx plugins discover /path/to/skills   # show what the plugins CLI finds, installs nothing
npx plugins add /path/to/skills        # install the local checkout into detected agents
```

In Claude Code, add the checkout as a local marketplace (remove the published one first with `/plugin marketplace remove snowplow`, since both are named `snowplow`):

```text
/plugin marketplace add /path/to/skills
/plugin install snowplow@snowplow
```

A locally installed plugin is loaded in place, so edits take effect after `/reload-plugins` with no version bump.

## Architecture

### Two manifest formats, one payload

The repository is simultaneously a native Claude Code marketplace and a vendor-neutral open-plugin bundle, so every manifest exists twice:

| Claude Code native | open-plugin (for the `plugins` CLI) |
| --- | --- |
| `.claude-plugin/marketplace.json` | `.plugin/marketplace.json` |
| `plugins/snowplow/.claude-plugin/plugin.json` | `plugins/snowplow/.plugin/plugin.json` |

The `plugins` CLI translates the `.plugin/` format into whatever each agent expects at install time. `plugins/snowplow/.mcp.json` (the MCP server definition, using `mcp-remote` with a static OAuth client) and `plugins/snowplow/skills/` are shared by both formats.

Rules that follow from this:

- The pairs are kept in sync by hand. When changing description, keywords, or other metadata, edit both files of the pair.
- Only `.plugin/plugin.json` carries a `version`. The Claude Code `plugin.json` deliberately has none: Claude Code updates an installed plugin only when the version string changes, and with no version it tracks commits instead, so every merge to `main` reaches existing installs. Do not add a version back to the native manifest. Bump the `.plugin/plugin.json` version when releasing a change.
- `server.json` at the root is a separate artifact: the MCP Registry entry for the remote server, following the 2025-12-11 `server.json` schema. `title` and `description` are capped at 100 characters, keywords live under `_meta["io.modelcontextprotocol.registry/publisher-provided"]`, and each registry publish needs a new `version` there.

### Skills

Each skill is `plugins/snowplow/skills/<name>/SKILL.md`. They share conventions that matter when adding or editing one:

- **Frontmatter**: `name`, a `description`, and (for all but `onboarding`) a `compatibility` line. The description does the routing work: it says when to use the skill, when to use a sibling skill instead, and ends with a `Triggers:` list of user phrases. Several descriptions tell the agent to fire "even if the user doesn't name Snowplow/Signals", so keep that wording when the skill is the natural home for a general request.
- **Routing between skills** is explicit in the descriptions and must stay consistent: `pipeline-infrastructure` is read-only inspection while `console-operations` mutates Console state; `signals` manages existing Signals resources while `signals-setup` is first-time setup in the user's codebase; `onboarding` fires only on vague "where do I start" requests, never on a specific task.
- **Body structure**: a phased workflow (`Phase N` or `Stage N` headings), an `Important Notes` or `Tips` section with Snowplow-specific constraints (for example, schema versions can only be created, never edited; SchemaVer is `MAJOR-MINOR-PATCH`), and a closing `## Tools` section listing the Snowplow MCP tool names the skill uses with a one-line purpose each. Tool names in the skills refer to Snowplow MCP tools.
- **References**: `onboarding` is the one skill with a `references/` directory, one file per stage, loaded on demand. It also maintains a progress file, `docs/snowplow-onboarding.md`, in the user's repo so a run can resume.
- **Docs links** point at `docs.snowplow.io` and prefer the `.md` suffix form of a page URL, which returns Markdown for the agent.

To add a skill: create the directory and `SKILL.md`, add a row to the skills table in README.md, and update the plugin description in both `plugin.json` files if it enumerates skill areas.
