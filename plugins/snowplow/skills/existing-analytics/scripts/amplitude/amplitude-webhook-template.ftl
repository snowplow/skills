<#-- Amplitude Webhook destination event payload (FreeMarker) -> Snowplow Collector tp2 payload.
     Paste the whole file as the Webhook destination event payload. Change "aid":"my-app" to your app ID,
     and keep the ECOM and SEARCH lists in step with the ones in amplitude-snowplow.js. -->
<#-- Your vendor: the one you created external_event and external_identity under. -->
<#assign VENDOR = "com.example">
<#setting time_zone="UTC">
<#setting datetime_format="yyyy-MM-dd HH:mm:ss.SSS">
<#setting number_format="computer">
<#assign p = input.event_properties!{}>
<#assign et = input.event_type>
<#-- Server SDKs and the HTTP API can send only user_id. Without device_id, anonymous_id is null and duid, tnuid and sid
     are left out, rather than copying the user ID into them. -->
<#assign did = (input.device_id!"")?string>
<#assign hasDid = did != "">
<#assign isPv = et == "[Amplitude] Page Viewed">
<#assign kind = "track">
<#if et == "$groupidentify"><#assign kind = "group"><#elseif et == "$identify"><#assign kind = (input.groups?? && input.groups?size > 0)?then("group", "identify")></#if>
<#assign name = (et == "revenue_amount")?then(p["$revenueType"]!et, et)>
<#assign lname = name?trim?lower_case>
<#function hex12 n><#local digits = "0123456789abcdef"><#local out = ""><#local v = n><#list 1..12 as i><#local out = digits[(v % 16)] + out><#local v = (v / 16)?floor></#list><#return out></#function>
<#function ms t><#local s = t?replace("T", " ")?replace("Z", "")><#local frac = s?contains(".")?then(s?keep_after_last("."), "")><#local base = s?contains(".")?then(s?keep_before_last("."), s)><#return base?datetime("yyyy-MM-dd HH:mm:ss")?long + ((frac + "000")?substring(0, 3))?number></#function>
<#function cur3 v><#if v?is_string && v?matches("[A-Za-z]{3}")><#return v?upper_case></#if><#return ""></#function>
<#function money v><#return ((v * 100)?round / 100)></#function>
<#function str v><#if v?is_number><#return v?c></#if><#if v?is_string><#return v></#if><#return ""></#function>
<#function num v><#if v?is_number><#return v></#if><#if v?is_string && v?trim?matches(r"-?[0-9]+(\.[0-9]+)?")><#return v?trim?number></#if><#return ""></#function>
<#assign E = "iglu:com.snowplowanalytics.snowplow.ecommerce/">
<#assign ECOM = {"product_view": ["product viewed", "view item", "view_item", "viewed product"], "add_to_cart": ["product added", "add to cart", "add_to_cart", "added to cart"], "remove_from_cart": ["product removed", "remove from cart", "remove_from_cart"], "checkout_step": ["checkout started", "begin checkout", "begin_checkout", "checkout step completed"], "transaction": ["order completed", "purchase", "purchase completed", "checkout completed"], "refund": ["order refunded", "refund", "refund completed"]}>
<#assign SEARCH = ["products searched", "search", "searched", "site search", "search submitted"]>
<#assign etype = "">
<#if kind == "track"><#list ECOM?keys as t><#if ECOM[t]?seq_contains(lname)><#assign etype = t></#if></#list>
<#if etype == "" && et == "revenue_amount"><#assign etype = (((p["$price"]!0) * (p["$quantity"]!1)) lt 0)?then("refund", "transaction")></#if></#if>
<#assign currency = cur3(p.currency!p["$currency"]!"")>
<#if p.products?? && p.products?is_sequence && p.products?size gt 0><#assign items = p.products>
<#else><#assign items = [{"product_id": (p.product_id!p["$productId"]!p.sku!""), "name": (p.name!""), "category": (p.category!""), "price": num(p.price!p["$price"]!""), "quantity": num(p.quantity!p["$quantity"]!""), "brand": (p.brand!""), "variant": (p.variant!"")}]></#if>
<#assign prods = []><#assign prodsOk = true><#assign lines = 0><#assign qty = 0>
<#list items as it>
<#assign pid = str(it.product_id!it.sku!it.id!it["$productId"]!"")><#assign pprice = num(it.price!"")>
<#assign pcur = cur3(it.currency!"")><#if pcur == ""><#assign pcur = currency></#if>
<#if pid == "" || !pprice?is_number || pprice lt 0 || pcur == ""><#assign prodsOk = false><#else>
<#assign pq = num(it.quantity!"")><#assign hasQ = pq?is_number>
<#assign prods = prods + [{"id": pid, "price": money(pprice), "currency": pcur, "q": hasQ?then(pq?round, -1), "name": str(it.name!""), "category": str(it.category!""), "brand": str(it.brand!""), "variant": str(it.variant!"")}]>
<#assign lines = lines + pprice * hasQ?then(pq, 1)><#assign qty = qty + hasQ?then(pq?round, 1)>
</#if>
</#list>
<#assign ents = "">
<#list prods as x><#assign ents>${ents},{"schema":"${E}product/jsonschema/1-0-0","data":{"id":"${x.id?json_string}"<#if x.name != "">,"name":"${x.name?json_string}"</#if>,"category":"${x.category?json_string}","price":${x.price?c},"currency":"${x.currency}"<#if x.q gte 0>,"quantity":${x.q?c}</#if><#if x.brand != "">,"brand":"${x.brand?json_string}"</#if><#if x.variant != "">,"variant":"${x.variant?json_string}"</#if>}}</#assign></#list>
<#if currency == "" && prods?size gt 0><#assign currency = prods[0].currency></#if>
<#assign orderId = str(p.order_id!p.transaction_id!p.orderId!"")>
<#assign ev = "">
<#if etype == "checkout_step">
<#assign step = p.step!1><#if !step?is_number || step lt 1><#assign step = 1></#if>
<#assign ents>,{"schema":"${E}checkout_step/jsonschema/1-0-0","data":{"step":${step?round?c}}}<#if prodsOk>${ents}</#if></#assign>
<#assign ev>{"schema":"${E}snowplow_ecommerce_action/jsonschema/1-0-2","data":{"type":"checkout_step"}}</#assign>
<#elseif etype == "refund">
<#assign amt = p.refund_amount!p.revenue!p["$revenue"]!(((p["$price"]!0) * (p["$quantity"]!1)))>
<#if orderId != "" && currency != "" && amt?is_number>
<#if !prodsOk><#assign ents = ""></#if>
<#assign amt = (amt lt 0)?then(-amt, amt)>
<#assign ents>${ents},{"schema":"${E}refund/jsonschema/1-0-0","data":{"transaction_id":"${orderId?json_string}","currency":"${currency}","refund_amount":${money(amt)?c}}}</#assign>
<#assign ev>{"schema":"${E}snowplow_ecommerce_action/jsonschema/1-0-2","data":{"type":"refund"}}</#assign>
</#if>
<#elseif etype != "" && prodsOk>
<#if etype == "transaction">
<#assign rev = num(p.revenue!p["$revenue"]!p.total!lines)><#if !rev?is_number || rev lt 0><#assign rev = lines></#if>
<#assign ents>${ents},{"schema":"${E}transaction/jsonschema/1-0-0","data":{"transaction_id":"${(orderId != "")?then(orderId, input["$insert_id"]!input.uuid)?json_string}","revenue":${money(rev)?c},"currency":"${currency}","total_quantity":${qty?c},"payment_method":"${str(p.payment_method!"unknown")?json_string}"}}</#assign>
<#elseif (etype == "add_to_cart" || etype == "remove_from_cart") && (p.cart_total!p.cart_value!"")?is_number>
<#assign ents>${ents},{"schema":"${E}cart/jsonschema/1-0-0","data":{"total_value":${money(p.cart_total!p.cart_value)?c},"currency":"${currency}"}}</#assign>
</#if>
<#assign ev>{"schema":"${E}snowplow_ecommerce_action/jsonschema/1-0-2","data":{"type":"${etype}"}}</#assign>
</#if>
<#if ev == ""><#assign ents = ""></#if>
<#assign term = str(p.query!p.search_term!p.term!p.keyword!"")>
<#if ev == "" && kind == "track" && SEARCH?seq_contains(lname) && term != "">
<#assign ev>{"schema":"iglu:com.snowplowanalytics.snowplow/site_search/jsonschema/1-0-0","data":{"terms":["${term?json_string}"]<#if (p.results_count!"")?is_number>,"totalResults":${p.results_count?round?c}</#if>}}</#assign>
</#if>
<#if ev == "" && kind == "identify" && input.user_id??>
<#assign ev>{"schema":"iglu:com.snowplowanalytics.snowplow/identify/jsonschema/1-0-0","data":{"id":"${input.user_id?json_string}"}}</#assign>
</#if>
<#if ev == "" && !isPv>
<#assign data>{"name":"${name?json_string}","tool":"amplitude","kind":"${kind}"<#rt>
<#if num(p.price!"")?is_number>,"value":${num(p.price)?c}<#elseif (p["$price"]!"")?is_number>,"value":${(p["$price"] * (p["$quantity"]!1))?c}</#if><#rt>
<#if (p.currency!p["$currency"]!"")?matches("[A-Za-z]{3}")>,"currency":"${(p.currency!p["$currency"])?upper_case}"</#if><#rt>
<#if (p.product_id!p["$productId"])??>,"item_id":"${(p.product_id!p["$productId"])?json_string}"</#if><#rt>
<#if p.category??>,"item_category":"${p.category?json_string}"</#if><#rt>
<#if p.query??>,"search_term":"${p.query?json_string}"</#if><#rt>
<#if p.plan??>,"plan":"${p.plan?json_string}"<#elseif kind == "group" && (input.group_properties.plan)??>,"plan":"${input.group_properties.plan?json_string}"</#if><#rt>
<#if kind == "group" && input.groups?? && input.groups?size gt 0>,"group_id":"${input.groups?values[0]?json_string}"</#if>}</#assign>
<#assign ev>{"schema":"iglu:${VENDOR}/external_event/jsonschema/1-0-0","data":${data}}</#assign>
</#if>
<#assign ue>{"schema":"iglu:com.snowplowanalytics.snowplow/unstruct_event/jsonschema/1-0-0","data":${ev}}</#assign>
<#assign co>{"schema":"iglu:com.snowplowanalytics.snowplow/contexts/jsonschema/1-0-1","data":[{"schema":"iglu:${VENDOR}/external_identity/jsonschema/1-0-0","data":{"tool":"amplitude","anonymous_id":<#if hasDid>"${did?json_string}"<#else>null</#if>,"event_id":"${(input["$insert_id"]!input.uuid)?json_string}","user_id":<#if input.user_id??>"${input.user_id?json_string}"<#else>null</#if>,"session_id":<#if input.session_id?? && input.session_id gte 0>"${input.session_id?c}"<#else>null</#if>,"event_name":"${et?json_string}"}}${ents}]}</#assign>
{"schema":"iglu:com.snowplowanalytics.snowplow/payload_data/jsonschema/1-0-4","data":[{
"e":"<#if isPv>pv<#else>ue</#if>","p":"web","tv":"amplitude-webhook-0.2","aid":"my-app",
"eid":"${input.uuid}",
"dtm":"${ms(input.client_event_time!input.event_time)?c}","ttm":"${ms(input.client_event_time!input.event_time)?c}","stm":"${ms(input.client_upload_time!input.event_time)?c}",
<#if hasDid>"duid":"${did?json_string}","tnuid":"${did?json_string}",</#if>
<#if input.session_id?? && input.session_id gt 0 && did?lower_case?matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")>"sid":"${did?lower_case[0..23]}${hex12(input.session_id)}",</#if>
<#if input.user_id??>"uid":"${input.user_id?json_string}",</#if>
<#if input.ip_address??>"ip":"${input.ip_address}",</#if>
<#if p["[Amplitude] Page Location"]??>"url":"${p["[Amplitude] Page Location"]?json_string}",</#if>
<#if (p["[Amplitude] Previous Page Location"]!"") != "">"refr":"${p["[Amplitude] Previous Page Location"]?json_string}",</#if>
<#if isPv>"page":"${(p["[Amplitude] Page Title"]!"")?json_string}",<#else>"ue_pr":"${ue?json_string}",</#if>
"co":"${co?json_string}"
}]}
