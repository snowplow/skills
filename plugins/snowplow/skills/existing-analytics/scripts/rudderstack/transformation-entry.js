// RudderStack transformation entry point. Paste it after rudderstack-snowplow-adapter.js in the same
// transformation; it calls the RudderStackSnowplow namespace that file defines.
export function transformEvent(event, metadata) {
  return RudderStackSnowplow.toPayload([event]);
}
