// Cloudflare Worker entry point
// Connects static assets with edge API functions

import ordersCatalog from "./public/orders-catalog.json";

const DEFAULT_CONFIG = {
  networks: [
    "O2",
    "EE",
    "THREE"
  ],
  networkTopUpValues: {
    "O2": ["£10", "£15", "£20", "£30"],
    "EE": ["£10", "£15", "£20", "£30", "£35"],
    "THREE": ["£10", "£15", "£20", "£35"]
  },
  topUpValues: ["£10", "£15", "£20", "£30", "£35"],
  notificationEmail: "vendor-orders@example.com"
};

const INVALID_ICCID_MESSAGE = "Invalid ICCID. This SIM card is not registered in our database and does not belong to us.";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-key",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  });
}

function checkAuth(request, env) {
  const adminPassword = env.ADMIN_PASSWORD || "admin123";
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const apiKey = request.headers.get("x-admin-key") || "";
  return token === adminPassword || apiKey === adminPassword;
}

async function handleApiRequest(request, env, url) {
  const path = url.pathname;
  const adminPassword = env.ADMIN_PASSWORD || "admin123";

  // 1. GET /api/config
  if (request.method === "GET" && path === "/api/config") {
    return jsonResponse({ ok: true, config: DEFAULT_CONFIG });
  }

  // 2. GET /api/validate-iccid
  if (request.method === "GET" && path === "/api/validate-iccid") {
    const rawIccid = url.searchParams.get("iccid") || "";
    const iccid = rawIccid.replace(/\D/g, "");

    if (!/^\d{18,22}$/.test(iccid)) {
      return jsonResponse({ ok: false, code: "INVALID_ICCID_FORMAT", message: INVALID_ICCID_MESSAGE }, 400);
    }

    if (env.DB) {
      const res = await env.DB.prepare("SELECT * FROM sims WHERE iccid = ?").bind(iccid).first();
      if (!res) {
        return jsonResponse({ ok: false, code: "ICCID_NOT_FOUND", message: INVALID_ICCID_MESSAGE }, 404);
      }
      return jsonResponse({
        ok: true,
        found: true,
        iccid: res.iccid,
        status: res.status || "available",
        network: res.network || "",
        lastTopUpValue: res.last_top_up_value || "",
        message: "ICCID Verified"
      });
    }

    return jsonResponse({
      ok: true,
      found: true,
      iccid,
      status: "available",
      message: "ICCID Verified"
    });
  }

  // 2b. GET /api/validate-order
  if (request.method === "GET" && path === "/api/validate-order") {
    const rawOrderId = url.searchParams.get("orderId") || "";
    const orderId = rawOrderId.trim().toUpperCase();

    if (!/^\d{3}-\d{7}-\d{7}$/.test(orderId)) {
      return jsonResponse({
        ok: false,
        code: "INVALID_ORDER_ID_FORMAT",
        message: "Enter a valid Order ID in the format 123-1234567-1234567."
      }, 400);
    }

    let checkReq = null;
    let order = null;

    if (env.DB) {
      checkReq = await env.DB.prepare("SELECT id FROM topup_requests WHERE amazon_order_id = ?").bind(orderId).first().catch(() => null);
      order = await env.DB.prepare("SELECT * FROM amazon_orders WHERE order_id = ?").bind(orderId).first().catch(() => null);
    }

    if (!order && ordersCatalog && ordersCatalog[orderId]) {
      const cat = ordersCatalog[orderId];
      order = {
        order_id: orderId,
        network: cat.network,
        top_up_value: cat.topUpValue,
        status: cat.status || "unclaimed"
      };
    }

    if (checkReq || (order && order.status === "claimed")) {
      return jsonResponse({
        ok: true,
        found: true,
        claimed: true,
        orderId,
        network: order ? (order.network || order.networkName) : null,
        topUpValue: order ? (order.top_up_value || order.topUpValue) : null,
        message: "This Order ID has already been redeemed for a SIM top-up."
      });
    }

    if (order && order.status === "cancelled") {
      return jsonResponse({
        ok: false,
        found: true,
        cancelled: true,
        orderId,
        message: "This Order was returned or cancelled and is not eligible for a top-up."
      });
    }

    if (!order) {
      return jsonResponse({ ok: true, found: false, orderId, message: "Order format valid." });
    }

    return jsonResponse({
      ok: true,
      found: true,
      claimed: false,
      orderId: order.order_id || order.orderId,
      network: order.network,
      topUpValue: order.top_up_value || order.topUpValue,
      itemTitle: order.item_title || order.itemTitle || "",
      sku: order.sku || "",
      itemPrice: order.item_price || order.itemPrice || "",
      message: `Verified Purchase: ${order.network} ${order.top_up_value || order.topUpValue}`
    });
  }

  // 3. POST /api/topup-request
  if (request.method === "POST" && (path === "/api/topup-request" || path === "/api/activate")) {
    const payload = await request.json().catch(() => ({}));
    const orderId = String(payload.orderId || "").trim().toUpperCase();
    const iccid = String(payload.iccid || "").replace(/\D/g, "");
    const networkName = String(payload.networkName || payload.network || "").trim();
    const topUpValue = String(payload.topUpValue || payload.plan || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();

    const missing = [];
    if (!orderId) missing.push("Order ID");
    if (!iccid) missing.push("SIM card ICCID");
    if (!networkName) missing.push("Network Name");
    if (!topUpValue) missing.push("Top-Up Value");

    if (missing.length > 0) {
      return jsonResponse({
        ok: false,
        code: "MISSING_MANDATORY_FIELDS",
        message: `Please complete all mandatory fields: ${missing.join(", ")}.`
      }, 400);
    }

    if (!/^\d{3}-\d{7}-\d{7}$/.test(orderId)) {
      return jsonResponse({
        ok: false,
        code: "INVALID_ORDER_ID",
        message: "Enter a valid Order ID in the format 123-1234567-1234567."
      }, 400);
    }

    if (!/^\d{18,22}$/.test(iccid)) {
      return jsonResponse({ ok: false, code: "INVALID_ICCID_FORMAT", message: INVALID_ICCID_MESSAGE }, 400);
    }

    if (env.DB) {
      const sim = await env.DB.prepare("SELECT * FROM sims WHERE iccid = ?").bind(iccid).first();
      if (!sim) {
        return jsonResponse({ ok: false, code: "ICCID_NOT_FOUND", message: INVALID_ICCID_MESSAGE }, 404);
      }

      const dupCheck = await env.DB.prepare("SELECT id FROM topup_requests WHERE amazon_order_id = ?").bind(orderId).first();
      if (dupCheck) {
        return jsonResponse({
          ok: false,
          code: "DUPLICATE_ORDER_SUBMISSION",
          message: "Duplicate submission. This Order ID has already been submitted for a top-up request."
        }, 409);
      }

      // Check registered order verification
      let regOrder = await env.DB.prepare("SELECT * FROM amazon_orders WHERE order_id = ?").bind(orderId).first().catch(() => null);
      if (!regOrder && ordersCatalog && ordersCatalog[orderId]) {
        const cat = ordersCatalog[orderId];
        regOrder = {
          order_id: orderId,
          network: cat.network,
          top_up_value: cat.topUpValue,
          status: cat.status || "unclaimed"
        };
      }
      if (regOrder) {
        if (regOrder.status === "cancelled") {
          return jsonResponse({
            ok: false,
            code: "ORDER_CANCELLED",
            message: "This Order was returned or cancelled and cannot be redeemed."
          }, 400);
        }
        if (regOrder.status === "claimed") {
          return jsonResponse({
            ok: false,
            code: "ORDER_ALREADY_CLAIMED",
            message: `This Order ID has already been redeemed${regOrder.claimed_iccid ? ` for SIM ${regOrder.claimed_iccid}` : ""}.`
          }, 409);
        }
        if (regOrder.network && regOrder.network.toUpperCase() !== networkName.toUpperCase()) {
          return jsonResponse({
            ok: false,
            code: "ORDER_NETWORK_MISMATCH",
            message: `Validation Error: Order ${orderId} was purchased for ${regOrder.network}, but you selected ${networkName}. Please select ${regOrder.network}.`
          }, 400);
        }
        if (regOrder.top_up_value && regOrder.top_up_value !== topUpValue) {
          return jsonResponse({
            ok: false,
            code: "ORDER_VALUE_MISMATCH",
            message: `Validation Error: Order ${orderId} was purchased for ${regOrder.top_up_value}, but you selected ${topUpValue}. Please select ${regOrder.top_up_value}.`
          }, 400);
        }
      }

      const requestId = `REQ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const now = new Date().toISOString();

      const batchStatements = [
        env.DB.prepare(
          "INSERT INTO topup_requests (id, amazon_order_id, sim_iccid, network_name, top_up_value, iccid_verified, customer_email, submitted_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)"
        ).bind(requestId, orderId, iccid, networkName, topUpValue, email, now),
        env.DB.prepare(
          "UPDATE sims SET status = 'activated', order_id = ?, network = ?, last_top_up_value = ?, customer_email = ?, last_activity_at = ? WHERE iccid = ?"
        ).bind(orderId, networkName, topUpValue, email, now, iccid)
      ];

      if (regOrder) {
        batchStatements.push(
          env.DB.prepare("UPDATE amazon_orders SET status = 'claimed', claimed_iccid = ?, claimed_at = ? WHERE order_id = ?").bind(iccid, now, orderId)
        );
      }

      await env.DB.batch(batchStatements);
    }

    const notification = {
      id: `REQ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      title: "New SIM Top-Up Request",
      amazonOrderId: orderId,
      simIccid: iccid,
      networkName,
      topUpValue,
      iccidVerified: true,
      customerEmail: email || null,
      submittedAt: new Date().toISOString()
    };

    if (env.RESEND_API_KEY) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: env.FROM_EMAIL || "SIM Top-Up <onboarding@resend.dev>",
            to: env.NOTIFICATION_EMAIL || "vendor-orders@example.com",
            subject: `New SIM Top-Up Request - ${orderId} (${networkName} ${topUpValue})`,
            text: `New SIM Top-Up Request Received!\n\nAmazon Order ID: ${orderId}\nSIM ICCID: ${iccid}\nNetwork: ${networkName}\nTop-Up Value: ${topUpValue}\nICCID Verified: Yes\nSubmitted At: ${notification.submittedAt}`
          })
        });
      } catch (err) {
        console.error("Cloudflare edge email error:", err);
      }
    }

    return jsonResponse({
      ok: true,
      message: "Top-up request submitted successfully.",
      notification
    });
  }

  // 4. POST /api/admin/auth
  if (request.method === "POST" && path === "/api/admin/auth") {
    const payload = await request.json().catch(() => ({}));
    if (String(payload.password || "").trim() === adminPassword) {
      return jsonResponse({ ok: true, token: adminPassword, message: "Authenticated" });
    }
    return jsonResponse({ ok: false, message: "Invalid Admin Password." }, 401);
  }

  // 5. POST /api/admin/iccid-bulk
  if (request.method === "POST" && path === "/api/admin/iccid-bulk") {
    if (!checkAuth(request, env)) {
      return jsonResponse({ ok: false, message: "Unauthorized. Admin password required." }, 401);
    }
    const payload = await request.json().catch(() => ({}));
    const rawIccids = Array.isArray(payload.iccids) ? payload.iccids : [];
    const incoming = [...new Set(rawIccids.map((s) => String(s || "").replace(/\D/g, "")).filter((s) => /^\d{18,22}$/.test(s)))];

    if (incoming.length === 0) {
      return jsonResponse({ ok: false, message: "Add at least one valid 18-22 digit ICCID." }, 400);
    }

    if (env.DB) {
      let added = 0;
      let skipped = 0;
      for (const iccid of incoming) {
        const check = await env.DB.prepare("SELECT iccid FROM sims WHERE iccid = ?").bind(iccid).first();
        if (check) {
          skipped++;
        } else {
          await env.DB.prepare(
            "INSERT INTO sims (iccid, ecommerce, batch_id, network, status, created_at) VALUES (?, ?, ?, ?, 'available', ?)"
          ).bind(iccid, payload.ecommerce || "Amazon", payload.batchId || "BATCH", payload.network || null, new Date().toISOString()).run();
          added++;
        }
      }
      return jsonResponse({ ok: true, added, skipped, total: added, batchId: payload.batchId });
    }

    return jsonResponse({ ok: true, added: incoming.length, skipped: 0, total: incoming.length, batchId: payload.batchId || "BATCH" });
  }

  // 6. GET /api/admin/summary
  if (request.method === "GET" && path === "/api/admin/summary") {
    if (!checkAuth(request, env)) {
      return jsonResponse({ ok: false, message: "Unauthorized. Admin password required." }, 401);
    }
    if (env.DB) {
      const total = (await env.DB.prepare("SELECT COUNT(*) AS c FROM sims").first())?.c || 0;
      const avail = (await env.DB.prepare("SELECT COUNT(*) AS c FROM sims WHERE status = 'available'").first())?.c || 0;
      const active = (await env.DB.prepare("SELECT COUNT(*) AS c FROM sims WHERE status = 'activated'").first())?.c || 0;
      const reqs = (await env.DB.prepare("SELECT COUNT(*) AS c FROM topup_requests").first())?.c || 0;
      return jsonResponse({ ok: true, summary: { total, available: avail, activated: active, requestsCount: reqs } });
    }
    return jsonResponse({ ok: true, summary: { total: 0, available: 0, activated: 0, requestsCount: 0 } });
  }

  // 7. GET /api/admin/requests
  if (request.method === "GET" && path === "/api/admin/requests") {
    if (!checkAuth(request, env)) {
      return jsonResponse({ ok: false, message: "Unauthorized. Admin password required." }, 401);
    }
    if (env.DB) {
      const { results } = await env.DB.prepare(
        "SELECT id, amazon_order_id AS amazonOrderId, sim_iccid AS simIccid, network_name AS networkName, top_up_value AS topUpValue, customer_email AS customerEmail, submitted_at AS submittedAt FROM topup_requests ORDER BY submitted_at DESC LIMIT 100"
      ).all();
      return jsonResponse({ ok: true, requests: results || [] });
    }
    return jsonResponse({ ok: true, requests: [] });
  }

  // 8. GET /api/admin/iccids
  if (request.method === "GET" && path === "/api/admin/iccids") {
    if (!checkAuth(request, env)) {
      return jsonResponse({ ok: false, message: "Unauthorized. Admin password required." }, 401);
    }
    if (env.DB) {
      const { results } = await env.DB.prepare("SELECT * FROM sims ORDER BY created_at DESC LIMIT 200").all();
      return jsonResponse({ ok: true, sims: results || [] });
    }
    return jsonResponse({ ok: true, sims: [] });
  }

  // 9. GET /api/admin/export-requests-csv
  if (request.method === "GET" && path === "/api/admin/export-requests-csv") {
    const key = url.searchParams.get("key") || "";
    if (key !== adminPassword && !checkAuth(request, env)) {
      return jsonResponse({ ok: false, message: "Unauthorized. Admin password required." }, 401);
    }
    let csv = "Request ID,Order ID,SIM ICCID,Network Name,Top-Up Value,ICCID Verified,Customer Email,Submitted At\r\n";
    if (env.DB) {
      const { results } = await env.DB.prepare("SELECT * FROM topup_requests ORDER BY submitted_at DESC").all();
      for (const r of results || []) {
        csv += `"${r.id}","${r.amazon_order_id}","${r.sim_iccid}","${r.network_name}","${r.top_up_value}","Yes","${r.customer_email || "-"}","${r.submitted_at}"\r\n`;
      }
    }
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="sim-topup-requests.csv"'
      }
    });
  }

  // 10. POST /api/admin/orders-bulk
  if (request.method === "POST" && path === "/api/admin/orders-bulk") {
    if (!checkAuth(request, env)) {
      return jsonResponse({ ok: false, message: "Unauthorized. Admin password required." }, 401);
    }
    const payload = await request.json().catch(() => ({}));
    const rawOrders = Array.isArray(payload.orders) ? payload.orders : [];
    if (rawOrders.length === 0) {
      return jsonResponse({ ok: false, message: "No orders provided." }, 400);
    }

    if (env.DB) {
      let added = 0;
      let updated = 0;
      for (const ord of rawOrders) {
        const orderId = String(ord.orderId || "").trim().toUpperCase();
        if (!/^\d{3}-\d{7}-\d{7}$/.test(orderId)) continue;
        const net = String(ord.network || "").trim().toUpperCase();
        const topUp = String(ord.topUpValue || "").trim();
        const statusVal = String(ord.status || "unclaimed").trim();
        const check = await env.DB.prepare("SELECT order_id FROM amazon_orders WHERE order_id = ?").bind(orderId).first();
        if (check) {
          await env.DB.prepare(
            "UPDATE amazon_orders SET network = ?, top_up_value = ?, item_title = COALESCE(?, item_title), sku = COALESCE(?, sku), status = ? WHERE order_id = ?"
          ).bind(net, topUp, ord.itemTitle || null, ord.sku || null, statusVal, orderId).run();
          updated++;
        } else {
          await env.DB.prepare(
            "INSERT INTO amazon_orders (order_id, network, top_up_value, item_title, sku, item_price, source, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ).bind(orderId, net, topUp, ord.itemTitle || null, ord.sku || null, ord.itemPrice || null, ord.source || "csv_upload", statusVal, new Date().toISOString()).run();
          added++;
        }
      }
      return jsonResponse({ ok: true, added, updated, total: added });
    }

    return jsonResponse({ ok: true, added: rawOrders.length, updated: 0, total: rawOrders.length });
  }

  // 11. GET /api/admin/orders
  if (request.method === "GET" && path === "/api/admin/orders") {
    if (!checkAuth(request, env)) {
      return jsonResponse({ ok: false, message: "Unauthorized. Admin password required." }, 401);
    }
    if (env.DB) {
      const search = url.searchParams.get("search") || "";
      let query = "SELECT order_id AS orderId, network, top_up_value AS topUpValue, item_title AS itemTitle, sku, item_price AS itemPrice, source, status, claimed_iccid AS claimedIccid, claimed_at AS claimedAt, created_at AS createdAt FROM amazon_orders";
      let results;
      if (search) {
        query += " WHERE order_id LIKE ? OR network LIKE ? OR sku LIKE ? ORDER BY created_at DESC LIMIT 200";
        const pattern = `%${search}%`;
        results = (await env.DB.prepare(query).bind(pattern, pattern, pattern).all()).results;
      } else {
        query += " ORDER BY created_at DESC LIMIT 200";
        results = (await env.DB.prepare(query).all()).results;
      }
      return jsonResponse({ ok: true, orders: results || [] });
    }
    return jsonResponse({ ok: true, orders: [] });
  }

  // 12. POST /api/webhooks/amazon-email
  if (request.method === "POST" && path === "/api/webhooks/amazon-email") {
    const payload = await request.json().catch(() => ({}));
    const text = typeof payload === "string" ? payload : (payload.body || payload.text || payload.raw || JSON.stringify(payload));
    const parsed = parseAmazonEmail(text);

    if (!parsed || !parsed.orderId) {
      return jsonResponse({ ok: false, message: "Could not parse Amazon Order ID from email body." }, 400);
    }

    if (env.DB) {
      await env.DB.prepare(
        "INSERT INTO amazon_orders (order_id, network, top_up_value, item_title, sku, item_price, source, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'email_alert', 'unclaimed', ?) ON CONFLICT(order_id) DO UPDATE SET network=excluded.network, top_up_value=excluded.top_up_value"
      ).bind(parsed.orderId, parsed.network, parsed.topUpValue, parsed.itemTitle, parsed.sku, parsed.itemPrice, new Date().toISOString()).run();
    }

    return jsonResponse({ ok: true, message: `Amazon Order ${parsed.orderId} registered from email alert.`, order: parsed });
  }

  // Sample CSV
  if (request.method === "GET" && path === "/api/admin/sample-csv") {
    const sample = "iccid,batchId,network\r\n8914800000000000001,AMZ-BATCH-001,giffgaff\r\n8914800000000000002,AMZ-BATCH-001,O2\r\n8914800000000000003,AMZ-BATCH-001,Vodafone\r\n";
    return new Response(sample, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="sample-iccids-template.csv"'
      }
    });
  }

  return jsonResponse({ ok: false, message: "Route not found." }, 404);
}

function parseAmazonEmail(rawText) {
  const text = String(rawText || "");
  const orderMatch = text.match(/\b(\d{3}-\d{7}-\d{7})\b/);
  if (!orderMatch) return null;
  const orderId = orderMatch[1];

  let network = "";
  if (/\b(?:O2|O 2)\b/i.test(text)) network = "O2";
  else if (/\b(?:EE|Everything Everywhere)\b/i.test(text)) network = "EE";
  else if (/\b(?:THREE|3 UK|Three UK)\b/i.test(text)) network = "THREE";

  let topUpValue = "";
  const priceMatch = text.match(/(?:£|GBP\s*|price[:\s]*£?)\s*(10|15|20|30|35)(?:\.00)?\b/i) ||
                     text.match(/\b(10|15|20|30|35)\s*(?:pounds|gbp|top\s*up)/i);
  if (priceMatch) {
    topUpValue = `£${priceMatch[1]}`;
  } else {
    if (text.includes("£35") || text.includes("35.00")) topUpValue = "£35";
    else if (text.includes("£30") || text.includes("30.00")) topUpValue = "£30";
    else if (text.includes("£20") || text.includes("20.00")) topUpValue = "£20";
    else if (text.includes("£15") || text.includes("15.00")) topUpValue = "£15";
    else if (text.includes("£10") || text.includes("10.00")) topUpValue = "£10";
  }

  let itemTitle = "";
  const itemMatch = text.match(/(?:Item(?: Name)?|Title|Product)[:\s]+([^\r\n]+)/i);
  if (itemMatch) itemTitle = itemMatch[1].trim();

  let sku = "";
  const skuMatch = text.match(/SKU[:\s]+([^\r\n\s]+)/i);
  if (skuMatch) sku = skuMatch[1].trim();

  return {
    orderId,
    network,
    topUpValue,
    itemTitle,
    sku,
    itemPrice: topUpValue ? topUpValue.replace("£", "") : "",
    source: "email_alert"
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-key",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
        }
      });
    }

    // Route API requests to the API handler
    if (url.pathname.startsWith("/api/")) {
      return handleApiRequest(request, env, url);
    }

    // Serve static assets from public/
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },

  // Cloudflare Email Routing native handler
  // Intercepts emails sent to @yourdomain.com automatically
  async email(message, env, ctx) {
    try {
      const rawText = await new Response(message.raw).text();
      const parsed = parseAmazonEmail(rawText);
      if (parsed && parsed.orderId && env.DB) {
        await env.DB.prepare(
          "INSERT INTO amazon_orders (order_id, network, top_up_value, item_title, sku, item_price, source, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'email_alert', 'unclaimed', ?) ON CONFLICT(order_id) DO UPDATE SET network=excluded.network, top_up_value=excluded.top_up_value"
        ).bind(parsed.orderId, parsed.network, parsed.topUpValue, parsed.itemTitle, parsed.sku, parsed.itemPrice, new Date().toISOString()).run();
      }
    } catch (err) {
      console.error("Cloudflare email routing parser error:", err);
    }
  }
};

