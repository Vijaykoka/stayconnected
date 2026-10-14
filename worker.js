// Cloudflare Worker entry point
// Connects static assets with edge API functions

const DEFAULT_CONFIG = {
  networks: [
    "giffgaff",
    "O2",
    "Vodafone",
    "EE",
    "Three",
    "Lebara",
    "Lycamobile",
    "VOXI",
    "SMARTY",
    "Tesco Mobile",
    "Other"
  ],
  topUpValues: ["£5", "£10", "£15", "£20", "£25", "£30", "£40", "£50"],
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

  // 3. POST /api/topup-request
  if (request.method === "POST" && (path === "/api/topup-request" || path === "/api/activate")) {
    const payload = await request.json().catch(() => ({}));
    const orderId = String(payload.orderId || "").trim().toUpperCase();
    const iccid = String(payload.iccid || "").replace(/\D/g, "");
    const networkName = String(payload.networkName || payload.network || "").trim();
    const topUpValue = String(payload.topUpValue || payload.plan || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();

    const missing = [];
    if (!orderId) missing.push("Amazon Order ID");
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
        message: "Enter a valid Amazon order ID in the format 123-1234567-1234567."
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
          message: "Duplicate submission. This Amazon Order ID has already been submitted for a top-up request."
        }, 409);
      }

      const requestId = `REQ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const now = new Date().toISOString();

      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO topup_requests (id, amazon_order_id, sim_iccid, network_name, top_up_value, iccid_verified, customer_email, submitted_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)"
        ).bind(requestId, orderId, iccid, networkName, topUpValue, email, now),
        env.DB.prepare(
          "UPDATE sims SET status = 'activated', order_id = ?, network = ?, last_top_up_value = ?, customer_email = ?, last_activity_at = ? WHERE iccid = ?"
        ).bind(orderId, networkName, topUpValue, email, now, iccid)
      ]);
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
    let csv = "Request ID,Amazon Order ID,SIM ICCID,Network Name,Top-Up Value,ICCID Verified,Customer Email,Submitted At\r\n";
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
  }
};
