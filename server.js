const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const db = require("./db");
const { sendTopUpNotification } = require("./mailer");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

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
  notificationEmail: process.env.NOTIFICATION_EMAIL || "vendor-orders@example.com"
};

const INVALID_ICCID_MESSAGE = "Invalid ICCID. This SIM card is not registered in our database and does not belong to us.";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function normalizeIccid(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeOrderId(value) {
  return String(value || "").trim().toUpperCase();
}

function isValidIccidShape(iccid) {
  return /^\d{18,22}$/.test(iccid);
}

function isValidAmazonOrderId(orderId) {
  return /^\d{3}-\d{7}-\d{7}$/.test(orderId);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "Content-Type, Authorization, x-admin-key",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function checkAdminAuth(req) {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const apiKey = req.headers["x-admin-key"] || "";
  return token === ADMIN_PASSWORD || apiKey === ADMIN_PASSWORD;
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

async function getConfigHandler(_req, res) {
  const config = await db.readJson(db.CONFIG_DB, DEFAULT_CONFIG);
  sendJson(res, 200, { ok: true, config });
}

// Check ICCID strictly against authorized database (Cloud DB or local)
async function validateIccidHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const rawIccid = url.searchParams.get("iccid") || "";
  const iccid = normalizeIccid(rawIccid);

  if (!isValidIccidShape(iccid)) {
    return sendJson(res, 400, {
      ok: false,
      code: "INVALID_ICCID_FORMAT",
      message: INVALID_ICCID_MESSAGE
    });
  }

  const sim = await db.getSimByIccid(iccid);

  if (!sim) {
    return sendJson(res, 404, {
      ok: false,
      code: "ICCID_NOT_FOUND",
      message: INVALID_ICCID_MESSAGE
    });
  }

  return sendJson(res, 200, {
    ok: true,
    found: true,
    iccid: sim.iccid,
    status: sim.status || "available",
    network: sim.network || "",
    lastTopUpValue: sim.lastTopUpValue || "",
    message: "ICCID Verified"
  });
}

// Process Customer SIM Top-Up Request
async function topupRequestHandler(req, res) {
  const payload = await readRequestBody(req);
  const orderId = normalizeOrderId(payload.orderId);
  const iccid = normalizeIccid(payload.iccid);
  const networkName = String(payload.networkName || payload.network || "").trim();
  const topUpValue = String(payload.topUpValue || payload.plan || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();

  // Validate mandatory fields
  const missing = [];
  if (!orderId) missing.push("Amazon Order ID");
  if (!iccid) missing.push("SIM card ICCID");
  if (!networkName) missing.push("Network Name");
  if (!topUpValue) missing.push("Top-Up Value");

  if (missing.length > 0) {
    return sendJson(res, 400, {
      ok: false,
      code: "MISSING_MANDATORY_FIELDS",
      message: `Please complete all mandatory fields: ${missing.join(", ")}.`,
      missing
    });
  }

  if (!isValidAmazonOrderId(orderId)) {
    return sendJson(res, 400, {
      ok: false,
      code: "INVALID_ORDER_ID",
      message: "Enter a valid Amazon order ID in the format 123-1234567-1234567."
    });
  }

  if (!isValidIccidShape(iccid)) {
    return sendJson(res, 400, {
      ok: false,
      code: "INVALID_ICCID_FORMAT",
      message: INVALID_ICCID_MESSAGE
    });
  }

  // Check ICCID against authorised database
  const sim = await db.getSimByIccid(iccid);

  if (!sim) {
    return sendJson(res, 404, {
      ok: false,
      code: "ICCID_NOT_FOUND",
      message: INVALID_ICCID_MESSAGE
    });
  }

  // Check duplicate submissions of the exact same Amazon Order ID
  const isUsed = await db.isOrderIdUsed(orderId);
  if (isUsed) {
    return sendJson(res, 409, {
      ok: false,
      code: "DUPLICATE_ORDER_SUBMISSION",
      message: "Duplicate submission. This Amazon Order ID has already been submitted for a top-up request."
    });
  }

  const now = new Date().toISOString();
  const requestId = `REQ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  const notification = {
    id: requestId,
    title: "New SIM Top-Up Request",
    amazonOrderId: orderId,
    simIccid: iccid,
    networkName,
    topUpValue,
    iccidVerified: true,
    customerEmail: email || null,
    submittedAt: now
  };

  // Save to database
  await db.saveTopUpRequest(notification, email);

  // Trigger automated email notification (runs in background)
  sendTopUpNotification(notification).catch((err) =>
    console.error("[Email Notification Error]", err)
  );

  return sendJson(res, 200, {
    ok: true,
    message: "Top-up request submitted successfully.",
    notification
  });
}

// Admin verify password endpoint
async function adminAuthHandler(req, res) {
  const payload = await readRequestBody(req);
  const password = String(payload.password || "").trim();
  if (password === ADMIN_PASSWORD) {
    return sendJson(res, 200, { ok: true, token: ADMIN_PASSWORD, message: "Authenticated" });
  }
  return sendJson(res, 401, { ok: false, message: "Invalid Admin Password." });
}

async function bulkImportHandler(req, res) {
  if (!checkAdminAuth(req)) {
    return sendJson(res, 401, { ok: false, message: "Unauthorized. Admin password required." });
  }
  const payload = await readRequestBody(req);
  const ecommerce = String(payload.ecommerce || "Amazon").trim() || "Amazon";
  const batchId = String(payload.batchId || `BATCH-${Date.now()}`).trim();
  const network = String(payload.network || "").trim();
  const rawIccids = Array.isArray(payload.iccids)
    ? payload.iccids
    : String(payload.iccids || "").split(/\r?\n|,/);

  const incoming = [...new Set(rawIccids.map(normalizeIccid).filter(isValidIccidShape))];
  if (incoming.length === 0) {
    return sendJson(res, 400, {
      ok: false,
      message: "Add at least one valid ICCID with 18 to 22 digits."
    });
  }

  const result = await db.bulkInsertIccids(incoming, ecommerce, batchId, network);
  return sendJson(res, 200, { ok: true, ...result });
}

async function summaryHandler(req, res) {
  if (!checkAdminAuth(req)) {
    return sendJson(res, 401, { ok: false, message: "Unauthorized. Admin password required." });
  }
  const summary = await db.getSummary();
  sendJson(res, 200, { ok: true, summary });
}

async function getRequestsHandler(req, res) {
  if (!checkAdminAuth(req)) {
    return sendJson(res, 401, { ok: false, message: "Unauthorized. Admin password required." });
  }
  const requests = await db.getRequests();
  sendJson(res, 200, { ok: true, requests });
}

async function inventoryHandler(req, res) {
  if (!checkAdminAuth(req)) {
    return sendJson(res, 401, { ok: false, message: "Unauthorized. Admin password required." });
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const status = String(url.searchParams.get("status") || "all").toLowerCase();
  const search = String(url.searchParams.get("search") || "").trim().toLowerCase();

  const sims = await db.getInventory(status, search);
  sendJson(res, 200, { ok: true, sims });
}

async function exportRequestsCsvHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("key") || "";
  if (token !== ADMIN_PASSWORD && !checkAdminAuth(req)) {
    return sendJson(res, 401, { ok: false, message: "Unauthorized. Admin password required." });
  }

  const requests = await db.getRequests();
  const headers = [
    "Request ID",
    "Amazon Order ID",
    "SIM ICCID",
    "Network Name",
    "Top-Up Value",
    "ICCID Verified",
    "Customer Email",
    "Submitted At"
  ];

  const escapeCsv = (str) => `"${String(str ?? "").replace(/"/g, '""')}"`;

  const rows = requests.map((r) => [
    escapeCsv(r.id),
    escapeCsv(r.amazonOrderId),
    escapeCsv(r.simIccid),
    escapeCsv(r.networkName),
    escapeCsv(r.topUpValue),
    "Yes",
    escapeCsv(r.customerEmail || "-"),
    escapeCsv(r.submittedAt)
  ].join(","));

  const csv = [headers.join(","), ...rows].join("\r\n");

  res.writeHead(200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": 'attachment; filename="sim-topup-requests.csv"',
    "cache-control": "no-store"
  });
  res.end(csv);
}

async function exportCsvHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("key") || "";
  if (token !== ADMIN_PASSWORD && !checkAdminAuth(req)) {
    return sendJson(res, 401, { ok: false, message: "Unauthorized. Admin password required." });
  }

  const sims = await db.getInventory("all", "");
  const headers = [
    "ICCID",
    "Status",
    "Network",
    "Last Top-Up Value",
    "Amazon Order ID",
    "Customer Email",
    "Batch ID",
    "Total Requests",
    "Last Activity At",
    "Created At"
  ];

  const escapeCsv = (str) => `"${String(str ?? "").replace(/"/g, '""')}"`;

  const rows = sims.map((sim) => [
    escapeCsv(sim.iccid),
    escapeCsv(sim.status || "available"),
    escapeCsv(sim.network || ""),
    escapeCsv(sim.lastTopUpValue || ""),
    escapeCsv(sim.orderId || ""),
    escapeCsv(sim.customerEmail || ""),
    escapeCsv(sim.batchId || ""),
    sim.rechargesCount || 0,
    escapeCsv(sim.lastActivityAt || ""),
    escapeCsv(sim.createdAt || "")
  ].join(","));

  const csv = [headers.join(","), ...rows].join("\r\n");

  res.writeHead(200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": 'attachment; filename="sim-inventory-export.csv"',
    "cache-control": "no-store"
  });
  res.end(csv);
}

function sampleCsvHandler(_req, res) {
  const sample = "iccid,batchId,network\r\n8914800000000000001,AMZ-BATCH-001,giffgaff\r\n8914800000000000002,AMZ-BATCH-001,O2\r\n8914800000000000003,AMZ-BATCH-001,Vodafone\r\n";
  res.writeHead(200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": 'attachment; filename="sample-iccids-template.csv"',
    "cache-control": "no-store"
  });
  res.end(sample);
}

async function staticHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": CONTENT_TYPES[ext] || "application/octet-stream",
      "cache-control": "no-cache"
    });
    return res.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    throw error;
  }
}

// Main request router
async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "Content-Type, Authorization, x-admin-key",
        "access-control-allow-methods": "GET, POST, OPTIONS"
      });
      return res.end();
    }

    if (req.method === "GET" && url.pathname === "/api/config") {
      return getConfigHandler(req, res);
    }
    if (req.method === "GET" && url.pathname === "/api/validate-iccid") {
      return validateIccidHandler(req, res);
    }
    if (req.method === "POST" && (url.pathname === "/api/topup-request" || url.pathname === "/api/activate")) {
      return topupRequestHandler(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/admin/auth") {
      return adminAuthHandler(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/admin/iccid-bulk") {
      return bulkImportHandler(req, res);
    }
    if (req.method === "GET" && url.pathname === "/api/admin/summary") {
      return summaryHandler(req, res);
    }
    if (req.method === "GET" && url.pathname === "/api/admin/requests") {
      return getRequestsHandler(req, res);
    }
    if (req.method === "GET" && url.pathname === "/api/admin/iccids") {
      return inventoryHandler(req, res);
    }
    if (req.method === "GET" && url.pathname === "/api/admin/export-requests-csv") {
      return exportRequestsCsvHandler(req, res);
    }
    if (req.method === "GET" && url.pathname === "/api/admin/export-csv") {
      return exportCsvHandler(req, res);
    }
    if (req.method === "GET" && url.pathname === "/api/admin/sample-csv") {
      return sampleCsvHandler(req, res);
    }
    if (req.method === "GET" || req.method === "HEAD") {
      return staticHandler(req, res);
    }

    sendJson(res, 405, { ok: false, message: "Method not allowed." });
  } catch (error) {
    const status = error.statusCode || 500;
    sendJson(res, status, {
      ok: false,
      message: status === 500 ? "Unexpected server error." : error.message
    });
  }
}

const server = http.createServer(handleRequest);

// Initialize DB schema & start listening
db.initDb().then(() => {
  if (require.main === module) {
    server.listen(PORT, () => {
      console.log(`Web Page Service running at http://localhost:${PORT}`);
    });
  }
}).catch((err) => {
  console.error("DB Initialization error:", err);
});

module.exports = server;
