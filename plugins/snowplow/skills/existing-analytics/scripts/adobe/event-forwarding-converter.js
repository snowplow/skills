// Adobe XDM event to Snowplow tracker protocol event.
// No dependencies, because event forwarding custom code has no require, Buffer or crypto.
// Your vendor: the one you created external_event and external_identity under.
var VENDOR = 'com.example';
var IGLU = 'iglu:com.snowplowanalytics.snowplow';
var ECOM = 'iglu:com.snowplowanalytics.snowplow.ecommerce';
var XDM2SP = {
  tv: 'adobe-ef-1',
  aid: 'my-site',
  schemas: {
    external: 'iglu:' + VENDOR + '/external_event/jsonschema/1-0-0',
    identity: 'iglu:' + VENDOR + '/external_identity/jsonschema/1-0-0',
    identify: IGLU + '/identify/jsonschema/1-0-0',
    search: IGLU + '/site_search/jsonschema/1-0-0',
    action: ECOM + '/snowplow_ecommerce_action/jsonschema/1-0-2',
    product: ECOM + '/product/jsonschema/1-0-0',
    transaction: ECOM + '/transaction/jsonschema/1-0-0',
    cart: ECOM + '/cart/jsonschema/1-0-0',
    refund: ECOM + '/refund/jsonschema/1-0-0',
    checkout: ECOM + '/checkout_step/jsonschema/1-0-0',
  },
  // XDM commerce eventTypes with a Snowplow ecommerce action. Adobe has no standard refund eventType;
  // commerce.refunds is mapped in case you send one.
  commerce: {
    'commerce.productViews': 'product_view', 'commerce.productListAdds': 'add_to_cart',
    'commerce.productListRemovals': 'remove_from_cart', 'commerce.checkouts': 'checkout_step',
    'commerce.purchases': 'transaction', 'commerce.refunds': 'refund',
  },
  // Your schema's paths, the same as FIELDS in the Web SDK mapping.
  slots: {
    plan: ['xdm._yourtenant.account.plan', 'xdm._yourtenant.user.plan'],
    group_id: ['xdm._yourtenant.account.id'],
    search_term: ['xdm._yourtenant.search.term', 'data.__adobe.analytics.prop3'],
  },
  searchQuery: ['xdm.siteSearch.query'],
  loginTypes: ['userAccount.login'],
  userNamespaces: ['CRMID'],
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
function userIdOut(id) {
  if (id === undefined || id === null || id === '') return undefined;
  return String(id).slice(0, 255);
}

// The authenticated ID from identityMap. The Email namespace is never read.
function crmId(xdm) {
  var map = (xdm && xdm.identityMap) || {};
  for (var i = 0; i < XDM2SP.userNamespaces.length; i++) {
    var ids = map[XDM2SP.userNamespaces[i]];
    if (ids && ids.length && ids[0].id) return ids[0].id;
  }
  return undefined;
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
    var p = { id: String(it.SKU).slice(0, 4096), category: (it.productCategories && it.productCategories[0] && it.productCategories[0].categoryID) || 'unknown', price: cents((num(it.priceTotal) || 0) / qty), currency: cur, quantity: qty };
    if (it.name) p.name = String(it.name);
    return p;
  });
}

function externalData(content, kind) {
  var xdm = content.xdm || {};
  var items = xdm.productListItems || [];
  var first = items[0] || {};
  var order = (xdm.commerce && xdm.commerce.order) || {};
  var cur = order.currencyCode || first.currencyCode;
  var out = {
    name: String(xdm.eventType || 'unknown').slice(0, 255), tool: 'adobe', kind: kind || 'track',
    value: num(order.priceTotal !== undefined ? order.priceTotal : first.priceTotal),
    currency: typeof cur === 'string' && /^[A-Za-z]{3}$/.test(cur) ? cur.toUpperCase() : undefined,
    item_id: str255(first.SKU),
    item_category: str255(first.productCategories && first.productCategories[0] && first.productCategories[0].categoryID),
  };
  for (var k in XDM2SP.slots) if (out[k] === undefined) out[k] = firstOf(content, XDM2SP.slots[k]);
  for (var key in out) if (out[key] === undefined) delete out[key];
  return out;
}

// One XDM event -> what Snowplow should record, by the ladder: page_view, ecommerce action,
// site_search, identify, then external_event for everything else.
function classify(content) {
  var xdm = content.xdm || {};
  var type = xdm.eventType;
  if (type === 'web.webpagedetails.pageViews') return { as: 'page_view', title: get(xdm, 'web.webPageDetails.name') };
  var action = XDM2SP.commerce[type];
  var products = toProducts(xdm);
  if (action && (products.length || action === 'refund')) {
    var order = (xdm.commerce && xdm.commerce.order) || {};
    var cur = currencyOf(xdm);
    var total = cents(order.priceTotal !== undefined ? order.priceTotal : products.reduce(function (a, p) { return a + p.price * p.quantity; }, 0));
    var r = { as: 'ecommerce', type: action, products: products };
    if (action === 'transaction') r.transaction = { transaction_id: String(order.purchaseID || 'unknown'), revenue: total, currency: cur, payment_method: (order.payments && order.payments[0] && order.payments[0].paymentType) || 'unknown', total_quantity: products.reduce(function (a, p) { return a + p.quantity; }, 0) };
    // XDM carries the items added or removed, not the cart total, so total_value is the sum of those items.
    if (action === 'add_to_cart' || action === 'remove_from_cart') r.cart = { total_value: total, currency: cur };
    if (action === 'refund') r.refund = { transaction_id: String(order.purchaseID || 'unknown'), refund_amount: total, currency: cur };
    if (action === 'checkout_step') r.checkout = { step: 1 };
    return r;
  }
  var q = firstOf(content, XDM2SP.searchQuery);
  if (q) return { as: 'site_search', terms: [q] };
  var uid = userIdOut(crmId(xdm));
  if (XDM2SP.loginTypes.indexOf(type) > -1 && uid) return { as: 'identify', id: uid };
  return { as: 'external', data: externalData(content, 'track') };
}

function identityEntity(ecid, uid, eventName, eventId) {
  return { schema: XDM2SP.schemas.identity, data: { tool: 'adobe', anonymous_id: ecid ? String(ecid) : null, user_id: uid || null, session_id: null, session_number: null, event_id: eventId ? String(eventId).slice(0, 255) : null, event_name: eventName ? String(eventName).slice(0, 255) : null } };
}

// The same entities the Snowplow ecommerce plugin attaches: one product per item, then the
// transaction, cart, refund or checkout_step entity.
function ecommerceEntities(c) {
  var out = c.products.map(function (p) { return { schema: XDM2SP.schemas.product, data: p }; });
  if (c.transaction) out.push({ schema: XDM2SP.schemas.transaction, data: c.transaction });
  if (c.cart) out.push({ schema: XDM2SP.schemas.cart, data: c.cart });
  if (c.refund) out.push({ schema: XDM2SP.schemas.refund, data: c.refund });
  if (c.checkout) out.push({ schema: XDM2SP.schemas.checkout, data: c.checkout });
  return out;
}

// content: { xdm, data }. ctx: { ecid, ip, ua, url, refr, lastUserId }.
function xdmToSp(content, ctx) {
  ctx = ctx || {};
  var xdm = content.xdm || {};
  var web = xdm.web || {};
  var page = web.webPageDetails || {};
  var uid = userIdOut(crmId(xdm) || ctx.lastUserId);
  var ts = Date.parse(xdm.timestamp);
  var out = {
    p: 'web', tv: XDM2SP.tv, aid: XDM2SP.aid,
    eid: xdm._id,
    dtm: isNaN(ts) ? undefined : String(ts),
    stm: String(Date.now()),
    duid: ctx.ecid, tnuid: ctx.ecid,
    uid: uid,
    ip: ctx.ip, ua: ctx.ua,
    url: page.URL || ctx.url,
    refr: (web.webReferrer && web.webReferrer.URL) || ctx.refr,
  };
  var vp = xdm.environment && xdm.environment.browserDetails;
  if (vp && vp.viewportWidth) out.vp = vp.viewportWidth + 'x' + vp.viewportHeight;
  var c = classify(content);
  var entities = [];
  var ue = null;
  if (c.as === 'page_view') { out.e = 'pv'; out.page = c.title; }
  else if (c.as === 'ecommerce') { ue = { schema: XDM2SP.schemas.action, data: { type: c.type } }; entities = ecommerceEntities(c); }
  else if (c.as === 'site_search') ue = { schema: XDM2SP.schemas.search, data: { terms: c.terms } };
  else if (c.as === 'identify') ue = { schema: XDM2SP.schemas.identify, data: { id: c.id } };
  else ue = { schema: XDM2SP.schemas.external, data: c.data };
  if (ue) { out.e = 'ue'; out.ue_pr = JSON.stringify({ schema: IGLU + '/unstruct_event/jsonschema/1-0-0', data: ue }); }
  entities.push(identityEntity(ctx.ecid, uid, xdm.eventType, xdm._id));
  if (entities.length) out.co = JSON.stringify({ schema: IGLU + '/contexts/jsonschema/1-0-1', data: entities });
  var clean = {};
  for (var key in out) if (out[key] !== undefined && out[key] !== null && out[key] !== '') clean[key] = String(out[key]);
  return clean;
}

function toPayload(events) { return { schema: IGLU + '/payload_data/jsonschema/1-0-4', data: events }; }
