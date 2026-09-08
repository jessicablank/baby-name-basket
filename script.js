// SECTION: DOM references
const form = document.getElementById("name-form");
const nameInput = document.getElementById("name");
const meaningInput = document.getElementById("meaning");
const fromInput = document.getElementById("from");
const submitBtn = document.getElementById("submit-btn");

const statusPending = document.getElementById("status-pending");
const statusSuccess = document.getElementById("status-success");
const statusError = document.getElementById("status-error");
const nameError = document.querySelector('[data-error-for="name"]');

const qrContainer = document.getElementById("qr-container");
const qrPlaceholder = document.getElementById("qr-placeholder");
const qrUrlEl = document.getElementById("qr-url");
const copyBtn = document.getElementById("copy-link-btn");
const copyFeedback = document.getElementById("copy-feedback");

// SECTION: Helpers
function setStatus(variant) {
  // Hide all
  statusPending.classList.add("status__row--hidden");
  statusSuccess.classList.add("status__row--hidden");
  statusError.classList.add("status__row--hidden");

  if (variant === "pending") statusPending.classList.remove("status__row--hidden");
  if (variant === "success") statusSuccess.classList.remove("status__row--hidden");
  if (variant === "error") statusError.classList.remove("status__row--hidden");
}

function setSubmitting(isSubmitting) {
  submitBtn.disabled = isSubmitting;
}

// Basic required validation for the name field
function validateName() {
  const value = nameInput.value.trim();
  if (!value) {
    nameError.textContent = "Please add at least one name suggestion.";
    return false;
  }

  if (value.length > 80) {
    nameError.textContent = "That name is a bit long. Try keeping it under 80 characters.";
    return false;
  }

  nameError.textContent = "";
  return true;
}

// SECTION: Google Sheets integration placeholder
// To keep this project fully static and easy to host for free, we call
// a public Google Apps Script Web App URL. That script is responsible
// for writing a new row into your private Google Sheet.
//
// 1. Create a Google Sheet with columns, e.g.: Timestamp, Name, Meaning, From
// 2. Tools → Script editor, and paste an Apps Script that handles POST
// 3. Deploy as Web app, set access: "Anyone" or "Anyone with the link"
// 4. Copy config.example.js to config.js and paste the deployment URL there
//
// This function expects that the Apps Script accepts JSON in the body
// and returns a JSON response like: { success: true }

const SHEETS_WEB_APP_URL = window.APP_CONFIG?.SHEETS_WEB_APP_URL || "";

async function sendToGoogleSheet(payload) {
  if (!SHEETS_WEB_APP_URL) {
    // If you haven't wired up the backend yet, we simulate a success
    console.warn("No Google Apps Script URL configured. Simulating success.");
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { success: true, simulated: true };
  }

  // text/plain keeps this a CORS "simple request"; Apps Script cannot answer preflight OPTIONS
  const response = await fetch(SHEETS_WEB_APP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({
      ...payload,
      token: window.APP_CONFIG?.SHEETS_TOKEN || "",
    }),
  });

  if (!response.ok) {
    throw new Error("Network response was not ok");
  }

  const data = await response.json().catch(() => ({}));
  return data;
}

// SECTION: Form submit handling
// Handles submit, validates, calls the Google Sheets endpoint, shows feedback

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!validateName()) {
    nameInput.focus();
    return;
  }

  const payload = {
    name: nameInput.value.trim(),
    meaning: meaningInput.value.trim(),
    from: fromInput.value.trim(),
    submittedAt: new Date().toISOString(),
  };

  try {
    setSubmitting(true);
    setStatus("pending");

    const result = await sendToGoogleSheet(payload);

    if (!result || result.success === false) {
      throw new Error("Backend indicated failure");
    }

    setStatus("success");
    form.reset();
  } catch (error) {
    console.error(error);
    setStatus("error");
  } finally {
    setSubmitting(false);
  }
});

// Live validation on blur
nameInput?.addEventListener("blur", validateName);

// SECTION: QR code generation
// Uses the qrcode.js library loaded from CDN in index.html

function getShareUrl() {
  // Prefer canonical URL of the page if deployed, else fallback
  try {
    return window.location.href;
  } catch {
    return "";
  }
}

function renderQrCode() {
  const url = getShareUrl();
  if (!url) return;

  qrUrlEl.textContent = url;

  // Remove placeholder dots
  if (qrPlaceholder && qrPlaceholder.parentNode) {
    qrPlaceholder.parentNode.removeChild(qrPlaceholder);
  }

  // Render QR into the container
  // Library exposes global `QRCode`
  if (window.QRCode) {
    // Clear any existing code
    qrContainer.innerHTML = "";
    new window.QRCode(qrContainer, {
      text: url,
      width: 160,
      height: 160,
      colorDark: "#1f2933",
      colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.M,
    });
  }
}

// Copy link button
copyBtn?.addEventListener("click", async () => {
  const url = getShareUrl();
  if (!url) return;

  try {
    await navigator.clipboard.writeText(url);
    copyFeedback.textContent = "Link copied to clipboard.";
  } catch (error) {
    console.error(error);
    copyFeedback.textContent = "Couldn't copy automatically, but you can copy the link above.";
  }

  setTimeout(() => {
    copyFeedback.textContent = "";
  }, 3000);
});

// Run on load
window.addEventListener("DOMContentLoaded", () => {
  const url = getShareUrl();
  if (url) {
    qrUrlEl.textContent = url;
    renderQrCode();
  }
});
