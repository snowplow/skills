(function () {
  var cfg = (window.snowplowAdobe = window.snowplowAdobe || {});
  cfg.collector = cfg.collector || 'https://collector.example.com';
  // Your vendor: the one you created external_event and external_identity under.
  var VENDOR = 'com.example';
  var IDENTITY = 'iglu:' + VENDOR + '/external_identity/jsonschema/1-0-0';
  var EXTERNAL = 'iglu:' + VENDOR + '/external_event/jsonschema/1-0-0';
  var PRODUCT = 'iglu:com.snowplowanalytics.snowplow.ecommerce/product/jsonschema/1-0-0';

  (function (p, l, o, w, i, n, g) {
    if (!p[i]) {
      p.GlobalSnowplowNamespace = p.GlobalSnowplowNamespace || [];
      p.GlobalSnowplowNamespace.push(i);
      p[i] = function () { (p[i].q = p[i].q || []).push(arguments); };
      p[i].q = p[i].q || [];
      n = l.createElement(o); g = l.getElementsByTagName(o)[0];
      n.async = 1; n.src = w; g.parentNode.insertBefore(n, g);
    }
  })(window, document, 'script', '/js/sp.js', 'snowplow');
  snowplow('newTracker', 'sp1', cfg.collector, {
    appId: 'my-site', platform: 'web', eventMethod: 'post',
    contexts: { webPage: true, session: true },
  });
  snowplow('addPlugin:sp1', '/js/snowplow-ecommerce.js', ['snowplowEcommerceAccelerator', 'SnowplowEcommercePlugin']);

  // The ECID, as an external_identity entity. Adobe sends no session ID, so those fields stay null.
  function identity(eventName, uid) {
    var id = cfg.vendorId && cfg.vendorId();
    return [{ schema: IDENTITY, data: { tool: 'adobe', anonymous_id: id ? String(id) : null, user_id: uid || null,
      session_id: null, session_number: null, event_name: eventName ? String(eventName).slice(0, 255) : null } }];
  }
  // On a first visit the ECID exists only after Adobe's first response, so events wait for it
  // (up to 5 seconds) rather than go out without it in the external_identity entity.
  // A held event keeps the user ID it was sent with, not the one current at the flush.
  var held = [], timer = null;
  function emit(eventName, send) {
    var uid = cfg.userId;
    if (held.length || (cfg.vendorId && !cfg.vendorId())) {
      held.push(function () { snowplow('setUserId', uid || null); send(identity(eventName, uid)); });
      if (!timer) timer = setTimeout(flush, 5000);
      return;
    }
    send(identity(eventName, uid));
  }
  function flush() {
    clearTimeout(timer); timer = null;
    var h = held; held = [];
    h.forEach(function (f) { f(); });
    if (h.length) snowplow('setUserId', cfg.userId || null);
  }
  cfg.idReady = flush;
  function productEntities(list) { return list.map(function (p) { return { schema: PRODUCT, data: p }; }); }

  var lastUrl = location.href;
  cfg.sp = {
    pageView: function (title, name) {
      var url = location.href;
      title = title || document.title;
      emit(name || 'page_view', function (ctx) {
        if (url !== lastUrl) { snowplow('setReferrerUrl', lastUrl); lastUrl = url; }
        snowplow('trackPageView', { title: title, context: ctx });
      });
    },
    // c: { type, products, transaction | cart | refund | checkout }.
    // A product view sends only the first item: the tracker puts extra entities before the
    // viewed product's, so Signals would read another item as the product viewed.
    ecommerce: function (name, c) {
      emit(name, function (ctx) {
        var ps = c.products;
        if (c.type === 'product_view') snowplow('trackProductView', Object.assign({}, ps[0], { context: ctx }));
        else if (c.type === 'add_to_cart') snowplow('trackAddToCart', Object.assign({}, c.cart, { products: ps, context: ctx }));
        else if (c.type === 'remove_from_cart') snowplow('trackRemoveFromCart', Object.assign({}, c.cart, { products: ps, context: ctx }));
        else if (c.type === 'transaction') snowplow('trackTransaction', Object.assign({}, c.transaction, { products: ps, context: ctx }));
        else if (c.type === 'refund') snowplow('trackRefund', Object.assign({}, c.refund, { products: ps, context: ctx }));
        else if (c.type === 'checkout_step') snowplow('trackCheckoutStep', Object.assign({}, c.checkout, { context: productEntities(ps).concat(ctx) }));
      });
    },
    search: function (name, terms) {
      emit(name, function (ctx) {
        snowplow('trackSelfDescribingEvent', { event: { schema: 'iglu:com.snowplowanalytics.snowplow/site_search/jsonschema/1-0-0', data: { terms: terms } }, context: ctx });
      });
    },
    setUser: function (id) {
      if (!id) return;
      cfg.userId = String(id);
      snowplow('setUserId', cfg.userId);
    },
    // identify also has an email field; it is never filled.
    identify: function (name, id) {
      this.setUser(id);
      if (!cfg.userId) return this.external(name, 'identify', {});
      var uid = cfg.userId;
      emit(name, function (ctx) {
        snowplow('trackSelfDescribingEvent', { event: { schema: 'iglu:com.snowplowanalytics.snowplow/identify/jsonschema/1-0-0', data: { id: uid } }, context: ctx });
      });
    },
    external: function (name, kind, slots) {
      var data = { name: String(name).slice(0, 255), tool: 'adobe', kind: kind || 'track' };
      for (var k in slots) if (slots[k] !== undefined && slots[k] !== null && slots[k] !== '') data[k] = slots[k];
      emit(name, function (ctx) { snowplow('trackSelfDescribingEvent', { event: { schema: EXTERNAL, data: data }, context: ctx }); });
    },
  };
})();
