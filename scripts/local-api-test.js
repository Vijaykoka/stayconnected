const fs = require("node:fs/promises");
const path = require("node:path");

const TEST_DATA = path.join(__dirname, "..", "public", "test-data.json");
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const EXPECTED_INVALID_MSG = "Invalid ICCID. This SIM card is not registered in our database and does not belong to us.";

async function post(pathname, body, headers = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  return { response, data };
}

async function get(pathname, headers = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, { headers });
  return response;
}

async function main() {
  const fixture = JSON.parse(await fs.readFile(TEST_DATA, "utf8"));
  const sample = fixture.rows[0];

  if (!sample) {
    throw new Error("No test data found. Run npm run seed first.");
  }

  console.log("===============================================================");
  console.log(" RUNNING VERIFICATION AGAINST WEB SERVICE SPEC");
  console.log("===============================================================\n");

  // Step 1: Pre-validation of authorized ICCID
  console.log("1. Step 3 Test: Checking valid ICCID against authorized database...");
  const validCheck = await (await get(`/api/validate-iccid?iccid=${sample.iccid}`)).json();
  if (!validCheck.ok || !validCheck.found) {
    throw new Error(`Valid ICCID check failed: ${JSON.stringify(validCheck)}`);
  }
  console.log(`   ✓ ICCID ${sample.iccid} is verified in database: "${validCheck.message}"`);

  // Step 2: Test Rule — If ICCID does not exist in database
  console.log("\n2. Rule Test: Unknown ICCID rejection...");
  const invalidCheck = await (await get(`/api/validate-iccid?iccid=8944999999999999999`)).json();
  if (invalidCheck.ok || invalidCheck.message !== EXPECTED_INVALID_MSG) {
    throw new Error(`Expected error message "${EXPECTED_INVALID_MSG}" but received "${invalidCheck.message}"`);
  }
  console.log(`   ✓ Correct exact rejection message returned:`);
  console.log(`     "${invalidCheck.message}"`);

  // Step 3: Test Rule — Missing mandatory field
  console.log("\n3. Rule Test: Missing mandatory fields validation...");
  const missingField = await post("/api/topup-request", {
    orderId: sample.orderId,
    iccid: sample.iccid
  });
  if (missingField.response.status !== 400 || missingField.data.code !== "MISSING_MANDATORY_FIELDS") {
    throw new Error(`Missing mandatory field check failed: ${JSON.stringify(missingField.data)}`);
  }
  console.log(`   ✓ Successfully prevented submission when mandatory fields are missing:`);
  console.log(`     "${missingField.data.message}"`);

  // Step 4: Complete valid submission
  console.log("\n4. Step 2 & 4 Test: Submitting complete valid top-up request...");
  const validRequest = await post("/api/topup-request", {
    orderId: sample.orderId,
    iccid: sample.iccid,
    networkName: sample.networkName || "giffgaff",
    topUpValue: sample.topUpValue || "£10",
    email: "customer@example.com"
  });

  if (!validRequest.response.ok || !validRequest.data.ok) {
    throw new Error(`Valid top-up submission failed: ${JSON.stringify(validRequest.data)}`);
  }

  const notif = validRequest.data.notification;
  console.log("   ✓ Top-Up Request received and validated successfully!");
  console.log("   ✓ Generated Notification Representation:");
  console.log("     -------------------------------------------");
  console.log(`     ${notif.title}`);
  console.log(`     Amazon Order ID: ${notif.amazonOrderId}`);
  console.log(`     SIM ICCID:       ${notif.simIccid}`);
  console.log(`     Network Name:    ${notif.networkName}`);
  console.log(`     Top-Up Value:    ${notif.topUpValue}`);
  console.log(`     ICCID Verified:  ${notif.iccidVerified ? "Yes" : "No"}`);
  console.log("     -------------------------------------------");

  // Step 5: Duplicate submission prevention
  console.log("\n5. Rule Test: Duplicate submission prevention (same Amazon Order ID)...");
  const duplicate = await post("/api/topup-request", {
    orderId: sample.orderId,
    iccid: fixture.rows[1].iccid,
    networkName: "O2",
    topUpValue: "£20"
  });

  if (duplicate.response.status !== 409 || duplicate.data.code !== "DUPLICATE_ORDER_SUBMISSION") {
    throw new Error(`Duplicate submission check failed: ${JSON.stringify(duplicate.data)}`);
  }
  console.log(`   ✓ Prevented duplicate Amazon Order ID submission: "${duplicate.data.message}"`);

  // Step 6: Security test — Admin Password Protection
  console.log("\n6. Security Test: Admin API password protection...");
  const unauthRes = await get("/api/admin/requests");
  if (unauthRes.status !== 401) {
    throw new Error(`Expected 401 Unauthorized but got ${unauthRes.status}`);
  }
  console.log("   ✓ Unauthenticated request to /api/admin/requests correctly blocked with 401.");

  const authAttempt = await post("/api/admin/auth", { password: ADMIN_PASSWORD });
  if (!authAttempt.response.ok || !authAttempt.data.ok) {
    throw new Error(`Admin auth login failed: ${JSON.stringify(authAttempt.data)}`);
  }
  console.log(`   ✓ Admin authentication successful with token.`);

  const authHeaders = { Authorization: `Bearer ${ADMIN_PASSWORD}` };
  const requestsRes = await (await get("/api/admin/requests", authHeaders)).json();
  if (!requestsRes.requests || requestsRes.requests.length === 0) {
    throw new Error("No requests found in database with authenticated admin!");
  }
  console.log(`   ✓ Found ${requestsRes.requests.length} saved top-up request(s) using authenticated admin token.`);

  const csvRes = await get(`/api/admin/export-requests-csv?key=${ADMIN_PASSWORD}`);
  if (!csvRes.ok || !csvRes.headers.get("content-type").includes("text/csv")) {
    throw new Error("CSV Export for requests failed!");
  }
  console.log("   ✓ Requests spreadsheet export (CSV) generated successfully.");

  console.log("\n===============================================================");
  console.log(" ALL CUSTOMER JOURNEY, SECURITY & CLOUD TESTS PASSED! ");
  console.log("===============================================================");
}

main().catch((error) => {
  console.error("Test error:", error.message);
  process.exit(1);
});
