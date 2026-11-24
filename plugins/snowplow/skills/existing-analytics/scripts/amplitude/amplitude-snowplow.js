// Amplitude event (Browser SDK 2 HTTP V2 shape, or the export/webhook shape) -> Snowplow tracker payload.
// Dependency-free so the same file runs in the page (Amplitude destination plugin) and on a server.
// Wrapped so that only AmplitudeSnowplow is added to window.
(function (root) {
var ADAPTER = {
  // Your vendor: the one you created external_event and external_identity under.
  vendor: 'com.example',
  tool: 'amplitude', tv: 'amplitude-adapter-1.0', aid: 'amplitude-adapter', ns: '6f1c3c2e-5b7a-4d2e-9a51-3e0f6c1d2b4a',
};
function utf8Bytes(str) {
  var out = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      var d = str.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function padBlocks(bytes) {
  var len = bytes.length, msg = bytes.slice();
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  var bits = len * 8, hi = Math.floor(bits / 0x100000000), lo = bits >>> 0;
  msg.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
    (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
  return msg;
}

function rotl(x, n) { return (x << n) | (x >>> (32 - n)); }
function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

function sha1(bytes) {
  var m = padBlocks(bytes), h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0], w = new Array(80);
  for (var o = 0; o < m.length; o += 64) {
    for (var i = 0; i < 16; i++) w[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
    for (i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
    for (i = 0; i < 80; i++) {
      var f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      var t = (rotl(a, 5) + f + e + k + w[i]) | 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = t;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0; h[4] = (h[4] + e) | 0;
  }
  var out = [];
  h.forEach(function (x) { out.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255); });
  return out;
}

var K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];

function sha256(bytes) {
  var m = padBlocks(bytes), w = new Array(64);
  var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  for (var o = 0; o < m.length; o += 64) {
    for (var i = 0; i < 16; i++) w[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
    for (i = 16; i < 64; i++) {
      var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (i = 0; i < 64; i++) {
      var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g);
      var t1 = (hh + S1 + ch + K256[i] + w[i]) | 0;
      var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), maj = (a & b) ^ (a & c) ^ (b & c);
      var t2 = (S0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  var out = [];
  h.forEach(function (x) { out.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255); });
  return out;
}

function hex(bytes) {
  return bytes.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
}

function uuidv5(name, ns) {
  var nsBytes = [], nsHex = ns.replace(/-/g, '');
  for (var i = 0; i < 32; i += 2) nsBytes.push(parseInt(nsHex.substr(i, 2), 16));
  var b = sha1(nsBytes.concat(utf8Bytes(String(name)))).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  var x = hex(b);
  return x.substr(0, 8) + '-' + x.substr(8, 4) + '-' + x.substr(12, 4) + '-' + x.substr(16, 4) + '-' + x.substr(20, 12);
}

// network_userid and domain_userid are 128 chars in atomic.events.
function fitId(id) {
  if (id === undefined || id === null || id === '') return undefined;
  var s = String(id);
  return s.length > 128 ? hex(sha256(utf8Bytes(s))) : s;
}

function pick() {
  for (var i = 0; i < arguments.length; i++) {
    var v = arguments[i];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}
function str255(v) { return v === undefined || v === null || typeof v === 'object' ? undefined : String(v).slice(0, 255); }
function num(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v);
  return undefined;
}
function firstKey(o) { if (!o || typeof o !== 'object') return undefined; for (var k in o) return k; return undefined; }
function firstVal(o) { var k = firstKey(o); if (k === undefined) return undefined; var v = o[k]; return Array.isArray(v) ? v[0] : v; }
// Export and webhook times are UTC strings like "2026-11-13 10:00:00.123456" with no zone.
function amplitudeTime(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number') return Math.round(v);
  var s = String(v);
  if (/^\d+$/.test(s)) return Number(s);
  var m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d{1,3})?\d*(Z|[+-]\d{2}:?\d{2})?$/);
  var n = m ? Date.parse(m[1] + 'T' + m[2] + (m[3] || '') + (m[4] || 'Z')) : Date.parse(s);
  return isNaN(n) ? undefined : n;
}

var PV = '[Amplitude] Page Viewed';

// domain_sessionid must be a UUID. Keep device_id's first 24 hex chars (74 random bits) and put session_id
// (epoch ms) in hex in the last 12, so a FreeMarker template and the page can build the same key.
function sessionKey(deviceId, sessionId) {
  if (!deviceId || sessionId === undefined || sessionId === null || sessionId < 0) return undefined;
  var d = String(deviceId).toLowerCase();
  var tail = ('000000000000' + Number(sessionId).toString(16)).slice(-12);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(d)) return d.slice(0, 24) + tail;
  return uuidv5('amplitude-session:' + deviceId + ':' + sessionId, ADAPTER.ns);
}

// Both input shapes reduce to one canonical event.
function fromBrowser(ev, sentMs) {
  return {
    eventType: ev.event_type, insertId: ev.insert_id, deviceId: ev.device_id, userId: ev.user_id,
    sessionId: ev.session_id, timeMs: ev.time, sentMs: sentMs, receivedMs: undefined,
    props: ev.event_properties || {}, groups: ev.groups, groupProps: ev.group_properties,
    ip: ev.ip && ev.ip !== '$remote' ? ev.ip : undefined, ua: ev.user_agent, lang: ev.language,
  };
}
function fromExport(ev) {
  return {
    eventType: ev.event_type, insertId: pick(ev.$insert_id, ev.uuid), deviceId: ev.device_id, userId: ev.user_id,
    sessionId: ev.session_id, timeMs: amplitudeTime(pick(ev.client_event_time, ev.event_time)),
    sentMs: amplitudeTime(ev.client_upload_time), receivedMs: amplitudeTime(pick(ev.server_received_time, ev.event_time)),
    props: ev.event_properties || {}, groups: ev.groups, groupProps: ev.group_properties,
    ip: ev.ip_address, ua: undefined, lang: ev.language,
  };
}

function kindOf(c) {
  if (c.eventType === PV) return 'page';
  if (c.eventType === '$groupidentify') return 'group';
  if (c.eventType === '$identify') return firstKey(c.groups) ? 'group' : 'identify';
  return 'track';
}

// Fallback slots for external_event only; ecommerce events carry every product as entities instead.
function slots(c, kind) {
  var p = c.props, first = Array.isArray(p.products) && p.products.length ? p.products[0] || {} : {};
  var gset = c.groupProps && c.groupProps.$set ? c.groupProps.$set : c.groupProps || {};
  var s = {
    value: num(pick(p.revenue, p.$revenue, p.value,
      num(p.$price) !== undefined ? num(p.$price) * (num(p.$quantity) || 1) : undefined, p.price)),
    currency: cur3(pick(p.currency, p.$currency)),
    item_id: str255(pick(p.product_id, p.$productId, p.sku, first.product_id)),
    item_category: str255(pick(p.category, first.category)),
    search_term: str255(p.query),
    plan: str255(pick(p.plan, kind === 'group' ? gset.plan : undefined)),
  };
  if (kind === 'group') s.group_id = str255(firstVal(c.groups));
  return s;
}

function cur3(v) { return typeof v === 'string' && /^[A-Za-z]{3}$/.test(v) ? v.toUpperCase() : undefined; }
function money(v) { v = num(v); return v === undefined || v < 0 ? undefined : Math.round(v * 100) / 100; }
function sdj(schema, data) { return { schema: 'iglu:' + schema, data: data }; }
function compact(o) { var r = {}; for (var k in o) if (o[k] !== undefined) r[k] = o[k]; return r; }

// Common Amplitude event names. Add your own names here if they differ.
var ECOM = {
  product_view: ['product viewed', 'view item', 'view_item', 'viewed product'],
  add_to_cart: ['product added', 'add to cart', 'add_to_cart', 'added to cart'],
  remove_from_cart: ['product removed', 'remove from cart', 'remove_from_cart'],
  checkout_step: ['checkout started', 'begin checkout', 'begin_checkout', 'checkout step completed'],
  transaction: ['order completed', 'purchase', 'purchase completed', 'checkout completed'],
  refund: ['order refunded', 'refund', 'refund completed'],
};
var SEARCH = ['products searched', 'search', 'searched', 'site search', 'search submitted'];
function ecomType(c, name) {
  var n = String(name || '').trim().toLowerCase();
  for (var t in ECOM) if (ECOM[t].indexOf(n) >= 0) return t;
  // Amplitude's revenue() call: a negative amount is a refund.
  if (c.eventType === 'revenue_amount') return (num(c.props.$price) || 0) * (num(c.props.$quantity) || 1) < 0 ? 'refund' : 'transaction';
  return undefined;
}

// One product entity per item. Returns undefined if any item lacks a field the product schema requires.
function products(p, currency) {
  var items = Array.isArray(p.products) && p.products.length ? p.products
    : [{ product_id: pick(p.product_id, p.$productId, p.sku), name: p.name, category: p.category,
      price: pick(p.price, p.$price), quantity: pick(p.quantity, p.$quantity), brand: p.brand, variant: p.variant }];
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    var id = pick(it.product_id, it.sku, it.id, it.$productId), price = money(it.price);
    var cur = cur3(pick(it.currency, currency));
    if (id === undefined || price === undefined || !cur) return undefined;
    var q = num(it.quantity);
    out.push(compact({
      id: String(id), name: str255(it.name), category: str255(pick(it.category)) || '', price: price, currency: cur,
      quantity: q !== undefined ? Math.max(0, Math.round(q)) : undefined, brand: str255(it.brand), variant: str255(it.variant),
      position: num(it.position) !== undefined ? Math.round(it.position) : undefined,
    }));
  }
  return out;
}

// The ladder: Iglu Central schemas where one fits, external_event for the rest.
function toSnowplow(c) {
  var p = c.props, kind = kindOf(c), E = 'com.snowplowanalytics.snowplow.ecommerce/';
  var name = c.eventType === 'revenue_amount' ? pick(p.$revenueType, c.eventType) : c.eventType;
  if (kind === 'page') return { e: 'pv', entities: [] };
  // An $identify without a user_id only sets user properties (the SDK's attribution call), so it stays external_event.
  if (kind === 'identify' && c.userId) return { e: 'ue', event: sdj('com.snowplowanalytics.snowplow/identify/jsonschema/1-0-0', { id: String(c.userId).slice(0, 256) }), entities: [] };
  var type = kind === 'track' ? ecomType(c, name) : undefined;
  if (type) {
    var currency = cur3(pick(p.currency, p.$currency));
    var prods = products(p, currency);
    if (type === 'checkout_step') {
      return { e: 'ue', event: sdj(E + 'snowplow_ecommerce_action/jsonschema/1-0-2', { type: type }),
        entities: [sdj(E + 'checkout_step/jsonschema/1-0-0', { step: Math.max(1, Math.round(num(p.step) || 1)) })]
          .concat((prods || []).map(function (x) { return sdj(E + 'product/jsonschema/1-0-0', x); })) };
    }
    if (prods || type === 'refund') {
      var ents = (prods || []).map(function (x) { return sdj(E + 'product/jsonschema/1-0-0', x); });
      var cur = currency || (prods && prods[0].currency);
      var lines = (prods || []).reduce(function (s, x) { return s + x.price * (x.quantity === undefined ? 1 : x.quantity); }, 0);
      var orderId = pick(p.order_id, p.transaction_id, p.orderId);
      if (type === 'transaction') {
        ents.push(sdj(E + 'transaction/jsonschema/1-0-0', compact({
          transaction_id: String(pick(orderId, c.insertId)), revenue: pick(money(pick(p.revenue, p.$revenue, p.total)), money(lines)),
          currency: cur, total_quantity: (prods || []).reduce(function (s, x) { return s + (x.quantity === undefined ? 1 : x.quantity); }, 0),
          // Required by the schema; Amplitude has no standard field for it.
          payment_method: String(pick(p.payment_method, 'unknown')).slice(0, 128),
          tax: money(p.tax), shipping: money(p.shipping), discount_amount: money(p.discount),
          discount_code: str255(p.coupon) ? String(p.coupon).slice(0, 99) : undefined,
        })));
      } else if (type === 'refund') {
        var amt = money(Math.abs(num(pick(p.refund_amount, p.revenue, p.$revenue, p.$price !== undefined ? num(p.$price) * (num(p.$quantity) || 1) : undefined)) || 0));
        if (orderId === undefined || !cur || amt === undefined) type = undefined;
        else ents.push(sdj(E + 'refund/jsonschema/1-0-0', compact({ transaction_id: String(orderId), currency: cur, refund_amount: amt, refund_reason: str255(p.reason) })));
      } else if (type === 'add_to_cart' || type === 'remove_from_cart') {
        var total = money(pick(p.cart_total, p.cart_value));
        // The cart entity needs the cart total after the change, which the event may not carry.
        if (total !== undefined && cur) ents.push(sdj(E + 'cart/jsonschema/1-0-0', compact({ cart_id: str255(p.cart_id), total_value: total, currency: cur })));
      }
      if (type) return { e: 'ue', event: sdj(E + 'snowplow_ecommerce_action/jsonschema/1-0-2', { type: type }), entities: ents };
    }
  }
  var term = kind === 'track' && SEARCH.indexOf(String(name).trim().toLowerCase()) >= 0 ? str255(pick(p.query, p.search_term, p.term, p.keyword)) : undefined;
  if (term) {
    var total2 = num(pick(p.results_count, p.total_results));
    return { e: 'ue', event: sdj('com.snowplowanalytics.snowplow/site_search/jsonschema/1-0-0', compact({ terms: [term], totalResults: total2 !== undefined ? Math.max(0, Math.round(total2)) : undefined })), entities: [] };
  }
  var data = { name: String(pick(name, 'unknown')).slice(0, 255), tool: ADAPTER.tool, kind: kind };
  var sl = slots(c, kind);
  for (var k in sl) if (sl[k] !== undefined) data[k] = sl[k];
  return { e: 'ue', event: sdj(ADAPTER.vendor + '/external_event/jsonschema/1-0-0', data), entities: [] };
}

function identity(c, anon) {
  return sdj(ADAPTER.vendor + '/external_identity/jsonschema/1-0-0', compact({
    tool: ADAPTER.tool, anonymous_id: anon ? String(anon).slice(0, 255) : null, user_id: c.userId ? String(c.userId).slice(0, 255) : null,
    session_id: c.sessionId !== undefined && c.sessionId !== null && c.sessionId >= 0 ? String(c.sessionId) : null,
    event_id: c.insertId ? String(c.insertId).slice(0, 255) : null,
    event_name: c.eventType ? String(c.eventType).slice(0, 255) : null,
  }));
}

function toTrackerEvent(c) {
  var p = c.props;
  // Server-side events can carry only user_id; falling back to it would copy an email into domain_userid.
  var anon = pick(c.deviceId);
  // Page Location keeps the query string (UTMs, click ids); Page URL drops it.
  var url = pick(p['[Amplitude] Page Location'], p['[Amplitude] Page URL']);
  var ref = pick(p['[Amplitude] Previous Page Location'], p.referrer);
  var sp = toSnowplow(c);
  var out = {
    e: sp.e, p: 'web', tv: ADAPTER.tv, aid: ADAPTER.aid,
    // UUIDv5 of insert_id, so the browser route and the webhook route give the same event_id.
    eid: uuidv5(pick(c.insertId, JSON.stringify(c)), ADAPTER.ns),
    dtm: c.timeMs !== undefined ? String(c.timeMs) : undefined,
    stm: c.sentMs !== undefined ? String(c.sentMs) : undefined,
    ttm: c.timeMs !== undefined ? String(c.timeMs) : undefined,
    ip: c.ip, ua: c.ua,
    tnuid: fitId(anon), duid: fitId(anon),
    sid: sessionKey(c.deviceId, c.sessionId),
    uid: c.userId ? String(c.userId).slice(0, 255) : undefined,
    url: url, refr: ref || undefined, lang: c.lang,
  };
  if (sp.e === 'pv') out.page = p['[Amplitude] Page Title'];
  else out.ue_pr = JSON.stringify(sdj('com.snowplowanalytics.snowplow/unstruct_event/jsonschema/1-0-0', sp.event));
  out.co = JSON.stringify(sdj('com.snowplowanalytics.snowplow/contexts/jsonschema/1-0-1', [identity(c, anon)].concat(sp.entities)));
  var clean = {};
  for (var key in out) if (out[key] !== undefined && out[key] !== null && out[key] !== '') clean[key] = String(out[key]);
  return clean;
}

function toPayload(canon) {
  return { schema: 'iglu:com.snowplowanalytics.snowplow/payload_data/jsonschema/1-0-4', data: canon.map(toTrackerEvent) };
}

var AmplitudeSnowplow = { toTrackerEvent: toTrackerEvent, toPayload: toPayload, fromBrowser: fromBrowser, fromExport: fromExport, kindOf: kindOf, slots: slots, toSnowplow: toSnowplow, identity: identity, uuidv5: uuidv5, sessionKey: sessionKey, amplitudeTime: amplitudeTime, ADAPTER: ADAPTER };
if (typeof module !== 'undefined' && module.exports) module.exports = AmplitudeSnowplow;
else root.AmplitudeSnowplow = AmplitudeSnowplow;
})(typeof window !== 'undefined' ? window : this);
