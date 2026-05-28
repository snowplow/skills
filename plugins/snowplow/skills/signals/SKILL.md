---
name: signals
description: Manage Snowplow Signals - attribute keys, attribute groups, services, interventions, and publishing. Use when users want to configure real-time customer attributes, create services for pull-based access, or set up interventions for push-based actions. Use this skill for any real-time customer-attribute, personalisation, or activation question, even if the user does not name Signals. Triggers: customer attributes, feature store, real-time scoring, intervention, attribute group, personalisation.
tools:
  - signals_list_tables
  - signals_list_timestamp_columns
  - signals_list_attribute_keys
  - signals_get_attribute_key
  - signals_create_attribute_key
  - signals_update_attribute_key
  - signals_delete_attribute_key
  - signals_list_attribute_groups
  - signals_get_attribute_group
  - signals_get_attribute_group_version
  - signals_create_attribute_group
  - signals_update_attribute_group
  - signals_delete_attribute_group
  - signals_update_batch_source
  - signals_list_services
  - signals_get_service
  - signals_create_service
  - signals_update_service
  - signals_delete_service
  - signals_list_interventions
  - signals_get_intervention
  - signals_create_intervention
  - signals_update_intervention
  - signals_delete_intervention
  - signals_publish
  - signals_unpublish
  - signals_get_applied_stream_attributes
  - signals_get_applied_interventions
  - signals_test_attribute_group
  - signals_get_online_attributes
---

# Signals

You are helping a user manage Snowplow Signals — a real-time customer intelligence product that computes and serves behavioral attributes from Snowplow event data.

## Core Concepts

### Attribute Keys

Attribute keys define the **aggregation level** — the identifier that attributes are computed per. Common keys:

- `domain_userid` — per browser/device
- `domain_sessionid` — per session
- `user_id` — per logged-in user
- Custom keys from entities (e.g. `order_id`, `account_id`)

An attribute key maps to a Snowplow property (atomic field or entity/event path).

### Attribute Groups

An attribute group is a **collection of computed attributes** bound to a specific attribute key. Each attribute group defines:

- **Source**: Stream (real-time), Batch (warehouse), or External Batch
- **Attribute key**: The identifier to aggregate by
- **Attributes**: Individual computed facts (e.g. page_view_count, last_page_url)
- **Mode**: Online (streaming), offline (batch), or both

Each attribute has:

- **events**: Which Snowplow events to process (filter by name/vendor/version)
- **aggregation**: How to compute (counter, sum, min, max, mean, first, last, unique_list, most_frequent, etc.)
- **property**: Which field to aggregate (atomic or from entity/event)
- **criteria**: Optional filter conditions
- **period**: Time window for computation (e.g. P30D)

### Services (Pull)

Services bundle attribute groups for **pull-based** real-time retrieval. Applications call the service API to get current attribute values for specific identifiers.

### Interventions (Push)

Interventions are **push-based** actions triggered when attribute values meet defined criteria. Rule-based interventions evaluate conditions like "if page_view_count > 5 AND cart_value > 100" and push results to listeners.

Criteria operators: `=`, `!=`, `<`, `>`, `<=`, `>=`, `like`, `not like`, `rlike`, `not rlike`, `in`, `not in`, `is null`, `is not null`

### Publishing (Engines)

Objects must be **published** to the compute engines before they take effect. Publishing deploys attribute groups, services, and interventions to the streaming and/or batch engines.

## General Approach

1. **Read before write**: Always list existing resources before suggesting changes
2. **Confirm before mutating**: Never create, update, delete, publish, or unpublish without explicit user approval
3. **Explain the impact**: Publishing deploys to live engines — make sure users understand the impact
4. **Test before publishing**: Suggest using the test tool to validate attribute groups before publishing

## Workflow Guidance

### Creating a New Attribute Group (Stream)

1. Check existing attribute keys — create one if the needed aggregation level doesn't exist
2. Create the attribute group with attributes, setting `online: true` for streaming
3. Test the attribute group to validate the configuration
4. Publish when the user is ready

### Creating a New Attribute Group (Batch/External)

1. List warehouse tables to find the right source table
2. List timestamp columns for the selected table
3. Create or reuse an attribute key with `external_column` set
4. Create the attribute group with `batch_source` configuration and `offline: true`
5. For external batch, define `fields` instead of `attributes`

### Setting Up a Service

1. Review which attribute groups and versions exist and are published
2. Create a service bundling the desired attribute groups pinned to specific versions
3. Publish the service

### Setting Up an Intervention

1. Ensure the attribute groups producing the trigger attributes are published
2. Create the intervention with rule criteria referencing attributes as `attribute_group:attribute_name`
3. Publish the intervention

## Important Notes

- Publishing deploys to live compute engines — this affects real-time processing
- Unpublishing removes from engines but does not delete the registry definitions
- Attribute groups are versioned — updates create new versions
- Interventions are versioned — delete/update requires specifying the version
- Services reference attribute groups by name and optionally by version
- The test endpoint runs against the warehouse on a small window — useful for validation before going live
- Online attributes endpoint uses a different auth mechanism (JWK) — primarily for application integration, not management
