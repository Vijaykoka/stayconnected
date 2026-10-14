const form = document.querySelector("#topup-form");
const result = document.querySelector("#result");
const submitButton = document.querySelector("#submit-button");
const networkSelect = document.querySelector("#networkName");
const customNetworkContainer = document.querySelector("#custom-network-container");
const customNetworkInput = document.querySelector("#customNetwork");
const topUpValueSelect = document.querySelector("#topUpValue");
const btnValidateIccid = document.querySelector("#btn-validate-iccid");
const iccidStatusBox = document.querySelector("#iccid-status-box");
const receiptCard = document.querySelector("#receipt-card");
const btnSubmitAnother = document.querySelector("#btn-submit-another");
const urlParams = new URLSearchParams(window.location.search);

const INVALID_ICCID_MSG = "Invalid ICCID. This SIM card is not registered in our database and does not belong to us.";

// Load Networks and Top-Up Values
async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    const data = await res.json();
    if (data.ok && data.config) {
      // Networks
      networkSelect.innerHTML = '<option value="">-- Select your SIM network --</option>';
      for (const net of data.config.networks) {
        const opt = document.createElement("option");
        opt.value = net;
        opt.textContent = net;
        networkSelect.appendChild(opt);
      }
      const initialNet = urlParams.get("network") || urlParams.get("networkName");
      if (initialNet) networkSelect.value = initialNet;

      // Top-Up Values
      topUpValueSelect.innerHTML = '<option value="">-- Select top-up value --</option>';
      for (const val of data.config.topUpValues) {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = val;
        topUpValueSelect.appendChild(opt);
      }
      const initialVal = urlParams.get("topUpValue") || urlParams.get("value") || urlParams.get("plan");
      if (initialVal) topUpValueSelect.value = initialVal;
    }
  } catch (err) {
    console.error("Config load error", err);
  }
}

// Show custom network input if "Other" is chosen
networkSelect.addEventListener("change", () => {
  if (networkSelect.value === "Other") {
    customNetworkContainer.hidden = false;
    customNetworkInput.required = true;
  } else {
    customNetworkContainer.hidden = true;
    customNetworkInput.required = false;
  }
});

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
    if (data.network && !networkSelect.value) {
      networkSelect.value = data.network;
    }
    return true;
  } catch {
    iccidStatusBox.className = "iccid-status-pill error";
    iccidStatusBox.textContent = "Network error while connecting to verification server.";
    return false;
  }
}

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
  let networkName = String(networkSelect.value || "").trim();
  if (networkName === "Other") {
    networkName = String(customNetworkInput.value || "").trim();
  }
  const topUpValue = String(topUpValueSelect.value || "").trim();
  const email = String(form.elements.email.value || "").trim();

  let hasError = false;

  // Validate Mandatory Field 1: Amazon Order ID
  if (!orderId) {
    showFieldError("orderId", "Amazon Order ID is mandatory.");
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

  if (hasError) {
    setResult("error", "Please complete all mandatory fields highlighted above.");
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
  form.hidden = false;
  receiptCard.hidden = true;
  result.hidden = true;
  iccidStatusBox.hidden = true;
});

loadConfig();
