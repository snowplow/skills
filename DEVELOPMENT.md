# Developing the Snowplow plugin

This page explains how the repository is laid out and how to test a change before you publish it. To install and use the plugin, see the [README](README.md).

## Layout

```text
.
├── .claude-plugin/
│   └── marketplace.json          # Claude Code native catalog
├── .plugin/
│   └── marketplace.json          # open-plugin catalog
├── plugins/
│   └── snowplow/
│       ├── .claude-plugin/
│       │   └── plugin.json       # Claude Code native manifest
│       ├── .plugin/
│       │   └── plugin.json       # open-plugin manifest
│       ├── .mcp.json             # Snowplow MCP server (shared)
│       ├── tools/                # filename-is-tool modules: <mcp_tool>.md
│       └── skills/               # bundled SKILL.md files (shared)
│           └── onboarding/resume.go  # single stdlib Go adapter; no build, no deps
└── server.json                   # MCP Registry entry for the Snowplow MCP server
```

### Manifest formats

Two manifest formats coexist, so the repository works both as a native Claude Code marketplace and as a vendor-neutral open-plugin bundle for the [plugins CLI](https://www.npmjs.com/package/plugins):

- **`.claude-plugin/`**: read directly by Claude Code's `/plugin marketplace add`.
- **`.plugin/`**: the vendor-neutral open-plugin format. At install time, the `plugins` CLI translates it into the format each agent expects, such as `.claude-plugin/`, `.cursor-plugin/`, or `.codex-plugin/`.

The `.mcp.json` file and the `skills/` directory are shared by both formats, so there is no duplication there.

### MCP Registry entry

`server.json` describes the remote Snowplow MCP server for the [MCP Registry](https://registry.modelcontextprotocol.io), following the [`server.json` schema](https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json). The schema caps `title` and `description` at 100 characters each. Search keywords go under `_meta["io.modelcontextprotocol.registry/publisher-provided"]`, because the schema has no top-level keywords field. Each publish to the registry needs a new `version` in `server.json`.

## Make a change

The manifests are kept in sync by hand. When you change plugin metadata, such as the description or keywords:

- Update both `plugins/snowplow/.claude-plugin/plugin.json` and `plugins/snowplow/.plugin/plugin.json`.
- Update both `.claude-plugin/marketplace.json` and `.plugin/marketplace.json` if the change affects the catalog entry.
- Bump `version` in `plugins/snowplow/.plugin/plugin.json` when you release a change. Leave `version` out of `plugins/snowplow/.claude-plugin/plugin.json` and out of the plugin entry in `.claude-plugin/marketplace.json`: Claude Code updates an installed plugin only when its version string changes, and with no version in either file it tracks commits instead. Existing Claude Code installs then pick up each merge to `main` on their next marketplace update, without a bump. Installs that the `plugins` CLI makes for other agents, such as Codex or VS Code, are local copies, so whatever the version says, they update only when the user runs `npx plugins add` again.

To add a skill, create `plugins/snowplow/skills/<skill-name>/SKILL.md` with `name` and `description` frontmatter, then add it to the skills table in the [README](README.md). The plugin descriptions in both `plugin.json` files and both `marketplace.json` files list the skill areas, so update all four if the new skill adds an area.
To add a tool, add `plugins/snowplow/tools/<mcp_tool>.md` (filename = MCP tool name) and one row in the relevant `SKILL.md` stage table; no Go change or rebuild (`go run` compiles each call).
Local Go check: `go vet plugins/snowplow/skills/onboarding/resume.go` and `go run plugins/snowplow/skills/onboarding/resume.go` from a test project containing `docs/snowplow-onboarding.md`.

## Test locally

To install your local checkout without publishing it:

```bash
npx plugins add /path/to/skills
```

To inspect what the CLI discovers, without installing anything:

```bash
npx plugins discover /path/to/skills
```

The same command works against the published repository:

```bash
npx plugins discover snowplow/skills
```

In Claude Code, you can also add the local checkout as a marketplace. If you already added the published marketplace, remove it first with `/plugin marketplace remove snowplow`, because both use the name `snowplow`.

```text
/plugin marketplace add /path/to/skills
/plugin install snowplow@snowplow
```

Claude Code loads a plugin from a local marketplace in place, so your edits take effect after `/reload-plugins`, without a version bump.
