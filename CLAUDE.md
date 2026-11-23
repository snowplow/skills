# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A plugin for AI coding agents (Claude Code, Cursor, Codex) that bundles the remote Snowplow MCP server with a set of Snowplow skills. There is no application code, build step, linter, or test suite, with one explicit exception: `plugins/snowplow/skills/onboarding/resume.go` is one stdlib Go adapter; no build step, no deps; all other skills remain Markdown-only. The repository is otherwise Markdown skill files plus JSON manifests. See [README.md](README.md) for the user-facing story.

The repository layout, the two manifest formats and their sync rules, the `server.json` constraints, and the local test commands are in DEVELOPMENT.md, imported here so there is one copy to maintain:

@DEVELOPMENT.md

## Rules that are easy to get wrong

- **Never add a `version` to `plugins/snowplow/.claude-plugin/plugin.json` or to the plugin entry in `.claude-plugin/marketplace.json`.** The manifests are otherwise kept in sync by hand, and the open-plugin `plugin.json` has a `version`, so the asymmetry looks like drift. It is deliberate: with no version in either file, Claude Code installs track commits and pick up each merge to `main` on their next marketplace update. A version in either file freezes them on their cached copy until someone remembers to bump it. This only affects Claude Code: other agents get local copies from the `plugins` CLI and update when the user runs `npx plugins add` again.
- When you change shared metadata, edit both files of each manifest pair in the same change.

## Skill conventions

Each skill is `plugins/snowplow/skills/<name>/SKILL.md`. These conventions are only visible by reading several skills, so keep them when adding or editing one:

- **Frontmatter**: `name`, a `description`, and (for all but `onboarding`) a `compatibility` line. The description does the routing work: it says when to use the skill, when to use a sibling skill instead, and ends with a `Triggers:` list of user phrases. Several descriptions tell the agent to fire "even if the user doesn't name Snowplow/Signals", so keep that wording when the skill is the natural home for a general request.
- **Routing between skills** is explicit in the descriptions and must stay consistent: `pipeline-infrastructure` is read-only inspection while `console-operations` mutates Console state; `signals` manages existing Signals resources while `signals-setup` is first-time setup in the user's codebase; `onboarding` fires only on vague "where do I start" requests, never on a specific task.
- **Body structure** (all skills except `onboarding`): a phased workflow (`Phase N` or `Stage N` headings), an `Important Notes` or `Tips` section with Snowplow-specific constraints (for example, schema versions can only be created, never edited; SchemaVer is `MAJOR-MINOR-PATCH`), and a closing `## Tools` section listing the Snowplow MCP tools the skill uses, with a one-line purpose each.
- **`onboarding` is structured differently**: a stage table in `SKILL.md`, with one file per stage under `references/`, loaded on demand. It keeps a progress file, `docs/snowplow-onboarding.md`, in the user's repo so a run can resume.
- **Docs links** point at `docs.snowplow.io` and use the `.md` suffix form of a page URL, which returns Markdown for the agent.
