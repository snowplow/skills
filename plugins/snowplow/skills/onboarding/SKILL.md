---
name: onboarding
description: >
  Guided Snowplow setup that demonstrates the value of the product end to end: create a demo
  app when there is no app to work on, plan what to track, implement the tracking, test that
  the events arrive, and query the collected data. Offer it when a user asks vaguely what the
  agent can do with Snowplow, where to start, or how to get going after signing up for a
  trial, and run it only when they accept or explicitly ask for the walk-through. Does not
  trigger on a specific task such as adding an event, designing a schema or fixing a tracker.
  Triggers: what can you do with snowplow, where do I start with snowplow, how do I get
  started with snowplow, I just signed up for snowplow, new to snowplow, help me with
  snowplow, snowplow trial, walk me through snowplow onboarding.
---

# snowplow-onboarding

Walk a developer from "I know nothing about Snowplow" to a first query over their own events. The main goal is to show the value of Snowplow, and demonstrate how easy it's to implement with the help of agents.

Assumptions: the Snowplow MCP bundled with this plugin is connected and the user is an admin of the organization. If the MCP or the skills are missing, `npx plugins add snowplow/skills` installs both. The machine has git, Node.js 18 or newer with npm and npx, and a browser for one login. Any platform with a Snowplow tracker is in scope. Snowtype generates typed code for ten of them, the rest call the tracker directly.

## Start

Offer the guided setup, start it only if the user says yes.

1. Describe it in plain words: the agent adds tracking to an existing app or creates a demo one, checks that the events arrive, and ends with a first query over the collected data. The onboarding is mostly hands off, only the warehouse connection step requires manual work.
2. Ask whether to start. Proceed only after approval.

## Rules

1. Decide, do not ask. After the start question, trial or existing customer, pipeline, Micro, target app, vendor, what to track and how to design it all come from the MCP and the repo. State each decision in one line as you go and list them in the final summary, so the user can redirect. Wait for the user only where the agent cannot act: the browser login in Stage 4, the app actions in Stage 5 when the agent cannot drive the app, and the warehouse connection in Stage 6. Show the design and wait only when the user explicitly asked to review before changes.
2. Stop early when nothing downstream can work: the MCP is not authenticated, no pipeline is `ready`, or `list_micros` is empty. Say what to do and end.
3. Credentials stay in a gitignored `.env` and never reach the model: do not ask for them, read them or print them.
4. Every path in this skill is relative to the project root, which Stage 1 sets. After each stage, update `docs/snowplow-onboarding.md` (template at the end). On entry, look for it in `docs/`, then in `snowplow-demo/docs/`: the directory that holds it is the project root. Resume from the first stage that is not done.
5. Tool names below are Snowplow MCP tools.

## Stages

| # | Stage | Done when | Detail |
|---|---|---|---|
| 1 | Inventory | Trial or existing customer, project root, pipeline id, collector host, Micro endpoint, vendor, target app and platform recorded | `references/inventory.md` |
| 1b | Demo app | Only when Stage 1 found no app: the demo shop runs locally | `references/demo-app.md` |
| 2 | Design | A JSON Schema per entity and event in the progress file | `references/design.md` |
| 3 | Create in Console | Trial: every schema in PROD, every event spec `published`. Existing customer: every schema in DEV, every spec created | `references/console-setup.md` |
| 4 | Instrument | Tracker initialised, Snowtype code generated and wired, app builds | `references/instrumentation.md` |
| 5 | Verify | Every spec seen in Micro as a good event, no bad events for the app | `references/verify.md` |
| 6 | Destination | `list_destinations` shows an active warehouse or lake, tracker on the pipeline collector, one round of events sent | `references/destination.md` |
| 7 | Query | Generated view in the warehouse, three questions answered, one insight stated | `references/query.md` |

## Stage 1: Inventory

Follow `references/inventory.md`. The result of this step is trial or existing customer decided, and the project root, pipeline, collector host, Micro, vendor, target app and platform recorded in the progress file.

## Stage 1b: Demo app

Only when Stage 1 found no app. Follow `references/demo-app.md`. The result of this step is a demo shop in the project root, running locally and recorded as the target app.

## Stage 2: Design

Follow `references/design.md`. The result of this step is a JSON Schema per entity and event, and the entities each event carries, written into the progress file.

## Stage 3: Create in Console

Follow `references/console-setup.md`. The result of this step is every schema, the source app, the tracking plan and its event specifications created and published in Console, with their ids in the progress file.

## Stage 4: Instrument

Follow `references/instrumentation.md`. The result of this step is the implementation decided, Snowtype or direct tracker calls, and the tracking code integrated into the application, which builds and runs.

## Stage 5: Verify

Follow `references/verify.md`. The result of this step is every event specification seen in Micro as a good event and no bad events for the app.

## Stage 6: Destination

Follow `references/destination.md`. The result of this step is an active warehouse or lake destination with the tracker pointed at the pipeline collector and one round of events sent to it, or the run ended after Stage 5 because the user has no warehouse.

## Stage 7: Query

Follow `references/query.md`. The result of this step is a view generated from the tracking plan in the warehouse, three questions answered from it, and one insight in plain words in the progress file.

## Final summary

Show the value, not the inventory. In this order: the insight from the data, what is tracked and why, that every event was validated against the schemas and the event specifications so the data can be trusted, how little time the design and the setup took.

## Progress file

Create `docs/snowplow-onboarding.md` in the user's repo on the first run and keep it current
Example:

````markdown
# Snowplow onboarding

| Stage | Status | Notes |
|---|---|---|
| 1 Inventory | done | org <id>, pipeline <id>, collector <host>, micro <url>, vendor com.acme |
| 1b Demo app | skipped | app found |
| 2 Design | done | entities product, order; events add_to_cart, checkout_completed |
| 3 Create | done | source app <id>, plan <id>, specs <ids> |
| 4 Instrument | in progress | tracker in src/analytics/snowplow.ts, Snowtype out ./src/snowplow |
| 5 Verify | | |
| 6 Destination | | |
| 7 Query | | |

## Design

Entity, com.acme/product 1-0-0:

```json
{ ... }
```

Event, com.acme/add_to_cart 1-0-0, carrying product, required:

```json
{ ... }
```
````

## Docs

- [Quickstart with your coding agent](https://docs.snowplow.io/docs/get-started/quickstart.md)
- [Free trial and its limits](https://docs.snowplow.io/docs/get-started/free-trial.md)
- [Tracking design best practice](https://docs.snowplow.io/docs/fundamentals/tracking-design-best-practice.md)
- [Snowplow MCP](https://docs.snowplow.io/docs/ai/snowplow-mcp.md)
- [Snowplow CLI](https://docs.snowplow.io/docs/api-reference/snowplow-cli.md)
- [Snowtype](https://docs.snowplow.io/docs/event-studio/implement-tracking.md)
