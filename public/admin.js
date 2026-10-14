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

let activeStatus = "all";
let parsedFileIccids = [];

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
    stats.innerHTML = `
      <span>Total Authorized SIMs: ${data.summary.total}</span>
      <span>Available SIMs: ${data.summary.available}</span>
      <span>Activated SIMs: ${data.summary.activated}</span>
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
    await Promise.all([refreshStats(), refreshRequests(), refreshInventory()]);
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

tabs.forEach((tab) => {
  tab.addEventListener("click", async () => {
    activeStatus = tab.dataset.status;
    tabs.forEach((item) => item.classList.toggle("active", item === tab));
    await refreshInventory();
  });
});

refreshAll();
setInterval(refreshAll, 10000);
