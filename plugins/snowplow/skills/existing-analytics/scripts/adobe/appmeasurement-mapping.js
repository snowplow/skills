(function () {
  var cfg = window.snowplowAdobe, sp = cfg.sp;
  // Your report suite's variables, as they appear in the request URL. This is the part you configure.
  var MAP = { userId: 'v1', plan: ['v2', 'v6'], groupId: 'v5', search: 'c3', searchEvent: 'event4' };
  var COMMERCE = { purchase: 'transaction', prodView: 'product_view', scAdd: 'add_to_cart', scRemove: 'remove_from_cart', scCheckout: 'checkout_step' };
  function first(q, keys) { keys = [].concat(keys); for (var i = 0; i < keys.length; i++) if (q.get(keys[i])) return q.get(keys[i]); }
  function cents(n) { return Math.round(n * 100) / 100; }
  function products(s, cur) {
    return (s || '').split(',').filter(Boolean).map(function (p) {
      var f = p.split(';');
      var qty = Math.max(1, Math.round(Number(f[2]) || 1)), total = Number(f[3]) || 0;
      return { id: f[1], category: f[0] || 'unknown', quantity: qty, price: cents(total / qty), currency: cur };
    }).filter(function (p) { return p.id; });
  }
  cfg.mirrorAm = function (url) {
    var q = new URL(url).searchParams;
    var events = (q.get('events') || '').split(',').map(function (e) { return e.split('=')[0].split(':')[0]; });
    var pe = q.get('pe');
    var name = pe === 'lnk_e' ? 'exit_link' : pe === 'lnk_d' ? 'download_link' : pe ? (q.get('pev2') || 'custom_link') : 'page_view';
    var uid = q.get(MAP.userId);
    var cur = (q.get('cc') || 'USD').toUpperCase();
    var prods = products(q.get('products'), cur);
    var action = null;
    for (var k in COMMERCE) if (events.indexOf(k) > -1) { action = COMMERCE[k]; break; }
    if (action && prods.length) {
      var total = cents(prods.reduce(function (a, p) { return a + p.price * p.quantity; }, 0));
      var c = { type: action, products: prods };
      // Analytics hits carry no payment method or cart total.
      if (action === 'transaction') c.transaction = { transaction_id: String(q.get('purchaseID') || q.get('xact') || 'unknown'), revenue: total, currency: cur, payment_method: 'unknown' };
      if (action === 'add_to_cart' || action === 'remove_from_cart') c.cart = { total_value: total, currency: cur };
      if (action === 'checkout_step') c.checkout = { step: 1 };
      if (uid) sp.setUser(uid);
      return sp.ecommerce(name, c);
    }
    if (!pe) { if (uid) sp.setUser(uid); return sp.pageView(q.get('pageName'), name); }
    if (events.indexOf(MAP.searchEvent) > -1 && q.get(MAP.search)) return sp.search(name, [q.get(MAP.search)]);
    if (uid) return sp.identify(name, uid);
    return sp.external(name, 'track', { plan: first(q, MAP.plan), group_id: q.get(MAP.groupId) || undefined, search_term: q.get(MAP.search) || undefined });
  };
})();
