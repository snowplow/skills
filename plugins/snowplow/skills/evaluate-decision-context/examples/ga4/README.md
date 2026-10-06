# Example: a Jev call on the Google Merchandise Store (GA4)

Google's public GA4 sample, converted to Snowplow events, and a Jev call an online store might make on product pages.

| File | What it is |
|---|---|
| `call.json` | The call being evaluated: two questions, `shopping_stage` (choice) and `will_purchase` (yes/no) |
| `build_state.py` | How the application builds the state it sends (a few session attributes and the last 10 events) |
| `anchors_product_view.json` | When the call happens: on product views, up to two per session, chosen at random |
| `anchors_trigger.json` | The alternative: an agentic-attribute-style trigger (three page views before checkout) |
| `attribute_groups.json` | Session attributes: page views, product views, cart adds, checkout steps, searches, device, traffic medium |
| `event_log.json` | `recent_activity`: the last 20 page views, ecommerce actions and searches within 30 minutes |
| `outcomes.json` | Purchased later, reached checkout later, added to cart within 10 minutes |

```bash
decision_eval.py request --anchors anchors_product_view.json --groups-file attribute_groups.json \
  --event-logs-file event_log.json --outcomes outcomes.json \
  --start 2021-01-04T00:00:00Z --end 2021-01-11T00:00:00Z --sample 3000 --seed eval-v1 \
  --name ga4_product_view --out request.json
decision_eval.py dataset --request request.json --out base
decision_eval.py render --dataset base --variant app --command "python build_state.py" --out states/app.jsonl
decision_eval.py ask --states states/app.jsonl --call call.json --out answers/app.jsonl
decision_eval.py check --dataset base --call call.json --answers answers/app.jsonl --out report.md
```

GA4 sends most page views two or three times, so the trigger example ("three page views") usually fires on a session's first page; most of those moments say little. Anchoring on product views gives the model more to go on.
