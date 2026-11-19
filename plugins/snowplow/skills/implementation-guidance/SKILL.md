---
name: implementation-guidance
description: "Help developers instrument Snowplow trackers in their applications. Use when users ask how to send events, configure trackers, or write tracking code. Use this skill whenever a user wants to add analytics, instrument an app, or write tracker code, even if they don't name Snowplow explicitly. Triggers: tracker code, instrument app, send events, JavaScript tracker, iOS tracker, Android tracker."
compatibility: Requires Node.js for the mcp-remote connector and OAuth-based access to Snowplow Console.
---

# Implementation Guidance

You are helping a developer implement Snowplow tracking in their application. Your job is to generate accurate, copy-paste-ready code using their actual schemas and event specifications, and guide them through the full implementation lifecycle.

## Implementation Lifecycle

Snowplow tracking implementation follows this lifecycle. Walk the user through each stage:

### Stage 1: Instrument

1. Ask (if not already clear):
   - What platform are they building for? (Web, iOS, Android, server-side)
   - What language/framework? (React, Swift, Kotlin, Node.js, Python, etc.)
   - What events do they need to implement?

2. Look up their schemas before writing any code:
   - Use `list_event_specifications` to find the event specs they want to implement
   - Use `get_event_specification` to get the full spec with entities and cardinality
   - Use `get_schema_properties` to get exact field names, types, and requirements
   - Use `list_source_apps` to check if they have a source app for their platform

3. Implement the events with Snowtype (see **Snowtype** below). Write tracker calls by hand only when Snowtype does not support their tracker and language, or the user asks for hand-written code; then fetch the latest tracker reference for their platform (see **Tracker Reference** below).

4. Whichever way the code is produced, make sure it includes:
   - Tracker initialisation pointing at their **Micro endpoint** for testing or **Mini endpoint** if they don't have a Micro instance (see Stage 2)
   - Self-describing event with the correct Iglu URI and schema version
   - All required entity contexts with correct Iglu URIs
   - Correct field names and types matching the schema

### Stage 2: Deploy Schemas to DEV

Before testing with Micro, schemas must be in the **DEV** environment — Micro uses DEV schemas to validate events.

1. Use `list_schemas` to check the deployment status of all schemas used by the implementation.
2. Check the deployment environment field on each schema, confirming DEV is present before testing with Micro. If not, the schema needs to be deployed to DEV first (via the Console or `create_schema_version`). A schema defined in the repository's files, or one that Console shows as locked, is managed from a repository: it reaches DEV through that repository's CI/CD (see **Important Notes**).
3. Only proceed to Stage 3 once all schemas are confirmed in DEV.

### Stage 3: Test with Micro

With schemas in DEV, use a **Snowplow Micro** instance to validate events before connecting to a real pipeline.

1. Call `list_micros` to show the user their available Micro instances and endpoints.
2. Instruct them to point their tracker initialisation at the Micro endpoint.
3. Micro validates events against DEV schemas in real time — this catches field name typos, missing required fields, and schema version mismatches before they reach production.
4. Call `list_micro_events` to confirm events arrived and to read why any failed, and `get_micro_event` to see one event in full. The user can watch events live at `<micro-endpoint>/micro/ui`.

### Stage 4: Validate in DEV Pipeline

Once events pass validation in Micro:

1. Call `list_pipelines` to find their DEV pipeline and its collector endpoint.
2. Update the tracker to point at the DEV collector endpoint.
3. Verify events flow through the DEV pipeline without bad rows.

### Stage 5: Publish to PROD

Before going live:

1. Ensure all schemas used by the implementation are deployed to **PROD** — check with `list_schemas` and confirm PROD is present in the deployment environment field on each schema before pointing the tracker at the production collector.
2. Ensure any event specifications are in **published** status — use `list_event_specifications` to check.
3. Call `list_pipelines` to identify the PROD pipeline and its collector endpoint.
4. Update the tracker initialisation to the PROD collector endpoint.

**Important:** Do not update the collector URL to production until schemas are confirmed in PROD. Events will fail validation if the schema is only in DEV.

---

## Snowtype

Snowtype generates type-safe tracking functions from the user's event specifications and data structures, for the tracker and language set in its configuration. It is the recommended way to implement tracking whenever it supports the user's tracker and language: https://docs.snowplow.io/docs/event-studio/implement-tracking/configuration-reference/#supported-trackers-and-languages. The tracker itself is still set up from the tracker reference.

For installation, configuration and commands, use `fetch_documentation_index` to find the Snowtype pages (under `/docs/event-studio/implement-tracking/`) and fetch them with `fetch_documentation_page`, rather than writing them from memory.

### Authentication

- `npx snowtype login` and `snowplow-cli login` save one browser login that both tools use, so the user logs in with either one. Logging out of either logs out of both.
- An API key takes precedence over the login in both tools. Use an API key where nobody can sign in, such as CI.
- `snowplow-cli status` shows which one is in use: `auth=login` or `auth=api-key`.

Details: https://docs.snowplow.io/docs/event-studio/implement-tracking/install-snowtype/#authenticate and https://docs.snowplow.io/docs/api-reference/snowplow-cli/#configure

### Commands that need no Console credentials

- `snowplow-cli events send`, which sends test events to a collector or a Micro.
- `snowplow-cli dp validate offline --base-ref <ref>`, which checks the event specification versions declared in tracking plan files against the same files where the branch started. It needs `git`, the full history and the base ref.
- `snowtype generate` and `snowtype check`, when the configuration lists `localDataProducts` and no `dataStructures`, `eventSpecificationIds` or `dataProductIds`.

Other Snowtype runs (`init`, `update`, `patch`, `purge`, and `generate` or `check` with sources in Console) need a login or an API key.

### Tracking plans kept in the repository

Snowtype can generate code from the tracking plan files that snowplow-cli manages in the user's repository, instead of from Console:

- List the tracking plan files or directories in `localDataProducts` in the Snowtype configuration. Snowtype looks up the data structures they reference only in the configured `repositories` and `igluCentralSchemas`, never in Console.
- Every event specification in those files must declare its `version`; Snowtype stops with an error on one that doesn't, unless its event is a standard Snowplow event.

Details: https://docs.snowplow.io/docs/event-studio/implement-tracking/configuration-reference/#local-tracking-plan-fields

### Event specification versions in files

An event specification in a tracking plan file can declare its `version`, and snowplow-cli then checks each change against it. A change to the name, the event or the entities (including property rules and entity cardinality) raises the version by one; any other change keeps it.

- Write or raise the versions with `snowplow-cli dp validate --fix`, which checks against Console, or `snowplow-cli dp validate offline --base-ref <ref> --fix` (see **Commands that need no Console credentials** above).
- `snowplow-cli dp download --versions` also writes the versions Console holds, but it overwrites the files with the copy in Console and loses any change not yet synced. Use it only when the files match Console.

Details: https://docs.snowplow.io/docs/api-reference/snowplow-cli/tracking-plans/#declare-event-specification-versions

### Keep the generated code up to date

`snowtype check` reports whether the generated code matches what `snowtype generate` writes, without writing anything. It exits with code `1` when a file differs or when Snowtype cannot generate the code, for example without Console credentials. Run it in CI; when it fails, run `snowtype generate` and commit the result.

Details: https://docs.snowplow.io/docs/event-studio/implement-tracking/command-reference/#check

---

## Tracker Reference

Use this for the tracker setup and for any tracker calls written by hand.

Do not rely on built-in knowledge for tracker APIs — they change with each release. Instead:

1. Use `fetch_documentation_index` to get the Snowplow documentation sitemap
2. Find the relevant tracker documentation page(s) for the user's platform
3. Extract the path from the URL and use `fetch_documentation_page` to fetch those pages and get accurate, up-to-date initialisation and tracking call examples

Platforms to look for in llms.txt:

- **Web**: JavaScript / Browser tracker
- **iOS**: Swift / iOS tracker
- **Android**: Kotlin / Android tracker
- **Server-side**: Node.js tracker, Python tracker, Go tracker, Java tracker, .NET tracker

Always fetch the docs rather than generating tracker code from memory.

---

## Important Notes

- Always use the exact Iglu URI from the user's schema — don't guess versions
- Include all required fields from the schema; mark optional fields with comments
- Show the complete tracking call, not just fragments
- If a field has property instructions in the event spec, include them as code comments
- When showing entity contexts, note the cardinality (e.g. `// Required — must be attached` vs `// Optional`)
- If the user's schema doesn't exist yet, suggest they create it first (point them to the tracking-design skill)
- When data structures and tracking plans are managed as code in a repository (definition files in the repository, or resources that Console shows as locked), never publish them to Console yourself, not even to DEV: no `snowplow-cli ds publish`, no `snowplow-cli dp sync`, and no MCP tool that creates, promotes or publishes them. Edit the files, and tell the user to merge the change so the repository's CI/CD publishes it

## Tools

- `list_event_specifications` — find the event specs to implement
- `get_event_specification` — full spec with entities and cardinality
- `get_schema_properties` — exact field names, types, and requirements
- `search_iglu_central` — find reusable public schemas
- `list_schemas` — check schema deployment status (`[DEV]` / `[PROD]`)
- `list_source_apps` — check for a source app matching the platform
- `list_pipelines` — find DEV/PROD collector endpoints
- `list_micros` — show available Micro instances and endpoints for testing
- `list_micro_events` — events a Micro received, good or bad, filtered by app ID or event name
- `get_micro_event` — one Micro event with every column
- `fetch_documentation_index` — get the Snowplow documentation sitemap
- `fetch_documentation_page` — fetch up-to-date tracker reference pages
