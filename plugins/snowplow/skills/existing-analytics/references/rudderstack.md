# RudderStack

Tested setup for sending RudderStack events to Snowplow. The mapping lives in `scripts/rudderstack/rudderstack-snowplow-adapter.js`, which has no `export`, so the page can load it as a classic script. The file defines one global, `RudderStackSnowplow`. The client-side integration loads the file and calls `RudderStackSnowplow.ladder`. The server-side transformation pastes that file followed by `scripts/rudderstack/transformation-entry.js`, which holds the `export function transformEvent` entry point and calls `RudderStackSnowplow.toPayload`. Set `vendor` in `CONFIG` to the vendor the customer created the `external_event` and `external_identity` schemas under in their own Snowplow registry (the copies in `references/schemas/` use `com.example`), and in the HTTP Webhook mappings replace `<your-vendor>` with the same value. Set `aid` in `CONFIG` to the customer's app ID, and adapt the `ECOM` table of event names if the customer's ecommerce event names differ from the ecommerce spec. For the HTTP Webhook mappings, set the `aid` value, and leave the `ue_pr` and `co` values unchanged except for `<your-vendor>`.

## Choose an approach

Most sites should use the **client-side approach**: a custom device mode integration in the RudderStack JavaScript SDK copies each call into the Snowplow JavaScript tracker on the same page. It gives you sessions, page pings and a random visitor ID that is safe for interventions in the page, and the visitor ID stays the same if you later move to native tracking.

| Approach | Use it when |
|---|---|
| [Client-side: custom device mode integration](#set-up-the-client-side-approach) | You can add a few lines to the page where the RudderStack SDK loads |
| [Server-side: transformation and Webhook destination](#server-side-transformation-and-webhook-destination) | You need events from RudderStack's server or mobile SDKs, or you can't change the page. No sessions, and events arrive seconds later |
| [Server-side without code: HTTP Webhook mappings](#server-side-without-code-http-webhook-mappings) | As above, but your workspace can't use transformations |
| [Warehouse history](#warehouse-history) | You want batch attributes from the RudderStack data already in your warehouse |

You can run client-side and server-side together. Connect the server-side destination only to your server and app sources, so browser events don't arrive twice under two visitor keys.

## Before you begin

You need:

- A Snowplow Collector URL for a pipeline with Signals enabled.
- The RudderStack JavaScript SDK v3 (`@rudderstack/analytics-js`) 3.23.0 or later on your site, loaded with a snippet that lists `addCustomIntegration` among its methods. If yours doesn't, copy a current snippet from your source's **Setup** tab.
- RudderStack ecommerce events that use the ecommerce spec names (`Product Viewed`, `Order Completed` and so on) with a price and a currency. Other events become generic `external_event` events. See [How RudderStack events map to Snowplow](#how-rudderstack-events-map-to-snowplow).

## Set up the client-side approach

1. In your RudderStack workspace, add a **Custom Device Mode** destination, connect it to your JavaScript source and copy its destination ID.

2. Load the Snowplow tracker and create a tracker that points at your Collector. Put this after the RudderStack snippet.

   ```html
   <script>
     (function (p, l, o, w, i, n, g) { if (!p[i]) { p.GlobalSnowplowNamespace = p.GlobalSnowplowNamespace || []; p.GlobalSnowplowNamespace.push(i); p[i] = function () { (p[i].q = p[i].q || []).push(arguments); }; p[i].q = p[i].q || []; n = l.createElement(o); g = l.getElementsByTagName(o)[0]; n.async = 1; n.src = w; g.parentNode.insertBefore(n, g); } })(window, document, 'script', 'https://cdn.jsdelivr.net/npm/@snowplow/javascript-tracker@4.10.3/dist/sp.js', 'snowplow');

     window.snowplow('newTracker', 'sp', 'https://collector.example.com', {
       appId: 'my-site',
       platform: 'web',
       contexts: { webPage: true },
       stateStorageStrategy: 'cookieAndLocalStorage',
     });
     window.snowplow('enableActivityTracking', { minimumVisitLength: 10, heartbeatDelay: 10 });
   </script>
   ```

   Replace `https://collector.example.com` with your Collector URL and `my-site` with your app ID. Activity tracking sends the page pings that engagement attributes need.

   If your Collector is on the same site as your pages, the browser also sends RudderStack's `rl_*` cookies to it, and these can carry an email address from your traits. To keep them off Collector requests, add `credentials: 'omit'` to the `newTracker` options, or use a Collector on a different site.

3. Add `scripts/rudderstack/rudderstack-snowplow-adapter.js` to the page with a classic `<script>` tag, after step 2 and before step 4. Don't add `transformation-entry.js`: its `export` is a syntax error in a classic script. The adapter defines one global, `RudderStackSnowplow`. The integration below uses its `ladder` function and its `S.identity` schema URI.

4. Register the integration straight after steps 2 and 3 in the page source, not in a `rudderanalytics.ready()` callback or a tag that fires later. The SDK ignores integrations added after it has loaded.

   ```html
   <script>
   (function () {
     function externalIdentity(ev, type) {
       return {
         schema: RudderStackSnowplow.S.identity,
         data: {
           tool: 'rudderstack',
           anonymous_id: ev.anonymousId ? String(ev.anonymousId).slice(0, 255) : null,
           user_id: ev.userId ? String(ev.userId).slice(0, 255) : null,
           session_id: ev.context && ev.context.sessionId ? String(ev.context.sessionId) : null,
           session_number: null,
           event_id: ev.messageId ? String(ev.messageId).slice(0, 255) : null,
           event_name: type === 'track' ? String(ev.event || '').slice(0, 255) || null : type === 'page' ? ev.name || null : type,
         },
       };
     }

     function forward(analytics, logger, rsEvent) {
       const ev = rsEvent.message;
       const type = String(ev.type || '').toLowerCase();
       const context = ev.anonymousId ? [externalIdentity(ev, type)] : [];
       // RudderStack can hand over a call after a single-page app has changed the URL, so use the URL from the call.
       if (ev.context.page && ev.context.page.url) window.snowplow('setCustomUrl', ev.context.page.url);
       // Set on every call, so the user ID survives page loads and rudderanalytics.reset() clears it.
       if (ev.userId) window.snowplow('setUserId', String(ev.userId).slice(0, 255));
       else if (type !== 'identify') window.snowplow('setUserId', null);
       if (type === 'page') {
         window.snowplow('trackPageView', { title: (ev.context.page && ev.context.page.title) || ev.name, context });
         return;
       }
       const l = RudderStackSnowplow.ladder(ev, type);
       window.snowplow('trackSelfDescribingEvent', { event: l.event, context: l.entities.concat(context) });
     }

     rudderanalytics.addCustomIntegration('<destination_id>', {
       isReady: () => typeof window.snowplow === 'function',
       page: forward,
       track: forward,
       identify: forward,
       group: forward,
       alias: forward,
     });
   })();
   </script>
   ```

   Replace `<destination_id>` with the ID from step 1.

5. Publish the page change.

To react to interventions in the page, add the Signals browser plugin to the Snowplow tracker. See `references/interventions.md`.

## Check it works

Test with your Console development environment before you send events to your pipeline. Every Snowplow trial includes one. See [Run Snowplow Micro through Console](https://docs.snowplow.io/docs/testing/snowplow-micro/console.md).

1. In Console, go to **Pipelines**, select your development environment and copy its Collector endpoint.
2. Point the Snowplow tracker (or the Webhook destination's URL, keeping its path) at it.
3. Send a few calls from a test page.
4. Select **Open dashboard** to see the good and failed events.

For a page view, a product view, an order and an `identify` call, you should see:

- A `page_view` for each `page` call.
- `snowplow_ecommerce_action` events of type `product_view` and `transaction`, with `product` and `transaction` entities.
- An `identify` event whose only field is `id`.
- An `external_identity` entity on every event, with `tool` set to `rudderstack` and the original event name in `event_name`.
- On the client-side approach, `page_ping` events and one `domain_sessionid` across the visit.
- No failed events. The Collector accepts events before they are validated, so a failed event shows here, not in RudderStack.

Once the events look right, point the tracker or the destination at your pipeline's Collector, then hand over to the `signals` skill to build attribute groups and interventions (see SKILL.md).

## Other approaches

The server-side approaches run in your RudderStack workspace and cover RudderStack's server and mobile SDKs too. RudderStack's `anonymousId` becomes `domain_userid`, so read those attributes from your backend, not the public intervention endpoint. There are no sessions or page pings, and events arrive seconds after the call. See [Delivery and delay](https://docs.snowplow.io/docs/signals/data-sources/existing-analytics.md#delivery-and-delay). If your Collector is behind a firewall, allow RudderStack's outbound IP addresses.

### Server-side: transformation and Webhook destination

1. Create a JavaScript transformation. Paste the mapping code from `scripts/rudderstack/rudderstack-snowplow-adapter.js`, then the entry point from `scripts/rudderstack/transformation-entry.js` below it. Set `vendor` and `aid` in `CONFIG` near the top of the adapter. The entry point is:

   ```js
   export function transformEvent(event, metadata) {
     return RudderStackSnowplow.toPayload([event]);
   }
   ```

   Each event's `event_id` is derived from RudderStack's `messageId`, so a retried event counts once in Signals.

2. Add a **Webhook** destination with **Webhook URL** `https://collector.example.com/com.snowplowanalytics.snowplow/tp2` and **Method** `POST`.
3. Connect the transformation to the Webhook destination.
4. Connect the destination to the sources you want in Snowplow, and enable it.

When you change the transformation, publish it as a new version.

### Server-side without code: HTTP Webhook mappings

If your workspace can't use transformations, the **HTTP Webhook** destination can build the Collector request from field mappings.

1. Add an **HTTP Webhook** destination with URL `https://collector.example.com/i`, method `GET`, no authentication and batching off. Use the query parameter mappings, not the JSONata body template.

2. Add these query parameter mappings:

   | Parameter | Value |
   |---|---|
   | `e` | `($.type === 'page' \|\| $.type === 'screen') ? 'pv' : 'ue'` |
   | `p` | `'web'` |
   | `aid` | `'my-site'` |
   | `url` | `$.context.page.url` |
   | `page` | `$.context.page.title` |
   | `refr` | `$.context.page.referrer && !$.context.page.referrer.startsWith('$') ? $.context.page.referrer : undefined` |
   | `ua` | `$.context.userAgent` |
   | `ip` | `$.context.ip ?? $.request_ip` |
   | `duid` | `$.anonymousId` |
   | `tnuid` | `$.anonymousId` |
   | `uid` | `$.userId \|\| undefined` |
   | `eid` | `$.messageId` |
   | `dtm` | `String(Date.parse($.originalTimestamp))` |
   | `stm` | `String(Date.parse($.sentAt))` |
   | `ttm` | `String(Date.parse($.timestamp))` |
   | `ue_pr` | See step 3 |
   | `co` | See step 3 |

3. Add the `ue_pr` and `co` mappings. Copy each value as it is, then replace `<your-vendor>` (in the `external_event` and `external_identity` schema URIs) with the vendor you created those schemas under. Leave the `com.snowplowanalytics` URIs unchanged.

   <details>
   <summary><code>ue_pr</code> value</summary>

   ```js
   ($.type === 'page' || $.type === 'screen') ? undefined : JSON.stringify({schema: 'iglu:com.snowplowanalytics.snowplow/unstruct_event/jsonschema/1-0-0', data: $.type === 'identify' && $.userId ? {schema: 'iglu:com.snowplowanalytics.snowplow/identify/jsonschema/1-0-0', data: {id: String($.userId)}} : $.type === 'track' && $.event === 'Products Searched' && $.properties.query ? {schema: 'iglu:com.snowplowanalytics.snowplow/site_search/jsonschema/1-0-0', data: {terms: [String($.properties.query)]}} : ($.type === 'track' && ($.properties.currency ? $.properties.currency.toUpperCase() : undefined) ? ({'product viewed': 'product_view', 'product added': 'add_to_cart', 'product removed': 'remove_from_cart', 'checkout started': 'checkout_step', 'checkout step viewed': 'checkout_step', 'checkout step completed': 'checkout_step', 'order completed': 'transaction', 'order refunded': 'refund'})[($.event ?? '').toLowerCase()] : undefined) ? {schema: 'iglu:com.snowplowanalytics.snowplow.ecommerce/snowplow_ecommerce_action/jsonschema/1-0-2', data: {type: ($.type === 'track' && ($.properties.currency ? $.properties.currency.toUpperCase() : undefined) ? ({'product viewed': 'product_view', 'product added': 'add_to_cart', 'product removed': 'remove_from_cart', 'checkout started': 'checkout_step', 'checkout step viewed': 'checkout_step', 'checkout step completed': 'checkout_step', 'order completed': 'transaction', 'order refunded': 'refund'})[($.event ?? '').toLowerCase()] : undefined)}} : {schema: 'iglu:<your-vendor>/external_event/jsonschema/1-0-0', data: {name: $.type === 'track' ? $.event : $.type, tool: 'rudderstack', kind: $.type, value: $.properties.revenue ?? $.properties.value ?? $.properties.total ?? $.properties.price, currency: ($.properties.currency ? $.properties.currency.toUpperCase() : undefined), item_id: $.properties.product_id ?? $.properties.sku ?? $.properties.products[0].product_id, item_category: $.properties.category ?? $.properties.products[0].category, search_term: $.properties.query, plan: $.properties.plan ?? ($.type === 'group' ? $.traits.plan : undefined), group_id: $.groupId, previous_id: $.previousId}}})
   ```

   </details>

   <details>
   <summary><code>co</code> value</summary>

   ```js
   JSON.stringify({schema: 'iglu:com.snowplowanalytics.snowplow/contexts/jsonschema/1-0-1', data: ($.type === 'page' || $.type === 'screen') ? [{schema: 'iglu:<your-vendor>/external_identity/jsonschema/1-0-0', data: {tool: 'rudderstack', anonymous_id: $.anonymousId, user_id: $.userId || null, session_id: $.context.sessionId ? String($.context.sessionId) : null, session_number: null, event_id: $.messageId || null, event_name: $.type === 'track' ? $.event : ($.type === 'page' || $.type === 'screen') ? ($.name || null) : $.type}}] : [...(($.type === 'track' && ($.properties.currency ? $.properties.currency.toUpperCase() : undefined) ? ({'product viewed': 'product_view', 'product added': 'add_to_cart', 'product removed': 'remove_from_cart', 'checkout started': 'checkout_step', 'checkout step viewed': 'checkout_step', 'checkout step completed': 'checkout_step', 'order completed': 'transaction', 'order refunded': 'refund'})[($.event ?? '').toLowerCase()] : undefined) && Array.isArray($.properties.products) ? $.properties.products : (($.type === 'track' && ($.properties.currency ? $.properties.currency.toUpperCase() : undefined) ? ({'product viewed': 'product_view', 'product added': 'add_to_cart', 'product removed': 'remove_from_cart', 'checkout started': 'checkout_step', 'checkout step viewed': 'checkout_step', 'checkout step completed': 'checkout_step', 'order completed': 'transaction', 'order refunded': 'refund'})[($.event ?? '').toLowerCase()] : undefined) === 'product_view' || ($.type === 'track' && ($.properties.currency ? $.properties.currency.toUpperCase() : undefined) ? ({'product viewed': 'product_view', 'product added': 'add_to_cart', 'product removed': 'remove_from_cart', 'checkout started': 'checkout_step', 'checkout step viewed': 'checkout_step', 'checkout step completed': 'checkout_step', 'order completed': 'transaction', 'order refunded': 'refund'})[($.event ?? '').toLowerCase()] : undefined) === 'add_to_cart' || ($.type === 'track' && ($.properties.currency ? $.properties.currency.toUpperCase() : undefined) ? ({'product viewed': 'product_view', 'product added': 'add_to_cart', 'product removed': 'remove_from_cart', 'checkout started': 'checkout_step', 'checkout step viewed': 'checkout_step', 'checkout step completed': 'checkout_step', 'order completed': 'transaction', 'order refunded': 'refund'})[($.event ?? '').toLowerCase()] : undefined) === 'remove_from_cart') ? [$.properties] : []).map(lambda {schema: 'iglu:com.snowplowanalytics.snowplow.ecommerce/product/jsonschema/1-0-0', data: {id: String(?0.product_id ?? ?0.sku), name: ?0.name, category: ?0.category ?? '', price: Number((?0.price).toFixed(2)), currency: ($.properties.currency ? $.properties.currency.toUpperCase() : undefined), quantity: ?0.quantity, brand: ?0.brand, variant: ?0.variant}}), ...((($.type === 'track' && ($.properties.currency ? $.properties.currency.toUpperCase() : undefined) ? ({'product viewed': 'product_view', 'product added': 'add_to_cart', 'product removed': 'remove_from_cart', 'checkout started': 'checkout_step', 'checkout step viewed': 'checkout_step', 'checkout step completed': 'checkout_step', 'order completed': 'transaction', 'order refunded': 'refund'})[($.event ?? '').toLowerCase()] : undefined) === 'product_view' || ($.type === 'track' && ($.properties.currency ? $.properties.currency.toUpperCase() : undefined) ? ({'product viewed': 'product_view', 'product added': 'add_to_cart', 'product removed': 'remove_from_cart', 'checkout started': 'checkout_step', 'checkout step viewed': 'checkout_step', 'checkout step completed': 'checkout_step', 'order completed': 'transaction', 'order refunded': 'refund'})[($.event ?? '').toLowerCase()] : undefined) === 'add_to_cart' || ($.type === 'track' && ($.properties.currency ? $.properties.currency.toUpperCase() : undefined) ? ({'product viewed': 'product_view', 'product added': 'add_to_cart', 'product removed': 'remove_from_cart', 'checkout started': 'checkout_step', 'checkout step viewed': 'checkout_step', 'checkout step completed': 'checkout_step', 'order completed': 'transaction', 'order refunded': 'refund'})[($.event ?? '').toLowerCase()] : undefined) === 'remove_from_cart') && ($.type === 'track' && ($.properties.currency ? $.properties.currency.toUpperCase() : undefined) ? ({'product viewed': 'product_view', 'product added': 'add_to_cart', 'product removed': 'remove_from_cart', 'checkout started': 'checkout_step', 'checkout step viewed': 'checkout_step', 'checkout step completed': 'checkout_step', 'order completed': 'transaction', 'order refunded': 'refund'})[($.event ?? '').toLowerCase()] : undefined) !== 'product_view' ? [{schema: 'iglu:com.snowplowanalytics.snowplow.ecommerce/cart/jsonschema/1-0-0', data: {cart_id: $.properties.cart_id, total_value: Number((($.properties.cart_total ?? $.properties.value ?? $.properties.price * ($.properties.quantity ?? 1))).toFixed(2)), currency: ($.properties.currency ? $.properties.currency.toUpperCase() : undefined)}}] : ($.type === 'track' && ($.properties.currency ? $.properties.currency.toUpperCase() : undefined) ? ({'product viewed': 'product_view', 'product added': 'add_to_cart', 'product removed': 'remove_from_cart', 'checkout started': 'checkout_step', 'checkout step viewed': 'checkout_step', 'checkout step completed': 'checkout_step', 'order completed': 'transaction', 'order refunded': 'refund'})[($.event ?? '').toLowerCase()] : undefined) === 'checkout_step' ? [{schema: 'iglu:com.snowplowanalytics.snowplow.ecommerce/checkout_step/jsonschema/1-0-0', data: {step: $.properties.step ?? 1, payment_method: $.properties.payment_method, delivery_method: $.properties.shipping_method, coupon_code: $.properties.coupon}}] : ($.type === 'track' && ($.properties.currency ? $.properties.currency.toUpperCase() : undefined) ? ({'product viewed': 'product_view', 'product added': 'add_to_cart', 'product removed': 'remove_from_cart', 'checkout started': 'checkout_step', 'checkout step viewed': 'checkout_step', 'checkout step completed': 'checkout_step', 'order completed': 'transaction', 'order refunded': 'refund'})[($.event ?? '').toLowerCase()] : undefined) === 'transaction' ? [{schema: 'iglu:com.snowplowanalytics.snowplow.ecommerce/transaction/jsonschema/1-0-0', data: {transaction_id: String($.properties.order_id), revenue: Number((($.properties.revenue ?? $.properties.total ?? $.properties.value)).toFixed(2)), currency: ($.properties.currency ? $.properties.currency.toUpperCase() : undefined), payment_method: $.properties.payment_method ?? 'unknown', total_quantity: (($.type === 'track' && ($.properties.currency ? $.properties.currency.toUpperCase() : undefined) ? ({'product viewed': 'product_view', 'product added': 'add_to_cart', 'product removed': 'remove_from_cart', 'checkout started': 'checkout_step', 'checkout step viewed': 'checkout_step', 'checkout step completed': 'checkout_step', 'order completed': 'transaction', 'order refunded': 'refund'})[($.event ?? '').toLowerCase()] : undefined) && Array.isArray($.properties.products) ? $.properties.products : (($.type === 'track' && ($.properties.currency ? $.properties.currency.toUpperCase() : undefined) ? ({'product viewed': 'product_view', 'product added': 'add_to_cart', 'product removed': 'remove_from_cart', 'checkout started': 'checkout_step', 'checkout step viewed': 'checkout_step', 'checkout step completed': 'checkout_step', 'order completed': 'transaction', 'order refunded': 'refund'})[($.event ?? '').toLowerCase()] : undefined) === 'product_view' || ($.type === 'track' && ($.properties.currency ? $.properties.currency.toUpperCase() : undefined) ? ({'product viewed': 'product_view', 'product added': 'add_to_cart', 'product removed': 'remove_from_cart', 'checkout started': 'checkout_step', 'checkout step viewed': 'checkout_step', 'checkout step completed': 'checkout_step', 'order completed': 'transaction', 'order refunded': 'refund'})[($.event ?? '').toLowerCase()] : undefined) === 'add_to_cart' || ($.type === 'track' && ($.properties.currency ? $.properties.currency.toUpperCase() : undefined) ? ({'product viewed': 'product_view', 'product added': 'add_to_cart', 'product removed': 'remove_from_cart', 'checkout started': 'checkout_step', 'checkout step viewed': 'checkout_step', 'checkout step completed': 'checkout_step', 'order completed': 'transaction', 'order refunded': 'refund'})[($.event ?? '').toLowerCase()] : undefined) === 'remove_from_cart') ? [$.properties] : []).map(lambda ?0.quantity ?? 1).reduce(lambda ?0 + ?1, 0), tax: $.properties.tax, shipping: $.properties.shipping, discount_amount: $.properties.discount, discount_code: $.properties.coupon}}] : ($.type === 'track' && ($.properties.currency ? $.properties.currency.toUpperCase() : undefined) ? ({'product viewed': 'product_view', 'product added': 'add_to_cart', 'product removed': 'remove_from_cart', 'checkout started': 'checkout_step', 'checkout step viewed': 'checkout_step', 'checkout step completed': 'checkout_step', 'order completed': 'transaction', 'order refunded': 'refund'})[($.event ?? '').toLowerCase()] : undefined) === 'refund' ? [{schema: 'iglu:com.snowplowanalytics.snowplow.ecommerce/refund/jsonschema/1-0-0', data: {transaction_id: String($.properties.order_id), refund_amount: Number((($.properties.total ?? $.properties.revenue ?? $.properties.value)).toFixed(2)), currency: ($.properties.currency ? $.properties.currency.toUpperCase() : undefined), refund_reason: $.properties.reason}}] : []), {schema: 'iglu:<your-vendor>/external_identity/jsonschema/1-0-0', data: {tool: 'rudderstack', anonymous_id: $.anonymousId, user_id: $.userId || null, session_id: $.context.sessionId ? String($.context.sessionId) : null, session_number: null, event_id: $.messageId || null, event_name: $.type === 'track' ? $.event : ($.type === 'page' || $.type === 'screen') ? ($.name || null) : $.type}}]})
   ```

   </details>

The mappings send `messageId` as the event ID, which Snowplow requires to be a UUID. The RudderStack JavaScript SDK sends one. For sources whose `messageId` may not be a UUID, use the transformation instead.

### Warehouse history

RudderStack's warehouse destinations can fill a warehouse attribute group with history from before you connected. This needs a Signals warehouse connection.

## How RudderStack events map to Snowplow

Each RudderStack call takes the first rung of the [event mapping](https://docs.snowplow.io/docs/signals/data-sources/existing-analytics/how-it-works/event-mapping.md) ladder that fits. The client-side integration and the transformation share the mapping in the adapter, so they send the same events. The HTTP Webhook mappings are a simplified copy: they check only for a currency before sending an ecommerce event. An ecommerce event with a currency but no order ID, price or product ID still goes out as an ecommerce event there, and fails validation instead of falling back to `external_event`. Use the transformation if your ecommerce events can lack those fields.

| RudderStack call or event | Snowplow event | Notes |
|---|---|---|
| `page` | `page_view` | Title from the page context, or the page name. A `$direct` referrer is dropped |
| `screen` | `page_view` | Server-side only. URL is `screen://<name>` when there is no page URL |
| `Product Viewed` | `snowplow_ecommerce_action` (`product_view`) with `product` | Needs a product ID, price and currency |
| `Product Added`, `Product Removed` | `snowplow_ecommerce_action` (`add_to_cart`, `remove_from_cart`) with `product` and `cart` | Cart total is `cart_total`, then `value`, then price times quantity, which is not the true cart total |
| `Checkout Started`, `Checkout Step Viewed`, `Checkout Step Completed` | `snowplow_ecommerce_action` (`checkout_step`) with `product` and `checkout_step` | Step defaults to 1 |
| `Order Completed` | `snowplow_ecommerce_action` (`transaction`) with one `product` per product and `transaction` | Needs an order ID, revenue or total, and currency. `payment_method` is set to `unknown` when absent |
| `Order Refunded` | `snowplow_ecommerce_action` (`refund`) with `product` and `refund` | Needs an order ID, total and currency |
| `Products Searched` | `site_search` | `query` becomes the search term |
| `identify` with a `userId` | `identify` | The user ID only. Traits, including email, are dropped |
| `identify` without a `userId` | `external_event`, kind `identify` | Traits only, so there's no ID to send |
| `group` | `external_event` | `group_id` from `groupId`, `plan` from the group traits |
| `alias` | `external_event` | `previous_id` from `previousId` |
| Any other `track` call | `external_event` | `name` is the RudderStack event name. Typed fields such as `value`, `currency`, `item_id` and `plan` are filled from matching properties |
| An ecommerce event missing a required field | `external_event` | For example an `Order Completed` with no currency, or a `Product Viewed` with no price |


RudderStack properties and traits that don't match a typed field stay in RudderStack.

## Identifiers

| RudderStack field | Snowplow field | Use as a Signals key? |
|---|---|---|
| Snowplow cookie ID (client-side) | `domain_userid` | Yes. Random, and safe on the public intervention endpoint |
| Snowplow session ID (client-side) | `domain_sessionid` | Yes, for session attributes |
| `anonymousId` | Server-side: `domain_userid`. Both: `external_identity.anonymous_id` | Server-side key, for reads from your backend only. Read it in the page with `rudderanalytics.getAnonymousId()`. Never on the public intervention endpoint |
| `userId` | `user_id`, `external_identity.user_id` and `identify.id`, unchanged. If it's an email address, the email reaches Snowplow | Backend reads only. Never on the public intervention endpoint |
| `context.sessionId` | `external_identity.session_id` | No. It's a timestamp, so it can be guessed |
| `groupId` | `external_event.group_id` | Backend reads only, for account attributes |
| `messageId` | `event_id` | No |

On the server-side approaches, an event with no `anonymousId`, such as a server-side call with only a `userId`, has no `domain_userid` or `network_userid` and a null `external_identity.anonymous_id`. Key those events on `user_id`. See [Identifiers](https://docs.snowplow.io/docs/signals/data-sources/existing-analytics/how-it-works/identifiers.md) for keying attributes across a visitor's browser and logged-in events.

## Troubleshooting

- **Nothing reaches Snowplow from the client-side integration:** the destination ID doesn't match a Custom Device Mode destination on your source, or the integration was added after the SDK loaded. Check the ID, and register the integration in the page source straight after the snippet.
- **Ecommerce events arrive as `external_event`:** the event name isn't a spec name, or it lacks a price, currency or order ID. Rename it, or add the missing field.
- **Events arrive twice:** both approaches receive your browser source. Connect the server-side destination only to server and mobile sources.
- **A changed transformation has no effect:** publish it as a new version.
- **A property is missing from attributes:** Signals only reads fields a schema declares. Map it to a typed `external_event` field. See [external_event](https://docs.snowplow.io/docs/signals/data-sources/existing-analytics/reference/external-event.md).
