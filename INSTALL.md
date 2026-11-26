# Install (folder only)

This folder is install-ready. Preparing it changed **no global config**; installing it is a separate step that writes to your agent config. No `.env` was created. Install from the folder itself.

## Local check — no install

```bash
npx plugins discover /path/to/this/folder
```

Inspect what the `plugins` CLI finds before installing anything.

## Claude Code

```bash
npx plugins add /path/to/this/folder
```

Or as a local marketplace (loads in place; `/reload-plugins` after edits):

```text
/plugin marketplace add /path/to/this/folder
/plugin install snowplow@snowplow
```

## OpenCode

Add this `mcp.servers.snowplow` entry to `opencode.json` in your project root (merge it into an existing config). It uses the same remote MCP command as `plugins/snowplow/.mcp.json`; no local MCP server is started.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "snowplow": {
        "type": "local",
        "command": [
          "npx",
          "-y",
          "mcp-remote",
          "https://console.snowplowanalytics.com/api/agent/mcp",
          "3334",
          "--static-oauth-client-info",
          "{\"client_id\":\"NxCcdyu13Cr4umnIYw70evvUyRXRvyWf\"}"
        ],
        "enabled": true
      }
    }
  }
}
```

## Install caveats

- If `claude` is not installed, `npx plugins add` still works for the Claude-side install.
- `plugins@1.3.9` regenerates marketplace metadata and registers a staging path, not this folder. Treat the installed copy as a snapshot; re-add it to refresh.
- If `npx mcp-remote` fails with `EACCES` from a root-owned npm cache, set a writable `npm_config_cache` for the MCP server.
- The `plugins` CLI has no OpenCode target; merge the JSON below manually.

## Log in

The first Snowplow tool call opens a browser for OAuth login to Snowplow Console. Details, including `/mcp` → **Authenticate** in Claude Code, are in [README.md](README.md) → “Log in”.

## Secrets

No `.env` ships with this folder. Credentials stay in a gitignored `.env` in the user's own project; never ask for, read, or print them. Only the public OAuth `client_id` appears in the MCP config, unchanged from `.mcp.json`.
