const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const PUBLIC_DIR = path.join(ROOT, "public");
const ICCID_DB = path.join(DATA_DIR, "iccids.json");
const CONFIG_DB = path.join(DATA_DIR, "config.json");
const REQUESTS_DB = path.join(DATA_DIR, "topup-requests.json");
const NOTIFICATION_DB = path.join(DATA_DIR, "activation-notifications.json");
const TEST_DATA_PUBLIC = path.join(PUBLIC_DIR, "test-data.json");

const COUNT = Number(process.argv[2] || 20);

const SAMPLE_NETWORKS = ["O2", "EE", "THREE"];
const NETWORK_TOPUPS = {
  "O2": ["£10", "£15", "£20", "£30"],
  "EE": ["£10", "£15", "£20", "£30", "£35"],
  "THREE": ["£10", "£15", "£20", "£35"]
};

function randomDigits(length) {
  let value = "";
  while (value.length < length) {
    value += crypto.randomInt(0, 10).toString();
  }
  return value;
}

function amazonOrderId() {
  return `${randomDigits(3)}-${randomDigits(7)}-${randomDigits(7)}`;
}

// Generates standard UK 19-digit ICCID (starts with 8944...)
function iccid(index) {
  const suffix = String(index).padStart(5, "0");
  return `894411${randomDigits(8)}${suffix}`;
}

async function main() {
  const generatedAt = new Date().toISOString();
  const batchId = `AMZ-BATCH-${Date.now()}`;
  const usedIccids = new Set();
  const rows = [];

  while (rows.length < COUNT) {
    const candidate = iccid(rows.length + 1);
    if (usedIccids.has(candidate)) continue;
    usedIccids.add(candidate);
    const network = SAMPLE_NETWORKS[rows.length % SAMPLE_NETWORKS.length];
    const allowed = NETWORK_TOPUPS[network];
    const topUpValue = allowed[rows.length % allowed.length];
    rows.push({
      ecommerce: "Amazon",
      orderId: amazonOrderId(),
      iccid: candidate,
      networkName: network,
      topUpValue,
      batchId
    });
  }

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(PUBLIC_DIR, { recursive: true });

  await fs.writeFile(
    ICCID_DB,
    `${JSON.stringify(
      {
        sims: rows.map((row) => ({
          iccid: row.iccid,
          ecommerce: row.ecommerce,
          batchId: row.batchId,
          network: row.networkName,
          status: "available",
          createdAt: generatedAt
        }))
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  await fs.writeFile(
    CONFIG_DB,
    `${JSON.stringify(
      {
        networks: ["giffgaff", "O2", "Vodafone", "EE", "Three", "Lebara", "Lycamobile", "VOXI", "SMARTY", "Tesco Mobile", "Other"],
        topUpValues: ["£5", "£10", "£15", "£20", "£25", "£30", "£40", "£50"],
        notificationEmail: "vendor-orders@example.com"
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  await fs.writeFile(
    REQUESTS_DB,
    `${JSON.stringify({ requests: [] }, null, 2)}\n`,
    "utf8"
  );

  await fs.writeFile(
    NOTIFICATION_DB,
    `${JSON.stringify({ notifications: [] }, null, 2)}\n`,
    "utf8"
  );

  await fs.writeFile(
    TEST_DATA_PUBLIC,
    `${JSON.stringify(
      {
        generatedAt,
        note: "Local testing only. Do not expose this file in production.",
        rows
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(`Generated ${rows.length} authorized Amazon SIMs with UK ICCIDs (8944...).`);
  console.log(`Batch: ${batchId}`);
  console.log(`Sample Order: ${rows[0].orderId}`);
  console.log(`Sample ICCID: ${rows[0].iccid}`);
  console.log(`Sample Network: ${rows[0].networkName}`);
  console.log(`Sample Top-Up: ${rows[0].topUpValue}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
