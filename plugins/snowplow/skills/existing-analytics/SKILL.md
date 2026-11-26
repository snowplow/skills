---
name: existing-analytics
description: "Send the events a site already tracks with Segment, RudderStack, Google Analytics 4 (GA4) or Google Tag Manager (GTM), Amplitude, Adobe (Web SDK, AppMeasurement, Tags, Event Forwarding), or PostHog to Snowplow, so Signals can calculate attributes and deliver interventions on them without retagging. Installs a tested adapter, creates the two schemas it needs, and checks that events arrive. Use when a user wants Signals, personalization, or real-time attributes but already tracks with one of these tools, asks to forward or mirror events from one of them to Snowplow, or mentions external_event or external_identity, even if they don't name Signals. If the site has no other analytics tool, use signals-setup or implementation-guidance instead. Hand over to signals to build attribute groups once events arrive. Triggers: existing analytics, Segment to Snowplow, GA4 to Snowplow, GTM, Amplitude, Adobe, PostHog, RudderStack, without retagging, adapter, mirror events, forward events."
compatibility: Requires Node.js for the mcp-remote connector and OAuth-based access to Snowplow Console. Adapter scripts are plain JavaScript with no dependencies.
---

# Use Signals with existing analytics

You are helping a user send the events their site already sends to another analytics tool to Snowplow, so Snowplow Signals can calculate attributes on them. An **adapter** maps each event from the tool to a Snowplow event and sends it to the user's Collector. The user keeps their existing tool.

Each tool has a tested setup in `references/<tool>.md` and reference mapping scripts in `scripts/<tool>/`. Start from them rather than writing a mapping from scratch: they already handle edge cases such as missing currencies, ID length limits, retries, and deduplication. Adapt them to the user's setup where it needs it, such as their event names, TypeScript, a bundler, or a framework's routing, as long as the output still follows [the mapping contract](#the-mapping-contract) and [Identifiers and keys](#identifiers-and-keys). The Signals guidance in Phase 5 depends on that output.

| Tool | Reference | Recommended approach |
| --- | --- | --- |
| Segment | `references/segment.md` | Destination plugin in analytics.js |
| RudderStack | `references/rudderstack.md` | Custom device mode integration |
| GA4 and GTM | `references/ga4-and-google-tag-manager.md` | Snowplow tag templates in the web GTM container; the page script if gtag.js runs without GTM |
| Amplitude | `references/amplitude.md` | Destination plugin in the Browser SDK |
| Adobe | `references/adobe.md` | Web SDK `onBeforeEventSend` callback |
| PostHog | `references/posthog.md` | `before_send` hook in posthog-js |

The user-facing docs are at https://docs.snowplow.io/docs/signals/data-sources/existing-analytics.md.

## Phase 1: Find the tool and choose the approach

1. Search the codebase for the tool's snippet or SDK: `analytics.load`, `rudderanalytics`, `gtag(`, `googletagmanager.com`, `amplitude.init`, `alloy(`, `s_gi` or `AppMeasurement`, `adobeDataLayer`, `posthog.init`.
2. If the site loads the tool only through a tag manager, the change is in the tag manager, not the codebase. Tell the user, and give them exact UI steps from the reference file unless you have browser access to that tag manager.
3. Default to the recommended approach in the table. Use a server-side approach only for events that don't come from a browser (server libraries, mobile apps), or when the user can't change the page. Never send the same browser events through both, or they arrive twice under two visitor keys.
4. For PostHog, RudderStack, and Amplitude, check whether the tool's official MCP server is connected. If it is, use it to read the event names the site actually sends, so the event-name lists in Phase 3 match.

## Phase 2: Create the two schemas

Every adapter sends a generic `external_event` and attaches an `external_identity` entity to every event. These schemas aren't on Iglu Central: the user creates them in their own registry, under their own vendor. Until they exist in the environment the Collector validates against, every event fails validation, including page views.

1. Call `list_schemas` to find the user's vendor (the vendor their existing schemas use) and whether `external_event` and `external_identity` already exist. Ask the user to confirm the vendor.
2. If they don't exist, call `create_schema_version` twice, with `vendor` set to the user's vendor and `version` `1-0-0`. Take `name`, `description`, and the `schema` body (`type`, `properties`, `required`, `additionalProperties`) unchanged from `references/schemas/external_event.json` and `references/schemas/external_identity.json`. Use `type: event` for `external_event` and `type: entity` for `external_identity`. Change nothing else: the scripts depend on the field names and limits.
3. Confirm both are deployed to the development environment before testing. Promote them to production with `promote_data_structure` only after the user explicitly approves.
4. If the repository manages schemas through CI/CD, add the two schema files there instead, with `com.example` in `self.vendor` replaced by the user's vendor, and tell the user which merge publishes them.

## Phase 3: Install the adapter

1. Get a Collector URL. If the user gave one, use it for production. Test first against the Console development environment, a hosted Snowplow Micro included with every trial: find it with `list_micros`, or the pipelines with `list_pipelines`. Check that Signals is set up with `list_signals_environments`.
2. Get the app ID: ask the user, or reuse a source app from `list_source_apps`.
3. Follow the reference file for the chosen approach. Copy the scripts from `scripts/<tool>/` into the user's code, static assets, or tool configuration. Set the adaptation points the reference file names: the schema vendor, the Collector URL, the app ID, and the event-name lists for ecommerce and search events if the user's names differ from the tool's standard names. Adapt anything else the user's setup needs, and keep the edge-case handling unless it can't apply. Tell the user what you changed beyond the adaptation points.
4. For a server-side approach on PostHog or RudderStack with the tool's MCP server connected, create the destination or transformation through it instead of giving the user UI steps, and test it there before you send real traffic. Ask before you create or change anything in the tool, as you would in Console.

## Phase 4: Verify

1. Send a page view, a product view, an order, and a login or identify call through the user's tool.
2. Check with `list_micro_events` and `get_micro_event`, or `get_failed_events_metrics` and `get_failed_event_detail` on a pipeline, that the events in the reference file's "Check it works" list arrive and none failed.
3. If you changed the scripts beyond the adaptation points, also check each event against [the mapping contract](#the-mapping-contract): the rung it took, the schemas and entities, `external_identity` on every event, and the user ID only in `user_id` fields, never in `domain_userid` or `anonymous_id`.
4. Fix failures before you switch to the production Collector. A failure on every event usually means the two schemas aren't deployed to that environment, or the vendor in the script doesn't match the vendor the schemas were created under.

## Phase 5: Privacy, then attributes

1. Walk through the privacy points in Important Notes with the user before production traffic.
2. If Signals isn't set up in the project yet, hand over to `signals-setup`. Otherwise hand over to `signals` to build attribute groups and interventions for the user's use case, passing on the facts in [Attributes on adapter events](#attributes-on-adapter-events).
3. To deliver interventions to the page, follow `references/interventions.md`.

## The mapping contract

Every adapter maps an event the same way. It takes the first rung that fits:

1. **Page view:** native `page_view`, with URL, title, and referrer in the standard fields.
2. **Ecommerce:** `iglu:com.snowplowanalytics.snowplow.ecommerce/snowplow_ecommerce_action/jsonschema/1-0-2`, with one `product` entity per product, and `cart`, `checkout_step`, `transaction`, or `refund` entities, shaped as the Snowplow ecommerce plugin sends them. Only events the tool defines as ecommerce take this rung. Missing required fields are handled per tool: Segment, RudderStack, PostHog, and the GA4 page script send an order with no currency or order ID as `external_event`; the GA4 GTM tag templates don't check, so a GA4 order missing those fields fails validation (see the reference); Adobe fills `USD` and `unknown`; Amplitude uses the event's `insert_id` as the order ID. Each reference file says which.
3. **Site search:** `iglu:com.snowplowanalytics.snowplow/site_search/jsonschema/1-0-0`, with the term in `terms`.
4. **Identify:** `iglu:com.snowplowanalytics.snowplow/identify/jsonschema/1-0-0`, holding the user ID only. Traits are dropped.
5. **Google's schemas (GA4 only):** on Iglu Central under three vendors. `com.google.tag-manager.server-side` for recommended events such as `sign_up`, `generate_lead`, and `share`, which every GA4 approach sends. `com.google.ga4` for `user_engagement`, and `com.google.ga4.enhanced-measurement` for Enhanced Measurement events such as `scroll`; only server-side GTM sends these two.
6. **`iglu:<vendor>/external_event/jsonschema/1-0-0`** for everything else, with typed fields only: `name` (the tool's event name), `tool` (lower case, such as `segment`), `kind` (`track`, `identify`, `group`, `alias`, `screen`, or `page`), `value`, `currency`, `item_id`, `item_category`, `search_term`, `plan`, `group_id`, and `previous_id`.

Every event also carries the `iglu:<vendor>/external_identity/jsonschema/1-0-0` entity: `tool` (required), `anonymous_id`, `user_id`, `session_id`, `session_number` (GA4 only), `event_name`, and `event_id` (the tool's own event ID, such as a Segment `messageId`). It's sent with a null `anonymous_id` when the tool hasn't set its ID yet.

## Identifiers and keys

- **Client-side approaches** use the Snowplow tracker's random `domain_userid` and `domain_sessionid`. These are the only keys safe on the public intervention endpoint.
- **Server-side approaches** put the tool's own visitor ID in `domain_userid`: Segment and RudderStack `anonymousId`, GA client ID, Amplitude `device_id`, Adobe ECID, PostHog `$device_id`. Only PostHog (`$session_id`) and Amplitude (a key built from `device_id` and session ID) have sessions. Read these attributes from the user's backend only. Never deliver interventions to them.
- On PostHog server-side events with no `$device_id`, the adapter treats `distinct_id` as anonymous. See `references/posthog.md`.
- `user_id` and `group_id` are never safe on the public endpoint. Read them from the backend through the Profiles API.
- To combine anonymous and logged-in activity, use identity resolution keyed on `snowplow_id` (needs Snowplow Identities on the pipeline).

## Attributes on adapter events

When handing over to `signals`, pass on these facts:

- The user's vendor for `external_event` and `external_identity`.
- Every custom event is the same `external_event` type, so each attribute on it needs a criteria filter on `name`, using the tool's event name exactly.
- Ecommerce attributes read `snowplow_ecommerce_action` `type` with the `product` and `transaction` entities. One attribute reads one product entity per event.
- Key visitor groups on `domain_userid` and session groups on `domain_sessionid`. Session groups on server-side approaches work only on PostHog and Amplitude.
- Attributes without a time window expire after 7 days without an update. For values meant to persist, such as the first referrer, current plan, or account ID, set `ttl` to 365 days (the **Time to live (TTL)** field in Console).
- Build groups for the user's use case. Don't offer a generic set of starter groups.

## Important Notes

- **Send the user ID as the tool holds it.** Never hash, drop, or rewrite it. The scripts make two exceptions to fit field limits: IDs over 128 characters are hashed into `domain_userid` and `network_userid`, and user IDs over 255 characters are truncated in `user_id` and `external_identity.user_id`.
- **Don't add properties that aren't schema fields.** Signals only reads declared fields. If the user needs a property `external_event` doesn't have, track that event natively instead: https://docs.snowplow.io/docs/signals/data-sources/existing-analytics/move-to-native-tracking.md.
- **Schema versions can only be created, never edited.** If the user needs a field the schema lacks, that's native tracking, not a new `external_event` version: the scripts are written against 1-0-0.
- **Privacy.** Before production traffic, agree these with whoever owns privacy for the site:
  - Whether user IDs that are email addresses may reach Snowplow. The adapters send them unchanged.
  - Whether page URLs with query strings, and search terms, may reach Snowplow.
  - On client-side approaches with a Collector on the same site as the pages, the browser sends the tool's cookies to the Collector (for example Segment's `ajs_user_id`). Fix with a Collector on another site, or `credentials: 'omit'` in `newTracker`.
  - Consent: the Adobe callbacks and the PostHog hook follow the tool's consent state. Segment, RudderStack, and Amplitude client-side adapters run on every event the tool processes. GTM tag templates follow only the consent settings given to the Snowplow tags. The GA4 page script ignores Consent Mode, so load it only after consent. Server-side GTM needs the consent condition in `references/ga4-and-google-tag-manager.md`. Other server-side destinations forward everything the tool ingests. Gate loading the Snowplow tracker on the same consent signal as the tool.

## Tools

- `list_schemas` — find the user's vendor and whether `external_event` and `external_identity` exist and are deployed
- `create_schema_version` — create the two schemas under the user's vendor
- `promote_data_structure` — promote the schemas to production, after explicit approval
- `search_iglu_central` — check Snowplow's and Google's schemas the adapters use
- `list_pipelines` — find Collector endpoints
- `list_micros` — find the Console development environment for testing
- `list_micro_events` — check which test events arrived and why any failed
- `get_micro_event` — read one test event in full
- `get_failed_events_metrics` — failed event counts on a pipeline
- `get_failed_event_detail` — why a pipeline event failed
- `list_signals_environments` — check that Signals is set up
- `list_source_apps` — reuse an existing app ID
