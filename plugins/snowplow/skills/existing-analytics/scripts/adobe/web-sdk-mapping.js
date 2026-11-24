(function () {
  var cfg = window.snowplowAdobe, sp = cfg.sp;
  // Your schema's paths. These three are the only part you configure.
  var FIELDS = {
    plan: ['xdm._yourtenant.account.plan', 'xdm._yourtenant.user.plan'],
    group_id: ['xdm._yourtenant.account.id'],
    search_term: ['xdm._yourtenant.search.term', 'data.__adobe.analytics.prop3'],
  };
  var SEARCH_QUERY = ['xdm.siteSearch.query'];
  var LOGIN_TYPES = ['userAccount.login'];
  var USER_NAMESPACES = ['CRMID'];
  var COMMERCE = {
    'commerce.productViews': 'product_view', 'commerce.productListAdds': 'add_to_cart',
    'commerce.productListRemovals': 'remove_from_cart', 'commerce.checkouts': 'checkout_step',
    'commerce.purchases': 'transaction', 'commerce.refunds': 'refund',
  };

  function get(o, path) {
    var parts = path.split('.');
    for (var i = 0; i < parts.length; i++) { if (o === undefined || o === null) return undefined; o = o[parts[i]]; }
    return o;
  }
  function str255(v) { return v === undefined || v === null || typeof v === 'object' ? undefined : String(v).slice(0, 255); }
  function num(v) { var n = typeof v === 'string' ? Number(v) : v; return typeof n === 'number' && isFinite(n) ? n : undefined; }
  function cents(v) { return Math.round((num(v) || 0) * 100) / 100; }
  function firstOf(content, paths) { for (var i = 0; i < paths.length; i++) { var v = str255(get(content, paths[i])); if (v !== undefined && v !== '') return v; } }

  // The authenticated ID from identityMap. The Email namespace is never read.
  function crmId(xdm) {
    var map = (xdm && xdm.identityMap) || {};
    for (var i = 0; i < USER_NAMESPACES.length; i++) {
      var ids = map[USER_NAMESPACES[i]];
      if (ids && ids.length && ids[0].id) return ids[0].id;
    }
  }
  function currencyOf(xdm) {
    var items = xdm.productListItems || [];
    var c = (xdm.commerce && xdm.commerce.order && xdm.commerce.order.currencyCode) || (items[0] && items[0].currencyCode);
    return typeof c === 'string' && /^[A-Za-z]{3}$/.test(c) ? c.toUpperCase() : 'USD';
  }
  // One product entity per productListItems entry.
  function toProducts(xdm) {
    var cur = currencyOf(xdm);
    return (xdm.productListItems || []).filter(function (it) { return it && it.SKU !== undefined; }).map(function (it) {
      var qty = Math.max(1, Math.round(num(it.quantity) || 1));
      var p = { id: String(it.SKU), category: (it.productCategories && it.productCategories[0] && it.productCategories[0].categoryID) || 'unknown',
        price: cents((num(it.priceTotal) || 0) / qty), currency: cur, quantity: qty };
      if (it.name) p.name = String(it.name);
      return p;
    });
  }
  function externalData(content) {
    var xdm = content.xdm || {};
    var first = (xdm.productListItems || [])[0] || {};
    var order = (xdm.commerce && xdm.commerce.order) || {};
    var cur = order.currencyCode || first.currencyCode;
    var out = {
      value: num(order.priceTotal !== undefined ? order.priceTotal : first.priceTotal),
      currency: typeof cur === 'string' && /^[A-Za-z]{3}$/.test(cur) ? cur.toUpperCase() : undefined,
      item_id: str255(first.SKU),
      item_category: str255(first.productCategories && first.productCategories[0] && first.productCategories[0].categoryID),
    };
    for (var k in FIELDS) if (out[k] === undefined) out[k] = firstOf(content, FIELDS[k]);
    return out;
  }

  cfg.mirrorXdm = function (content) {
    var xdm = content.xdm || {};
    var type = xdm.eventType;
    var crm = crmId(xdm);
    if (crm) sp.setUser(crm);
    if (type === 'web.webpagedetails.pageViews') return sp.pageView(get(xdm, 'web.webPageDetails.name'), type);
    var action = COMMERCE[type];
    var products = toProducts(xdm);
    if (action && (products.length || action === 'refund')) {
      var order = (xdm.commerce && xdm.commerce.order) || {};
      var cur = currencyOf(xdm);
      var total = cents(order.priceTotal !== undefined ? order.priceTotal : products.reduce(function (a, p) { return a + p.price * p.quantity; }, 0));
      var c = { type: action, products: products };
      if (action === 'transaction') c.transaction = { transaction_id: String(order.purchaseID || 'unknown'), revenue: total, currency: cur,
        payment_method: (order.payments && order.payments[0] && order.payments[0].paymentType) || 'unknown',
        total_quantity: products.reduce(function (a, p) { return a + p.quantity; }, 0) };
      // XDM carries the items added or removed, not the cart total.
      if (action === 'add_to_cart' || action === 'remove_from_cart') c.cart = { total_value: total, currency: cur };
      if (action === 'refund') c.refund = { transaction_id: String(order.purchaseID || 'unknown'), refund_amount: total, currency: cur };
      if (action === 'checkout_step') c.checkout = { step: 1 };
      return sp.ecommerce(type, c);
    }
    var q = firstOf(content, SEARCH_QUERY);
    if (q) return sp.search(type, [q]);
    if (LOGIN_TYPES.indexOf(type) > -1 && crm) return sp.identify(type, crm);
    return sp.external(type, 'track', externalData(content));
  };
})();
