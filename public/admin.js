const form = document.querySelector("#bulk-form");
const result = document.querySelector("#result");
const stats = document.querySelector("#stats");
const submitButton = document.querySelector("#submit-button");
const importBtnLabel = document.querySelector("#import-btn-label");
const requestsRows = document.querySelector("#requests-rows");
const inventoryRows = document.querySelector("#inventory-rows");
const tabs = document.querySelectorAll(".tabs .tab");
const searchInput = document.querySelector("#search-input");
const btnRefreshRequests = document.querySelector("#btn-refresh-requests");
const btnLogout = document.querySelector("#btn-logout");
const btnExportRequests = document.querySelector("#btn-export-requests");
const btnExportInventory = document.querySelector("#btn-export-inventory");

// Login Modal Elements
const loginModal = document.querySelector("#login-modal");
const loginForm = document.querySelector("#admin-login-form");
const passwordInput = document.querySelector("#admin-password-input");
const loginError = document.querySelector("#login-error");
const btnSubmitLogin = document.querySelector("#btn-submit-login");

// Import Tabs & File Drop elements
const tabCsvFile = document.querySelector("#tab-csv-file");
const tabPasteText = document.querySelector("#tab-paste-text");
const fileDropSection = document.querySelector("#file-drop-section");
const textPasteSection = document.querySelector("#text-paste-section");
const csvFileInput = document.querySelector("#csv-file-input");
const dropContent = document.querySelector("#drop-content");
const fileInfo = document.querySelector("#file-info");
const fileName = document.querySelector("#file-name");
const fileCount = document.querySelector("#file-count");
const btnClearFile = document.querySelector("#btn-clear-file");

// Sales Orders Drop & Table Elements
const orderDropSection = document.querySelector("#order-drop-section");
const orderFileInput = document.querySelector("#order-file-input");
const orderDropContent = document.querySelector("#order-drop-content");
const orderFileInfo = document.querySelector("#order-file-info");
const orderFileName = document.querySelector("#order-file-name");
const orderFileCount = document.querySelector("#order-file-count");
const btnClearOrderFile = document.querySelector("#btn-clear-order-file");
const orderPreviewContainer = document.querySelector("#order-preview-container");
const orderPreviewRows = document.querySelector("#order-preview-rows");
const btnImportOrders = document.querySelector("#btn-import-orders");
const importOrdersBtnLabel = document.querySelector("#import-orders-btn-label");
const orderImportResult = document.querySelector("#order-import-result");
const ordersRows = document.querySelector("#orders-rows");
const searchOrdersInput = document.querySelector("#search-orders-input");
const btnRefreshOrders = document.querySelector("#btn-refresh-orders");

// ASIN Catalog & Code Management Elements
const asinForm = document.querySelector("#asin-form");
const asinCodeInput = document.querySelector("#asin-code");
const asinNetworkSelect = document.querySelector("#asin-network");
const asinTopupSelect = document.querySelector("#asin-topup");
const asinTitleInput = document.querySelector("#asin-title");
const btnSaveAsin = document.querySelector("#btn-save-asin");
const asinResult = document.querySelector("#asin-result");
const asinsRows = document.querySelector("#asins-rows");
const btnRefreshAsins = document.querySelector("#btn-refresh-asins");

// Modal: Update Order ASIN Elements
const modalUpdateAsin = document.querySelector("#modal-update-asin");
const modalAsinClose = document.querySelector("#modal-asin-close");
const modalAsinCancel = document.querySelector("#modal-asin-cancel");
const formUpdateOrderAsin = document.querySelector("#form-update-order-asin");
const modalOrderId = document.querySelector("#modal-order-id");
const modalOrderIdLabel = document.querySelector("#modal-order-id-label");
const modalAsinSelect = document.querySelector("#modal-asin-select");
const modalAsinInput = document.querySelector("#modal-asin-input");
const modalNetwork = document.querySelector("#modal-network");
const modalTopup = document.querySelector("#modal-topup");
const modalAsinResult = document.querySelector("#modal-asin-result");
const modalAsinSubmit = document.querySelector("#modal-asin-submit");

let currentAsinCatalog = {};

let activeStatus = "all";
let parsedFileIccids = [];
let parsedOrders = [];

function getAdminToken() {
  return sessionStorage.getItem("admin_token") || "";
}

function setAdminToken(token) {
  if (token) {
    sessionStorage.setItem("admin_token", token);
    loginModal.hidden = true;
    updateExportLinks(token);
  } else {
    sessionStorage.removeItem("admin_token");
    loginModal.hidden = false;
  }
}

function updateExportLinks(token) {
  if (btnExportRequests) {
    btnExportRequests.href = `/api/admin/export-requests-csv?key=${encodeURIComponent(token)}`;
  }
  if (btnExportInventory) {
    btnExportInventory.href = `/api/admin/export-csv?key=${encodeURIComponent(token)}`;
  }
}

function getAuthHeaders() {
  return {
    "content-type": "application/json",
    Authorization: `Bearer ${getAdminToken()}`
  };
}

// Authentication Check
function checkAuth() {
  const token = getAdminToken();
  if (!token) {
    loginModal.hidden = false;
    return false;
  }
  loginModal.hidden = true;
  updateExportLinks(token);
  return true;
}

// Login form submit
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const password = passwordInput.value.trim();
  if (!password) return;

  btnSubmitLogin.disabled = true;
  btnSubmitLogin.querySelector("span").textContent = "Checking...";

  try {
    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password })
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      loginError.hidden = false;
      loginError.textContent = data.message || "Invalid Admin Password.";
      return;
    }

    setAdminToken(data.token);
    passwordInput.value = "";
    await refreshAll();
  } catch {
    loginError.hidden = false;
    loginError.textContent = "Connection error. Please try again.";
  } finally {
    btnSubmitLogin.disabled = false;
    btnSubmitLogin.querySelector("span").textContent = "Unlock Dashboard";
  }
});

// Logout
if (btnLogout) {
  btnLogout.addEventListener("click", () => {
    setAdminToken("");
    passwordInput.focus();
  });
}

// Tab switching
tabCsvFile.addEventListener("click", () => {
  tabCsvFile.classList.add("active");
  tabPasteText.classList.remove("active");
  fileDropSection.hidden = false;
  textPasteSection.hidden = true;
});

tabPasteText.addEventListener("click", () => {
  tabPasteText.classList.add("active");
  tabCsvFile.classList.remove("active");
  fileDropSection.hidden = true;
  textPasteSection.hidden = false;
});

// File upload / drag and drop handling
fileDropSection.addEventListener("click", (e) => {
  if (e.target !== btnClearFile && !e.target.classList.contains("sample-link")) {
    csvFileInput.click();
  }
});

fileDropSection.addEventListener("dragover", (e) => {
  e.preventDefault();
  fileDropSection.classList.add("drag-over");
});

fileDropSection.addEventListener("dragleave", () => {
  fileDropSection.classList.remove("drag-over");
});

fileDropSection.addEventListener("drop", (e) => {
  e.preventDefault();
  fileDropSection.classList.remove("drag-over");
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    handleFile(e.dataTransfer.files[0]);
  }
});

csvFileInput.addEventListener("change", () => {
  if (csvFileInput.files && csvFileInput.files[0]) {
    handleFile(csvFileInput.files[0]);
  }
});

btnClearFile.addEventListener("click", (e) => {
  e.stopPropagation();
  parsedFileIccids = [];
  csvFileInput.value = "";
  fileInfo.hidden = true;
  dropContent.hidden = false;
  importBtnLabel.textContent = "Import Authorized ICCIDs";
});

function handleFile(file) {
  const isExcel = /\.(xlsx|xls)$/i.test(file.name);
  fileName.textContent = file.name;
  fileCount.textContent = "Parsing file...";
  fileInfo.hidden = false;
  dropContent.hidden = true;

  if (isExcel && typeof XLSX !== "undefined") {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const allMatches = [];

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          for (const row of rows) {
            if (Array.isArray(row)) {
              for (const cell of row) {
                const str = String(cell || "").replace(/\s+/g, "");
                const matches = str.match(/\b\d{18,22}\b/g);
                if (matches) allMatches.push(...matches);
              }
            }
          }
        }

        parsedFileIccids = [...new Set(allMatches)];
        fileCount.textContent = `${parsedFileIccids.length.toLocaleString()} ICCIDs detected in Excel`;
        importBtnLabel.textContent = `Import ${parsedFileIccids.length.toLocaleString()} Authorized ICCIDs`;
      } catch (err) {
        console.error("Excel parse error", err);
        setResult("error", "Could not parse Excel file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  // Fallback / standard CSV/TXT reader
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const matches = text.match(/\b\d{18,22}\b/g) || [];
    parsedFileIccids = [...new Set(matches)];

    fileCount.textContent = `${parsedFileIccids.length.toLocaleString()} ICCIDs detected`;
    importBtnLabel.textContent = `Import ${parsedFileIccids.length.toLocaleString()} Authorized ICCIDs`;
  };
  reader.readAsText(file);
}

function setResult(kind, message) {
  result.hidden = false;
  result.className = `result ${kind}`;
  result.innerHTML = `<strong>${message}</strong>`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

// 1. Refresh Stats
// 1. Refresh Stats
async function refreshStats() {
  if (!getAdminToken()) return;
  try {
    const response = await fetch("/api/admin/summary", { headers: getAuthHeaders() });
    if (response.status === 401) {
      setAdminToken("");
      return;
    }
    const data = await response.json();
    if (!data.ok) return;

    // Fetch verified orders count
    const ordersRes = await fetch("/api/admin/orders", { headers: getAuthHeaders() }).catch(() => null);
    const ordersData = ordersRes ? await ordersRes.json().catch(() => null) : null;
    let ordersCount = 0;
    if (ordersData && ordersData.ok) {
      if (typeof ordersData.total === "number") {
        ordersCount = ordersData.total;
      } else if (Array.isArray(ordersData.orders)) {
        ordersCount = ordersData.orders.length;
      }
    } else if (data.summary && typeof data.summary.verifiedOrdersCount === "number") {
      ordersCount = data.summary.verifiedOrdersCount;
    }

    const totalSims = Number(data.summary.total || 0);
    const availSims = Number(data.summary.available || 0);
    const incomingReqs = Number(data.summary.requestsCount || 0);

    stats.innerHTML = `
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">Total Authorized SIMs</span>
          <span class="stat-icon">💳</span>
        </div>
        <div class="stat-value">${totalSims.toLocaleString()}</div>
        <div class="stat-hint">Registered in stock database</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">Available SIMs</span>
          <span class="stat-icon">🟢</span>
        </div>
        <div class="stat-value">${availSims.toLocaleString()}</div>
        <div class="stat-hint">Ready for customer activation</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">Verified Sales Orders</span>
          <span class="stat-icon">📦</span>
        </div>
        <div class="stat-value">${ordersCount.toLocaleString()}</div>
        <div class="stat-hint">Active Amazon/Sellerboard orders</div>
      </div>
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">Incoming Requests</span>
          <span class="stat-icon">⚡</span>
        </div>
        <div class="stat-value">${incomingReqs.toLocaleString()}</div>
        <div class="stat-hint">Customer submissions received</div>
      </div>
    `;
  } catch (err) {
    console.error("Stats refresh error", err);
  }
}

// 2. Refresh Customer Top-Up Requests Feed
async function refreshRequests() {
  if (!getAdminToken()) return;
  try {
    const response = await fetch("/api/admin/requests", { headers: getAuthHeaders() });
    if (response.status === 401) {
      setAdminToken("");
      return;
    }
    const data = await response.json();
    if (!data.ok) return;

    if (!data.requests || data.requests.length === 0) {
      requestsRows.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center;padding:36px 20px;color:var(--muted);">
            <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
              <span style="font-size:28px;">📥</span>
              <strong style="color:#334155;">No Top-Up Requests Yet</strong>
              <span style="font-size:13px;max-width:380px;">Customer submissions submitted through the portal will appear here in real-time ready for operator processing.</span>
            </div>
          </td>
        </tr>`;
      return;
    }

    requestsRows.innerHTML = data.requests
      .map((r) => `
        <tr>
          <td><code style="font-weight:bold;color:var(--primary);">${r.amazonOrderId}</code></td>
          <td><strong>${r.simIccid}</strong></td>
          <td><span class="badge" style="background:#e8f4fd;color:#0b5394;">${r.networkName}</span></td>
          <td><strong style="color:#146b37;">${r.topUpValue}</strong></td>
          <td><span class="badge activated">ICCID Verified ✓</span></td>
          <td>${r.customerEmail || "-"}</td>
          <td>${formatDate(r.submittedAt)}</td>
        </tr>
      `)
      .join("");
  } catch (err) {
    console.error("Requests refresh error", err);
  }
}

// 3. Refresh SIM Inventory
async function refreshInventory() {
  if (!getAdminToken()) return;
  const search = encodeURIComponent(searchInput ? searchInput.value.trim() : "");
  try {
    const response = await fetch(`/api/admin/iccids?status=${encodeURIComponent(activeStatus)}&search=${search}`, {
      headers: getAuthHeaders()
    });
    if (response.status === 401) {
      setAdminToken("");
      return;
    }
    const data = await response.json();
    if (!data.ok) return;

    if (data.sims.length === 0) {
      inventoryRows.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center;padding:36px 20px;color:var(--muted);">
            <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
              <span style="font-size:28px;">💳</span>
              <strong style="color:#334155;">No Authorized SIMs Found</strong>
              <span style="font-size:13px;max-width:380px;">Use the bulk import tool above to register carrier SIM batches into your database.</span>
            </div>
          </td>
        </tr>`;
      return;
    }

    inventoryRows.innerHTML = data.sims
      .map((sim) => {
        const statusBadge = sim.status === "activated"
          ? '<span class="badge activated">Active / Requested</span>'
          : '<span class="badge available">Available</span>';

        return `
          <tr>
            <td><strong>${sim.iccid}</strong></td>
            <td>${statusBadge}</td>
            <td>${sim.network || "-"}</td>
            <td>${sim.lastTopUpValue || "-"}</td>
            <td>${sim.orderId || "-"}</td>
            <td>${sim.rechargesCount || 0}</td>
            <td>${sim.customerEmail || "-"}</td>
            <td>${sim.batchId || "-"}</td>
            <td>${formatDate(sim.createdAt)}</td>
          </tr>
        `;
      })
      .join("");
  } catch (err) {
    console.error("Inventory refresh error", err);
  }
}

async function refreshAll() {
  if (checkAuth()) {
    await Promise.all([refreshStats(), refreshRequests(), refreshInventory(), refreshOrders(), refreshAsinCatalog()]);
  }
}

// 4. Refresh Verified Orders Table
async function refreshOrders() {
  if (!getAdminToken() || !ordersRows) return;
  try {
    const search = searchOrdersInput ? searchOrdersInput.value.trim() : "";
    const response = await fetch(`/api/admin/orders?search=${encodeURIComponent(search)}`, { headers: getAuthHeaders() });
    if (response.status === 401) {
      setAdminToken("");
      return;
    }
    const data = await response.json();
    if (!data.ok) return;

    if (!data.orders || data.orders.length === 0) {
      ordersRows.innerHTML = `
        <tr>
          <td colspan="10" style="text-align:center;padding:36px 20px;color:var(--muted);">
            <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
              <span style="font-size:28px;">📦</span>
              <strong style="color:#334155;">No Verified Orders Found</strong>
              <span style="font-size:13px;max-width:380px;">Upload your daily sales report above or search with another term.</span>
            </div>
          </td>
        </tr>`;
      return;
    }

    ordersRows.innerHTML = data.orders
      .map((o) => {
        const isClaimed = o.status === "claimed";
        const statusBadge = isClaimed
          ? `<span class="badge activated">Redeemed ✓</span>`
          : `<span class="badge available">Unclaimed</span>`;
        const asinBadge = o.asin
          ? `<span class="asin-badge">${o.asin}</span>`
          : `<span class="asin-badge none">Not Assigned</span>`;

        return `
          <tr>
            <td><code style="font-weight:bold;color:var(--primary);">${o.orderId}</code></td>
            <td>${asinBadge}</td>
            <td><span class="badge" style="background:#e8f4fd;color:#0b5394;">${o.network}</span></td>
            <td><strong style="color:#146b37;">${o.topUpValue}</strong></td>
            <td><small>${o.itemTitle || o.sku || "-"}</small></td>
            <td>${statusBadge}</td>
            <td>${o.claimedIccid ? `<code>${o.claimedIccid}</code>` : "-"}</td>
            <td><span class="badge" style="background:#f0f4f8;color:var(--muted);">${o.source === "email_alert" ? "✉ Email Alert" : "📄 CSV Report"}</span></td>
            <td>${formatDate(o.createdAt)}</td>
            <td>
              <button type="button" class="btn-sm btn-edit-order-asin" data-order-id="${o.orderId}" data-asin="${o.asin || ""}" data-network="${o.network || ""}" data-topup="${o.topUpValue || ""}" data-title="${encodeURIComponent(o.itemTitle || "")}">✏️ Update ASIN</button>
            </td>
          </tr>
        `;
      })
      .join("");
  } catch (err) {
    console.error("Orders refresh error", err);
  }
}

if (btnRefreshRequests) {
  btnRefreshRequests.addEventListener("click", refreshRequests);
}

// Bulk form submit handler
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  result.hidden = true;

  if (!checkAuth()) return;

  let iccidsToImport = [];
  if (!fileDropSection.hidden && parsedFileIccids.length > 0) {
    iccidsToImport = parsedFileIccids;
  } else {
    const raw = String(form.elements.iccids.value || "");
    const matches = raw.match(/\b\d{18,22}\b/g) || [];
    iccidsToImport = [...new Set(matches)];
  }

  if (iccidsToImport.length === 0) {
    setResult("error", "No valid 18-22 digit ICCIDs found. Please upload a CSV file or paste ICCIDs.");
    return;
  }

  submitButton.disabled = true;
  importBtnLabel.textContent = `Importing ${iccidsToImport.length} SIMs...`;

  try {
    const response = await fetch("/api/admin/iccid-bulk", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        ecommerce: form.elements.ecommerce.value,
        batchId: form.elements.batchId.value,
        network: form.elements.network.value,
        iccids: iccidsToImport
      })
    });

    if (response.status === 401) {
      setAdminToken("");
      return;
    }

    const data = await response.json();

    if (!response.ok || !data.ok) {
      setResult("error", data.message || "Import failed.");
      return;
    }

    setResult("success", `✓ Successfully imported ${data.added} new ICCIDs to authorized database. Skipped ${data.skipped} duplicates.`);
    if (form.elements.iccids) form.elements.iccids.value = "";
    btnClearFile.click();
    await refreshAll();
  } catch {
    setResult("error", "Network error. Please try again.");
  } finally {
    submitButton.disabled = false;
    importBtnLabel.textContent = "Import Authorized ICCIDs";
  }
});

// Search input debounced
let searchTimeout;
if (searchInput) {
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      refreshInventory();
    }, 300);
  });
}

// Sales Orders File Drop & Parse
if (orderDropSection && orderFileInput) {
  orderDropSection.addEventListener("click", () => orderFileInput.click());
  orderDropSection.addEventListener("dragover", (e) => {
    e.preventDefault();
    orderDropSection.classList.add("drag-over");
  });
  orderDropSection.addEventListener("dragleave", () => orderDropSection.classList.remove("drag-over"));
  orderDropSection.addEventListener("drop", (e) => {
    e.preventDefault();
    orderDropSection.classList.remove("drag-over");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleOrderFile(e.dataTransfer.files[0]);
    }
  });

  orderFileInput.addEventListener("change", () => {
    if (orderFileInput.files && orderFileInput.files[0]) {
      handleOrderFile(orderFileInput.files[0]);
    }
  });
}

if (btnClearOrderFile) {
  btnClearOrderFile.addEventListener("click", (e) => {
    e.stopPropagation();
    parsedOrders = [];
    orderFileInput.value = "";
    orderFileInfo.hidden = true;
    orderDropContent.hidden = false;
    orderPreviewContainer.hidden = true;
    orderImportResult.hidden = true;
  });
}

function handleOrderFile(file) {
  const isExcel = /\.(xlsx|xls)$/i.test(file.name);
  orderFileName.textContent = file.name;
  orderFileCount.textContent = "Parsing orders...";
  orderFileInfo.hidden = false;
  orderDropContent.hidden = true;
  orderImportResult.hidden = true;

  const processRows = (rows) => {
    parsedOrders = parseOrderRows(rows);
    const activeCount = parsedOrders.filter((o) => o.status !== "cancelled").length;
    const cancelledCount = parsedOrders.length - activeCount;

    orderFileCount.textContent = cancelledCount > 0
      ? `${activeCount} Active orders (${cancelledCount} Returns/Cancelled flagged)`
      : `${parsedOrders.length.toLocaleString()} Orders detected`;
    importOrdersBtnLabel.textContent = `Confirm & Import ${parsedOrders.length.toLocaleString()} Verified Orders`;

    if (parsedOrders.length > 0) {
      orderPreviewContainer.hidden = false;
      orderPreviewRows.innerHTML = parsedOrders.slice(0, 10).map((o) => `
        <tr>
          <td><code>${o.orderId}</code></td>
          <td>${o.asin ? `<span class="asin-badge">${o.asin}</span>` : '<span class="asin-badge none">-</span>'}</td>
          <td><span class="badge" style="background:#e8f4fd;color:#0b5394;">${o.network}</span></td>
          <td><strong style="color:#146b37;">${o.topUpValue}</strong></td>
          <td><small>${o.itemTitle || o.sku}</small></td>
          <td>${o.status === "cancelled" ? '<span class="badge" style="background:#fee2e2;color:#991b1b;font-weight:700;">Returned / Cancelled</span>' : '<span class="badge available">Active Order</span>'}</td>
        </tr>
      `).join("") + (parsedOrders.length > 10 ? `<tr><td colspan="6" style="text-align:center;color:var(--muted);font-style:italic;">...and ${parsedOrders.length - 10} more orders ready to import</td></tr>` : "");
    } else {
      orderPreviewContainer.hidden = true;
      orderImportResult.hidden = false;
      orderImportResult.className = "result error";
      orderImportResult.innerHTML = "<strong>No Order IDs (format 123-1234567-1234567) found in this file.</strong>";
    }
  };

  if (isExcel && typeof XLSX !== "undefined") {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const allRows = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const sheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          allRows.push(...sheetRows);
        }
        processRows(allRows);
      } catch (err) {
        orderImportResult.hidden = false;
        orderImportResult.className = "result error";
        orderImportResult.textContent = "Excel parse error: " + err.message;
      }
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  // Fallback CSV / TSV / Semicolon reader
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const lines = text.split(/\r?\n/).filter(Boolean);
    const rows = lines.map((l) => l.split(/[\t,;]/).map((c) => c.replace(/^"|"$/g, "").trim()));
    processRows(rows);
  };
  reader.readAsText(file);
}

let ASIN_CATALOG = {
  "B0FN4LXYM7": { network: "THREE", topUp: "£10", title: "Three £10 Topup" },
  "B0FLZ8Z84T": { network: "EE", topUp: "£10", title: "EE £10 Topup" },
  "B0FLM3DNMQ": { network: "O2", topUp: "£10", title: "O2 £10 Topup" },
  "B017M2ZZ3A": { network: "O2", topUp: "£15", title: "O2 £15 Big Bundle" },
  "B01M2XS5GL": { network: "EE", topUp: "£15", title: "EE £15 Data Pack" },
  "B0GZKJCQ9R": { network: "EE", topUp: "£15", title: "EE 20GB (£15)" },
  "B0GZKNYBKR": { network: "EE", topUp: "£15", title: "EE 25GB/30GB (£15)" },
  "B0GZKKK685": { network: "EE", topUp: "£15", title: "EE SIM Pack (£15)" },
  "B01N1L2YCE": { network: "EE", topUp: "£20", title: "EE 50GB (£20)" },
  "B016MWIMRW": { network: "EE", topUp: "£10", title: "EE 3-in-1 SIM" },
  "B0DYKW3CK1": { network: "THREE", topUp: "£10", title: "Three 40GB (£10)" },
  "B0888G1C16": { network: "THREE", topUp: "£10", title: "Three Mobile PAYG SIM" },
  "B000TIY0EK": { network: "THREE", topUp: "£10", title: "Network 3 PAYG SIM" },
  "B0D6W46FJK": { network: "THREE", topUp: "£10", title: "SMARTY (Three) SIM" },
  "B0002GDK2C": { network: "O2", topUp: "£10", title: "O2 PAYG SIM Blue" },
  "B08265GRSP": { network: "O2", topUp: "£15", title: "O2 Big Bundle Unlimited" },
  "B08KHDBZK5": { network: "O2", topUp: "£10", title: "Giffgaff/O2 PAYG SIM" },
  "B01M5GWY1N": { network: "O2", topUp: "£10", title: "Giffgaff Triple SIM" },
  "B0189VSP3U": { network: "O2", topUp: "£10", title: "Giffgaff O2 4G Multi SIM" },
  "B017TKT978": { network: "O2", topUp: "£10", title: "Giffgaff Nano SIM" },
  "B07DLYWX6W": { network: "O2", topUp: "£10", title: "Vodafone/VOXI SIM" },
  "B0FQ5LH556": { network: "O2", topUp: "£10", title: "VOXI SIM (£10)" }
};

function parseOrderRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  let headerRowIdx = -1;
  let orderIdCol = -1;
  let skuCol = -1;
  let titleCol = -1;
  let priceCol = -1;
  let statusCol = -1;
  let asinCol = -1;

  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const row = rows[r];
    if (Array.isArray(row)) {
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || "").trim().toLowerCase().replace(/["_\s-]/g, "");
        if (val === "orderid" || val === "amazonorderid") orderIdCol = c;
        if (val === "sku" || val === "merchantsku" || val === "sellersku") skuCol = c;
        if (val === "asin") asinCol = c;
        if (val === "productname" || val === "itemname" || val === "title" || val === "itemtitle" || val === "products") titleCol = c;
        if (val === "itemprice" || val === "price" || val === "amount" || val === "ordertotalamount") priceCol = c;
        if (val === "orderstatus" || val === "itemstatus" || val === "status") statusCol = c;
      }
      if (orderIdCol !== -1) {
        headerRowIdx = r;
        break;
      }
    }
  }

  const detectedOrders = [];
  const startRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;

    let orderId = "";
    if (orderIdCol !== -1) {
      orderId = String(row[orderIdCol] || "").trim().toUpperCase();
    } else {
      for (const cell of row) {
        const match = String(cell || "").match(/\b\d{3}-\d{7}-\d{7}\b/);
        if (match) {
          orderId = match[0];
          break;
        }
      }
    }

    if (!/^\d{3}-\d{7}-\d{7}$/.test(orderId)) continue;

    const rowText = row.map((c) => String(c || "")).join(" ");
    const rawStatus = statusCol !== -1 ? String(row[statusCol] || "").trim().toLowerCase() : "";
    const isCancelled = rawStatus === "return" || rawStatus === "cancelled" || rawStatus === "refunded";

    let asin = asinCol !== -1 ? String(row[asinCol] || "").trim().toUpperCase() : "";
    if (!asin && titleCol !== -1) {
      const matchAsin = String(row[titleCol] || "").match(/\bB0[0-9A-Z]{8}\b/);
      if (matchAsin) asin = matchAsin[0];
    }
    if (!asin) {
      const matchAsin = rowText.match(/\bB0[0-9A-Z]{8}\b/);
      if (matchAsin) asin = matchAsin[0];
    }

    const catalogEntry = asin && ASIN_CATALOG[asin] ? ASIN_CATALOG[asin] : null;

    let network = "EE";
    if (catalogEntry) {
      network = catalogEntry.network;
    } else if (/\b(?:O2|O 2|Giffgaff)\b/i.test(rowText)) {
      network = "O2";
    } else if (/\b(?:THREE|3 UK|Three UK|Network 3|3 Mobile|Smarty)\b/i.test(rowText)) {
      network = "THREE";
    } else if (/\b(?:EE|Everything Everywhere)\b/i.test(rowText)) {
      network = "EE";
    }

    let topUpValue = "£15";
    if (catalogEntry) {
      topUpValue = catalogEntry.topUp;
    } else {
      const priceRaw = priceCol !== -1 ? String(row[priceCol] || "").trim() : "";
      const priceMatch = (priceRaw + " " + rowText).match(/(?:£|GBP\s*|price[:\s]*£?)\s*(10|15|20|30|35)(?:\.00)?\b/i) ||
                         (priceRaw + " " + rowText).match(/\b(10|15|20|30|35)\s*(?:pounds|gbp|top\s*up)/i);
      if (priceMatch) {
        topUpValue = `£${priceMatch[1]}`;
      } else {
        if (rowText.includes("£35") || rowText.includes("35.00")) topUpValue = "£35";
        else if (rowText.includes("£30") || rowText.includes("30.00")) topUpValue = "£30";
        else if (rowText.includes("£20") || rowText.includes("20.00") || rowText.includes("50GB")) topUpValue = "£20";
        else if (rowText.includes("£15") || rowText.includes("15.00") || rowText.includes("20GB")) topUpValue = "£15";
        else if (rowText.includes("£10") || rowText.includes("10.00") || rowText.includes("40GB")) topUpValue = "£10";
      }
    }

    const sku = skuCol !== -1 ? String(row[skuCol] || "").trim() : "";
    const title = catalogEntry ? catalogEntry.title : (titleCol !== -1 ? String(row[titleCol] || "").trim() : (sku || "Order Item"));
    const priceRaw = priceCol !== -1 ? String(row[priceCol] || "").trim() : "";

    detectedOrders.push({
      orderId,
      network,
      topUpValue,
      itemTitle: isCancelled ? `${title} [RETURNED]` : title,
      sku,
      asin,
      itemPrice: priceRaw || topUpValue.replace("£", ""),
      status: isCancelled ? "cancelled" : "unclaimed"
    });
  }

  const uniqueMap = new Map();
  for (const ord of detectedOrders) {
    if (!uniqueMap.has(ord.orderId)) uniqueMap.set(ord.orderId, ord);
  }
  return Array.from(uniqueMap.values());
}

if (btnImportOrders) {
  btnImportOrders.addEventListener("click", async () => {
    if (!checkAuth() || parsedOrders.length === 0) return;
    btnImportOrders.disabled = true;
    importOrdersBtnLabel.textContent = `Importing ${parsedOrders.length} orders...`;
    orderImportResult.hidden = true;

    try {
      const response = await fetch("/api/admin/orders-bulk", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ orders: parsedOrders })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        orderImportResult.hidden = false;
        orderImportResult.className = "result error";
        orderImportResult.textContent = data.message || "Failed to import orders.";
        return;
      }
      orderImportResult.hidden = false;
      orderImportResult.className = "result success";
      orderImportResult.innerHTML = `✓ <strong>Success:</strong> Imported ${data.inserted} new orders (${data.updated} updated). Customer selections on website are now strictly validated!`;
      btnClearOrderFile.click();
      await refreshAll();
    } catch {
      orderImportResult.hidden = false;
      orderImportResult.className = "result error";
      orderImportResult.textContent = "Network error. Please try again.";
    } finally {
      btnImportOrders.disabled = false;
      importOrdersBtnLabel.textContent = "Confirm & Import Verified Orders";
    }
  });
}

if (btnRefreshOrders) {
  btnRefreshOrders.addEventListener("click", refreshOrders);
}

if (searchOrdersInput) {
  let searchOrdersTimeout;
  searchOrdersInput.addEventListener("input", () => {
    clearTimeout(searchOrdersTimeout);
    searchOrdersTimeout = setTimeout(refreshOrders, 300);
  });
}

tabs.forEach((tab) => {
  tab.addEventListener("click", async () => {
    activeStatus = tab.dataset.status;
    tabs.forEach((item) => item.classList.toggle("active", item === tab));
    await refreshInventory();
  });
});

// 5. ASIN Catalog & Code Management Logic
async function refreshAsinCatalog() {
  if (!getAdminToken() || !asinsRows) return;
  try {
    let asins = {};
    const res = await fetch("/api/admin/asins", { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.asins) {
        asins = data.asins;
      }
    } else {
      // Fallback to static JSON
      const fallbackRes = await fetch("/asin-catalog.json").catch(() => null);
      if (fallbackRes && fallbackRes.ok) {
        asins = await fallbackRes.json();
      }
    }

    currentAsinCatalog = asins;
    ASIN_CATALOG = Object.assign({}, ASIN_CATALOG, asins);

    const list = Object.values(asins);
    if (list.length === 0) {
      asinsRows.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center;padding:24px;color:var(--muted);">
            No ASIN codes registered yet. Add your first product ASIN above.
          </td>
        </tr>`;
    } else {
      asinsRows.innerHTML = list
        .sort((a, b) => a.asin.localeCompare(b.asin))
        .map((a) => `
          <tr>
            <td><span class="asin-badge">${a.asin}</span></td>
            <td><span class="badge" style="background:#e8f4fd;color:#0b5394;">${a.network}</span></td>
            <td><strong style="color:#146b37;">${a.topUp}</strong></td>
            <td>${a.title || "-"}</td>
            <td>
              <div style="display:flex;gap:6px;">
                <button type="button" class="btn-sm btn-edit-asin" data-asin="${a.asin}" data-network="${a.network}" data-topup="${a.topUp}" data-title="${encodeURIComponent(a.title || "")}">Edit</button>
                <button type="button" class="btn-sm btn-danger-sm btn-del-asin" data-asin="${a.asin}">Delete</button>
              </div>
            </td>
          </tr>
        `)
        .join("");
    }

    // Populate modal ASIN select options
    if (modalAsinSelect) {
      const currentSelected = modalAsinSelect.value;
      modalAsinSelect.innerHTML = `<option value="">-- Choose from Catalog --</option>` +
        list
          .sort((a, b) => `${a.network} ${a.topUp}`.localeCompare(`${b.network} ${b.topUp}`))
          .map((a) => `<option value="${a.asin}">${a.asin} - ${a.network} ${a.topUp} (${a.title || "Topup"})</option>`)
          .join("");
      modalAsinSelect.value = currentSelected;
    }
  } catch (err) {
    console.error("ASIN catalog refresh error", err);
  }
}

if (btnRefreshAsins) {
  btnRefreshAsins.addEventListener("click", refreshAsinCatalog);
}

// ASIN Form Submit
if (asinForm) {
  asinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!checkAuth()) return;

    const asin = String(asinCodeInput ? asinCodeInput.value : "").trim().toUpperCase();
    const network = String(asinNetworkSelect ? asinNetworkSelect.value : "").trim();
    const topUp = String(asinTopupSelect ? asinTopupSelect.value : "").trim();
    const title = String(asinTitleInput ? asinTitleInput.value : "").trim();

    if (!asin || !network || !topUp) {
      if (asinResult) {
        asinResult.hidden = false;
        asinResult.className = "result error";
        asinResult.textContent = "Please provide valid ASIN, Network, and Top-Up value.";
      }
      return;
    }

    if (btnSaveAsin) btnSaveAsin.disabled = true;

    try {
      const response = await fetch("/api/admin/asins", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ asin, network, topUp, title })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        if (asinResult) {
          asinResult.hidden = false;
          asinResult.className = "result error";
          asinResult.textContent = data.message || "Failed to save ASIN.";
        }
        return;
      }

      if (asinResult) {
        asinResult.hidden = false;
        asinResult.className = "result success";
        asinResult.innerHTML = `✓ <strong>ASIN Registered:</strong> ${asin} mapped to <strong>${network} ${topUp}</strong> (${title || "Topup"}).`;
      }

      if (asinCodeInput) asinCodeInput.value = "";
      if (asinTitleInput) asinTitleInput.value = "";
      await refreshAsinCatalog();
      await refreshOrders();
    } catch {
      if (asinResult) {
        asinResult.hidden = false;
        asinResult.className = "result error";
        asinResult.textContent = "Network error. Please try again.";
      }
    } finally {
      if (btnSaveAsin) btnSaveAsin.disabled = false;
    }
  });
}

// ASIN table click delegation (Edit / Delete)
if (asinsRows) {
  asinsRows.addEventListener("click", async (e) => {
    const editBtn = e.target.closest(".btn-edit-asin");
    if (editBtn) {
      const asin = editBtn.dataset.asin;
      const network = editBtn.dataset.network;
      const topup = editBtn.dataset.topup;
      const title = decodeURIComponent(editBtn.dataset.title || "");
      if (asinCodeInput) asinCodeInput.value = asin;
      if (asinNetworkSelect) asinNetworkSelect.value = network;
      if (asinTopupSelect) asinTopupSelect.value = topup;
      if (asinTitleInput) asinTitleInput.value = title;
      if (asinForm) {
        asinForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
        if (asinCodeInput) asinCodeInput.focus();
      }
      return;
    }

    const delBtn = e.target.closest(".btn-del-asin");
    if (delBtn) {
      const asin = delBtn.dataset.asin;
      if (!confirm(`Are you sure you want to remove ASIN ${asin} from the catalog?`)) return;
      try {
        const response = await fetch(`/api/admin/asins?asin=${encodeURIComponent(asin)}`, {
          method: "DELETE",
          headers: getAuthHeaders()
        });
        const data = await response.json();
        if (response.ok && data.ok) {
          await refreshAsinCatalog();
        } else {
          alert(data.message || "Could not delete ASIN.");
        }
      } catch {
        alert("Network error deleting ASIN.");
      }
    }
  });
}

// Orders table click delegation for Update ASIN
if (ordersRows) {
  ordersRows.addEventListener("click", (e) => {
    const editBtn = e.target.closest(".btn-edit-order-asin");
    if (editBtn) {
      const orderId = editBtn.dataset.orderId;
      const asin = editBtn.dataset.asin || "";
      const network = editBtn.dataset.network || "THREE";
      const topup = editBtn.dataset.topup || "£10";

      if (modalOrderId) modalOrderId.value = orderId;
      if (modalOrderIdLabel) modalOrderIdLabel.textContent = orderId;
      if (modalAsinInput) modalAsinInput.value = asin;
      if (modalNetwork) modalNetwork.value = network;
      if (modalTopup) modalTopup.value = topup;

      if (modalAsinSelect) {
        modalAsinSelect.value = asin;
      }

      if (modalAsinResult) modalAsinResult.hidden = true;
      if (modalUpdateAsin) modalUpdateAsin.hidden = false;
    }
  });
}

// Modal ASIN Select change handler
if (modalAsinSelect) {
  modalAsinSelect.addEventListener("change", () => {
    const selected = modalAsinSelect.value;
    if (selected && currentAsinCatalog[selected]) {
      const entry = currentAsinCatalog[selected];
      if (modalAsinInput) modalAsinInput.value = entry.asin;
      if (modalNetwork) modalNetwork.value = entry.network;
      if (modalTopup) modalTopup.value = entry.topUp;
    } else if (!selected) {
      if (modalAsinInput) modalAsinInput.value = "";
    }
  });
}

// Modal ASIN Input auto-match
if (modalAsinInput) {
  modalAsinInput.addEventListener("input", () => {
    const val = modalAsinInput.value.trim().toUpperCase();
    if (currentAsinCatalog[val]) {
      const entry = currentAsinCatalog[val];
      if (modalAsinSelect) modalAsinSelect.value = val;
      if (modalNetwork) modalNetwork.value = entry.network;
      if (modalTopup) modalTopup.value = entry.topUp;
    }
  });
}

// Modal Form submit
if (formUpdateOrderAsin) {
  formUpdateOrderAsin.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!checkAuth()) return;

    const orderId = String(modalOrderId ? modalOrderId.value : "").trim();
    const asin = String(modalAsinInput ? modalAsinInput.value : "").trim().toUpperCase();
    const network = String(modalNetwork ? modalNetwork.value : "").trim();
    const topUpValue = String(modalTopup ? modalTopup.value : "").trim();

    if (!orderId) return;

    if (modalAsinSubmit) modalAsinSubmit.disabled = true;

    try {
      const response = await fetch("/api/admin/orders/update-asin", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ orderId, asin, network, topUpValue })
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        if (modalAsinResult) {
          modalAsinResult.hidden = false;
          modalAsinResult.className = "result error";
          modalAsinResult.textContent = data.message || "Failed to update order ASIN.";
        }
        return;
      }

      if (modalAsinResult) {
        modalAsinResult.hidden = false;
        modalAsinResult.className = "result success";
        modalAsinResult.innerHTML = `✓ <strong>Updated:</strong> Order ${orderId} assigned to ASIN <code>${asin || "None"}</code> (${network} ${topUpValue}).`;
      }

      await refreshOrders();

      setTimeout(() => {
        if (modalUpdateAsin) modalUpdateAsin.hidden = true;
      }, 900);
    } catch {
      if (modalAsinResult) {
        modalAsinResult.hidden = false;
        modalAsinResult.className = "result error";
        modalAsinResult.textContent = "Network error updating order.";
      }
    } finally {
      if (modalAsinSubmit) modalAsinSubmit.disabled = false;
    }
  });
}

// Close Modal events
function closeModal() {
  if (modalUpdateAsin) modalUpdateAsin.hidden = true;
}

if (modalAsinClose) modalAsinClose.addEventListener("click", closeModal);
if (modalAsinCancel) modalAsinCancel.addEventListener("click", closeModal);
if (modalUpdateAsin) {
  modalUpdateAsin.addEventListener("click", (e) => {
    if (e.target === modalUpdateAsin) closeModal();
  });
}

refreshAll();
setInterval(refreshAll, 10000);

