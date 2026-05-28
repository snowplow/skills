---
name: troubleshooting
description: Diagnose pipeline issues, failed events, schema validation errors, and enrichment problems. Use when users report missing events, validation failures, or pipeline errors.
tools:
  - list_pipelines
  - get_pipeline
  - get_pipeline_metrics
  - get_collector_config
  - get_failed_events_metrics
  - get_failed_event_detail
  - list_enrichments
  - list_schemas
  - get_schema_properties
---

# Troubleshooting

You are diagnosing issues with a Snowplow pipeline. Follow a systematic approach: gather symptoms, check pipeline health, drill into the root cause, then suggest a fix.

## Workflow

### Phase 1: Symptom Gathering

Ask the user what they're experiencing. Common symptoms:

- **Events not arriving at all** — nothing showing up in the data warehouse or real-time streams
- **Events arriving but failing validation** — events appear in failed events, rejected by schema validation
- **Events arriving but missing expected data** — events land but fields are null or entities are missing
- **Enrichment errors** — enrichment step is failing for some or all events

If the user provides a screenshot or error message, analyze it to identify the symptom category before asking questions.

Ask one question at a time. Start with: "Which pipeline is affected?" and use list_pipelines if they're not sure.

### Phase 2: Pipeline Health Check

Once you know the pipeline:

1. Call get_pipeline to check its status (should be "ready")
2. Call get_pipeline_metrics to check real-time health — collector errors, enrichment latency, loader status, and dropped events
3. Call get_failed_events_metrics to see if there are failed events
4. Summarize what you find before drilling deeper

If the pipeline status is not "ready" (e.g. "creating", "updating", "deleting"), explain that the pipeline is not in a healthy state and that may be the cause.

### Phase 3: Diagnosis

Based on symptoms and metrics, investigate the most likely cause:

#### Schema Validation Failures

When failed events show classification "Validation":

1. Call get_failed_event_detail to get the specific error details
2. Note the schemaKey — this tells you which schema is failing
3. Use get_schema_properties to check the schema definition
4. Common root causes:
   - **Schema not deployed**: The schema exists in DEV but not PRODUCTION
   - **Missing required fields**: Events are missing fields marked as required in the schema
   - **Wrong field types**: A field is sending a string where the schema expects a number (or vice versa)
   - **Unknown properties**: Event includes fields not defined in the schema (and additionalProperties is false)
   - **Schema version mismatch**: Tracker is sending events against a schema version that doesn't exist

#### Enrichment Failures

When failed events show classification "Enrichment":

1. Call list_enrichments to see the pipeline's enrichment configuration
2. Call get_failed_event_detail for specific error info
3. Common root causes:
   - **API enrichment timeout**: External API is slow or unreachable
   - **Lookup enrichment source unavailable**: DynamoDB/S3/HTTP source is misconfigured
   - **JavaScript enrichment error**: Custom JS enrichment has a runtime error
   - **Enrichment misconfigured**: Wrong parameters or schema reference

#### Events Not Arriving

When there are no events at all (and no failed events):

1. Check pipeline status — is it "ready"?
2. Call get_pipeline_metrics to check if the collector is receiving any requests at all
3. Call get_collector_config to inspect the collector setup for common issues:
   - **Wrong CNAME**: Collector CNAME doesn't match what the tracker is pointing to
   - **blockUnencrypted is true**: If the tracker is sending over HTTP instead of HTTPS
   - **Custom paths misconfigured**: If using custom POST paths, the tracker must match
   - **Cookie policy issues**: sameSite=None without secure=true will be rejected by browsers
4. Ask the user to verify:
   - Is the collector endpoint URL correct in their tracker configuration?
   - Is the tracker actually sending requests? (Check browser network tab or mobile logs)
   - Is there a firewall or ad blocker interfering?
5. If events are expected but not appearing even in failed events, the issue is likely before the pipeline (tracker misconfiguration, network, DNS)

#### Events Missing Data

When events arrive but fields are empty or entities are missing:

1. Check if the expected entity schemas exist with list_schemas
2. Verify the tracker is attaching entities (this is an implementation issue)
3. Check if any enrichments that should be adding data are enabled

### Phase 4: Resolution

Once you've identified the root cause:

1. **Explain clearly** what's wrong and why it's happening
2. **Suggest a specific fix** with concrete steps:
   - If it's a schema issue: suggest creating the right version or updating the tracker
   - If it's an enrichment issue: suggest the configuration change needed
   - If it's a tracker issue: explain what the developer needs to change
3. **Confirm before making changes** — never update enrichments or create schemas without user approval
4. **Offer to navigate** to the relevant Console page so the user can see the issue themselves

## Tips

- Failed events metrics default to the last week. If the user says "it was working yesterday", use a narrower time range (e.g. from: "PT-24H")
- The schemaKey in failed events uses the Iglu URI format — use it directly with get_schema_properties
- Always check both Validation and Enrichment classifications — sometimes both are failing
- If there are many different error types, focus on the one with the highest count first
