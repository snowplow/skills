"""An example state builder, written the way an application might build its Jev state.

The evaluation runs it over dataset rows instead of live Signals reads, so the states match
what the application sends. Reads dataset rows (JSONL) on stdin, writes {"row_id", "state"}.
"""

import json
import sys

PROFILE = ["page_views", "product_views", "cart_adds", "searches", "distinct_products_viewed", "device"]

for line in sys.stdin:
    row = json.loads(line)
    recent = []
    for entry in (row.get("recent_activity") or [])[-10:]:
        item = {"event": entry.get("action") or entry["event_name"]}
        if entry.get("product"):
            item["product"] = entry["product"]
        elif entry.get("page_title"):
            item["page"] = entry["page_title"]
        recent.append(item)
    state = {
        "visitor": {k: row[k] for k in PROFILE if row.get(k) not in (None, 0)},
        "last_10_events": recent,
    }
    print(json.dumps({"row_id": row["row_id"], "state": state}))
