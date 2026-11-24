# Adobe

Tested setup for sending Adobe events to Snowplow. Every approach uses the shared loader and helpers in `scripts/adobe/snowplow-adobe.js`. The Web SDK callback adds `scripts/adobe/web-sdk-mapping.js`, the AppMeasurement callback adds `scripts/adobe/appmeasurement-mapping.js`, and event forwarding uses `scripts/adobe/event-forwarding-converter.js` on its own. Copy them and set the adaptation points: `VENDOR` in `snowplow-adobe.js` and in `event-forwarding-converter.js`, set to the vendor the customer created the `external_event` and `external_identity` schemas under in their own Snowplow registry (the copies in `references/schemas/` use `com.example`); `collector`, the `appId` in `newTracker`, and the `/js/sp.js` and `/js/snowplow-ecommerce.js` paths in `snowplow-adobe.js`; `FIELDS` (and, if needed, `SEARCH_QUERY`, `LOGIN_TYPES` and `USER_NAMESPACES`) in `web-sdk-mapping.js`; `MAP` in `appmeasurement-mapping.js`; and `aid` and `slots` (plus `searchQuery`, `loginTypes` and `userNamespaces`) in `event-forwarding-converter.js`.

## Choose an approach

Most sites should use the **Web SDK callback**. One callback in your Web SDK configuration copies each event into the Snowplow tracker as Adobe sends it. The tracker runs in the browser, so you get Snowplow sessions, page pings and interventions in the page.

Find your setup to pick an approach:

| Your setup | How you'll know | Use |
|---|---|---|
| Web SDK (alloy.js), with Tags or in page code | `alloy` exists on the page | [Web SDK callback](#set-up-the-web-sdk-callback) (recommended) |
| AppMeasurement (Adobe Analytics `s` object) | `s_gi` exists on the page; requests go to `/b/ss/` | [AppMeasurement callback](#appmeasurement-callback) |
| Adobe Client Data Layer and Tags rules | `adobeDataLayer` exists on the page | [Tags rules on the data layer](#tags-rules-on-the-adobe-client-data-layer) |
| Web SDK or Mobile SDK, with event forwarding licensed, and you can't add a browser script | Your contract includes Real-Time CDP Connections, Prime or Ultimate | [Event forwarding](#event-forwarding). No sessions or in-page interventions, and values arrive later |
| Analytics history you want in Signals | You receive Analytics Data Feeds in a warehouse | [Data Feeds](#warehouse-history-data-feeds), beside a live approach |

If your site runs both the Web SDK and AppMeasurement, pick one hook. Using both copies each event twice.

## Before you begin

You need:

- A Snowplow pipeline with Signals enabled, and its Collector URL.
- Access to change your Adobe setup: the Tags property, or the page code that configures the Web SDK.
- A list of the XDM fields that hold the user ID, plan, account ID and search term. The adapter reads only the fields you name.

The `external_event` and `external_identity` schemas aren't on Iglu Central. Create them in your Snowplow registry under your own vendor, from the JSON in `references/schemas/` with `com.example` replaced, and set `VENDOR` in the scripts to the same vendor. The other schemas the adapter uses are on Iglu Central. See [external_event](schemas/external_event.json) and [external_identity](schemas/external_identity.json).

## Set up the Web SDK callback

The Web SDK calls `onBeforeEventSend` with each event just before it sends it. The callback copies the event into Snowplow and lets Adobe's request continue unchanged.

1. **Add the shared script.** Host the Snowplow JavaScript tracker and ecommerce plugin, version 4.10.3, where your pages can load them. Then copy `scripts/adobe/snowplow-adobe.js` to your pages, or to your Tags library, so that it runs before the Web SDK sends its first event. Set `collector` to your Collector URL and `appId` to your app ID. All Adobe approaches use this script.

   To send page pings for engagement attributes, add this after `newTracker`:

   ```js
   snowplow('enableActivityTracking', { minimumVisitLength: 5, heartbeatDelay: 5 });
   ```

2. **Add the field map.** Append `scripts/adobe/web-sdk-mapping.js` to `snowplow-adobe.js`, after the helpers. Replace the paths in `FIELDS` with the paths in your own XDM schema. Tenant fields start with your tenant ID, such as `xdm._yourtenant`.

3. **Read the ECID.** Call `getIdentity` once after your first `sendEvent` resolves. Use your Web SDK instance name; it's `alloy` by default.

   ```js
   var ecid = null;
   window.snowplowAdobe.vendorId = function () { return ecid; };
   // getIdentity returns no identity, or rejects, while consent is pending or refused.
   function fetchEcid() {
     alloy('getIdentity', { namespaces: ['ECID'] }).then(function (r) {
       ecid = (r && r.identity && r.identity.ECID) || null;
       if (ecid) window.snowplowAdobe.idReady();
     }).catch(function () {});
   }
   // For example, after the first page view:
   // alloy('sendEvent', { xdm: { ... } }).then(function () { if (!ecid) fetchEcid(); }).catch(function () {});
   ```

4. **Add the callback.** If you configure the Web SDK in page code, add `onBeforeEventSend` to your `configure` call:

   ```js
   alloy('configure', {
     datastreamId: 'YOUR_DATASTREAM_ID',
     orgId: 'YOUR_ORG_ID@AdobeOrg',
     // An exception here would stop the Web SDK sending to Adobe too, so the copy never throws.
     onBeforeEventSend: function (content) {
       try { window.snowplowAdobe.mirrorXdm(content); } catch (e) {}
     },
   });
   ```

   If you deploy the Web SDK with Tags, add this to the on before event send callback code in the Adobe Experience Platform Web SDK extension settings. The extension provides the event as `content`:

   ```js
   try { if (window.snowplowAdobe && window.snowplowAdobe.mirrorXdm) window.snowplowAdobe.mirrorXdm(content); } catch (e) {}
   ```

   Keep the `try` and `catch`, and never return `false`: either would stop the event for Adobe too.

5. **Gate the tracker on consent.** The tracker sets its own cookies when it loads. Load `snowplow-adobe.js` only once your consent management platform allows analytics.

6. **Publish** your Tags library or deploy your page code, then [check it works](#check-it-works).

To react to interventions in the page, add the Signals browser plugin to the Snowplow tracker. See `references/interventions.md`.

## Check it works

Test with your Console development environment, which runs Snowplow Micro hosted by Snowplow. Every Snowplow trial includes one. See [Run Snowplow Micro through Console](https://docs.snowplow.io/docs/testing/snowplow-micro/console.md).

1. In Console, go to **Pipelines**, select your development environment and copy its Collector endpoint.
2. Point `collector` in the shared script at it. For event forwarding, point the Make Fetch Call action at it, keeping the `/com.snowplowanalytics.snowplow/tp2` path.
3. Send a page view, a product view, a purchase and a login.
4. Select **Open dashboard** to see the good and failed events.

Check that:

- no event failed
- page views arrive as `page_view` events, one per Adobe page view
- product views and orders arrive as `snowplow_ecommerce_action` events, with a `product` entity per line and a `transaction` entity
- logins arrive as `identify` events with `id` only
- other events arrive as `external_event`, with `name` set to the XDM `eventType`, the link name or the data layer event
- every event carries `external_identity`, with the ECID in `anonymous_id`
- Adobe still receives every event, in the Adobe Experience Platform Debugger

Once the events look right, point the shared script at your pipeline's Collector, then hand over to the `signals` skill to build attribute groups and interventions (see SKILL.md).

## Other approaches

### AppMeasurement callback

AppMeasurement calls the function you pass to `s.registerPreTrackCallback` with the request URL of every `s.t()` and `s.tl()` call. The callback reads that URL and sends the matching Snowplow event.

1. Add the shared script, `scripts/adobe/snowplow-adobe.js`, from step 1 of the Web SDK callback.

2. Write down which eVars, props and events hold the user ID, plan, account ID and search term. In the request URL, `eVar1` appears as `v1` and `prop3` as `c3`. Append `scripts/adobe/appmeasurement-mapping.js` to `snowplow-adobe.js`, after the helpers, and set `MAP` to your variables. Context data is never read.

3. Register the callback on your `s` object and tell the helpers how to read the ECID. If your `s` object already has a Visitor instance, use that one. If Tags deploys AppMeasurement, put this in the Adobe Analytics extension's custom code.

   ```js
   var visitor = Visitor.getInstance('YOUR_ORG_ID@AdobeOrg', { trackingServer: 'metrics.example.com' });
   var s = s_gi('yourreportsuite');
   s.visitor = visitor;
   s.registerPreTrackCallback(function (url) {
     try { window.snowplowAdobe.mirrorAm(url); } catch (e) {}
   });
   window.snowplowAdobe.vendorId = function () { return visitor.getMarketingCloudVisitorID(); };
   ```

4. Gate the tracker on consent, deploy the change, then [check it works](#check-it-works).

### Tags rules on the Adobe Client Data Layer

If your site pushes events to the Adobe Client Data Layer (`adobeDataLayer`), you can fire Snowplow events from Tags rules on those pushes. You write one rule per event.

1. Add the shared script, `scripts/adobe/snowplow-adobe.js`, to your Tags library.

2. In the Adobe Client Data Layer extension, create data elements that read named paths from the data layer, such as `page.name`, `user.id`, `account.id` and `account.plan`. Read named fields only: the data layer keeps every field ever pushed, including emails.

3. Create one rule per data layer event, with the extension's Data Pushed event for that event name and a Core Custom Code action that calls a helper. The pushed object is `event.message`. For example:

   ```js
   // Rule: SP page view. Event: Data Pushed, specific event "page loaded".
   window.snowplowAdobe.sp.pageView(_satellite.getVar('page name'), 'page loaded');
   ```

   ```js
   // Rule: SP purchase. Event: Data Pushed, specific event "purchase".
   var t = event.message.transaction;
   window.snowplowAdobe.sp.ecommerce('purchase', {
     type: 'transaction',
     transaction: { transaction_id: t.id, revenue: t.total, currency: t.currency, payment_method: t.paymentMethod || 'unknown' },
     products: t.items.map(function (i) { return { id: i.sku, name: i.name, category: i.category, price: i.price, quantity: i.qty, currency: t.currency }; }),
   });
   ```

   ```js
   // Rule: SP login. Event: Data Pushed, specific event "login".
   window.snowplowAdobe.sp.identify('login', _satellite.getVar('user id'));
   ```

   ```js
   // Rule: SP join group. Event: Data Pushed, specific event "join group".
   window.snowplowAdobe.sp.external('join_group', 'group', { group_id: _satellite.getVar('account id'), plan: _satellite.getVar('account plan') });
   ```

   Add rules that call `sp.ecommerce` with type `product_view` and `sp.search` if you want product views and searches. These rules don't read the ECID unless you set `window.snowplowAdobe.vendorId`, as in the other approaches.

4. Publish your Tags library, then [check it works](#check-it-works).

### Event forwarding

Event forwarding runs a rule on Adobe's servers for each Web SDK or Mobile SDK event that reaches the Edge Network, and posts a Snowplow event to your Collector. Nothing changes in the browser or the app. It has no Snowplow sessions, the visitor key is the ECID, and values arrive later than client-side. See [Delivery and delay](https://docs.snowplow.io/docs/signals/data-sources/existing-analytics.md#delivery-and-delay).

1. Confirm that your contract includes event forwarding. Adobe includes it with Real-Time CDP Connections, Prime and Ultimate.

2. In your event forwarding property, create a Core Custom Code data element, for example `snowplow body`, and paste in the converter from `scripts/adobe/event-forwarding-converter.js`. Set `slots` to the same paths as `FIELDS` in the Web SDK mapping, and `aid` to your app ID.

   Then add these lines at the end of the data element:

   ```js
   var x = arc.event.xdm || {};
   var ecid = x.identityMap && x.identityMap.ECID && x.identityMap.ECID[0] && x.identityMap.ECID[0].id;
   var head = (arc.request && arc.request.head) || {};
   return JSON.stringify(toPayload([xdmToSp(arc.event, { ecid: ecid, ip: head.ip, ua: head.userAgent })]));
   ```

3. Install the Adobe Cloud Connector extension. Create a rule with a Make Fetch Call action that sends a `POST` to `https://<your collector>/com.snowplowanalytics.snowplow/tp2`, with the header `Content-Type: application/json` and the `snowplow body` data element as the body.

4. Publish the event forwarding library, then [check it works](#check-it-works).

### Warehouse history: Data Feeds

If you receive Adobe Analytics Data Feeds in your warehouse, you can turn them into batch attributes per visitor beside your live attributes. This needs a Signals warehouse connection.

1. Load the Data Feed `hit_data` files into a table in the warehouse Signals reads.

2. Build a model that aggregates the feed per ECID. This example counts visits, page views, product views and orders over 90 days, and keeps the latest account ID from `eVar5`. Change the eVar and event numbers to match your report suite, and the date functions to match your warehouse.

   ```sql
   WITH hits AS (
     SELECT *
     FROM hit_data
     WHERE exclude_hit = 0                      -- Adobe's own exclusion flag
       AND hit_source NOT IN (5, 7, 8, 9)       -- data sources and other non-hit rows
       AND mcvisid IS NOT NULL AND mcvisid <> ''
       AND date_time >= DATE('now', '-90 day')
   ),
   accounts AS (
     SELECT mcvisid, post_evar5,
            ROW_NUMBER() OVER (PARTITION BY mcvisid ORDER BY date_time DESC) AS rn
     FROM hits
     WHERE post_evar5 <> ''
   )
   SELECT
     h.mcvisid                                                                          AS adobe_ecid,
     COUNT(DISTINCT h.post_visid_high || '-' || h.post_visid_low || '-' || h.visit_num) AS visits_90d,
     SUM(CASE WHEN h.page_event = 0 THEN 1 ELSE 0 END)                                  AS page_views_90d,
     SUM(CASE WHEN (',' || h.post_event_list || ',') LIKE '%,2,%' THEN 1 ELSE 0 END)    AS product_views_90d,
     SUM(CASE WHEN (',' || h.post_event_list || ',') LIKE '%,1,%' THEN 1 ELSE 0 END)    AS orders_90d,
     MAX(a.post_evar5)                                                                  AS last_account_id,
     MAX(h.date_time)                                                                   AS last_seen
   FROM hits h
   LEFT JOIN accounts a ON a.mcvisid = h.mcvisid AND a.rn = 1
   GROUP BY h.mcvisid;
   ```

   In `post_event_list`, `1` is purchase, `2` is product view, and `200` to `299` are `event1` to `event100`.

3. In Signals, create a custom attribute key for the ECID, and add the model's output as a [batch source](https://docs.snowplow.io/docs/signals/attributes/warehouse-config.md) on that key.

Warehouse attributes update periodically, so they can't trigger interventions.

## How Adobe events map to Snowplow

Every approach uses the same [event mapping ladder](https://docs.snowplow.io/docs/signals/data-sources/existing-analytics/how-it-works/event-mapping.md): a standard Snowplow event wherever one fits, and `external_event` for the rest.

| Adobe event | Snowplow event |
|---|---|
| Web SDK `web.webpagedetails.pageViews`; AppMeasurement `s.t()`; data layer page event | `page_view` |
| Web SDK `commerce.productViews`; Analytics `prodView` | `snowplow_ecommerce_action`, type `product_view` |
| Web SDK `commerce.productListAdds`, `commerce.productListRemovals`; Analytics `scAdd`, `scRemove` | `snowplow_ecommerce_action`, type `add_to_cart` or `remove_from_cart`, with a `cart` entity |
| Web SDK `commerce.checkouts`; Analytics `scCheckout` | `snowplow_ecommerce_action`, type `checkout_step` |
| Web SDK `commerce.purchases`; Analytics `purchase` | `snowplow_ecommerce_action`, type `transaction`, with a `transaction` entity and one `product` entity per line |
| Web SDK and event forwarding `commerce.refunds` | `snowplow_ecommerce_action`, type `refund`, with a `refund` entity and one `product` entity per line. Adobe has no standard refund event type, so this applies only if you send one. AppMeasurement has no refund mapping |
| Any Web SDK event with `siteSearch.query`; your Analytics search event | `site_search` |
| Web SDK `userAccount.login` with a CRMID; an AppMeasurement hit with the user ID variable | `identify`, with `id` only |
| Everything else: link clicks, form events, your own event types and link names | `external_event`, `tool` set to `adobe` |

Ecommerce events don't fall back to `external_event` when a field is missing. The scripts fill placeholders instead: the currency is `USD` when the order and first item have no valid currency code (AppMeasurement: when the hit has no `cc`), `transaction_id` is `unknown` when there's no `purchaseID` (AppMeasurement: no `purchaseID` or `xact`), `payment_method` is `unknown` when there's no payment type, and `category` is `unknown` when an item has none. Check for these values before you build revenue or order attributes, and set the real currency and order ID in your Adobe implementation where you can.

## Identifiers

| Adobe field | Snowplow field | Use as a Signals key? |
|---|---|---|
| Snowplow visitor ID, client-side approaches | `domain_userid` | Yes. A random ID, safe on the public intervention endpoint |
| Snowplow session ID, client-side approaches | `domain_sessionid` | Yes, for session attributes |
| ECID | `external_identity.anonymous_id`; on event forwarding, also `domain_userid` | Only for reads from your own servers. Never on the public intervention endpoint |
| Authenticated ID: Web SDK `identityMap` CRMID, or your user ID eVar | `user_id`, `external_identity.user_id` and `identify.id`, unchanged | Only for reads from your own servers |
| Adobe visit | Nothing | Adobe computes visits on its servers |

See [Identifiers and attribute keys](https://docs.snowplow.io/docs/signals/data-sources/existing-analytics/how-it-works/identifiers.md).

## Troubleshooting

- **Adobe stops receiving an event:** the callback is throwing or returning `false`. Keep the `try` and `catch`, and return nothing.
- **The first events on a page aren't copied:** `snowplow-adobe.js` loaded after the Web SDK sent them. Load it first, or from a Library Loaded rule ordered before your first event.
- **Events arrive without `external_identity`:** the ECID wasn't available within 5 seconds. Check the `getIdentity` call in step 3.
- **Each event arrives twice:** your site runs both the Web SDK and AppMeasurement hooks. Keep one.
- **A value is missing from `external_event`:** add its XDM path, eVar or prop to your field map. Attributes read only the typed fields of `external_event`, and Adobe's own processing, such as eVar persistence and processing rules, isn't applied.

For how each approach handles consent and personal data, see [Privacy and consent](https://docs.snowplow.io/docs/signals/data-sources/existing-analytics/how-it-works/privacy-and-consent.md).
