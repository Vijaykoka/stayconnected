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

// Amazon Orders Drop & Table Elements
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
    const ordersCount = ordersData && ordersData.ok ? ordersData.total : 0;

    stats.innerHTML = `
      <span>Total Authorized SIMs: ${data.summary.total}</span>
      <span>Available SIMs: ${data.summary.available}</span>
      <span>Verified Orders: ${ordersCount}</span>
      <span>Incoming Requests: ${data.summary.requestsCount || 0}</span>
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
      requestsRows.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted);">No top-up requests received yet. Customer submissions will appear here in real-time.</td></tr>';
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
      inventoryRows.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--muted);">No SIM records found.</td></tr>';
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
    await Promise.all([refreshStats(), refreshRequests(), refreshInventory(), refreshOrders()]);
  }
}

// 4. Refresh Verified Amazon Orders Table
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
      ordersRows.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted);">No verified Amazon orders in database. Upload your daily report or receive email alerts to populate this table.</td></tr>';
      return;
    }

    ordersRows.innerHTML = data.orders
      .map((o) => {
        const isClaimed = o.status === "claimed";
        const statusBadge = isClaimed
          ? `<span class="badge activated">Redeemed ✓</span>`
          : `<span class="badge available">Unclaimed</span>`;
        return `
          <tr>
            <td><code style="font-weight:bold;color:var(--primary);">${o.orderId}</code></td>
            <td><span class="badge" style="background:#e8f4fd;color:#0b5394;">${o.network}</span></td>
            <td><strong style="color:#146b37;">${o.topUpValue}</strong></td>
            <td><small>${o.itemTitle || o.sku || "-"}</small></td>
            <td>${statusBadge}</td>
            <td>${o.claimedIccid ? `<code>${o.claimedIccid}</code>` : "-"}</td>
            <td><span class="badge" style="background:#f0f4f8;color:var(--muted);">${o.source === "email_alert" ? "✉ Email Alert" : "📄 CSV Report"}</span></td>
            <td>${formatDate(o.createdAt)}</td>
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

// Amazon Orders File Drop & Parse
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
    parsedOrders = parseAmazonOrderRows(rows);
    orderFileCount.textContent = `${parsedOrders.length.toLocaleString()} Amazon orders detected`;
    importOrdersBtnLabel.textContent = `Confirm & Import ${parsedOrders.length.toLocaleString()} Verified Orders`;

    if (parsedOrders.length > 0) {
      orderPreviewContainer.hidden = false;
      orderPreviewRows.innerHTML = parsedOrders.slice(0, 10).map((o) => `
        <tr>
          <td><code>${o.orderId}</code></td>
          <td><span class="badge" style="background:#e8f4fd;color:#0b5394;">${o.network}</span></td>
          <td><strong style="color:#146b37;">${o.topUpValue}</strong></td>
          <td><small>${o.itemTitle || o.sku}</small></td>
          <td>${o.itemPrice ? `£${o.itemPrice}` : o.topUpValue}</td>
        </tr>
      `).join("") + (parsedOrders.length > 10 ? `<tr><td colspan="5" style="text-align:center;color:var(--muted);font-style:italic;">...and ${parsedOrders.length - 10} more orders ready to import</td></tr>` : "");
    } else {
      orderPreviewContainer.hidden = true;
      orderImportResult.hidden = false;
      orderImportResult.className = "result error";
      orderImportResult.innerHTML = "<strong>No Amazon Order IDs (format 123-1234567-1234567) found in this file.</strong>";
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

function parseAmazonOrderRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  let headerRowIdx = -1;
  let orderIdCol = -1;
  let skuCol = -1;
  let titleCol = -1;
  let priceCol = -1;

  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const row = rows[r];
    if (Array.isArray(row)) {
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || "").trim().toLowerCase().replace(/["_\s-]/g, "");
        if (val === "orderid" || val === "amazonorderid") orderIdCol = c;
        if (val === "sku" || val === "merchantsku" || val === "sellersku") skuCol = c;
        if (val === "productname" || val === "itemname" || val === "title" || val === "itemtitle" || val === "products") titleCol = c;
        if (val === "itemprice" || val === "price" || val === "amount" || val === "ordertotalamount") priceCol = c;
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
    const sku = skuCol !== -1 ? String(row[skuCol] || "").trim() : "";
    const title = titleCol !== -1 ? String(row[titleCol] || "").trim() : "";
    const priceRaw = priceCol !== -1 ? String(row[priceCol] || "").trim() : "";

    let network = "EE";
    if (/\b(?:O2|O 2)\b/i.test(rowText)) network = "O2";
    else if (/\b(?:EE|Everything Everywhere)\b/i.test(rowText)) network = "EE";
    else if (/\b(?:THREE|3 UK|Three UK)\b/i.test(rowText)) network = "THREE";

    let topUpValue = "£15";
    const priceMatch = (priceRaw + " " + rowText).match(/(?:£|GBP\s*|price[:\s]*£?)\s*(10|15|20|30|35)(?:\.00)?\b/i) ||
                       (priceRaw + " " + rowText).match(/\b(10|15|20|30|35)\s*(?:pounds|gbp|top\s*up)/i);
    if (priceMatch) {
      topUpValue = `£${priceMatch[1]}`;
    } else {
      if (rowText.includes("£35") || rowText.includes("35.00")) topUpValue = "£35";
      else if (rowText.includes("£30") || rowText.includes("30.00")) topUpValue = "£30";
      else if (rowText.includes("£20") || rowText.includes("20.00")) topUpValue = "£20";
      else if (rowText.includes("£15") || rowText.includes("15.00")) topUpValue = "£15";
      else if (rowText.includes("£10") || rowText.includes("10.00")) topUpValue = "£10";
    }

    detectedOrders.push({
      orderId,
      network,
      topUpValue,
      itemTitle: title || sku || "Amazon Order",
      sku,
      itemPrice: priceRaw || topUpValue.replace("£", "")
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
      orderImportResult.innerHTML = `✓ <strong>Success:</strong> Imported ${data.inserted} new Amazon orders (${data.updated} updated). Customer selections on website are now strictly validated!`;
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

refreshAll();
setInterval(refreshAll, 10000);

