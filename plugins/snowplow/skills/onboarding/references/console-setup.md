# Stage 3 Create in Console

Everything runs through Snowplow MCP tools. Each step names the tool and the fields that matter. Use `get_schema_properties` on an Iglu URI when you need to confirm what a deployed schema contains.

## Order

1. Schemas. `list_schemas` first: when a schema with the same vendor and name exists, create its next version instead of `1-0-0`. Then `create_schema_version` per entity and event with `type: entity` or `type: event`, `vendor`, `name`, `version`, `description`, and the `schema` from Stage 2. The call validates the schema and deploys it to DEV.
2. Source app. `create_source_app` with `name`, `tracker` from the platform table in `references/instrumentation.md` (`javascript` for web), `appIds: ["<app-id>"]`. Add `trackedEntities` only for entities sent with every event (a `user` entity, for example). Entities listed here are inherited by every event spec in a plan linked to this source app, so never repeat them on the specs. The default design from Stage 2 has none.
3. Tracking plan. `create_tracking_plan` with `name`, `description`, `sourceApplicationIds: ["<source-app-id>"]`.
4. Event specifications. One `create_event_specification` per event with `name` in title case ("Checkout Completed"), a `description` that says when it fires, `eventSource` as the full Iglu URI with version, `trackingPlanId`, and `trackedEntities` for the entities specific to this event from the Stage 2 list, each with `source`, `minCardinality` (`1` when the event cannot happen without it, else `0`) and `maxCardinality`. Leave `eventInstructions` and entity `schema` out, they are for specs that share one schema with other specs.
5. Promote. `promote_data_structure` with `target: PROD` for every schema from step 1. The pipeline validates against PROD only.
6. Publish. `publish_tracking_plan` with the plan id. It is asynchronous.
7. Poll. `get_tracking_plan` until every spec is `published`. `published` means the specs were delivered, Micro and the pipeline can take up to five minutes more to pick them up. Do not wait for that, Stage 5 handles it.

App ID: lowercase, hyphenated, the product name (`acme-web`). The tracker config in Stage 4 uses the same value.

## Iglu URIs

`iglu:<vendor>/<name>/jsonschema/<version>`, for example `iglu:com.acme/product/jsonschema/1-0-0`. Specs and source apps need the full version.

## Existing customer

Create the schemas, the source app, the plan and the specs, but do not promote or publish. Test in Micro, which validates DEV schemas and draft specs, and promote to PROD and publish only after the user has reviewed and accepted.

## Git-managed resources

`snowplow-cli` manages data structures and tracking plans from a git repository, GitOps style. Resources managed that way are locked in Console, which is why some write tools refuse them. The CLI docs below cover it if the organization uses it or user asks about it.

## Docs

- [Data structures](https://docs.snowplow.io/docs/event-studio/data-structures.md)
- [Source applications](https://docs.snowplow.io/docs/event-studio/source-applications.md)
- [Tracking plans](https://docs.snowplow.io/docs/event-studio/tracking-plans.md)
- [Event specifications](https://docs.snowplow.io/docs/event-studio/tracking-plans/event-specifications.md)
- [CLI data structures](https://docs.snowplow.io/docs/api-reference/snowplow-cli/data-structures.md)
- [CLI tracking plans](https://docs.snowplow.io/docs/api-reference/snowplow-cli/tracking-plans.md)
