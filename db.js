const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.join(__dirname, "data");
const ICCID_DB = path.join(DATA_DIR, "iccids.json");
const REQUESTS_DB = path.join(DATA_DIR, "topup-requests.json");
const CONFIG_DB = path.join(DATA_DIR, "config.json");
const NOTIFICATION_DB = path.join(DATA_DIR, "activation-notifications.json");
const AMAZON_ORDERS_DB = path.join(DATA_DIR, "amazon-orders.json");

let pgPool = null;

// Initialize PostgreSQL if DATABASE_URL is provided (Supabase / Neon / RDS)
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require("pg");
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost")
        ? false
        : { rejectUnauthorized: false }
    });
    console.log("Connected to Cloud Database (PostgreSQL / Supabase / Neon).");
  } catch (err) {
    console.warn("pg module not found or connection failed. Falling back to local storage.", err.message);
    pgPool = null;
  }
}

async function initDb() {
  if (pgPool) {
    const client = await pgPool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS sims (
          iccid VARCHAR(32) PRIMARY KEY,
          ecommerce VARCHAR(64) DEFAULT 'Amazon',
          batch_id VARCHAR(64),
          network VARCHAR(64),
          status VARCHAR(32) DEFAULT 'available',
          last_top_up_value VARCHAR(32),
          order_id VARCHAR(64),
          customer_email VARCHAR(255),
          recharges_count INT DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          last_activity_at TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS topup_requests (
          id VARCHAR(64) PRIMARY KEY,
          amazon_order_id VARCHAR(64) NOT NULL,
          sim_iccid VARCHAR(32) NOT NULL,
          network_name VARCHAR(64) NOT NULL,
          top_up_value VARCHAR(32) NOT NULL,
          iccid_verified BOOLEAN DEFAULT TRUE,
          customer_email VARCHAR(255),
          submitted_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS amazon_orders (
          order_id VARCHAR(64) PRIMARY KEY,
          network VARCHAR(64) NOT NULL,
          top_up_value VARCHAR(32) NOT NULL,
          item_title VARCHAR(255),
          sku VARCHAR(128),
          item_price VARCHAR(32),
          source VARCHAR(64) DEFAULT 'csv_upload',
          status VARCHAR(32) DEFAULT 'unclaimed',
          claimed_iccid VARCHAR(32),
          claimed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_sims_order_id ON sims(order_id);
        CREATE INDEX IF NOT EXISTS idx_requests_order_id ON topup_requests(amazon_order_id);
        CREATE INDEX IF NOT EXISTS idx_amazon_orders_status ON amazon_orders(status);
      `);
    } finally {
      client.release();
    }
  } else {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

// 1. Get SIM by ICCID
async function getSimByIccid(iccid) {
  if (pgPool) {
    const res = await pgPool.query("SELECT * FROM sims WHERE iccid = $1", [iccid]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      iccid: r.iccid,
      ecommerce: r.ecommerce,
      batchId: r.batch_id,
      network: r.network,
      status: r.status,
      lastTopUpValue: r.last_top_up_value,
      orderId: r.order_id,
      customerEmail: r.customer_email,
      rechargesCount: r.recharges_count,
      createdAt: r.created_at,
      lastActivityAt: r.last_activity_at
    };
  }
  const db = await readJson(ICCID_DB, { sims: [] });
  return db.sims.find((s) => s.iccid.replace(/\D/g, "") === iccid) || null;
}

// 2. Check if Amazon Order ID was already used
async function isOrderIdUsed(orderId) {
  if (pgPool) {
    const res = await pgPool.query(
      "SELECT id FROM topup_requests WHERE amazon_order_id = $1 LIMIT 1",
      [orderId]
    );
    return res.rows.length > 0;
  }
  const requestsDb = await readJson(REQUESTS_DB, { requests: [] });
  return requestsDb.requests.some((r) => r.amazonOrderId === orderId);
}

// 3. Save Top-Up Request & Update SIM
async function saveTopUpRequest(request, email) {
  if (pgPool) {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO topup_requests (id, amazon_order_id, sim_iccid, network_name, top_up_value, iccid_verified, customer_email, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          request.id,
          request.amazonOrderId,
          request.simIccid,
          request.networkName,
          request.topUpValue,
          true,
          email || null,
          request.submittedAt
        ]
      );
      await client.query(
        `UPDATE sims
         SET status = 'activated',
             order_id = $1,
             network = $2,
             last_top_up_value = $3,
             customer_email = COALESCE($4, customer_email),
             recharges_count = recharges_count + 1,
             last_activity_at = $5
         WHERE iccid = $6`,
        [
          request.amazonOrderId,
          request.networkName,
          request.topUpValue,
          email || null,
          request.submittedAt,
          request.simIccid
        ]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return;
  }

  // Local JSON fallback
  const requestsDb = await readJson(REQUESTS_DB, { requests: [] });
  requestsDb.requests.unshift(request);
  await writeJson(REQUESTS_DB, requestsDb);

  const db = await readJson(ICCID_DB, { sims: [] });
  const sim = db.sims.find((s) => s.iccid.replace(/\D/g, "") === request.simIccid);
  if (sim) {
    sim.status = "activated";
    sim.orderId = request.amazonOrderId;
    sim.network = request.networkName;
    sim.lastTopUpValue = request.topUpValue;
    sim.customerEmail = email || sim.customerEmail || "";
    sim.lastActivityAt = request.submittedAt;
    sim.recharges = Array.isArray(sim.recharges) ? sim.recharges : [];
    sim.recharges.push({
      requestId: request.id,
      orderId: request.amazonOrderId,
      networkName: request.networkName,
      topUpValue: request.topUpValue,
      submittedAt: request.submittedAt
    });
    await writeJson(ICCID_DB, db);
  }

  const notifications = await readJson(NOTIFICATION_DB, { notifications: [] });
  notifications.notifications.unshift({
    type: "NEW_SIM_TOPUP_REQUEST",
    ...request
  });
  await writeJson(NOTIFICATION_DB, notifications);
}

// 4. Bulk Insert ICCIDs
async function bulkInsertIccids(iccids, ecommerce, batchId, network) {
  if (pgPool) {
    const client = await pgPool.connect();
    let added = 0;
    let skipped = 0;
    try {
      await client.query("BEGIN");
      for (const iccid of iccids) {
        const check = await client.query("SELECT iccid FROM sims WHERE iccid = $1", [iccid]);
        if (check.rows.length > 0) {
          skipped++;
        } else {
          await client.query(
            `INSERT INTO sims (iccid, ecommerce, batch_id, network, status, created_at)
             VALUES ($1, $2, $3, $4, 'available', NOW())`,
            [iccid, ecommerce, batchId, network || null]
          );
          added++;
        }
      }
      await client.query("COMMIT");
      const totalRes = await client.query("SELECT COUNT(*) FROM sims");
      return { added, skipped, total: parseInt(totalRes.rows[0].count, 10), batchId };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // Local JSON fallback
  const db = await readJson(ICCID_DB, { sims: [] });
  const existing = new Set(db.sims.map((s) => s.iccid.replace(/\D/g, "")));
  const createdAt = new Date().toISOString();
  const added = [];
  const skipped = [];

  for (const iccid of iccids) {
    if (existing.has(iccid)) {
      skipped.push(iccid);
      continue;
    }
    db.sims.push({
      iccid,
      ecommerce,
      batchId,
      network: network || "",
      status: "available",
      createdAt
    });
    existing.add(iccid);
    added.push(iccid);
  }
  await writeJson(ICCID_DB, db);
  return { added: added.length, skipped: skipped.length, total: db.sims.length, batchId };
}

// 5. Get Summary Stats
async function getSummary() {
  if (pgPool) {
    const totalRes = await pgPool.query("SELECT COUNT(*) FROM sims");
    const availRes = await pgPool.query("SELECT COUNT(*) FROM sims WHERE status = 'available'");
    const activeRes = await pgPool.query("SELECT COUNT(*) FROM sims WHERE status = 'activated'");
    const reqRes = await pgPool.query("SELECT COUNT(*) FROM topup_requests");

    return {
      total: parseInt(totalRes.rows[0].count, 10),
      available: parseInt(availRes.rows[0].count, 10),
      activated: parseInt(activeRes.rows[0].count, 10),
      requestsCount: parseInt(reqRes.rows[0].count, 10)
    };
  }

  const db = await readJson(ICCID_DB, { sims: [] });
  const requestsDb = await readJson(REQUESTS_DB, { requests: [] });
  const summary = db.sims.reduce(
    (acc, sim) => {
      acc.total += 1;
      acc[sim.status] = (acc[sim.status] || 0) + 1;
      return acc;
    },
    { total: 0, available: 0, activated: 0 }
  );
  summary.requestsCount = requestsDb.requests.length;
  return summary;
}

// 6. Get Requests List
async function getRequests() {
  if (pgPool) {
    const res = await pgPool.query(
      `SELECT id, amazon_order_id AS "amazonOrderId", sim_iccid AS "simIccid",
              network_name AS "networkName", top_up_value AS "topUpValue",
              customer_email AS "customerEmail", submitted_at AS "submittedAt"
       FROM topup_requests
       ORDER BY submitted_at DESC`
    );
    return res.rows;
  }
  const requestsDb = await readJson(REQUESTS_DB, { requests: [] });
  return requestsDb.requests;
}

// 7. Get Inventory List
async function getInventory(status, search) {
  if (pgPool) {
    let query = "SELECT * FROM sims WHERE 1=1";
    const params = [];
    if (status && status !== "all") {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (iccid ILIKE $${params.length} OR order_id ILIKE $${params.length} OR network ILIKE $${params.length} OR batch_id ILIKE $${params.length})`;
    }
    query += " ORDER BY COALESCE(last_activity_at, created_at) DESC";
    const res = await pgPool.query(query, params);
    return res.rows.map((r) => ({
      iccid: r.iccid,
      ecommerce: r.ecommerce,
      batchId: r.batch_id,
      network: r.network,
      status: r.status,
      lastTopUpValue: r.last_top_up_value,
      orderId: r.order_id,
      customerEmail: r.customer_email,
      rechargesCount: r.recharges_count,
      createdAt: r.created_at,
      lastActivityAt: r.last_activity_at
    }));
  }

  const db = await readJson(ICCID_DB, { sims: [] });
  return db.sims
    .filter((sim) => {
      if (status !== "all" && String(sim.status || "available").toLowerCase() !== status) {
        return false;
      }
      if (search) {
        const iccid = sim.iccid.replace(/\D/g, "");
        const orderId = String(sim.orderId || "").toLowerCase();
        const network = String(sim.network || "").toLowerCase();
        const batch = String(sim.batchId || "").toLowerCase();
        if (!iccid.includes(search) && !orderId.includes(search) && !network.includes(search) && !batch.includes(search)) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => String(b.lastActivityAt || b.createdAt).localeCompare(String(a.lastActivityAt || a.createdAt)));
}

// 8. Amazon Orders Management
async function getAmazonOrder(orderId) {
  const normId = String(orderId || "").trim();
  if (pgPool) {
    const res = await pgPool.query("SELECT * FROM amazon_orders WHERE order_id = $1 LIMIT 1", [normId]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      orderId: r.order_id,
      network: r.network,
      topUpValue: r.top_up_value,
      itemTitle: r.item_title,
      sku: r.sku,
      itemPrice: r.item_price,
      source: r.source,
      status: r.status,
      claimedIccid: r.claimed_iccid,
      claimedAt: r.claimed_at,
      createdAt: r.created_at
    };
  }
  const db = await readJson(AMAZON_ORDERS_DB, { orders: [] });
  const found = db.orders.find((o) => o.orderId === normId);
  if (found) return found;

  const catalog = await readJson(path.join(__dirname, "public", "orders-catalog.json"), {});
  if (catalog && catalog[normId]) {
    const c = catalog[normId];
    return {
      orderId: normId,
      network: c.network,
      topUpValue: c.topUpValue,
      status: c.status || "unclaimed"
    };
  }
  return null;
}

async function bulkInsertAmazonOrders(newOrders) {
  if (!Array.isArray(newOrders) || newOrders.length === 0) {
    return { inserted: 0, updated: 0, total: 0 };
  }

  if (pgPool) {
    const client = await pgPool.connect();
    let inserted = 0;
    try {
      await client.query("BEGIN");
      for (const ord of newOrders) {
        const orderId = String(ord.orderId || "").trim();
        if (!orderId) continue;
        const statusVal = String(ord.status || "unclaimed").trim();
        const res = await client.query(
          `INSERT INTO amazon_orders (order_id, network, top_up_value, item_title, sku, item_price, source, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           ON CONFLICT (order_id) DO UPDATE SET
             network = EXCLUDED.network,
             top_up_value = EXCLUDED.top_up_value,
             item_title = COALESCE(EXCLUDED.item_title, amazon_orders.item_title),
             sku = COALESCE(EXCLUDED.sku, amazon_orders.sku),
             item_price = COALESCE(EXCLUDED.item_price, amazon_orders.item_price),
             status = EXCLUDED.status
           RETURNING (xmax = 0) AS is_new`,
          [
            orderId,
            String(ord.network || "").trim().toUpperCase(),
            String(ord.topUpValue || "").trim(),
            ord.itemTitle || "",
            ord.sku || "",
            ord.itemPrice || "",
            ord.source || "csv_upload",
            statusVal
          ]
        );
        if (res.rows[0] && res.rows[0].is_new) inserted++;
      }
      await client.query("COMMIT");
      const countRes = await client.query("SELECT COUNT(*) AS total FROM amazon_orders");
      return { inserted, updated: newOrders.length - inserted, total: parseInt(countRes.rows[0].total, 10) };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // Local JSON implementation
  const db = await readJson(AMAZON_ORDERS_DB, { orders: [] });
  const map = new Map();
  for (const o of db.orders) {
    map.set(o.orderId, o);
  }

  let inserted = 0;
  let updated = 0;
  for (const ord of newOrders) {
    const orderId = String(ord.orderId || "").trim();
    if (!orderId) continue;
    const existing = map.get(orderId);
    if (existing) {
      existing.network = String(ord.network || existing.network).trim().toUpperCase();
      existing.topUpValue = String(ord.topUpValue || existing.topUpValue).trim();
      if (ord.itemTitle) existing.itemTitle = ord.itemTitle;
      if (ord.sku) existing.sku = ord.sku;
      if (ord.itemPrice) existing.itemPrice = ord.itemPrice;
      if (ord.status) existing.status = ord.status;
      updated++;
    } else {
      const entry = {
        orderId,
        network: String(ord.network || "").trim().toUpperCase(),
        topUpValue: String(ord.topUpValue || "").trim(),
        itemTitle: ord.itemTitle || "",
        sku: ord.sku || "",
        itemPrice: ord.itemPrice || "",
        source: ord.source || "csv_upload",
        status: String(ord.status || "unclaimed").trim(),
        claimedIccid: null,
        claimedAt: null,
        createdAt: new Date().toISOString()
      };
      map.set(orderId, entry);
      inserted++;
    }
  }

  const updatedList = Array.from(map.values());
  await writeJson(AMAZON_ORDERS_DB, { orders: updatedList });
  return { inserted, updated, total: updatedList.length };
}

async function markAmazonOrderClaimed(orderId, iccid) {
  const normId = String(orderId || "").trim();
  const now = new Date().toISOString();
  if (pgPool) {
    await pgPool.query(
      `UPDATE amazon_orders
       SET status = 'claimed', claimed_iccid = $1, claimed_at = $2
       WHERE order_id = $3`,
      [iccid, now, normId]
    );
    return;
  }
  const db = await readJson(AMAZON_ORDERS_DB, { orders: [] });
  const ord = db.orders.find((o) => o.orderId === normId);
  if (ord) {
    ord.status = "claimed";
    ord.claimedIccid = iccid;
    ord.claimedAt = now;
    await writeJson(AMAZON_ORDERS_DB, db);
  }
}

async function getAmazonOrdersList(search) {
  if (pgPool) {
    let query = "SELECT * FROM amazon_orders WHERE 1=1";
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (order_id ILIKE $1 OR network ILIKE $1 OR item_title ILIKE $1 OR sku ILIKE $1)`;
    }
    query += " ORDER BY created_at DESC LIMIT 500";
    const res = await pgPool.query(query, params);
    return res.rows.map((r) => ({
      orderId: r.order_id,
      network: r.network,
      topUpValue: r.top_up_value,
      itemTitle: r.item_title,
      sku: r.sku,
      itemPrice: r.item_price,
      source: r.source,
      status: r.status,
      claimedIccid: r.claimed_iccid,
      claimedAt: r.claimed_at,
      createdAt: r.created_at
    }));
  }
  const db = await readJson(AMAZON_ORDERS_DB, { orders: [] });
  let list = db.orders;
  if (search) {
    const s = search.toLowerCase();
    list = list.filter((o) =>
      o.orderId.toLowerCase().includes(s) ||
      (o.network && o.network.toLowerCase().includes(s)) ||
      (o.itemTitle && o.itemTitle.toLowerCase().includes(s)) ||
      (o.sku && o.sku.toLowerCase().includes(s))
    );
  }
  return list.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

module.exports = {
  initDb,
  getSimByIccid,
  isOrderIdUsed,
  saveTopUpRequest,
  bulkInsertIccids,
  getSummary,
  getRequests,
  getInventory,
  getAmazonOrder,
  bulkInsertAmazonOrders,
  markAmazonOrderClaimed,
  getAmazonOrdersList,
  readJson,
  CONFIG_DB
};
