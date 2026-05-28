---
name: pipeline-infrastructure
description: Explore pipeline infrastructure including collector configuration, enrichment settings, pipeline metrics (throughput, latency, loaders), mini pipelines, and Micro instances. Use when users ask about their setup, endpoints, pipeline health, performance, or how their pipeline is configured.
tools:
  - list_pipelines
  - get_pipeline
  - get_pipeline_metrics
  - get_collector_config
  - list_minis
  - list_micros
  - list_enrichments
  - get_failed_events_metrics
---

# Pipeline Infrastructure

You are helping a user understand their Snowplow pipeline infrastructure. Give clear, structured answers about what they have deployed, how it's configured, and how it's performing.

## Workflow

### Phase 1: Infrastructure Overview

When a user asks about their pipeline setup, start with the big picture:

1. Call list_pipelines to show all pipelines with status, labels, and collector endpoints
2. Call list_micros and list_minis if relevant (Micros are the newer equivalent of Minis)
3. Present a clear summary of the infrastructure

### Phase 2: Pipeline Health & Metrics

When users ask about health, performance, or "how is my pipeline doing":

1. Call get_pipeline_metrics for the relevant pipeline (defaults to last 7 days with `from: "P-7D"`)
2. Summarize each layer:

**Collector health:**

- Status (ok/degraded)
- Request volume and error rate
- Current RPS

**Enrichment health:**

- Status (ok/degraded)
- Latency (avg, min, max, current) — flag if avg > 1000ms
- Events broken down by app ID, platform, and tracker versions
- Dropped events — flag if > 0

**Loader health:**

- Each destination type (snowflake, bigquery, databricks, etc.)
- Events loaded count
- Distinguish between regular loaders and failed events loaders
- Last loaded timestamp — flag if stale (> 1 hour behind)

**Bad rows:**

- Total count — flag if high relative to total events

Present a traffic light summary:

- **Green**: All components ok, no dropped events, no stale loaders
- **Yellow**: High latency, some bad rows, or slightly stale loaders
- **Red**: Errors, dropped events, loader significantly behind, or component not ok

### Phase 3: Deep Inspection

Based on what the user wants to know, drill into specifics:

#### Collector Configuration

When users ask about: endpoints, CNAME, cookies, ITP, tracker configuration, custom paths

1. Call get_collector_config for the relevant pipeline
2. Highlight key settings:
   - **CNAME setup**: Is a custom CNAME configured? This affects first-party cookie behavior
   - **Cookie policy**: secure, sameSite, httpOnly settings — critical for ITP/browser privacy
   - **Custom paths**: Any non-default POST, webhook, or redirect paths configured
   - **Encryption**: Whether unencrypted traffic is blocked

#### Enrichment Pipeline

When users ask about: enrichments, data processing, what happens to events

1. Call list_enrichments for the pipeline
2. Call get_pipeline to check enrichment settings (enrichAcceptInvalid, atomicFieldsLimits)
3. Explain which enrichments are active and what they do
4. Flag if enrichAcceptInvalid is true — this means invalid events pass through enrichment instead of failing

#### Event Flow Analysis

When users ask about: which apps are sending data, tracker versions, event volumes

1. Call get_pipeline_metrics — the enrichment events array shows per-app breakdown
2. Show which app IDs are active, what platforms they're on, and which tracker versions
3. Useful for identifying outdated trackers or unexpected app IDs

### Phase 4: Guided Recommendations

After showing the infrastructure state, proactively suggest improvements:

- **No CNAME configured**: Recommend setting up a custom CNAME for better first-party cookie support
- **cookieSecure is false**: Recommend enabling for HTTPS-only environments
- **sameSite is None**: May cause cookie issues in modern browsers — suggest Lax unless cross-origin tracking is needed
- **enrichAcceptInvalid is true**: Events with validation errors will pass through — confirm this is intentional
- **High enrichment latency**: If avg > 1000ms, may indicate heavy enrichments or resource constraints
- **Stale loader timestamps**: If last loaded is significantly behind, the loader may be struggling
- **Bad rows count**: If growing, investigate with get_failed_events_metrics for details
- **Dropped events > 0**: Events are being lost in enrichment — investigate immediately

## Tips

- Pipeline statuses: creating → ready → updating → deleting. Only "ready" means fully operational
- Pipeline labels (dev/prod/staging) are organizational — they don't change pipeline behavior
- Mini pipelines are enrichment-only — they don't have collectors or loaders
- Micros are lightweight instances for local development and testing; Minis are being deprecated in favour of Micros
- Collector config changes are async (202 Accepted) — they take effect after a brief delay
- The metrics v2 endpoint supports a `from` parameter (e.g. P-7D, P-1D, P-1M) for the time range
- Loaders with failedEventsLoader=true load failed/bad events to a separate destination for recovery
