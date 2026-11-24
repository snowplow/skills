# Amplitude

Tested setup for sending Amplitude events to Snowplow. The client-side plugin and the no-tracker plugin both load the converter in `scripts/amplitude/amplitude-snowplow.js` (`window.AmplitudeSnowplow`): save it on the site, for example as `/js/amplitude-snowplow.js`, and load it with a `<script>` tag before the Amplitude SDK. The Webhook destination uses the FreeMarker template in `scripts/amplitude/amplitude-webhook-template.ftl`, pasted as the event payload. Use both files unchanged except at the adaptation points: the vendor, `vendor` in `ADAPTER` in the converter and `VENDOR` at the top of the template, both set to the vendor the customer created the `external_event` and `external_identity` schemas under in their own Snowplow registry (the copies in `references/schemas/` use `com.example`); the `ECOM` and `SEARCH` event-name lists (in both files, kept in step) if the customer's ecommerce or search event names differ from the defaults, `AmplitudeSnowplow.ADAPTER.aid` for the no-tracker plugin, and `"aid":"my-app"` in the template.

## Choose an approach

Most sites should use the **client-side plugin with the Snowplow tracker**. It's a few lines of JavaScript next to `amplitude.init`, it reacts while the visitor is still on the page, and it gives you a random visitor key that is safe to use for interventions.

Use one of the [other approaches](#other-approaches) when:

| Approach | Use it when |
|---|---|
| [Send without the Snowplow tracker](#send-without-the-snowplow-tracker) | You can't add the Snowplow tracker to your pages |
| [Webhook destination](#webhook-destination) | Important events come from your servers, mobile apps or the HTTP API, or you can't change the page code. Events arrive within about a minute |
| [Warehouse history](#warehouse-history) | You want history, such as a lifetime order count, alongside a real-time approach |

You can run the plugin and the webhook together. Send only server and app events through the webhook, so the same event isn't counted twice.

## Before you begin

- Amplitude Browser SDK 2 (`@amplitude/analytics-browser`).
- The Admin or Manager role on your Amplitude project, or someone who has it. Only those roles can see the API key and add destinations.
- A Snowplow Collector URL and Signals enabled on your pipeline.
- Your Amplitude tracking plan, so you can match your event names to the ecommerce and search lists described in [How Amplitude events map to Snowplow](#how-amplitude-events-map-to-snowplow).

## Set up the client-side approach

A destination plugin receives every event the Browser SDK sends, converts it, and passes it to the Snowplow browser tracker. Amplitude keeps receiving its events as before.

1. Load the Snowplow JavaScript tracker with the [tag snippet](https://docs.snowplow.io/docs/sources/web-trackers/quick-start-guide.md), and the converter (`scripts/amplitude/amplitude-snowplow.js`), before the Amplitude SDK, and create a tracker. The plugin calls `window.snowplow`, which the tag snippet defines, so use the tag snippet rather than the npm package.

   ```javascript
   window.snowplow('newTracker', 'sp', 'https://collector.example.com', {
     appId: 'my-site',
     eventMethod: 'post',
     contexts: { webPage: true },
   });
   window.snowplow('enableActivityTracking', { minimumVisitLength: 30, heartbeatDelay: 10 });
   ```

   Activity tracking sends the page pings that engagement attributes need. Don't call `trackPageView` yourself: the plugin forwards Amplitude's page views, so keep page views on in the Browser SDK's `autocapture` option, as they are by default.

2. Add the destination plugin before you call `amplitude.init`.

   ```javascript
   const snowplowDestination = {
     name: 'snowplow-destination',
     type: 'destination',
     setup: async () => undefined,
     execute: async (event) => {
       const c = AmplitudeSnowplow.fromBrowser(event, Date.now());
       const sp = AmplitudeSnowplow.toSnowplow(c);
       const context = [AmplitudeSnowplow.identity(c, event.device_id)].concat(sp.entities);
       window.snowplow('setUserId', event.user_id || null);
       if (sp.e === 'pv') {
         window.snowplow('trackPageView', {
           title: event.event_properties['[Amplitude] Page Title'],
           context,
           timestamp: { type: 'ttm', value: event.time },
         });
       } else {
         window.snowplow('trackSelfDescribingEvent', {
           event: sp.event,
           context,
           timestamp: { type: 'ttm', value: event.time },
         });
       }
       return { event, code: 200, message: 'forwarded' };
     },
   };

   amplitude.add(snowplowDestination);
   amplitude.init('YOUR_AMPLITUDE_API_KEY', {
     // your existing options, unchanged
   });
   ```

3. If your ecommerce or search event names differ from the defaults, add them to the converter's `ECOM` and `SEARCH` lists. Events whose names aren't in a list arrive as `external_event`.

4. Gate both tools on consent. The Snowplow tracker sets its own cookies as soon as `newTracker` runs, so create it only after the visitor consents. Add `optOut: true` to the `amplitude.init` call from step 2, and move the step 1 tracker code into a function that runs on consent and then opts Amplitude back in:

   ```javascript
   amplitude.add(snowplowDestination);
   amplitude.init('YOUR_AMPLITUDE_API_KEY', {
     optOut: true,
     // your existing options, unchanged
   });

   function onAnalyticsConsent() {
     window.snowplow('newTracker', 'sp', 'https://collector.example.com', {
       appId: 'my-site',
       eventMethod: 'post',
       contexts: { webPage: true },
     });
     window.snowplow('enableActivityTracking', { minimumVisitLength: 30, heartbeatDelay: 10 });
     amplitude.setOptOut(false);
   }
   ```

   Call `onAnalyticsConsent` from your consent tool. Events tracked before consent are dropped, so neither Amplitude nor Snowplow receives them. See [Privacy and consent](https://docs.snowplow.io/docs/signals/data-sources/existing-analytics/how-it-works/privacy-and-consent.md).

5. Publish the change to your site.

To react to interventions in the page, add the Signals browser plugin to the Snowplow tracker. See `references/interventions.md`.

## Check it works

Test with your Console development environment before you send events to your pipeline. Every Snowplow trial includes one: it runs Snowplow Micro, hosted by Snowplow. See [Run Snowplow Micro through Console](https://docs.snowplow.io/docs/testing/snowplow-micro/console.md).

1. In Console, go to **Pipelines** and select your development environment.
2. Copy its Collector endpoint, and point the Snowplow tracker at it. For the other approaches, use it as the plugin's or Webhook destination's URL, keeping the `/com.snowplowanalytics.snowplow/tp2` path.
3. Send test events from your site.
4. Select **Open dashboard** to see the good and failed events.

In the dashboard, check that:

- Every Amplitude event arrives once, with no failed events.
- `[Amplitude] Page Viewed` arrives as a `page_view`.
- Product views and orders arrive as `snowplow_ecommerce_action`, with one `product` entity per item and a `transaction` entity on orders.
- Searches arrive as `site_search`, and identifies with a user ID arrive as `identify` with the ID only.
- Every other event arrives as `external_event`, with `name` set to the Amplitude event type.
- Every event carries an `external_identity` entity with `tool` set to `amplitude` and `anonymous_id` set to the Amplitude `device_id`.

Once the events look right, point the tracker at your pipeline's Collector, then hand over to the `signals` skill to build attribute groups and interventions (see SKILL.md).

## Other approaches

### Send without the Snowplow tracker

The plugin can also post each converted event straight to the Collector, without loading the Snowplow tracker. Use it instead of the plugin above, not alongside it, or every event reaches Snowplow twice. It uses Amplitude's `device_id` as `domain_userid`, and builds `domain_sessionid` from the `device_id` and Amplitude's `session_id`. Set your app ID after loading the converter with `AmplitudeSnowplow.ADAPTER.aid = 'my-site';`.

```javascript
const snowplowDirect = {
  name: 'snowplow-direct',
  type: 'destination',
  setup: async () => undefined,
  execute: async (event) => {
    const body = JSON.stringify(
      AmplitudeSnowplow.toPayload([AmplitudeSnowplow.fromBrowser(event, Date.now())])
    );
    fetch('https://collector.example.com/com.snowplowanalytics.snowplow/tp2', {
      method: 'POST',
      body,
      keepalive: true,
      credentials: 'include',
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
    return { event, code: 200, message: 'forwarded' };
  },
};
amplitude.add(snowplowDirect);
```

Without the tracker there are no page pings, no retries and no in-page interventions. A `?deviceId=` link can set Amplitude's `device_id`, so don't use `domain_userid` or `domain_sessionid` as a key on the public intervention endpoint in this mode.

### Webhook destination

Amplitude's Webhook destination can format each event with a FreeMarker template. The template in `scripts/amplitude/amplitude-webhook-template.ftl` writes a Snowplow Collector payload, so Amplitude posts straight to your Collector with no service in between. It covers every source Amplitude streams, including server SDKs, the HTTP API and mobile apps. Check that your Amplitude plan includes the Webhook destination.

1. In Amplitude, go to **Data** > **Catalog**, open the **Destinations** tab, and create a Webhook destination that sends events. See Amplitude's [Webhooks](https://amplitude.com/docs/data/destination-catalog/webhooks) documentation.
2. Set the URL to your Collector's `tp2` endpoint, for example `https://collector.example.com/com.snowplowanalytics.snowplow/tp2`, and add the header `Content-Type: application/json`.
3. Choose to send events, and select the events to forward. If you also run the client-side plugin, forward only events that don't come from the browser.
4. Paste `scripts/amplitude/amplitude-webhook-template.ftl` as the event payload. Change `"aid":"my-app"` to the app ID you want these events to carry. If you added event names to the converter's lists, add them to the same lists near the top of the template.
5. Send test events from Amplitude, then check them as described in [Check it works](#check-it-works).

The webhook keys visitors on Amplitude's `device_id`, which a `?deviceId=` link can set, so read these attributes from your backend only. Amplitude's documented delivery target is 60 seconds at the 95th percentile, so don't rely on this approach for reactions within a page view. See [Delivery and delay](https://docs.snowplow.io/docs/signals/data-sources/existing-analytics.md#delivery-and-delay).

### Warehouse history

If you already export Amplitude events to a warehouse such as Snowflake or BigQuery, Signals can read pre-calculated attributes from a table there. Build a table of attributes per Amplitude `device_id` or `user_id` from the export, then configure it as described in [Warehouse configuration](https://docs.snowplow.io/docs/signals/attributes/warehouse-config.md), with a custom attribute key for the Amplitude ID. This needs a warehouse connection in Signals, and attributes update on your sync schedule.

## How Amplitude events map to Snowplow

Each event takes the first row that fits. The same mapping runs in the converter and in the webhook template. See [Event mapping](https://docs.snowplow.io/docs/signals/data-sources/existing-analytics/how-it-works/event-mapping.md) for the reasoning.

| Amplitude event or call | Snowplow event | Notes |
|---|---|---|
| `[Amplitude] Page Viewed` | `page_view` | Title from `[Amplitude] Page Title`, URL from `[Amplitude] Page Location` |
| `track` with a product view name, such as `Product Viewed` | `snowplow_ecommerce_action`, type `product_view`, with a `product` entity | |
| `track` with an add or remove name, such as `Product Added` | `snowplow_ecommerce_action`, type `add_to_cart` or `remove_from_cart` | A `cart` entity when the event has `cart_total` or `cart_value` |
| `track` with a checkout name, such as `Checkout Started` | `snowplow_ecommerce_action`, type `checkout_step` | |
| `track` with an order name, such as `Order Completed`, or `amplitude.revenue()` | `snowplow_ecommerce_action`, type `transaction`, with `product` and `transaction` entities | `payment_method` is `unknown` when the event has none. With no `order_id`, `transaction_id` or `orderId`, the transaction ID is the event's `insert_id` (the template uses `$insert_id`, then `uuid`) |
| `track` with a refund name, or a negative `amplitude.revenue()` | `snowplow_ecommerce_action`, type `refund` | Needs an order ID and a currency |
| `track` with a search name, such as `Products Searched`, and a `query` | `site_search` | |
| `identify` after `setUserId` | `identify` | ID only. User properties, including any email, aren't sent |
| `setGroup` and `groupIdentify` | `external_event`, kind `group` | `group_id` from the group value, `plan` from the group's `plan` property |
| Any other event | `external_event`, kind `track` | `name` is the Amplitude event type. Typed fields from `price`, `currency`, `product_id`, `category`, `query` and `plan` |

Ecommerce and search events are matched by name, ignoring case. If any item lacks an ID, a price or a currency, product view, cart and order events fall back to `external_event`. Checkout and refund events are still sent, without product entities. A refund needs an order ID and a currency, or it falls back too. A refund with no amount is sent with `refund_amount` 0. An order with no order ID is still sent as a transaction, keyed on the `insert_id` placeholder, so it doesn't fall back. Amplitude properties outside the typed fields aren't sent.

## Identifiers

| Amplitude field | Snowplow field | Use as a Signals key? |
|---|---|---|
| Snowplow's own visitor and session cookies (with the tracker) | `domain_userid`, `domain_sessionid` | Yes, including on the public intervention endpoint |
| `device_id` | `external_identity.anonymous_id`. Also `domain_userid` without the tracker and on the webhook | Server-side reads only: a `?deviceId=` link can set it |
| `session_id` | `external_identity.session_id`. Without the tracker and on the webhook, also part of `domain_sessionid` | Never on its own: it's a timestamp |
| `user_id` | `user_id`, `external_identity.user_id` and `identify.id`, unchanged. Never copied into `domain_userid` or `anonymous_id`: an event the converter or the webhook template receives with no `device_id` has no `domain_userid` or `domain_sessionid` and a null `external_identity.anonymous_id` | Server-side reads only |
| `groups` | `external_event.group_id` | As a custom key for account attributes, server-side reads only |

To combine a visitor's activity across devices and logins, key stream attribute groups on `snowplow_id` with Snowplow Identities. See [Identifiers](https://docs.snowplow.io/docs/signals/data-sources/existing-analytics/how-it-works/identifiers.md).

## Troubleshooting

- **No page views in Snowplow:** page view autocapture is off in the Browser SDK. Turn it back on, or no visitor or session attributes fill.
- **Events reach Snowplow but not Amplitude:** the plugin forwards events even when Amplitude rejects them, for example with a wrong API key. Check **Data** > **Sources** > **Ingestion Debugger** in Amplitude.
- **Every event arrives twice:** both the tracker plugin and the no-tracker plugin are loaded, or the webhook forwards browser events the plugin already sends. Keep one path per event.
- **Server or app events are missing:** the client-side plugin sees browser events only. Add the Webhook destination for the rest.
- **`plan` changes unexpectedly:** any event with a `plan` property updates it, so a later track event replaces the plan from `groupIdentify`.
