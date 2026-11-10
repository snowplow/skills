---
name: signals-setup
description: "Set up Snowplow Signals in the user's project by completing the four setup steps Console shows: Tracking, Attribute groups, Services, and Used by your app. Checks which steps are already done, agrees a use case, adds tracking, creates and publishes an attribute group and a service, and wires the app to fetch values. Use when the user runs or mentions `snowplow-cli signals setup`, asks to add Snowplow Signals to a project, or asks to finish Signals setup. Use this skill whenever a user wants real-time attributes or personalization in their own app, even if they don't name Signals. Triggers: signals setup, setup signals, add Signals to this project, finish Signals setup, Signals quickstart, personalize with Snowplow, personalise, real-time attributes in my app."
compatibility: Requires the Snowplow MCP, which comes with the Snowplow plugin. `snowplow-cli signals setup` installs the plugin and writes the app's Signals credentials to .env.
---

# Signals Setup

You are setting up Snowplow Signals in the user's project. Signals computes attributes about users and sessions from their Snowplow events (for example "products viewed in the last 30 minutes") and serves them to the app in real time. `snowplow-cli signals setup` has usually already written the app's Signals credentials to `.env` and installed the Snowplow plugin. Your job is to agree what to build, configure it, and wire it into the code.

Load the `signals` skill for Signals concepts and configuration detail, and `implementation-guidance` for tracker code.

## Goal

Signals is set up when all four steps Console shows are done:

| Step | Done when | How you check |
|---|---|---|
| 1. Tracking | Events from the app's `app_id` reach the Signals pipeline | get_pipeline_metrics for the Signals pipeline |
| 2. Attribute groups | The attribute groups in the app's service are published | signals_list_attribute_groups |
| 3. Services | The service the app fetches is published | signals_list_services |
| 4. Used by your app | The app's server code fetches the service with its own credentials and gets values back | `snowplow-cli signals status --json-output`, then values for a real visitor |

A step counts only when it's connected to this project. Published groups and services that nothing in this project fetches don't make steps 2 to 4 done; they're candidates to reuse. Show the user the status of the four steps at the start and at the end, and never call the setup finished while a step is not done.

What you may create or change is limited to: the tracker and events for the use case, a schema for each custom event only if no existing event or schema fits, the source app and tracking plan entries that document those events, one attribute key (only if no existing one fits), one attribute group, one service, and the app code that fetches the service. Don't change or publish any other Signals resources. Interventions, Agentic Context, and batch attribute groups are out of scope; mention them as next steps if they fit the use case.

## Workflow

Add the five phases to your task list and work through them in order. Phases 3 and 4 each stop for approval; don't skip them.

### Phase 1: Prerequisites

- Check the Snowplow MCP tools are available (for example list_signals_environments). If they're missing, ask the user to connect or sign in to the Snowplow MCP (in Claude Code: `/mcp`, server `plugin:snowplow:snowplow`; if `/plugin` shows the plugin failed to load, update Claude Code). If they have no Snowplow MCP at all, ask them to run `snowplow-cli signals setup` again in this project.
- Check snowplow-cli runs: `snowplow-cli signals status --help`. If that fails, use `npx @snowplow/snowplow-cli` wherever this skill says `snowplow-cli`, including in commands you give the user.
- Run `snowplow-cli signals status --json-output` to check the app's credentials. If `reason` is `config`, ask the user to run `snowplow-cli signals setup` in this project; steps 1 to 3 can go ahead meanwhile, step 4 can't.
- Find the Signals environment in list_signals_environments whose API host matches the host of `apiUrl`. If none matches, stop: the MCP works in the user's home organization and `.env` is for a different one. Ask the user to run `snowplow-cli signals setup` again (it uses their home organization and replaces the credentials), then restart the app if it's running.
- Note that environment's pipeline. This is the **Signals pipeline**: Signals only computes attributes from events that reach it, so use it for every get_pipeline_metrics and get_collector_config call.

### Phase 2: Status Check

List before you create, so you can skip finished steps and reuse what's there:

- Read the project: language, framework, where server-side code runs, the Snowplow tracker and its `app_id`, the collector it sends to, and any code that fetches Signals (`@snowplow/signals-node`, `snowplow_signals`, or `get-online-attributes`) and which service it names.
- Call get_pipeline_metrics for the Signals pipeline with `from: PT-24H`. If the tracker sends to a different pipeline's collector, step 1 is not done.
- Call signals_list_attribute_keys, signals_list_attribute_groups, and signals_list_services.
- Call list_source_apps, list_tracking_plans, list_event_specifications, and list_schemas.

Decide each step from this project, not from what the organization has:

- **Tracking**: done when events with the project's `app_id` reached the Signals pipeline in the last 24 hours.
- **Used by your app**: done only if code fetches a service and `signals status` passed. If no code fetches a service, steps 2 to 4 are not done.
- **Services**: done when the service the code names is published.
- **Attribute groups**: done when every group in that service is published.

Show the status in the same order as Console:

```
Signals setup
  1. Tracking          <Done | Not done>: <one line of evidence>
  2. Attribute groups  <Done | Not done>: <evidence>
  3. Services          <Done | Not done>: <evidence>
  4. Used by your app  <Done | Not done>: <evidence>
```

If all four are done, say so and stop.

### Phase 3: Use Case and Plan

If the project already fetches a service, the use case is what that code does: plan only the missing steps.

Otherwise, ask for the outcome, not the configuration. Offer two or three concrete use cases that fit what the project already tracks. Describe each one the same way, in full sentences: the events it tracks, what Signals computes from them, and what the user will see in the app. Mention schemas only for an option that needs a new one. For example:

- **Product recommendations**: Tracks product view events. Signals works out which categories each visitor viewed this session, and the app reorders a "Recommended for you" section to match.
- **High-intent offer**: Tracks product view and add-to-cart events. Signals counts both for each session, and the app shows an offer once the counts pass a threshold.
- **AI assistant context**: Tracks page view and product view events. Signals keeps a summary of what each visitor looked at this session, and the app passes it to its AI assistant.

Keep it to stream attribute groups and one service, and reuse existing resources where they fit. If the tracker sends to a pipeline other than the Signals pipeline, say so and propose a fix in the plan. Then present the plan:

```
Signals setup plan

Use case:           <one sentence>
1. Tracking:        <tracker to add, or existing>, sending to <Signals pipeline>; events: <events to add or reuse, and where in the code>
   - schemas:       <none needed | reuse <schema> | new <vendor/name>, deployed to production after approval>
   - tracking plan: <source app and tracking plan the events are documented in, existing | new>
2. Attribute group: <name>, per <visitor | session> (<attribute key>), existing | new key
   - scope:         events from <app_id> only
   - <attribute>:   <what it holds, in plain words, with its period, e.g. "the categories they viewed this session">
3. Service:         <name> → <group>@<version>
4. Used by app:     <file and route that fetches the service, and what it does with the values>
```

Ask: "Does this plan look right? I'll add the tracking and create the attribute group and service, unpublished, once you confirm. Nothing goes live until you approve again."

Wait for explicit approval. Never treat silence or your own recommendation as approval.

### Phase 4: The Four Steps

Skip any step the status check showed as done. After each create, update, or publish in Snowplow, tell the user in one line what changed, by name, and whether it's live.

#### Step 1: Tracking

- If there's no tracker, add one pointed at the Signals pipeline's collector (get_collector_config), with a clear `app_id`. If an existing tracker sends to another pipeline, change it only as the approved plan says. Follow `implementation-guidance`, and check the tracker's docs (fetch_documentation_index, fetch_documentation_page) so you use its own API rather than working around it.
- Add the events the attribute group needs. Prefer events that need no new schema: built-in page views and page pings (see the `signals` skill for how to reference them), then existing schemas from list_schemas (get_schema_properties shows their fields). Only for a custom event that nothing fits, create its schema with create_schema_version, which deploys it to development.
- A new schema must also be in production before the pipeline accepts its events, and that is going live. Ask: "Ready to deploy `<vendor/name>` to production?" After an explicit yes, call promote_data_structure with target `PROD`.
- Document the tracking: if no source app has the app's `app_id`, create one with create_source_app; add the events as event specifications (create_event_specification) in a tracking plan for the use case, reusing an existing plan when it fits (create_tracking_plan, or edit_tracking_plan to link the source app).
- Start the app (or ask the user to) and trigger the events.
- Call get_pipeline_metrics for the Signals pipeline and look for the `app_id`. Metrics can lag by a few minutes; if nothing shows yet, move on and check again in Phase 5.

**Tracking as files**: if the project has `./data-products/` or `./data-structures/`, the user manages tracking with snowplow-cli. Run `snowplow-cli status`; if it passes, make the tracking changes in those files and apply them with `snowplow-cli dp sync` and `ds publish dev`. `ds publish prod` needs the same approval as promote_data_structure. If it fails, ask the user to run `snowplow-cli setup`, or use the MCP tools instead.

#### Step 2: Attribute Groups

- Create the attribute key if needed, then the attribute group, unpublished.
- Call signals_test_attribute_group with the full attribute group definition (the object you passed to signals_create_attribute_group, not its name), `app_ids` set to the project's `app_id`, and `window` such as `P1D`. Show the user a few sample values.
- The test queries the warehouse. If it fails for lack of a destination connection, tell the user and continue; Step 4 still checks the group end to end. If it returns nothing because the tracking is new, check the event filters against your tracking code, say why it's empty, and continue.

#### Step 3: Services

- Create the service with the attribute group, unpublished.
- Summarize what will go live, then ask: "Ready to publish `<group>` and `<service>`? They start computing values from live events as soon as they're published."
- After an explicit yes, call signals_publish for both, then confirm with signals_list_attribute_groups and signals_list_services.

#### Step 4: Used by Your App

- **Identifier**: the server needs the identifier the attributes are keyed on. For `domain_userid` or `domain_sessionid` in a web app, read it in the browser with the tracker's own API (for example `getDomainUserId()` in the browser tracker) and send it to the server.
- **Fetch the service server-side**, reading the four `SNOWPLOW_SIGNALS_*` variables from the environment. Read [Connect to Signals](https://docs.snowplow.io/docs/signals/connection.md) and [Retrieve attributes](https://docs.snowplow.io/docs/signals/applications/retrieve-attributes.md) with fetch_documentation_page, and follow them:
  - Node / TypeScript: `@snowplow/signals-node`
  - Python: `snowplow-signals`
  - Anything else: the Signals API. The connection page shows the token exchange; the request and response formats are in the deployment's Swagger docs at `<apiUrl>/docs/` (`apiUrl` from `signals status --json-output`).
- Install the SDK with the project's package manager. Don't type a version into the manifest from memory.
- Use the values for the agreed use case, with a fallback when they're empty.
- Never put the Signals key in browser code or in a file that gets committed.

Then check it end to end:

1. Run `snowplow-cli signals status --json-output`. `"ok": true` means the app's credentials reach the Signals API. Otherwise fix what `reason` points at: `config` (values missing from `.env`), `auth` (key rejected), or `network` (Console or the Signals API failed). If you can't, suggest re-running `snowplow-cli signals setup`.
2. Open the app as a visitor, trigger the events, and get that visitor's identifier the same way the app does.
3. Call the app's route or code path that fetches the service and confirm it returns values for that identifier. To tell an app bug from a Signals one, compare with signals_get_online_attributes for the same service and identifier.

### Phase 5: Final Report

- If Step 1 moved on before events showed, call get_pipeline_metrics again. If they still don't show, mark Step 1 as not done and say what to check.
- Show the four-step status again with evidence, marking each step as done in this session, already done before, or not done with the reason and what the user needs to do.
- List what was created in Snowplow and the files changed.
- Explain that attributes fill in from new events onwards, so other visitors' values start empty until they're active.
- End with a short "Before you deploy" list, with only the items that apply: for example, set the `SNOWPLOW_SIGNALS_*` variables in production, and make sure the production tracker sends to the Signals pipeline (name it), since Signals sees no events from other pipelines.

## Important Notes

- `.env` holds a secret key: never read, search, or print it, or ask the user to paste keys into chat; `snowplow-cli signals status` checks it for you
- Never publish, or deploy a schema to production, without an explicit approval for it
- Reuse existing schemas, attribute keys, groups, and services when they fit; never create a duplicate
- If a Snowplow MCP call fails with an auth error, ask the user to sign in to the Snowplow MCP again (in Claude Code, `/mcp`)

## Tools

- `list_signals_environments` — find the Signals environment and its pipeline
- `list_pipelines`, `get_pipeline_metrics` — check events arrive at the Signals pipeline for the app's `app_id`
- `get_collector_config` — the Signals pipeline's collector endpoint
- `fetch_documentation_index`, `fetch_documentation_page` — check the tracker's and Signals' docs before writing code
- `list_source_apps`, `list_tracking_plans`, `list_event_specifications` — existing tracking
- `list_schemas`, `get_schema_properties` — existing schemas to reuse
- `create_schema_version`, `promote_data_structure` — a custom event's schema, to development, then to production after approval
- `create_source_app`, `create_tracking_plan`, `edit_tracking_plan`, `create_event_specification` — document the events in a tracking plan
- `signals_list_attribute_keys`, `signals_create_attribute_key` — attribute keys
- `signals_list_attribute_groups`, `signals_create_attribute_group`, `signals_test_attribute_group` — attribute groups
- `signals_list_services`, `signals_create_service` — services
- `signals_publish` — make the attribute group and service live, after approval
- `signals_get_online_attributes` — compare the app's values with what Signals returns
