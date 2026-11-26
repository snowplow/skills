# Interventions on pages that use an adapter

Use after the `signals` skill has published an attribute group and an intervention keyed on `domain_userid` or `domain_sessionid` from a client-side approach. Server-side approaches key on the tool's own ID, so never deliver interventions to them on the public endpoint; read attributes from the customer's backend instead.

## Receive interventions in the page

On a client-side approach, add the [Signals browser plugin](https://docs.snowplow.io/docs/signals/applications/subscribe.md#subscribe-with-the-browser-tracker-plugin) to the Snowplow tracker and subscribe. Run this after `newTracker`, and set `endpoint` to your Signals API URL:

```js
snowplow('addPlugin', 'https://cdn.jsdelivr.net/npm/@snowplow/signals-browser-plugin@0.2.2/dist/index.umd.min.js', ['snowplowSignals', 'SignalsPlugin']);

snowplow('addInterventionHandlers', {
  purchaseIntentNudge: function (intervention) {
    if (intervention.name === 'purchase_intent_nudge') {
      // Show the offer in your UI.
    }
  },
});

snowplow('subscribeToInterventions', { endpoint: 'YOUR_SIGNALS_API_URL' });
```

Load the plugin once per page: a second copy doesn't receive your handlers. Approaches that send events without the Snowplow tracker can't use the plugin.

In Google Tag Manager:

1. On the **Snowplow v4** page view tag that fires on **Window Loaded**, open **Load Plugins** and add a row with **Plugin URL** set to the URL above and **Plugin Configuration** set to `snowplowSignals,SignalsPlugin`. If the same tag also fires on **History Change**, split it into two tags and load the plugin only on the Window Loaded one.
2. Add a **Custom HTML** tag on **Window Loaded** with the `addInterventionHandlers` and `subscribeToInterventions` calls in a `<script>` element. Under **Advanced Settings** > **Tag Sequencing**, select **Fire a tag before** this tag fires, and choose the Window Loaded page view tag.

See [Subscribe to interventions](https://docs.snowplow.io/docs/signals/applications/subscribe.md) for the options.
