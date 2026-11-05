# Stage 6 Destination

Goals of this step:

- An active destination, so the pipeline loads events into the user's own warehouse or lake.
- The tracker pointed at the pipeline collector instead of the Micro.
- One round of events sent, so Stage 7 has data to query.

Snowplow does not store events for you. Unlike a hosted analytics product, the pipeline collects, validates and enriches events and then loads them into a warehouse or lake the user owns: Snowflake, BigQuery, Databricks, Redshift, or a lake. The data lives only there, and that is where Stage 7 queries it. Two Console objects make that happen: a connection, which holds the warehouse credentials, and a destination, which ties a pipeline to a connection and says which events to load.

The connection and the destination are created in Console, in one wizard at Destinations → Warehouses and lakes → Add destination. Two forks:

- A browser automation tool is available: the user logs in to Console, then the agent drives the wizard, picks the pipeline and the warehouse type, and leaves the credential fields to the user, since credentials never reach the model.
- No browser tool: ask the user to run the wizard, tell them what to prepare, and wait.

Either way, poll `list_destinations` every few minutes until the destination is active. If the user has no warehouse, say so plainly: the Micro is the end of the trial path, and stop after Stage 5.

What they need ready. Snowflake: account URL, region, a loader user with key pair authentication, role, warehouse, database. The Snowflake destination page provides the SQL. BigQuery: project and a service account with the documented roles. Databricks: host, catalog, token. Trial allows one warehouse or lake destination.

When a warehouse MCP is connected, run the setup SQL from the destination page through it and report what was created. The Console step still belongs to the user.

When `list_connections` shows a connection labelled loader that is ready but no destination uses it, the agent creates the destination itself: `create_destination` with the pipeline id, the connection id, the destination type matching the connection, and `failedEventsLoader: false` for enriched events. Once the destination is active, only events sent after that get loaded, so then switch the tracker's collector host to the pipeline collector from Stage 1 and trigger the actions once more, the same way as in Stage 5, so Stage 7 has data. An existing customer stays on the Micro until the schemas reach PROD. `get_destination` gives database, schema and the events table for Stage 7.

## Docs

- [Warehouses and lakes](https://docs.snowplow.io/docs/destinations/warehouses-lakes.md)
- [Snowflake destination](https://docs.snowplow.io/docs/destinations/warehouses-lakes/snowflake.md)
