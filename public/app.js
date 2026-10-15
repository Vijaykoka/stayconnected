const form = document.querySelector("#topup-form");
const result = document.querySelector("#result");
const submitButton = document.querySelector("#submit-button");
const networkSelect = document.querySelector("#networkName");
const topUpValueSelect = document.querySelector("#topUpValue");
const btnValidateIccid = document.querySelector("#btn-validate-iccid");
const iccidStatusBox = document.querySelector("#iccid-status-box");
const orderStatusBox = document.querySelector("#order-status-box");
const receiptCard = document.querySelector("#receipt-card");
const btnSubmitAnother = document.querySelector("#btn-submit-another");
const urlParams = new URLSearchParams(window.location.search);

let verifiedOrder = null;

const INVALID_ICCID_MSG = "Invalid ICCID. This SIM card is not registered in our database and does not belong to us.";

const DEFAULT_NETWORK_TOPUPS = {
  "O2": ["£10", "£15", "£20", "£30"],
  "EE": ["£10", "£15", "£20", "£30", "£35"],
  "THREE": ["£10", "£15", "£20", "£35"]
};

let currentNetworkTopUps = DEFAULT_NETWORK_TOPUPS;

function updateTopUpOptions(network, presetValue) {
  const values = currentNetworkTopUps[network] || [];
  topUpValueSelect.innerHTML = "";

  if (!network || values.length === 0) {
    topUpValueSelect.innerHTML = '<option value="">-- Select network first --</option>';
    topUpValueSelect.disabled = true;
    return;
  }

  topUpValueSelect.disabled = false;
  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = `-- Select ${network} Top-Up --`;
  topUpValueSelect.appendChild(defaultOpt);

  for (const val of values) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = val;
    topUpValueSelect.appendChild(opt);
  }

  if (presetValue && values.includes(presetValue)) {
    topUpValueSelect.value = presetValue;
  }
}

networkSelect.addEventListener("change", () => {
  updateTopUpOptions(networkSelect.value);
});

// Load Networks and Top-Up Values from config
async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    const data = await res.json();
    if (data.ok && data.config) {
      if (data.config.networkTopUpValues) {
        currentNetworkTopUps = data.config.networkTopUpValues;
      }

      if (Array.isArray(data.config.networks) && data.config.networks.length > 0) {
        networkSelect.innerHTML = '<option value="">-- Select Network --</option>';
        for (const net of data.config.networks) {
          const opt = document.createElement("option");
          opt.value = net;
          opt.textContent = net;
          networkSelect.appendChild(opt);
        }
      }

      const initialNet = urlParams.get("network") || urlParams.get("networkName");
      const initialVal = urlParams.get("topUpValue") || urlParams.get("value") || urlParams.get("plan");

      if (initialNet) {
        networkSelect.value = initialNet;
        updateTopUpOptions(initialNet, initialVal);
      } else {
        updateTopUpOptions("");
      }
    }
  } catch (err) {
    console.error("Config load error", err);
    updateTopUpOptions("");
  }
}

// Prefill form from URL query parameters (e.g. from QR code)
for (const field of ["orderId", "iccid", "email"]) {
  const val = urlParams.get(field);
  if (val && form.elements[field]) form.elements[field].value = val;
}

function clearFieldErrors() {
  document.querySelectorAll(".field-error-msg").forEach((el) => {
    el.hidden = true;
    el.textContent = "";
  });
  document.querySelectorAll(".field-error").forEach((el) => {
    el.classList.remove("field-error");
  });
}

function showFieldError(fieldId, message) {
  const label = document.querySelector(`#label-${fieldId}`);
  const errEl = document.querySelector(`#err-${fieldId}`);
  if (label) label.classList.add("field-error");
  if (errEl) {
    errEl.hidden = false;
    errEl.textContent = message;
  }
}

function setResult(kind, message) {
  result.hidden = false;
  result.className = `result ${kind}`;
  result.innerHTML = `<strong>${message}</strong>`;
}

// Live ICCID Check against Server
async function checkIccid() {
  clearFieldErrors();
  const raw = String(form.elements.iccid.value || "");
  const iccidVal = raw.replace(/\D/g, "");

  if (!iccidVal || iccidVal.length < 18) {
    iccidStatusBox.hidden = false;
    iccidStatusBox.className = "iccid-status-pill error";
    iccidStatusBox.textContent = INVALID_ICCID_MSG;
    showFieldError("iccid", "ICCID must be between 18 and 22 digits.");
    return false;
  }

  iccidStatusBox.hidden = false;
  iccidStatusBox.className = "iccid-status-pill loading";
  iccidStatusBox.textContent = "Verifying ICCID with authorized database...";

  try {
    const res = await fetch(`/api/validate-iccid?iccid=${encodeURIComponent(iccidVal)}`);
    const data = await res.json();

    if (!res.ok || !data.ok) {
      iccidStatusBox.className = "iccid-status-pill error";
      iccidStatusBox.textContent = data.message || INVALID_ICCID_MSG;
      showFieldError("iccid", data.message || INVALID_ICCID_MSG);
      return false;
    }

    iccidStatusBox.className = "iccid-status-pill success";
    iccidStatusBox.innerHTML = "✓ <strong>ICCID Verified:</strong> Valid SIM registered in our database.";
    if (data.network) {
      networkSelect.value = data.network;
      updateTopUpOptions(data.network, data.lastTopUpValue);
    }
    return true;
  } catch {
    iccidStatusBox.className = "iccid-status-pill error";
    iccidStatusBox.textContent = "Network error while connecting to verification server.";
    return false;
  }
}

let isCheckingOrder = false;
let orderInputTimer = null;

function normalizeAndFormatOrderId(raw) {
  let val = String(raw || "").trim().toUpperCase();
  // Auto-hyphenate if user pasted 17 digits without hyphens
  const digits = val.replace(/\D/g, "");
  if (digits.length === 17 && !val.includes("-")) {
    val = `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10, 17)}`;
  }
  return val;
}

// Live Order Check against Verified Orders Database
async function checkOrderId() {
  clearFieldErrors();
  const raw = normalizeAndFormatOrderId(form.elements.orderId.value);
  if (raw !== form.elements.orderId.value) {
    form.elements.orderId.value = raw;
  }

  if (!raw || !/^\d{3}-\d{7}-\d{7}$/.test(raw)) {
    orderStatusBox.hidden = true;
    verifiedOrder = null;
    networkSelect.disabled = false;
    topUpValueSelect.disabled = false;
    return;
  }

  if (isCheckingOrder) return;
  isCheckingOrder = true;

  orderStatusBox.hidden = false;
  orderStatusBox.className = "iccid-status-pill loading";
  orderStatusBox.textContent = "Verifying Order ID...";

  try {
    const res = await fetch(`/api/validate-order?orderId=${encodeURIComponent(raw)}`);
    const data = await res.json();

    if (data.cancelled) {
      orderStatusBox.className = "iccid-status-pill error";
      orderStatusBox.textContent = data.message || "This Order has been cancelled or returned and is not eligible for a top-up.";
      showFieldError("orderId", data.message || "Order returned/cancelled.");
      verifiedOrder = null;
      networkSelect.disabled = false;
      topUpValueSelect.disabled = false;
      return;
    }

    if (data.claimed) {
      orderStatusBox.className = "iccid-status-pill error";
      orderStatusBox.textContent = data.message || "This Order ID has already been redeemed.";
      showFieldError("orderId", data.message || "Order already redeemed.");
      verifiedOrder = null;
      networkSelect.disabled = false;
      topUpValueSelect.disabled = false;
      return;
    }

    if (data.found && data.network && data.topUpValue) {
      verifiedOrder = data;

      // 1. Auto populate Network Name and Recharge Amount on the screen
      networkSelect.value = data.network;
      updateTopUpOptions(data.network, data.topUpValue);
      networkSelect.disabled = true;
      topUpValueSelect.disabled = true;

      // Show verified notification badge on screen
      orderStatusBox.className = "iccid-status-pill success";
      orderStatusBox.innerHTML = `✓ <strong>Order Verified:</strong> Network: <strong>${data.network}</strong> &nbsp;|&nbsp; Top-Up: <strong>${data.topUpValue}</strong> (Auto-selected &amp; Locked)`;

      // 2. Ask the customer to enter the ICCID
      iccidStatusBox.hidden = false;
      iccidStatusBox.className = "iccid-status-pill info";
      iccidStatusBox.innerHTML = `👉 <strong>Please enter your SIM Card ICCID below</strong> (18–22 digits on your ${data.network} SIM) to complete your top-up.`;

      // Focus and highlight the ICCID input field
      const iccidInput = form.elements.iccid;
      if (!iccidInput.value || iccidInput.value.replace(/\D/g, "").length < 18) {
        iccidInput.focus();
        iccidInput.classList.add("highlight-pulse");
        setTimeout(() => iccidInput.classList.remove("highlight-pulse"), 2500);
      }
      return;
    }

    // Valid format, but not yet pre-loaded in DB (e.g. fresh order)
    orderStatusBox.hidden = false;
    orderStatusBox.className = "iccid-status-pill info";
    orderStatusBox.textContent = "Order ID format valid. Please enter your SIM Card ICCID and select your Network below.";
    verifiedOrder = null;
    networkSelect.disabled = false;
    topUpValueSelect.disabled = false;
    form.elements.iccid.focus();
  } catch {
    orderStatusBox.hidden = true;
  } finally {
    isCheckingOrder = false;
  }
}

// Trigger validation instantly as soon as user types or pastes the complete Order ID
form.elements.orderId.addEventListener("input", () => {
  clearTimeout(orderInputTimer);
  const raw = form.elements.orderId.value.trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 17 || /^\d{3}-\d{7}-\d{7}$/.test(raw)) {
    orderInputTimer = setTimeout(checkOrderId, 180);
  } else if (verifiedOrder) {
    verifiedOrder = null;
    networkSelect.disabled = false;
    topUpValueSelect.disabled = false;
    orderStatusBox.hidden = true;
    iccidStatusBox.hidden = true;
  }
});

form.elements.orderId.addEventListener("paste", () => {
  setTimeout(checkOrderId, 50);
});

form.elements.orderId.addEventListener("blur", checkOrderId);
form.elements.orderId.addEventListener("change", checkOrderId);
form.elements.orderId.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    checkOrderId();
  }
});

btnValidateIccid.addEventListener("click", checkIccid);
form.elements.iccid.addEventListener("blur", () => {
  const digits = String(form.elements.iccid.value || "").replace(/\D/g, "");
  if (digits.length >= 18) {
    checkIccid();
  }
});

// Form Submit Handler
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  result.hidden = true;
  clearFieldErrors();

  const orderId = String(form.elements.orderId.value || "").trim().toUpperCase();
  const iccid = String(form.elements.iccid.value || "").replace(/\D/g, "");
  const networkName = String(networkSelect.value || "").trim();
  const topUpValue = String(topUpValueSelect.value || "").trim();
  const email = String(form.elements.email.value || "").trim();

  let hasError = false;

  // Validate Mandatory Field 1: Order ID
  if (!orderId) {
    showFieldError("orderId", "Order ID is mandatory.");
    hasError = true;
  } else if (!/^\d{3}-\d{7}-\d{7}$/.test(orderId)) {
    showFieldError("orderId", "Format must be 123-1234567-1234567.");
    hasError = true;
  }

  // Validate Mandatory Field 2: SIM ICCID
  if (!iccid) {
    showFieldError("iccid", "SIM card ICCID is mandatory.");
    hasError = true;
  } else if (!/^\d{18,22}$/.test(iccid)) {
    showFieldError("iccid", "ICCID must contain 18 to 22 numeric digits.");
    hasError = true;
  }

  // Validate Mandatory Field 3: Network Name
  if (!networkName) {
    showFieldError("networkName", "Network name is mandatory.");
    hasError = true;
  }

  // Validate Mandatory Field 4: Top-Up Value
  if (!topUpValue) {
    showFieldError("topUpValue", "Top-up value is mandatory.");
    hasError = true;
  }

  // Client-side mismatch prevention against verified purchase
  if (verifiedOrder) {
    if (verifiedOrder.network && verifiedOrder.network.toUpperCase() !== networkName.toUpperCase()) {
      showFieldError("networkName", `Purchased for ${verifiedOrder.network}, not ${networkName}.`);
      setResult("error", `Validation Mismatch: Order was purchased for ${verifiedOrder.network}. Please select ${verifiedOrder.network}.`);
      hasError = true;
    }
    if (verifiedOrder.topUpValue && verifiedOrder.topUpValue !== topUpValue) {
      showFieldError("topUpValue", `Purchased for ${verifiedOrder.topUpValue}, not ${topUpValue}.`);
      setResult("error", `Validation Mismatch: Order was purchased for ${verifiedOrder.topUpValue}, but you selected ${topUpValue}.`);
      hasError = true;
    }
  }

  if (hasError) {
    if (!result.textContent) {
      setResult("error", "Please complete all mandatory fields highlighted above.");
    }
    return;
  }

  submitButton.disabled = true;
  submitButton.querySelector("span:last-child").textContent = "Verifying & Submitting...";

  try {
    const response = await fetch("/api/topup-request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orderId,
        iccid,
        networkName,
        topUpValue,
        email
      })
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      setResult("error", data.message || "Failed to submit request.");
      if (data.code === "ICCID_NOT_FOUND" || data.code === "INVALID_ICCID_FORMAT") {
        showFieldError("iccid", INVALID_ICCID_MSG);
      }
      return;
    }

    // Success! Show receipt card
    const notif = data.notification;
    document.querySelector("#receipt-orderId").textContent = notif.amazonOrderId;
    document.querySelector("#receipt-iccid").textContent = notif.simIccid;
    document.querySelector("#receipt-network").textContent = notif.networkName;
    document.querySelector("#receipt-value").textContent = notif.topUpValue;

    form.hidden = true;
    iccidStatusBox.hidden = true;
    result.hidden = true;
    receiptCard.hidden = false;
  } catch {
    setResult("error", "Network error. Please try again.");
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span:last-child").textContent = "Submit Top-Up Request";
  }
});

btnSubmitAnother.addEventListener("click", () => {
  form.reset();
  clearFieldErrors();
  verifiedOrder = null;
  networkSelect.disabled = false;
  topUpValueSelect.disabled = false;
  form.hidden = false;
  receiptCard.hidden = true;
  result.hidden = true;
  iccidStatusBox.hidden = true;
  orderStatusBox.hidden = true;
  updateTopUpOptions("");
  form.elements.orderId.focus();
});

loadConfig().then(() => {
  if (form.elements.orderId && form.elements.orderId.value) {
    checkOrderId();
  }
});
