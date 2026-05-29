---
name: console-operations
description: Create, update, or delete Snowplow Console resources — enrichment configuration, data quality alerts, source applications, and tracking plans. Use when the user wants to mutate Console state. For read-only inspection use the pipeline-infrastructure or tracking-design skills instead. Triggers: create alert, update enrichment, add source app, create tracking plan, enable enrichment.
tools:
  - list_pipelines
  - get_pipeline
  - get_pipeline_metrics
  - get_collector_config
  - list_minis
  - list_micros
  - list_enrichments
  - update_enrichment
  - list_data_quality_alerts
  - create_data_quality_alert
  - update_data_quality_alert
  - delete_data_quality_alert
  - list_source_apps
  - create_source_app
  - list_tracking_plans
  - get_tracking_plan
  - create_tracking_plan
  - get_event_spec_metrics
  - list_data_catalog
  - search_data_catalog
compatibility: Requires Node.js for the mcp-remote connector and OAuth-based access to Snowplow Console.
---

# Console Operations

You are helping a user manage their Snowplow BDP Console resources. Follow these principles:

## General Approach

1. **Read before write**: Always list or get existing resources before suggesting changes
2. **Confirm before mutating**: Never create, update, or delete resources without explicit user approval
3. **Navigate after changes**: After any mutation, offer to navigate the user to the relevant Console page to verify

## Capabilities

### Pipeline Management

- List all pipelines with status, labels, and collector endpoints
- Inspect individual pipeline configuration including collector settings and enrichment flags
- View collector configuration details (CNAME, cookie policy, custom paths)
- View real-time pipeline metrics (collector RPS, enrichment latency, loader throughput, bad rows)
- List mini pipelines and their endpoints
- List Micro instances (name, endpoint, app version) — Micros run locally for development and testing, or as Snowplow-hosted instances
- Pipelines cannot be created or deleted via API — direct users to Console UI for that

### Enrichment Management

- List enrichments configured on a pipeline
- Enable or disable enrichments by updating their content with enabled: true/false
- Update enrichment parameters (e.g. adding cookies to cookie extractor, updating API keys)
- When updating an enrichment, you must send the complete content object — it's a full replacement, not a patch

### Data Quality Alerts

- List existing alerts
- Create new alerts for email or Slack notifications
- Alert types: ALERT (immediate) or DIGEST (periodic summary)
- Filters: by app ID, issue type (ValidationError, ResolutionError), or specific schemas
- For Slack alerts, user must have Slack integration set up first
- Update or delete existing alerts

### Tracking Plans

- List existing tracking plans (formerly called data products)
- Get a specific tracking plan with all its event specs using get_tracking_plan
- Create new tracking plans with name and description
- For adding event specs to tracking plans, use the tracking-design skill

### Source Applications

- List source apps and their configurations
- Create new source apps with tracker platform, app IDs, and entity associations
- Source apps define which tracker sends which entities — useful for documentation and validation

### Event Spec Metrics

- Retrieve event volume metrics for event specifications
- Shows total event counts, breakdown by app ID, and last seen timestamps
- Filter by tracking plan, source schema, schema version, or event spec status (draft/published)

### Data Catalog

- List all tracked schemas (events and entities) with their relationships
- Search the catalog by name, vendor, or description to find specific schemas
- See which events link to which entities and vice versa

## Workflow Recipes

### Add a Cookie to the Cookie Extractor Enrichment

1. Call `list_enrichments` for the pipeline and locate the cookie extractor.
2. Show the user the current `cookies` array from the enrichment content.
3. Ask which cookie name(s) to add and confirm the final list.
4. Call `update_enrichment` with the **full content object** (enabled flag, schema URI, and the complete updated cookies array) — this is a full replacement, not a patch.
5. Offer to navigate to the enrichment in the Console to verify.

### Create a Data Quality Alert for Validation Errors

1. Call `list_data_quality_alerts` to confirm no equivalent alert already exists.
2. Ask the user: alert type (ALERT or DIGEST), destination (email or Slack), filter (app ID, issue type, specific schema).
3. Present the proposed alert config and ask for confirmation.
4. Call `create_data_quality_alert` and report the resulting alert ID.

### Create a Source Application

1. Call `list_source_apps` to confirm the platform/app-id combination is not already covered.
2. Ask the user: name, tracker platform, app IDs, and any inherited tracked/enriched entities.
3. Confirm the proposal, then call `create_source_app`.
4. Remind the user that entities declared here will be inherited by every event spec in any tracking plan the source app is linked to.

## Important Notes

- Pipeline creation/deletion is not available via API
- Enrichment updates trigger a pipeline reconfiguration — warn users this may briefly affect event processing
- Deleting a data quality alert cannot be undone
- Source app lock status: "locked" source apps cannot be modified
