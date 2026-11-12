# Stage 5 Verify

The tracker points at the Micro endpoint, and the Micro is where the agent reads events.

Trigger the actions. Two forks:

- The agent can drive the app: a browser tool for a web app, direct calls to a server's endpoints, a simulator for a mobile app. Do it.
- It cannot: send one CLI event per spec to the Micro, as close to the real events as possible, and say so in the final summary. Then give the user the app's URL, ask them to click around, and poll the Micro while they do, reporting each event as it lands.

Call `list_micro_events` with the Micro id from `list_micros`, a filter on `app_id`, and `kind: bad` for failures. The failure entity on a bad event names the schema and the property. `kind: good` with a filter on `event_name` confirms each spec was seen; a good event that violates its spec carries an `event_specification_validation` entity. When that entity says the spec was not found, the Micro does not have the spec yet: it refreshes its copy every five minutes, so a spec that Console already shows as published can still be missing. Wait five minutes, send the event again, and repeat until it validates. After three rounds stop and check that the spec is published and that the id in the event matches it. `get_micro_event` shows one event with every column. The Micro keeps events seven days and validates DEV schemas and draft specs. `<micro-endpoint>/micro/ui` is where the user can watch events live. When nothing at all reaches the Micro and there is no error anywhere, an ad blocker in the browser is the usual cause: try a private window or pause it.

Done when every spec has been seen as a good event with no `event_specification_validation` entity and there are no bad events for the app. Do not report success to the user before that. The tracker stays on the Micro, Stage 6 moves it to the pipeline once there is somewhere to load into.

## Docs

- [Micro UI](https://docs.snowplow.io/docs/testing/snowplow-micro/ui.md)
- [Snowplow Inspector](https://docs.snowplow.io/docs/testing/snowplow-inspector.md)
- [Failed events](https://docs.snowplow.io/docs/get-started/failed-events.md)
- [Event specification validation](https://docs.snowplow.io/docs/event-studio/tracking-plans/event-specification-validation.md)
