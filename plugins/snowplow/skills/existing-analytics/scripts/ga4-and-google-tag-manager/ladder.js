// Maps a GA4 event to the first rung that fits: page_view, Snowplow ecommerce, site_search,
// identify (id only), a Google schema from Iglu Central, then external_event.
(function (root) {
  // Your vendor: the one you created external_event and external_identity under.
  var VENDOR = 'com.example';
  var S = {
    externalEvent: 'iglu:' + VENDOR + '/external_event/jsonschema/1-0-0',
    externalIdentity: 'iglu:' + VENDOR + '/external_identity/jsonschema/1-0-0',
    identify: 'iglu:com.snowplowanalytics.snowplow/identify/jsonschema/1-0-0',
    siteSearch: 'iglu:com.snowplowanalytics.snowplow/site_search/jsonschema/1-0-0',
    ecomAction: 'iglu:com.snowplowanalytics.snowplow.ecommerce/snowplow_ecommerce_action/jsonschema/1-0-2',
    product: 'iglu:com.snowplowanalytics.snowplow.ecommerce/product/jsonschema/1-0-0',
    transaction: 'iglu:com.snowplowanalytics.snowplow.ecommerce/transaction/jsonschema/1-0-0',
    cart: 'iglu:com.snowplowanalytics.snowplow.ecommerce/cart/jsonschema/1-0-0',
    refund: 'iglu:com.snowplowanalytics.snowplow.ecommerce/refund/jsonschema/1-0-0',
    checkoutStep: 'iglu:com.snowplowanalytics.snowplow.ecommerce/checkout_step/jsonschema/1-0-0',
  };

  // GA4 recommended events with a Google schema and no Snowplow equivalent, with the fields each keeps.
  var GOOGLE = {
    add_to_wishlist: ['com.google.tag-manager.server-side/add_to_wishlist/jsonschema/1-0-0', ['currency', 'value', 'items']],
    exception: ['com.google.tag-manager.server-side/exception/jsonschema/1-0-0', ['description', 'fatal']],
    generate_lead: ['com.google.tag-manager.server-side/generate_lead/jsonschema/1-0-0', ['currency', 'value']],
    select_content: ['com.google.tag-manager.server-side/select_content/jsonschema/1-0-0', ['content_type', 'item_id']],
    share: ['com.google.tag-manager.server-side/share/jsonschema/1-0-0', ['method', 'content_type', 'item_id']],
    sign_up: ['com.google.tag-manager.server-side/sign_up/jsonschema/1-0-0', ['method']],
  };
  var ECOM = ['view_item', 'view_item_list', 'select_item', 'add_to_cart', 'remove_from_cart', 'begin_checkout', 'add_payment_info', 'purchase', 'refund'];
  var SEARCH = ['view_search_results', 'search'];
  var IDENTIFY = ['login'];

  function clean(o) { for (var k in o) if (o[k] === undefined || o[k] === '') delete o[k]; return o; }
  function str(v) { return v === undefined || v === null || typeof v === 'object' ? undefined : String(v).slice(0, 255); }
  function num(v) { var n = typeof v === 'string' && v !== '' ? Number(v) : v; return typeof n === 'number' && isFinite(n) ? n : undefined; }
  function money(v) { var n = num(v); return n === undefined ? undefined : Math.round(n * 100) / 100; }
  function nonNeg(n) { return n === undefined ? undefined : Math.max(0, n); }
  function int(v) { var n = num(v); return n === undefined ? undefined : Math.round(n); }
  function currency(c, fallback) { c = String(c || fallback || '').toUpperCase(); return /^[A-Z]{3}$/.test(c) ? c : undefined; }

  // Same field mapping as the ecommerce plugin's GA4 helpers, but every item with an item_id is kept.
  function products(items, cur) {
    return (items || []).filter(function (it) { return it && str(it.item_id) !== undefined; }).map(function (it) {
      var cat = [it.item_category, it.item_category2, it.item_category3, it.item_category4, it.item_category5].filter(Boolean).join('/');
      return clean({
        id: String(it.item_id), name: str(it.item_name), category: cat || 'unknown',
        // The product schema has minimum 0 for both prices, so a discount larger than the price gives 0.
        price: nonNeg(money((num(it.price) || 0) - (num(it.discount) || 0))), list_price: nonNeg(money(it.price)),
        quantity: int(it.quantity), position: int(it.index), brand: str(it.item_brand), variant: str(it.item_variant),
        currency: cur,
      });
    });
  }

  // Pass the event's params to check that an ecommerce event can be sent; without them, any ecommerce name
  // returns 'ecommerce'.
  function rung(name, p, opts) {
    if (name === 'page_view') return 'page_view';
    if (ECOM.indexOf(name) >= 0) return p === undefined || ecommerceCalls(name, p, opts).length ? 'ecommerce' : 'external_event';
    if (SEARCH.indexOf(name) >= 0) return 'site_search';
    if (IDENTIFY.indexOf(name) >= 0) return 'identify';
    if (GOOGLE[name]) return 'google';
    return 'external_event';
  }

  // Ecommerce plugin calls for a GA4 ecommerce event: [[method, args], ...]. Args carry no context.
  // Returns [] when a field the Snowplow schemas require is missing, so the event goes to external_event.
  function ecommerceCalls(name, p, opts) {
    opts = opts || {};
    p = p || {};
    var cur = currency(p.currency, opts.currency);
    var prods = products(p.items, cur);
    var orderId = str(p.transaction_id);
    // The product, cart, transaction and refund entities all require a currency.
    if (!cur && (prods.length || ['add_to_cart', 'remove_from_cart', 'purchase', 'refund'].indexOf(name) >= 0)) return [];
    switch (name) {
      case 'view_item': return prods.map(function (pr) { return ['trackProductView', pr]; });
      case 'view_item_list': return [['trackProductListView', clean({ name: str(p.item_list_name || p.item_list_id), products: prods })]];
      case 'select_item':
        if (!prods.length) return [];
        return [['trackProductListClick', clean({ name: str(p.item_list_name || p.item_list_id), product: prods[0] })]];
      // GA4 value is what was added or removed, not the cart total the cart entity asks for.
      case 'add_to_cart': return [['trackAddToCart', { products: prods, total_value: money(p.value) || 0, currency: cur }]];
      case 'remove_from_cart': return [['trackRemoveFromCart', { products: prods, total_value: money(p.value) || 0, currency: cur }]];
      case 'begin_checkout': return [['trackCheckoutStep', { step: 1 }]];
      case 'add_payment_info': return [['trackCheckoutStep', clean({ step: int(opts.step) || 2, payment_method: str(p.payment_type) })]];
      case 'purchase':
        var revenue = money(p.value);
        if (!orderId || revenue === undefined) return [];
        // The plugin counts only items with a quantity; GA4 items without one are one each.
        var qty = prods.reduce(function (s, pr) { return s + (pr.quantity === undefined ? 1 : pr.quantity); }, 0);
        return [['trackTransaction', clean({
          transaction_id: orderId, revenue: revenue, currency: cur, total_quantity: qty,
          payment_method: str(p.payment_type) || opts.paymentMethod || 'unknown',
          tax: money(p.tax), shipping: money(p.shipping), discount_code: str(p.coupon), products: prods,
        })]];
      case 'refund':
        // A full refund in GA4 can omit value; the refund entity requires an amount.
        var amount = money(p.value);
        if (!orderId || amount === undefined) return [];
        return [['trackRefund', clean({ transaction_id: orderId, currency: cur, refund_amount: amount, products: prods })]];
    }
    return [];
  }

  function externalEvent(name, p, kind) {
    var first = (p.items && p.items[0]) || {};
    return clean({
      name: String(name).slice(0, 255), tool: 'ga4', kind: kind || 'track',
      value: num(p.value), currency: currency(p.currency),
      item_id: str(first.item_id || p.item_id), item_category: str(first.item_category),
      search_term: str(p.search_term), plan: str(p.plan), group_id: str(p.group_id),
    });
  }

  function googleEvent(name, p) {
    var g = GOOGLE[name], data = {};
    g[1].forEach(function (k) { if (p[k] !== undefined) data[k] = p[k]; });
    return { schema: 'iglu:' + g[0], data: data };
  }

  // GA client ID and session from the _ga and _ga_<container> cookies (GS1 and GS2 formats).
  function readGaCookies(cookieString, measurementId) {
    var jar = {};
    String(cookieString || '').split(/;\s*/).forEach(function (c) { var i = c.indexOf('='); if (i > 0) jar[c.slice(0, i)] = c.slice(i + 1); });
    var out = {};
    if (jar._ga) { var parts = jar._ga.split('.'); if (parts.length >= 4) out.clientId = parts.slice(-2).join('.'); }
    var s = jar['_ga_' + String(measurementId || '').replace(/^G-/, '')];
    if (s) {
      var m = /^GS2\.\d+\.s(\d+)\$o(\d+)/.exec(s) || /^GS1\.\d+\.(\d+)\.(\d+)/.exec(s);
      if (m) { out.sessionId = m[1]; out.sessionNumber = Number(m[2]); }
    }
    return out;
  }

  // Sent even without a GA client ID, with anonymous_id null, so user_id and event_name still arrive.
  function identityEntity(ids, eventName) {
    ids = ids || {};
    return {
      schema: S.externalIdentity,
      data: clean({
        tool: 'ga4', anonymous_id: ids.clientId ? String(ids.clientId) : null, user_id: ids.userId ? String(ids.userId).slice(0, 255) : undefined,
        session_id: ids.sessionId ? String(ids.sessionId) : undefined, session_number: ids.sessionNumber,
        event_name: eventName || undefined,
      }),
    };
  }

  root.GA4Snowplow = { S: S, GOOGLE: GOOGLE, rung: rung, products: products, ecommerceCalls: ecommerceCalls, externalEvent: externalEvent, googleEvent: googleEvent, readGaCookies: readGaCookies, identityEntity: identityEntity, currency: currency };
})(window);
