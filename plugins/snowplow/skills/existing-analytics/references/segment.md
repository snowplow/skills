# Segment

Tested setup for sending Segment events to Snowplow. The mapping lives in `scripts/segment/segment-snowplow-adapter.js`; both approaches use it, set at the adaptation points. Set `vendor` in `ADAPTER` to the vendor the customer created the `external_event` and `external_identity` schemas under in their own Snowplow registry (the copies in `references/schemas/` use `com.example`). Adapt the event-name checks in `standardEvent` if the customer's event names differ from the Segment v2 spec.

## Choose an approach

Most sites should use the **client-side approach**: a destination plugin in analytics.js copies each Segment call into the Snowplow JavaScript tracker on the same page. It gives you sessions, page pings and a random visitor ID that is safe for interventions in the page, and the visitor ID stays the same if you later move to native tracking.

| Approach | Use it when |
|---|---|
| [Client-side: destination plugin](#set-up-the-client-side-approach) | You can add a few lines to the page where analytics.js loads |
| [Server-side: Destination Function](#server-side-destination-function) | You need events from Segment's server or app libraries, or you can't change the page. No sessions, and events arrive seconds later through Segment's queue |
| [Warehouse history](#warehouse-history) | You want batch attributes from the Segment data already in your warehouse |

You can run client-side and server-side together. Connect the Destination Function only to your server and app sources, so browser events don't arrive twice under two visitor keys.

## Before you begin

You need:

- A Snowplow Collector URL for a pipeline with Signals enabled.
- Segment's analytics.js 2.0 (analytics-next) on your site.
- Segment ecommerce events that use Segment's v2 spec names (`Product Viewed`, `Order Completed` and so on) with a price and a currency. Other events become generic `external_event` events. See [How Segment events map to Snowplow](#how-segment-events-map-to-snowplow).

## Set up the client-side approach

1. Load the Snowplow tracker and the ecommerce plugin, and create a tracker that points at your Collector. Put this after the Segment snippet.

   ```html
   <script>
     (function (p, l, o, w, i, n, g) { if (!p[i]) { p.GlobalSnowplowNamespace = p.GlobalSnowplowNamespace || []; p.GlobalSnowplowNamespace.push(i); p[i] = function () { (p[i].q = p[i].q || []).push(arguments); }; p[i].q = p[i].q || []; n = l.createElement(o); g = l.getElementsByTagName(o)[0]; n.async = 1; n.src = w; g.parentNode.insertBefore(n, g); } })(window, document, 'script', 'https://cdn.jsdelivr.net/npm/@snowplow/javascript-tracker@4.10.3/dist/sp.js', 'snowplow');

     window.snowplow('newTracker', 'sp', 'https://collector.example.com', {
       appId: 'my-site',
       platform: 'web',
       contexts: { webPage: true },
       stateStorageStrategy: 'cookieAndLocalStorage',
     });
     window.snowplow('addPlugin',
       'https://cdn.jsdelivr.net/npm/@snowplow/browser-plugin-snowplow-ecommerce@4.10.3/dist/index.umd.min.js',
       ['snowplowEcommerceAccelerator', 'SnowplowEcommercePlugin']);
     window.snowplow('enableActivityTracking', { minimumVisitLength: 10, heartbeatDelay: 10 });
   </script>
   ```

   Replace `https://collector.example.com` with your Collector URL and `my-site` with your app ID. Activity tracking sends the page pings that engagement attributes need.

2. Copy `scripts/segment/segment-snowplow-adapter.js` into the site's static assets and load it. It defines one global, `SegmentSnowplow`, whose functions the plugin uses to map each call.

   ```html
   <script src="/js/segment-snowplow-adapter.js"></script>
   ```

3. Register the destination plugin. Call `analytics.register` directly in the same page load as the Segment snippet, not inside `analytics.ready()`, or the plugin misses the first page view and its UTM parameters. Keep the snippet's own `analytics.page()` call.

   ```html
   <script>
     const snowplowDestination = {
       name: 'Snowplow (JavaScript tracker)', type: 'destination', version: '0.2.0',
       isLoaded: () => true, load: () => Promise.resolve(),
     };
     ['page', 'track', 'identify', 'group', 'alias', 'screen'].forEach((method) => {
       snowplowDestination[method] = async (ctx) => {
         const SP = window.SegmentSnowplow;
         const ev = ctx.event;
         const uid = SP.userIdOut(ev.userId);
         const ident = SP.externalIdentity(ev, uid);
         const context = ident ? [ident] : [];
         // Set on every call, so the user ID survives page loads and analytics.reset() clears it.
         if (uid) window.snowplow('setUserId', uid);
         else if (ev.type !== 'identify') window.snowplow('setUserId', null);
         if (ev.type === 'page') {
           window.snowplow('trackPageView', { title: (ev.context.page && ev.context.page.title) || ev.name, context });
           return ctx;
         }
         const l = SP.ladder(ev, uid);
         if (l.plugin) {
           const [pluginMethod, arg] = l.plugin;
           window.snowplow(pluginMethod, Object.assign({}, arg, { context: (arg.context || []).concat(context) }));
         } else {
           window.snowplow('trackSelfDescribingEvent', { event: l.event, context: l.entities.concat(context) });
         }
         return ctx;
       };
     });

     analytics.register(snowplowDestination);
   </script>
   ```

4. Publish the page change.

If your Collector is on the same site as your pages, the browser also sends Segment's `ajs_*` cookies to it, and `ajs_user_id` can hold an email address. Use a Collector on a different site, or confirm this in your privacy review.

To react to interventions in the page, add the Signals browser plugin to the Snowplow tracker. See `references/interventions.md`.

## Check it works

Test with your Console development environment before you send events to your pipeline. Every Snowplow trial includes one. See [Run Snowplow Micro through Console](https://docs.snowplow.io/docs/testing/snowplow-micro/console.md).

1. In Console, go to **Pipelines**, select your development environment and copy its Collector endpoint.
2. Point the tracker (or the function's `collectorUrl` setting) at it.
3. Send a few calls from a test page or Segment's debugger.
4. Select **Open dashboard** to see the good and failed events.

For a page view, a product view, an order and an `identify` call, you should see:

- A `page_view` for each `analytics.page` call, including the landing page with its UTM parameters.
- `snowplow_ecommerce_action` events of type `product_view` and `transaction`, with `product` and `transaction` entities.
- An `identify` event whose only field is `id`.
- An `external_identity` entity on every event, with `tool` set to `segment` and the original Segment event name in `event_name`.
- On the client-side approach, `page_ping` events and one `domain_sessionid` across the visit.
- No failed events. The Collector accepts events before they are validated, so a failed event shows here, not in Segment.

Once the events look right, point the tracker or the function at your pipeline's Collector, then hand over to the `signals` skill to build attribute groups and interventions (see SKILL.md).

## Other approaches

### Server-side: Destination Function

A Destination Function in your Segment workspace maps each event Segment receives and posts it to your Collector. It covers Segment's server and app libraries too. Segment's `anonymousId` becomes `domain_userid`, so read those attributes from your backend, not the public intervention endpoint. There are no sessions or page pings, and events arrive seconds later through Segment's queue. See [Delivery and delay](https://docs.snowplow.io/docs/signals/data-sources/existing-analytics.md#delivery-and-delay).

If your Collector is behind a firewall, allow Segment's functions, which run in AWS us-west-2 and eu-west-1.

1. In your Segment workspace, create a new Destination Function.
2. Add two settings: `collectorUrl` (for example `https://collector.example.com`) and `appId`.
3. Paste the adapter script from `scripts/segment/segment-snowplow-adapter.js`, followed by these handlers. The adapter defines `SegmentSnowplow`, which the handlers call.

   ```js
   async function send(events, settings) {
     SegmentSnowplow.ADAPTER.aid = settings.appId || SegmentSnowplow.ADAPTER.aid;
     let res;
     try {
       res = await fetch(settings.collectorUrl.replace(/\/$/, '') + '/com.snowplowanalytics.snowplow/tp2', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json; charset=utf-8' },
         body: JSON.stringify(SegmentSnowplow.toPayload(events)),
       });
     } catch (e) {
       throw new RetryError('collector unreachable: ' + e.message);
     }
     if (res.status >= 500 || res.status === 429) throw new RetryError('collector ' + res.status);
     if (!res.ok) throw new ValidationError('collector rejected ' + res.status);
   }

   async function onTrack(event, settings) { await send([event], settings); }
   async function onPage(event, settings) { await send([event], settings); }
   async function onScreen(event, settings) { await send([event], settings); }
   async function onIdentify(event, settings) { await send([event], settings); }
   async function onGroup(event, settings) { await send([event], settings); }
   async function onAlias(event, settings) { await send([event], settings); }

   // One collector request per batch.
   async function onBatch(events, settings) { await send(events, settings); }
   ```

   `RetryError` tells Segment to retry later, and `ValidationError` tells it not to. Each event's `event_id` is derived from Segment's `messageId`, so a retried event counts once in Signals.

4. Connect the function to the sources you want in Snowplow, and enable it.

Segment bills function execution time beyond its free allotment.

### Warehouse history

Segment's warehouse destinations or Profiles Sync can fill a warehouse attribute group with history from before you connected. This needs a Signals warehouse connection.

## How Segment events map to Snowplow

Each Segment call takes the first rung of the [event mapping](https://docs.snowplow.io/docs/signals/data-sources/existing-analytics/how-it-works/event-mapping.md) ladder that fits. Both approaches use the same mapping.

| Segment call or event | Snowplow event | Notes |
|---|---|---|
| `page` | `page_view` | Title from the page context, or the page name |
| `screen` | `page_view` | Server-side only |
| `Product Viewed` | `snowplow_ecommerce_action` (`product_view`) with `product` | Needs a product ID, price and currency |
| `Product Added`, `Product Removed` | `snowplow_ecommerce_action` (`add_to_cart`, `remove_from_cart`) with `product` | |
| `Checkout Started`, `Checkout Step Viewed`, `Checkout Step Completed` | `snowplow_ecommerce_action` (`checkout_step`) with `product` and `checkout_step` | Step defaults to 1 |
| `Order Completed` | `snowplow_ecommerce_action` (`transaction`) with one `product` per product and `transaction` | Needs an order ID, revenue or total, and currency |
| `Order Refunded` | `snowplow_ecommerce_action` (`refund`) with `product` and `refund` | Needs an order ID, total and currency |
| `Products Searched` | `site_search` | `query` becomes the search term |
| `identify` with a `userId` | `identify` | The user ID only. Traits, including email, are dropped |
| `identify` without a `userId` | `external_event`, kind `identify` | Traits only, so there's no ID to send |
| `group` | `external_event` | `group_id` from `groupId`, `plan` from the group traits |
| `alias` | `external_event` | `previous_id` from `previousId` (server-side only) |
| Any other `track` call, or an ecommerce event missing a required field | `external_event` | `name` is the Segment event name. Typed fields such as `value`, `currency`, `item_id` and `plan` are filled from matching properties |

Segment properties that don't match a typed field stay in Segment.

## Identifiers

| Segment field | Snowplow field | Use as a Signals key? |
|---|---|---|
| Snowplow cookie ID (client-side) | `domain_userid` | Yes. Random, and safe on the public intervention endpoint |
| Snowplow session ID (client-side) | `domain_sessionid` | Yes, for session attributes |
| `anonymousId` | Server-side: `domain_userid`. Both: `external_identity.anonymous_id` | Server-side key, for reads from your backend only. Never on the public intervention endpoint |
| `userId` | `user_id`, `external_identity.user_id` and `identify.id`, unchanged. If it's an email address, the email reaches Snowplow | Backend reads only. Never on the public intervention endpoint |
| `groupId` | `external_event.group_id` | Backend reads only, for account attributes |
| `messageId` | `event_id` (server-side) | No |

See [Identifiers](https://docs.snowplow.io/docs/signals/data-sources/existing-analytics/how-it-works/identifiers.md) for keying attributes across a visitor's browser and logged-in events.

## Troubleshooting

- **No first page view or UTM parameters:** the plugin was registered inside `analytics.ready()`. Call `analytics.register` directly.
- **Ecommerce events arrive as `external_event`:** the event name isn't a Segment spec name, or it lacks a price, currency or order ID. Rename it, or add the missing field.
- **Events arrive twice:** both approaches receive your browser source. Connect the Destination Function only to server and app sources.
- **No events when analytics.js is blocked:** the plugin runs inside analytics.js, so an ad blocker or consent tool that stops it stops the plugin too.
- **A property is missing from attributes:** Signals only reads fields a schema declares. Map it to a typed `external_event` field. See [external_event](https://docs.snowplow.io/docs/signals/data-sources/existing-analytics/reference/external-event.md).
