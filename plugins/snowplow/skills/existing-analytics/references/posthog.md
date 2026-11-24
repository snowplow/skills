# PostHog

Tested setup for sending PostHog events to Snowplow. The mapping lives in two scripts that carry the same ladder: `scripts/posthog/converter.js`, which the client-side `before_send` hook loads, and `scripts/posthog/snowplow-collector-destination.hog`, the source for the HTTP Webhook destination. Copy both unchanged, except at the adaptation points: set the vendor, `vendor` in `PH` near the top of `converter.js` and `VENDOR` near the top of the Hog source, to the vendor the customer created the `external_event` and `external_identity` schemas under in their own Snowplow registry (the copies in `references/schemas/` use `com.example`); if the customer's ecommerce or search events don't use PostHog's ecommerce spec names, add their names to the `ECOM` and `SEARCH` lists near the top of `converter.js`, and to the Hog source's `ECOM` map near the top and its `lname = 'products searched'` check. Write the names in lower case; both scripts match names ignoring case. To skip more events, add them to `DROP` in both scripts.

## Choose an approach

Most sites should use the **client-side `before_send` hook**. It's a few lines next to `posthog.init`, interventions arrive within a second or two, and it gives you a random visitor key that is safe to use for interventions.

Use one of the [other approaches](#other-approaches) when:

| Approach | Use it when |
|---|---|
| [HTTP Webhook destination](#http-webhook-destination) | You need events from PostHog's server or mobile SDKs or the capture API, or you can't change the page. Events arrive a few seconds after PostHog receives them |
| [Warehouse history](#warehouse-history) | You want history alongside a real-time approach |

You can run the hook and the destination together. Filter the destination so it skips browser events, as described in its steps.

## Before you begin

- posthog-js 1.187.0 or later on your site, which added `before_send`.
- Your PostHog project token. In PostHog, go to **Settings** > **Project** > **General** and copy **Project token**.
- A Snowplow Collector URL and Signals enabled on your pipeline.
- Ecommerce events that use PostHog's ecommerce spec names (`Product Viewed`, `Order Completed`, `Products Searched` and so on) with a price and a currency. Other names become `external_event`. See [How PostHog events map to Snowplow](#how-posthog-events-map-to-snowplow).

## Set up the client-side approach

The client-side approach loads the Snowplow JavaScript tracker and its ecommerce plugin next to posthog-js, then adds a hook to PostHog's `before_send` option. The hook replays each event into the Snowplow tracker and returns it unchanged, so PostHog receives exactly what it did before.

1. Load the Snowplow tracker and the ecommerce plugin, and create a tracker that points at your Collector. Put this before the PostHog snippet.

   ```html
   <script>
   ;(function (p, l, o, w, i, n, g) { if (!p[i]) { p.GlobalSnowplowNamespace = p.GlobalSnowplowNamespace || []; p.GlobalSnowplowNamespace.push(i); p[i] = function () { (p[i].q = p[i].q || []).push(arguments); }; p[i].q = p[i].q || []; n = l.createElement(o); g = l.getElementsByTagName(o)[0]; n.async = 1; n.src = w; g.parentNode.insertBefore(n, g); } })(window, document, 'script', 'https://cdn.jsdelivr.net/npm/@snowplow/javascript-tracker@4.10.3/dist/sp.js', 'snowplow');
   window.snowplow('newTracker', 'sp', 'https://collector.example.com', {
     appId: 'my-site', eventMethod: 'post', bufferSize: 1,
     contexts: { webPage: true }, credentials: 'omit',
   });
   window.snowplow('addPlugin', 'https://cdn.jsdelivr.net/npm/@snowplow/browser-plugin-snowplow-ecommerce@4.10.3/dist/index.umd.min.js', ['snowplowEcommerceAccelerator', 'SnowplowEcommercePlugin']);
   window.snowplow('enableActivityTracking', { minimumVisitLength: 5, heartbeatDelay: 5 });
   </script>
   ```

   Replace `https://collector.example.com` with your Collector URL and `my-site` with your app ID. Activity tracking sends the page pings that engagement attributes need. `credentials: 'omit'` keeps PostHog's `ph_` cookie, which can hold your user ID, off requests to a Collector on the same site as your pages.

2. Copy `scripts/posthog/converter.js` into the site's static assets and load it. It defines `PostHogSnowplow`, which maps each PostHog event to a Snowplow event.

   ```html
   <script src="/js/converter.js"></script>
   ```

3. Add the hook. It must be defined before `posthog.init` runs.

   ```html
   <script>
   // The client-side adapter: a before_send hook that copies each PostHog event into the Snowplow
   // browser tracker and returns the event unchanged, so PostHog receives exactly what it did before.
   // Load converter.js and the Snowplow tag first. Put this hook LAST in before_send, so it
   // sees events after the site's own redaction and sampling hooks.
   function snowplowBeforeSend(event) {
     if (!event) return event;
     try {
       var S = window.PostHogSnowplow;
       var c = S.fromBrowser(event);
       var l = S.ladder(c);
       if (!l) return event;
       var ident = S.identity(c);
       var context = ident ? [ident] : [];
       var timestamp = c.timeMs ? { type: 'ttm', value: c.timeMs } : undefined;
       window.snowplow('setUserId', S.userIdOf(c) || null);
       // Queued calls can be handed over after the URL changed, so use the URL PostHog recorded.
       if (c.props.$current_url) window.snowplow('setCustomUrl', c.props.$current_url);
       if (l.rung === 'page_view') {
         window.snowplow('trackPageView', { title: c.props.title, context: context, timestamp: timestamp });
       } else if (l.plugin) {
         var arg = l.plugin[1];
         window.snowplow(l.plugin[0], Object.assign({}, arg, { context: (arg.context || []).concat(context), timestamp: timestamp }));
       } else {
         window.snowplow('trackSelfDescribingEvent', { event: l.event, context: l.entities.concat(context), timestamp: timestamp });
       }
     } catch (e) {
       // A Snowplow problem must never stop the event reaching PostHog.
       if (window.console) console.warn('snowplow forwarder', e);
     }
     return event;
   }
   </script>
   ```

4. Add the hook to `before_send` in your `posthog.init` call, after the PostHog snippet:

   ```html
   <script>
   // PostHog's snippet from posthog.com/docs/libraries/js goes here.
   posthog.init('<project_token>', {
     api_host: 'https://us.i.posthog.com',
     defaults: '2026-08-30',
     before_send: [snowplowBeforeSend],
   });
   </script>
   ```

   If you already have `before_send` hooks, put `snowplowBeforeSend` last, for example `before_send: [redactHook, sampleHook, snowplowBeforeSend]`, so it sees events after your own redaction and sampling.

5. Publish the page change.

The hook follows PostHog's consent: when the visitor has opted out, or consent is pending, posthog-js doesn't call `before_send`, so nothing reaches Snowplow either. Load the Snowplow tracker under the same consent, because it sets its own cookies. Session replay and heatmap events pass through the hook, and the converter drops them. See [Privacy and consent](https://docs.snowplow.io/docs/signals/data-sources/existing-analytics/how-it-works/privacy-and-consent.md).

To react to interventions in the page, add the Signals browser plugin to the Snowplow tracker. See `references/interventions.md`.

## Check it works

Test with your Console development environment before you send events to your pipeline. Every Snowplow trial includes one: it runs Snowplow Micro, hosted by Snowplow. See [Run Snowplow Micro through Console](https://docs.snowplow.io/docs/testing/snowplow-micro/console.md).

1. In Console, go to **Pipelines** and select your development environment.
2. Copy its Collector endpoint, and point the Snowplow tracker at it. For the destination, use it as the `collector_url` input.
3. Send a few events from a test page.
4. Select **Open dashboard** to see the good and failed events.

You should see:

- A `page_view` for each `$pageview`, including single-page app route changes.
- `snowplow_ecommerce_action` events for product views and orders, with one `product` entity per product and a `transaction` entity on orders.
- A `site_search` event for each search, and an `identify` event whose only field is `id`.
- `external_event` for everything else, such as `$autocapture`, `$groupidentify` and your own events, with `name` set to the PostHog event name.
- An `external_identity` entity on every event, with `tool` set to `posthog` and `anonymous_id` set to PostHog's `$device_id`.
- With the client-side approach, `page_ping` events.
- No failed events.

Once the events look right, point the tracker or the destination at your pipeline's Collector, then hand over to the `signals` skill to build attribute groups and interventions (see SKILL.md).

## Other approaches

### HTTP Webhook destination

A destination built from PostHog's HTTP Webhook template receives each event after PostHog has ingested it, from any PostHog SDK or the capture API. Its source is replaced by Hog code that maps the event the same way as the converter and posts it to your Collector. Check that your PostHog plan includes destinations: PostHog bills each event that triggers one beyond a free allotment.

Use the Hog source in `scripts/posthog/snowplow-collector-destination.hog`, not the stock template with its JSON body edited. Body templating can't choose between page views, ecommerce events and `external_event`, and its default body sends every person property, including any email.

1. In PostHog, under **CDP**, open **Destinations**, click **New destination**, search for "Webhook" and click **Create** on **HTTP Webhook**.

2. Click **Edit source code**, then delete the template's inputs except **Log responses**: click each input's cog, then the bin. **Log responses** is the `debug` input the source reads.

3. Add two String inputs with **Add input variable**. Set each name in its cog panel, then enter the value in the editor under the input in the list.

   | Input | Value |
   |---|---|
   | `collector_url` | Your Collector URL, for example `https://collector.example.com`, with no trailing slash |
   | `app_id` | The app ID these events should carry |

4. Replace the source with the Hog code from `scripts/posthog/snowplow-collector-destination.hog`. If you added event names to the converter, add them to the same lists near the top.

5. In **Filters**, choose the events to forward. If you also run the client-side hook, add a property filter so `$lib` is not `web`. Browser test pages then don't reach the destination, so test from a server SDK or the capture API, or turn the filter off while you test.

6. Under **Testing**, click **Start testing**, then **Test function**. It posts a sample `$pageview` to your Collector and shows **Success**.

7. Click **Create & enable**.

8. Open the **Invocations** tab to see each event's status. With **Log responses** on, a delivered event logs `sent` and `200`. Turn **Log responses** off once the events look right.

The destination keys visitors on PostHog's `$device_id` and sessions on `$session_id`. Read these attributes from your backend: `$device_id` isn't recommended as a key on the public intervention endpoint. Events reach your Collector a few seconds after PostHog receives them, so don't rely on this approach for reactions within a page view. See [Delivery and delay](https://docs.snowplow.io/docs/signals/data-sources/existing-analytics.md#delivery-and-delay).

### Warehouse history

If you already use PostHog's batch exports to a warehouse, Signals can read pre-calculated attributes from a table there. Build a table of attributes per `$device_id` or `distinct_id` from the export, then configure it as described in [Warehouse configuration](https://docs.snowplow.io/docs/signals/attributes/warehouse-config.md), with a custom attribute key for the PostHog ID. This needs a warehouse connection in Signals. PostHog's events export includes person properties and the IP address, so select only the columns your attributes need.

## How PostHog events map to Snowplow

Each PostHog event takes the first rung of the [event mapping](https://docs.snowplow.io/docs/signals/data-sources/existing-analytics/how-it-works/event-mapping.md) ladder that fits. Both approaches use the same mapping.

| PostHog event | Snowplow event | Notes |
|---|---|---|
| `$pageview` | `page_view` | URL from `$current_url`, title from `title` |
| `Product Viewed` | `snowplow_ecommerce_action` (`product_view`) with `product` | Needs a product ID, price and currency |
| `Product Added`, `Product Removed` | `snowplow_ecommerce_action` (`add_to_cart`, `remove_from_cart`) with `product` | A `cart` entity when there's a `cart_total` or `value` |
| `Checkout Started`, `Checkout Step Viewed`, `Checkout Step Completed` | `snowplow_ecommerce_action` (`checkout_step`) | |
| `Order Completed` | `snowplow_ecommerce_action` (`transaction`) with one `product` per product and `transaction` | Needs an order ID, revenue or total, and currency |
| `Order Refunded` | `snowplow_ecommerce_action` (`refund`) | Needs an order ID, total and currency |
| `Products Searched` | `site_search` | `query` becomes the search term |
| `$identify` | `identify` | The user ID only. Person properties are dropped |
| `$groupidentify` | `external_event`, kind `group` | `group_id` from `$group_key`, `plan` from `$group_set` |
| `$pageleave` | `external_event`, kind `track` | `value` is the seconds the page was open |
| `$autocapture`, `$rageclick` and any other event | `external_event`, kind `track` | `name` is the PostHog event name. Element details aren't sent |
| `$snapshot`, `$$heatmap` and SDK bookkeeping events | Not sent | |

Ecommerce and search events are matched by name, ignoring case. An ecommerce event missing a required field falls back to `external_event`. PostHog properties that don't match a typed field stay in PostHog.

## Identifiers

| PostHog field | Snowplow field | Use as a Signals key? |
|---|---|---|
| Snowplow's own visitor and session cookies (client-side) | `domain_userid`, `domain_sessionid` | Yes, including on the public intervention endpoint |
| `$device_id` | `external_identity.anonymous_id`. Server-side, also `domain_userid` | Server-side reads only |
| `$session_id` | `external_identity.session_id`. Server-side, also `domain_sessionid` | Server-side reads only |
| `distinct_id` after `identify` | `user_id`, `external_identity.user_id` and `identify.id`, unchanged | Server-side reads only |
| `distinct_id` on an event with no `$device_id` | Treated as anonymous: `external_identity.anonymous_id` and, server-side, `domain_userid`. `user_id` is null | Server-side reads only |
| `$group_key` on `$groupidentify` | `external_event.group_id` | Server-side reads only, for account attributes |

Both scripts treat `distinct_id` as a user ID only on `$identify`, when it differs from `$device_id`, or (in `converter.js`) when `$user_state` is `identified`. Events from PostHog's server SDKs and the capture API usually carry only `distinct_id`, with no `$device_id` or `$user_state`, so the destination sends an identified user's `distinct_id`, often an email or account ID, as the anonymous ID and leaves `user_id` empty. To send it as the user ID, add `$device_id` to those events (a different value from `distinct_id`, such as the device or browser ID you already hold), or forward only browser events. Don't key user attributes on `user_id` for server SDK events until you've checked which field the ID arrived in.

`$device_id` can't be guessed, but it includes the time of the visitor's first visit, and PostHog's server SDKs accept any value for it. For interventions, use the client-side approach. If you run PostHog in cookieless mode, there's no `$device_id`, so use the client-side approach, which keys on Snowplow's own IDs.

## Troubleshooting

- **Nothing reaches PostHog or Snowplow in an automated browser:** posthog-js drops events from browsers it classes as bots. Set `opt_out_useragent_filter: true` in `posthog.init` for tests.
- **Nothing reaches Snowplow after an opt-out:** expected. The hook only runs for events PostHog sends.
- **The destination shows `Snowplow collector returned 404`:** the `collector_url` is wrong. Fix it, filter **Invocations** by **Logged errors**, and click **Rerun** on each failed row.
- **The destination shows delivered events but Snowplow has failed events:** the Collector accepts events before validation. Check failed events in Console as well as the destination's logs.
- **Browser events arrive twice:** both approaches send them. Add the `$lib` is not `web` filter to the destination.
- **`plan` changes unexpectedly:** any event with a `plan` property updates it, so a later event replaces the plan from `$groupidentify`.
