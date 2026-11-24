// PostHog event -> Snowplow, down the shared ladder. Dependency-free so the same file runs in the page
// (posthog-js before_send) and in Node.
// Input shapes: the browser CaptureResult ({uuid, event, properties, $set, timestamp}) or the CDP globals
// a Hog destination sees ({event: {uuid, event, distinct_id, properties, timestamp}, person}).

var PH = {
  tool: 'posthog',
  tv: 'posthog-adapter-1.0', aid: 'posthog-adapter',
  // Your vendor: the one you created external_event and external_identity under.
  vendor: 'com.example',
};

function iglu(name) {
  var map = {
    action: 'com.snowplowanalytics.snowplow.ecommerce/snowplow_ecommerce_action/jsonschema/1-0-2',
    product: 'com.snowplowanalytics.snowplow.ecommerce/product/jsonschema/1-0-0',
    transaction: 'com.snowplowanalytics.snowplow.ecommerce/transaction/jsonschema/1-0-0',
    cart: 'com.snowplowanalytics.snowplow.ecommerce/cart/jsonschema/1-0-0',
    refund: 'com.snowplowanalytics.snowplow.ecommerce/refund/jsonschema/1-0-0',
    checkout: 'com.snowplowanalytics.snowplow.ecommerce/checkout_step/jsonschema/1-0-0',
    siteSearch: 'com.snowplowanalytics.snowplow/site_search/jsonschema/1-0-0',
    identify: 'com.snowplowanalytics.snowplow/identify/jsonschema/1-0-0',
    external: PH.vendor + '/external_event/jsonschema/1-0-0',
    identity: PH.vendor + '/external_identity/jsonschema/1-0-0',
  };
  return 'iglu:' + map[name];
}

// Never forwarded: replay, heatmaps and SDK bookkeeping. Person updates ($set) carry traits only.
var DROP = ['$snapshot', '$$heatmap', '$feature_flag_called', '$web_vitals', '$exception', '$$client_ingestion_warning', '$opt_in', '$set'];

var ECOM = {
  product_view: ['product viewed'],
  add_to_cart: ['product added'],
  remove_from_cart: ['product removed'],
  checkout_step: ['checkout started', 'checkout step viewed', 'checkout step completed'],
  transaction: ['order completed'],
  refund: ['order refunded'],
};
var SEARCH = ['products searched'];

function pick() { for (var i = 0; i < arguments.length; i++) { var v = arguments[i]; if (v !== undefined && v !== null && v !== '') return v; } return undefined; }
function str255(v) { return v === undefined || v === null || typeof v === 'object' ? undefined : String(v).slice(0, 255); }
function num(v) { if (typeof v === 'number' && isFinite(v)) return v; if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v); return undefined; }
function money(v) { v = num(v); return v === undefined || v < 0 ? undefined : Math.round(v * 100) / 100; }
function int(v) { v = num(v); return v === undefined || v < 0 ? undefined : Math.round(v); }
function cur3(v) { return typeof v === 'string' && /^[A-Za-z]{3}$/.test(v) ? v.toUpperCase() : undefined; }
function compact(o) { var r = {}; for (var k in o) if (o[k] !== undefined && o[k] !== null && o[k] !== '') r[k] = o[k]; return r; }
function sdj(name, data) { return { schema: iglu(name), data: data }; }

// One canonical event from either input shape.
function fromBrowser(ev) {
  var p = ev.properties || {};
  return { name: ev.event, uuid: ev.uuid, props: p, distinctId: p.distinct_id, deviceId: p.$device_id,
    sessionId: p.$session_id, userState: p.$user_state, timeMs: ev.timestamp ? new Date(ev.timestamp).getTime() : undefined,
    ip: undefined, ua: p.$raw_user_agent, groupSet: p.$group_set };
}
function fromCdp(g) {
  var e = g.event, p = e.properties || {};
  return { name: e.event, uuid: e.uuid, props: p, distinctId: e.distinct_id, deviceId: p.$device_id,
    sessionId: p.$session_id, userState: p.$user_state, timeMs: Date.parse(e.timestamp),
    ip: p.$ip, ua: p.$raw_user_agent, groupSet: p.$group_set };
}

// distinct_id becomes the app's user id after identify(); before that it equals $device_id.
// identify() itself is sent while $user_state is still "anonymous", with the new id as distinct_id.
function userIdOf(c) {
  var identified = c.userState === 'identified' || c.name === '$identify' || (c.distinctId && c.deviceId && c.distinctId !== c.deviceId);
  if (!identified || !c.distinctId) return undefined;
  return String(c.distinctId).slice(0, 255);
}

function spProduct(it, currency) {
  var id = str255(pick(it.product_id, it.sku, it.id)), price = money(it.price), cur = cur3(it.currency) || currency;
  if (id === undefined || price === undefined || !cur) return undefined;
  var out = compact({ id: id, name: str255(it.name), price: price, currency: cur, quantity: int(it.quantity),
    variant: str255(it.variant), brand: str255(it.brand), position: int(it.position) });
  out.category = str255(it.category) || '';
  return out;
}
function spProducts(p, currency) {
  var list = Array.isArray(p.products) ? p.products : [], out = [];
  for (var i = 0; i < list.length; i++) { var x = spProduct(list[i] || {}, currency); if (x) out.push(x); }
  return out;
}

// Rungs 2 and 3: Snowplow ecommerce and site_search. Returns the event and entities as the ecommerce plugin
// would send them, plus the plugin call that produces them in the browser; undefined falls to external_event.
function standardEvent(c) {
  var p = c.props, n = String(c.name || '').trim().toLowerCase(), cur = cur3(p.currency), type, t;
  for (t in ECOM) if (ECOM[t].indexOf(n) >= 0) type = t;
  function prod(list) { return list.map(function (d) { return sdj('product', d); }); }
  function action(x) { return sdj('action', { type: x }); }
  if (SEARCH.indexOf(n) >= 0) {
    var q = str255(p.query);
    return q ? { event: sdj('siteSearch', { terms: [q] }), entities: [], plugin: ['trackSiteSearch', { terms: [q] }] } : undefined;
  }
  if (type === 'product_view') {
    var one = spProduct(p, cur);
    return one ? { event: action(type), entities: prod([one]), plugin: ['trackProductView', one] } : undefined;
  }
  if (type === 'add_to_cart' || type === 'remove_from_cart') {
    var line = spProduct(p, cur), total = money(pick(p.cart_total, p.value));
    if (!line) return undefined;
    var cart = total === undefined ? undefined : compact({ cart_id: str255(p.cart_id), total_value: total, currency: line.currency });
    return { event: action(type), entities: prod([line]).concat(cart ? [sdj('cart', cart)] : []),
      plugin: cart ? [type === 'add_to_cart' ? 'trackAddToCart' : 'trackRemoveFromCart', Object.assign({ products: [line] }, cart)] : undefined };
  }
  if (type === 'checkout_step') {
    var step = int(p.step), cs = compact({ step: step >= 1 && step <= 90 ? step : 1, delivery_method: str255(p.shipping_method), payment_method: str255(p.payment_method), coupon_code: str255(p.coupon) });
    var cp = spProducts(p, cur);
    return { event: action(type), entities: prod(cp).concat([sdj('checkout', cs)]), plugin: ['trackCheckoutStep', Object.assign({ context: prod(cp) }, cs)] };
  }
  if (type === 'transaction') {
    var rev = money(pick(p.revenue, p.total, p.value)), oid = str255(pick(p.order_id, p.checkout_id));
    if (!cur || rev === undefined || !oid) return undefined;
    var ps = spProducts(p, cur), qty = 0;
    ps.forEach(function (x) { qty += x.quantity === undefined ? 1 : x.quantity; });
    // payment_method is required by the schema and absent from PostHog's Order Completed.
    var trx = compact({ transaction_id: oid, revenue: rev, currency: cur, payment_method: str255(p.payment_method) || 'unknown',
      total_quantity: qty, tax: money(p.tax), shipping: money(p.shipping), discount_code: str255(p.coupon), discount_amount: money(p.discount) });
    return { event: action(type), entities: prod(ps).concat([sdj('transaction', trx)]), plugin: ['trackTransaction', Object.assign({ products: ps }, trx)] };
  }
  if (type === 'refund') {
    var amt = money(pick(p.total, p.revenue, p.value));
    if (!cur || amt === undefined || !p.order_id) return undefined;
    var rp = spProducts(p, cur), rf = { transaction_id: str255(p.order_id), currency: cur, refund_amount: amt };
    return { event: action(type), entities: prod(rp).concat([sdj('refund', rf)]), plugin: ['trackRefund', Object.assign({ products: rp }, rf)] };
  }
  return undefined;
}

function kindOf(c) {
  if (c.name === '$groupidentify') return 'group';
  if (c.name === '$create_alias') return 'alias';
  if (c.name === '$identify') return 'identify';
  return 'track';
}

// Rung 5: group, alias, autocapture and the prospect's own events.
function externalEvent(c) {
  var p = c.props, kind = kindOf(c), first = Array.isArray(p.products) && p.products.length ? p.products[0] || {} : {};
  var gs = c.groupSet || {};
  return sdj('external', compact({
    name: String(pick(c.name, 'unknown')).slice(0, 255), tool: PH.tool, kind: kind,
    // $pageleave carries how long the page was open; it is the only engagement signal without the tracker.
    value: c.name === '$pageleave' ? num(p.$prev_pageview_duration) : num(pick(p.revenue, p.value, p.total, p.price)),
    currency: cur3(p.currency),
    item_id: str255(pick(p.product_id, p.sku, first.product_id)),
    item_category: str255(pick(p.category, first.category)),
    search_term: str255(typeof p.query === 'string' ? p.query : undefined),
    plan: str255(pick(p.plan, kind === 'group' ? gs.plan : undefined)),
    group_id: str255(kind === 'group' ? p.$group_key : undefined),
    previous_id: str255(kind === 'alias' ? p.alias : undefined),
  }));
}

// The ladder. Returns null for events that are never forwarded.
function ladder(c) {
  if (DROP.indexOf(c.name) >= 0) return null;
  if (c.name === '$pageview') return { rung: 'page_view', entities: [] };
  var uid = userIdOf(c);
  if (c.name === '$identify' && uid) return { rung: 'identify', event: sdj('identify', { id: uid }), entities: [] };
  var std = standardEvent(c);
  if (std) return { rung: std.event.schema === iglu('siteSearch') ? 'site_search' : 'ecommerce', event: std.event, entities: std.entities, plugin: std.plugin };
  return { rung: 'external_event', event: externalEvent(c), entities: [] };
}

// Cookieless mode has no $device_id and one shared distinct_id for every visitor, so anonymous_id is null;
// an identified distinct_id is a user id, never an anonymous one.
function identity(c) {
  var anon = c.deviceId;
  if (anon === undefined && c.distinctId !== '$posthog_cookieless' && !userIdOf(c)) anon = c.distinctId;
  return sdj('identity', {
    tool: PH.tool, anonymous_id: anon === undefined || anon === null || anon === '' ? null : String(anon).slice(0, 255),
    user_id: userIdOf(c) || null,
    session_id: c.sessionId ? String(c.sessionId) : null, session_number: null, event_id: c.uuid ? String(c.uuid) : null,
    event_name: String(c.name).slice(0, 255),
  });
}

var PostHogSnowplow = { PH: PH, iglu: iglu, DROP: DROP, fromBrowser: fromBrowser, fromCdp: fromCdp, ladder: ladder, identity: identity, userIdOf: userIdOf };
if (typeof module !== 'undefined' && module.exports) module.exports = PostHogSnowplow;
else if (typeof window !== 'undefined') window.PostHogSnowplow = PostHogSnowplow;
