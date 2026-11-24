// RudderStack event to one Snowplow tracker protocol event (payload_data 1-0-4).
// Ladder: page_view, then Iglu Central ecommerce, site_search and identify, then external_event.
// No imports on purpose: RudderStack's transformation sandbox has no require, Buffer or crypto.
// No export either, so the page can load this file as a classic script. The transformation pastes this file,
// then transformation-entry.js. Everything is inside one namespace, RudderStackSnowplow, so the page gets a single
// global.

var RudderStackSnowplow = (function () {
  var CONFIG = {
    // Your vendor: the one you created external_event and external_identity under.
    vendor: 'com.example',
    tool: 'rudderstack',
    tv: 'rs-transformation-0.2',
    aid: 'your-app-id',
    // Fixed namespace for UUIDv5(messageId); any constant UUID works, it only has to never change.
    ns: '6f1c3c2e-5b7a-4d2e-9a51-3e0f6c1d2b4a',
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

  function epochMs(ts) {
    if (ts === undefined || ts === null || ts === '') return undefined;
    var n = typeof ts === 'number' ? ts : Date.parse(ts);
    return isNaN(n) ? undefined : String(Math.round(n));
  }

  function pick() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  }

  function str255(v) {
    if (v === undefined || v === null || typeof v === 'object') return undefined;
    return String(v).slice(0, 255);
  }

  function num(v) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v);
    return undefined;
  }

  var S = {
    ue: 'iglu:com.snowplowanalytics.snowplow/unstruct_event/jsonschema/1-0-0',
    co: 'iglu:com.snowplowanalytics.snowplow/contexts/jsonschema/1-0-1',
    action: 'iglu:com.snowplowanalytics.snowplow.ecommerce/snowplow_ecommerce_action/jsonschema/1-0-2',
    product: 'iglu:com.snowplowanalytics.snowplow.ecommerce/product/jsonschema/1-0-0',
    transaction: 'iglu:com.snowplowanalytics.snowplow.ecommerce/transaction/jsonschema/1-0-0',
    refund: 'iglu:com.snowplowanalytics.snowplow.ecommerce/refund/jsonschema/1-0-0',
    cart: 'iglu:com.snowplowanalytics.snowplow.ecommerce/cart/jsonschema/1-0-0',
    checkout: 'iglu:com.snowplowanalytics.snowplow.ecommerce/checkout_step/jsonschema/1-0-0',
    search: 'iglu:com.snowplowanalytics.snowplow/site_search/jsonschema/1-0-0',
    identify: 'iglu:com.snowplowanalytics.snowplow/identify/jsonschema/1-0-0',
    external: 'iglu:' + CONFIG.vendor + '/external_event/jsonschema/1-0-0',
    identity: 'iglu:' + CONFIG.vendor + '/external_identity/jsonschema/1-0-0',
  };

  // Segment ecommerce spec v2 names, which RudderStack shares.
  var ECOM = {
    'product viewed': 'product_view', 'product added': 'add_to_cart', 'product removed': 'remove_from_cart',
    'checkout started': 'checkout_step', 'checkout step viewed': 'checkout_step', 'checkout step completed': 'checkout_step',
    'order completed': 'transaction', 'order refunded': 'refund',
  };

  function money(v) { var n = num(v); return n === undefined || n < 0 ? undefined : Math.round(n * 100) / 100; }
  function int(v) { var n = num(v); return n === undefined || n < 0 ? undefined : Math.round(n); }
  function iso(v) { return typeof v === 'string' && /^[A-Za-z]{3}$/.test(v) ? v.toUpperCase() : undefined; }
  function compact(o) { var r = {}; for (var k in o) if (o[k] !== undefined) r[k] = o[k]; return r; }
  function sd(schema, data) { return { schema: schema, data: data }; }

  // Snowplow's product entity requires id, price and currency; null means "cannot express this item".
  function product(p, cur) {
    var id = str255(pick(p.product_id, p.sku, p.id)), price = money(p.price), currency = iso(pick(p.currency, cur));
    if (!id || price === undefined || !currency) return null;
    return compact({
      id: id, name: str255(p.name), category: str255(p.category) || '', price: price, currency: currency,
      quantity: int(p.quantity), brand: str255(p.brand), variant: str255(p.variant), position: int(p.position),
    });
  }

  function ecommerce(ev, action) {
    var p = ev.properties || {}, cur = iso(p.currency);
    var list = Array.isArray(p.products) ? p.products : (action === 'product_view' || action === 'add_to_cart' || action === 'remove_from_cart') ? [p] : [];
    var products = [];
    for (var i = 0; i < list.length; i++) {
      var pr = product(list[i] || {}, cur);
      if (!pr) return null;
      products.push(pr);
    }
    var ents = products.map(function (x) { return sd(S.product, x); });
    if (action === 'product_view' && products.length !== 1) return null;
    if (action === 'add_to_cart' || action === 'remove_from_cart') {
      if (products.length !== 1) return null;
      var pr0 = products[0], line = pr0.price * (pr0.quantity || 1);
      ents.push(sd(S.cart, compact({ cart_id: str255(p.cart_id), total_value: money(pick(p.cart_total, p.value, line)), currency: pr0.currency })));
    } else if (action === 'checkout_step') {
      var step = int(pick(p.step, 1));
      if (!step || step > 90) return null;
      ents.push(sd(S.checkout, compact({ step: step, payment_method: str255(p.payment_method), delivery_method: str255(p.shipping_method), coupon_code: str255(p.coupon) })));
    } else if (action === 'transaction') {
      var revenue = money(pick(p.revenue, p.total, p.value)), qty = 0;
      if (!p.order_id || revenue === undefined || !cur) return null;
      products.forEach(function (x) { qty += x.quantity || 1; });
      ents.push(sd(S.transaction, compact({
        transaction_id: str255(p.order_id), revenue: revenue, currency: cur,
        // Required by the schema; the Segment spec has no payment field.
        payment_method: str255(p.payment_method) || 'unknown', total_quantity: qty,
        tax: money(p.tax), shipping: money(p.shipping), discount_amount: money(p.discount), discount_code: str255(p.coupon),
      })));
    } else if (action === 'refund') {
      var amount = money(pick(p.total, p.revenue, p.value));
      if (!p.order_id || amount === undefined || !cur) return null;
      ents.push(sd(S.refund, compact({ transaction_id: str255(p.order_id), refund_amount: amount, currency: cur, refund_reason: str255(p.reason) })));
    }
    return { event: sd(S.action, { type: action }), entities: ents };
  }

  function externalEvent(ev, type) {
    var p = ev.properties || {};
    var first = Array.isArray(p.products) && p.products.length ? p.products[0] || {} : {};
    var data = {
      name: type === 'track' ? String(pick(ev.event, 'track')).slice(0, 255) : type,
      tool: CONFIG.tool,
      kind: type,
      value: num(pick(p.revenue, p.value, p.total, p.price)),
      currency: iso(p.currency),
      item_id: str255(pick(p.product_id, p.sku, first.product_id)),
      item_category: str255(pick(p.category, first.category)),
      search_term: str255(p.query),
      plan: str255(pick(p.plan, type === 'group' && ev.traits ? ev.traits.plan : undefined)),
    };
    if (type === 'group') data.group_id = str255(ev.groupId);
    if (type === 'alias') data.previous_id = str255(ev.previousId);
    return sd(S.external, compact(data));
  }

  // Returns {event, entities} for a non-page call, walking the ladder.
  function ladder(ev, type) {
    var name = String(ev.event || '').trim().toLowerCase();
    if (type === 'track' && ECOM[name]) {
      var e = ecommerce(ev, ECOM[name]);
      if (e) return e;
    }
    if (type === 'track' && name === 'products searched' && str255((ev.properties || {}).query)) {
      return { event: sd(S.search, { terms: [str255(ev.properties.query)] }), entities: [] };
    }
    // Only the id: identify traits can hold email and other personal data.
    if (type === 'identify' && ev.userId) return { event: sd(S.identify, { id: String(ev.userId).slice(0, 256) }), entities: [] };
    return { event: externalEvent(ev, type), entities: [] };
  }

  function toTrackerEvent(ev) {
    var ctx = ev.context || {};
    var page = ctx.page || {};
    var type = String(ev.type || '').toLowerCase();
    // Server-side calls often carry only userId; falling back to it would copy an email into domain_userid.
    var anon = pick(ev.anonymousId);
    var out = {
      p: 'web',
      tv: CONFIG.tv,
      aid: CONFIG.aid,
      eid: uuidv5(pick(ev.messageId, JSON.stringify(ev)), CONFIG.ns),
      dtm: epochMs(ev.originalTimestamp),
      stm: epochMs(ev.sentAt),
      ttm: epochMs(ev.timestamp),
      ip: pick(ctx.ip, ev.request_ip),
      ua: ctx.userAgent,
      tnuid: fitId(anon),
      duid: fitId(anon),
      uid: ev.userId ? String(ev.userId).slice(0, 255) : undefined,
      url: page.url,
      // The RudderStack SDK sends "$direct" when there is no referrer; Snowplow would parse it as a URL.
      refr: page.referrer && page.referrer.charAt(0) !== '$' ? page.referrer : undefined,
      lang: ctx.locale,
      tz: ctx.timezone,
    };
    if (ctx.screen && ctx.screen.width) out.res = ctx.screen.width + 'x' + ctx.screen.height;

    var entities = [];
    if (type === 'page' || type === 'screen') {
      out.e = 'pv';
      out.page = pick(page.title, ev.name, ev.properties && ev.properties.title);
      if (type === 'screen') out.url = pick(out.url, ev.name ? 'screen://' + ev.name : undefined);
    } else {
      var l = ladder(ev, type);
      out.e = 'ue';
      out.ue_pr = JSON.stringify(sd(S.ue, l.event));
      entities = l.entities;
    }

    var sid = pick(ctx.sessionId);
    entities.push(sd(S.identity, {
      tool: CONFIG.tool,
      anonymous_id: anon === undefined ? null : String(anon).slice(0, 255),
      user_id: ev.userId ? String(ev.userId).slice(0, 255) : null,
      session_id: sid === undefined ? null : String(sid).slice(0, 255),
      // RudderStack has no session counter.
      session_number: null,
      event_id: ev.messageId ? String(ev.messageId).slice(0, 255) : null,
      event_name: type === 'track' ? str255(ev.event) || null : type === 'page' || type === 'screen' ? str255(ev.name) || null : type,
    }));
    out.co = JSON.stringify(sd(S.co, entities));

    var clean = {};
    for (var key in out) if (out[key] !== undefined && out[key] !== null && out[key] !== '') clean[key] = String(out[key]);
    return clean;
  }

  function toPayload(events) {
    return {
      schema: 'iglu:com.snowplowanalytics.snowplow/payload_data/jsonschema/1-0-4',
      data: events.map(toTrackerEvent),
    };
  }

  return { CONFIG: CONFIG, S: S, ECOM: ECOM, ladder: ladder, toTrackerEvent: toTrackerEvent, toPayload: toPayload, uuidv5: uuidv5 };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RudderStackSnowplow;
