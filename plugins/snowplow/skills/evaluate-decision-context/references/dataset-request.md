# Dataset requests

`decision_eval.py request` writes this for you; this is what's in it and how Signals builds it. The request goes to `POST /api/v1/datasets/runs`.

```json
{
  "anchors": {
    "mode": "event",
    "criteria": {"all": [{"property": {"type": "atomic", "name": "event_name"}, "operator": "=", "value": "add_to_cart"}]},
    "max_per_session": 2,
    "training_span": {"start_time": "2026-01-01T00:00:00Z", "end_time": "2026-01-15T00:00:00Z"},
    "sample": {"max_sessions": 2000, "seed": "eval-v1"},
    "output": {"table": "stage_eval_anchors"}
  },
  "attributes": {"table_prefix": "stage_eval_attributes", "attribute_groups": ["<full group definitions>"]},
  "event_logs": ["<full event log definitions>"],
  "outcomes": [
    {"name": "purchased_later", "criteria": {"all": [{"property": {"type": "atomic", "name": "event_name"}, "operator": "=", "value": "purchase"}]}},
    {"name": "cart_within_10m", "criteria": {"...": "..."}, "within_seconds": 600},
    {"name": "user_back_within_7d", "criteria": {"...": "..."}, "attribute_key": "domain_userid", "within_seconds": 604800}
  ],
  "dataset": {"table": "stage_eval_dataset"}
}
```

## Anchors: when the call is made

Three modes. `request` fills in the span, sample and output table for `event` and `trigger`.

**Logs of past calls** (`user_supplied`): your table with the key columns (`domain_sessionid`) and `anchor_ts`; extra columns, such as the answers given at the time, are carried into the dataset. Context stops just before `anchor_ts`.

```json
{"mode": "user_supplied", "source": {"database": "ANALYTICS", "schema": "EVALS", "table": "JEV_CALLS"}, "has_label": false}
```

**An event** (`event`): every event matching `criteria` (event criteria, as in outcomes) is a moment; events sharing a timestamp in a session are one. `max_per_session` keeps the `first` N or a seeded `random` N. `include_anchor_event` says whether the context includes the event itself: false when the application calls the model as the event happens, true when the call follows Signals processing it.

```json
{"mode": "event", "criteria": {"all": [{"property": {"type": "atomic", "name": "event_name"}, "operator": "=", "value": "add_to_cart"}]},
 "max_per_session": 2, "pick": "random", "seed": "eval", "include_anchor_event": false}
```

**An attribute condition** (`trigger`): replays an agentic attribute's triggers and evaluation policy. Every event that updates one of the request's attributes is a candidate; the criteria are evaluated against attribute values after that event (`changed`, nested `all`/`any`/`none`, list membership and `rlike` behave as in the streaming engine); the policy keeps the first firing per session, then each next one at least `cooldown_seconds` later, up to `max_per_session`. Context includes the triggering event.

```json
{"mode": "trigger", "triggers": [{"type": "criteria", "criteria": {"attribute": "session_shopping:page_views", "operator": ">=", "value": 3}}],
 "evaluation_policy": {"cooldown_seconds": 600, "max_per_session": 2}}
```

`sample` (`{"max_sessions": 2000, "seed": "eval-v1"}`) limits event and trigger anchors to a deterministic sample of sessions. `variant-request` reuses a finished run's anchors table as `user_supplied` anchors.

## Context: what the model sees

- **Attributes**: point-in-time values per anchor, for every attribute in `attribute_groups`. They include the anchor event in trigger mode, and in event mode with `include_anchor_event`; otherwise they stop just before the anchor.
- **Event logs**: one array column per event log, holding the entries the streaming engine's buffer would have held: the same entry shape (projected properties, `event_id`, `event_name`, `page_urlpath`, `derived_tstamp`), trimmed to `max_age_seconds` and `max_events`, empty if the buffer would have expired. Snowflake only; selections by event specification aren't supported yet.

## Outcomes: what happened next

Each outcome is a boolean column: did an event matching `criteria` happen after the anchor, for the same `attribute_key` value (default `domain_sessionid`), within `within_seconds` if set? Without `within_seconds` an outcome follows the rest of the session; other keys need `within_seconds`. Outcomes never select or filter anchors.

## Limits

- Events sharing a timestamp in a session count as one moment.
- `changed` doesn't see values that change only with time (windows, time-since).
- The anchor-event cut-off uses `collector_tstamp`; production processing order can differ slightly.
