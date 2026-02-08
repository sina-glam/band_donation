import { db } from "./firebase-config.js";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  getDoc,
  serverTimestamp,
  setDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const STORAGE_KEY = "bandDonationItems";
const SETTINGS_KEY = "bandDonationDisplaySettings";
const LOGO_STORAGE_KEY = "bandDonationLogos";
const SCAN_SUMMARY_COLLECTION = "scan_summary";
const SCAN_SUMMARY_DOC = "global";
const DISPLAY_SETUPS_COLLECTION = "display_setups";
const MAX_DISPLAY_SETUPS = 8;

const DEFAULT_DISPLAY_SETTINGS = {
  viewSpot1: "#dceeff",
  viewSpot2: "#edf4ff",
  viewBase: "#f5f1ea",
  adminSpot1: "#dceeff",
  adminSpot2: "#edf4ff",
  adminBase: "#f5f1ea",
  heroNote: "",
};

const fileInput = document.getElementById("fileInput");
const saveButton = document.getElementById("saveButton");
const clearButton = document.getElementById("clearButton");
const statusEl = document.getElementById("status");
const previewTable = document.getElementById("previewTable");

const viewSpot1Input = document.getElementById("viewSpot1");
const viewSpot2Input = document.getElementById("viewSpot2");
const viewBaseInput = document.getElementById("viewBase");
const adminSpot1Input = document.getElementById("adminSpot1");
const adminSpot2Input = document.getElementById("adminSpot2");
const adminBaseInput = document.getElementById("adminBase");
const heroNoteInput = document.getElementById("heroNoteInput");
const saveSettingsButton = document.getElementById("saveSettingsButton");
const resetSettingsButton = document.getElementById("resetSettingsButton");
const logoFileInput = document.getElementById("logoFileInput");
const logoSideSelect = document.getElementById("logoSide");
const logoPositionSelect = document.getElementById("logoPosition");
const saveLogoButton = document.getElementById("saveLogoButton");
const clearLogoButton = document.getElementById("clearLogoButton");
const clearAllLogosButton = document.getElementById("clearAllLogosButton");
const logoStatusEl = document.getElementById("logoStatus");
const scanCountValueEl = document.getElementById("scanCountValue");
const scanStatusEl = document.getElementById("scanStatus");
const refreshScanButton = document.getElementById("refreshScanButton");
const resetScanButton = document.getElementById("resetScanButton");
const setupNameInput = document.getElementById("setupNameInput");
const saveSetupButton = document.getElementById("saveSetupButton");
const setupSelect = document.getElementById("setupSelect");
const loadSetupButton = document.getElementById("loadSetupButton");
const setupStatusEl = document.getElementById("setupStatus");

let pendingItems = [];
let pendingLogoDataUrl = "";
let setupList = [];

const headerMap = {
  heading: ["heading", "title", "item", "need"],
  description: ["description", "details", "desc"],
  quantity: ["quantity", "qty", "count", "amount"],
  value: ["value", "dollar", "price", "cost", "amount $", "amount"],
};

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || "");
}

function normalizeHeader(text) {
  return text.toLowerCase().trim();
}

function mapRow(row, headers) {
  const obj = { heading: "", description: "", quantity: "", value: "" };

  headers.forEach((header, index) => {
    const clean = normalizeHeader(header);
    Object.keys(headerMap).forEach((key) => {
      if (headerMap[key].includes(clean) && !obj[key]) {
        obj[key] = String(row[index] ?? "").trim();
      }
    });
  });

  return obj;
}

function extractRows(data) {
  const headers = data[0] || [];
  const rows = data.slice(1).filter((row) => row.some((cell) => cell !== ""));
  return rows.map((row) => mapRow(row, headers));
}

function parseCsv(text) {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map((cell) => cell.replace(/^\"|\"$/g, "")));
  return extractRows(rows);
}

function parseExcel(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  return extractRows(data);
}

function updatePreview(items) {
  previewTable.innerHTML = "";
  const headerRow = document.createElement("tr");
  ["Heading", "Description", "Quantity", "Value"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    headerRow.appendChild(th);
  });
  previewTable.appendChild(headerRow);

  items.slice(0, 9).forEach((item) => {
    const row = document.createElement("tr");
    [item.heading, item.description, item.quantity, item.value].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      row.appendChild(td);
    });
    previewTable.appendChild(row);
  });
}

function getSettingsFromInputs() {
  return {
    viewSpot1: isHexColor(viewSpot1Input.value) ? viewSpot1Input.value : DEFAULT_DISPLAY_SETTINGS.viewSpot1,
    viewSpot2: isHexColor(viewSpot2Input.value) ? viewSpot2Input.value : DEFAULT_DISPLAY_SETTINGS.viewSpot2,
    viewBase: isHexColor(viewBaseInput.value) ? viewBaseInput.value : DEFAULT_DISPLAY_SETTINGS.viewBase,
    adminSpot1: isHexColor(adminSpot1Input.value) ? adminSpot1Input.value : DEFAULT_DISPLAY_SETTINGS.adminSpot1,
    adminSpot2: isHexColor(adminSpot2Input.value) ? adminSpot2Input.value : DEFAULT_DISPLAY_SETTINGS.adminSpot2,
    adminBase: isHexColor(adminBaseInput.value) ? adminBaseInput.value : DEFAULT_DISPLAY_SETTINGS.adminBase,
    heroNote: (heroNoteInput.value || "").trim().slice(0, 160),
  };
}

function applyDisplaySettings(settings) {
  const root = document.documentElement;
  root.style.setProperty("--view-bg-spot-1", settings.viewSpot1);
  root.style.setProperty("--view-bg-spot-2", settings.viewSpot2);
  root.style.setProperty("--view-bg-base", settings.viewBase);
  root.style.setProperty("--admin-bg-spot-1", settings.adminSpot1);
  root.style.setProperty("--admin-bg-spot-2", settings.adminSpot2);
  root.style.setProperty("--admin-bg-base", settings.adminBase);
}

function loadDisplaySettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      viewSpot1: isHexColor(parsed.viewSpot1) ? parsed.viewSpot1 : DEFAULT_DISPLAY_SETTINGS.viewSpot1,
      viewSpot2: isHexColor(parsed.viewSpot2) ? parsed.viewSpot2 : DEFAULT_DISPLAY_SETTINGS.viewSpot2,
      viewBase: isHexColor(parsed.viewBase) ? parsed.viewBase : DEFAULT_DISPLAY_SETTINGS.viewBase,
      adminSpot1: isHexColor(parsed.adminSpot1) ? parsed.adminSpot1 : DEFAULT_DISPLAY_SETTINGS.adminSpot1,
      adminSpot2: isHexColor(parsed.adminSpot2) ? parsed.adminSpot2 : DEFAULT_DISPLAY_SETTINGS.adminSpot2,
      adminBase: isHexColor(parsed.adminBase) ? parsed.adminBase : DEFAULT_DISPLAY_SETTINGS.adminBase,
      heroNote: typeof parsed.heroNote === "string" ? parsed.heroNote.trim().slice(0, 160) : "",
    };
  } catch (err) {
    console.warn("Failed to parse stored settings", err);
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }
}

function fillSettingsInputs(settings) {
  viewSpot1Input.value = settings.viewSpot1;
  viewSpot2Input.value = settings.viewSpot2;
  viewBaseInput.value = settings.viewBase;
  adminSpot1Input.value = settings.adminSpot1;
  adminSpot2Input.value = settings.adminSpot2;
  adminBaseInput.value = settings.adminBase;
  heroNoteInput.value = settings.heroNote;
}

function emptyLogoConfig() {
  return { left: [null, null, null, null, null], right: [null, null, null, null, null] };
}

function isValidLogoData(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

function loadLogoConfig() {
  const empty = emptyLogoConfig();
  const raw = localStorage.getItem(LOGO_STORAGE_KEY);
  if (!raw) {
    return empty;
  }

  try {
    const parsed = JSON.parse(raw);
    ["left", "right"].forEach((side) => {
      const source = Array.isArray(parsed?.[side]) ? parsed[side] : [];
      empty[side] = empty[side].map((_, index) => (isValidLogoData(source[index]) ? source[index] : null));
    });
    return empty;
  } catch (err) {
    console.warn("Failed to parse stored logos", err);
    return empty;
  }
}

function saveLogoConfig(config) {
  localStorage.setItem(LOGO_STORAGE_KEY, JSON.stringify(config));
}

function selectedLogoSlot() {
  const side = logoSideSelect.value === "right" ? "right" : "left";
  const position = Number.parseInt(logoPositionSelect.value, 10);
  const index = Number.isInteger(position) ? Math.min(5, Math.max(1, position)) - 1 : 0;
  return { side, index, position: index + 1 };
}

function refreshLogoStatus() {
  const config = loadLogoConfig();
  const slot = selectedLogoSlot();
  const hasLogo = Boolean(config[slot.side][slot.index]);
  if (hasLogo) {
    logoStatusEl.textContent = `${slot.side === "left" ? "Left" : "Right"} slot ${slot.position} has a saved logo.`;
  } else {
    logoStatusEl.textContent = `${slot.side === "left" ? "Left" : "Right"} slot ${slot.position} is using the LOGO placeholder.`;
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

function formatSetupLabel(setup) {
  const createdAt = typeof setup.createdAtMs === "number" ? new Date(setup.createdAtMs) : null;
  const dateText = createdAt ? createdAt.toLocaleDateString() : "No date";
  return `${setup.name} (${dateText})`;
}

function refreshSetupSelect() {
  const selectedId = setupSelect.value;
  setupSelect.innerHTML = '<option value="">Select saved setup</option>';
  setupList.forEach((setup) => {
    const option = document.createElement("option");
    option.value = setup.id;
    option.textContent = formatSetupLabel(setup);
    setupSelect.appendChild(option);
  });

  if (selectedId && setupList.some((setup) => setup.id === selectedId)) {
    setupSelect.value = selectedId;
  }
}

function readSetupFromInputs() {
  const settings = getSettingsFromInputs();
  return {
    viewSpot1: settings.viewSpot1,
    viewSpot2: settings.viewSpot2,
    viewBase: settings.viewBase,
    heroNote: settings.heroNote,
  };
}

function applySetupToInputs(setup) {
  viewSpot1Input.value = setup.viewSpot1 || DEFAULT_DISPLAY_SETTINGS.viewSpot1;
  viewSpot2Input.value = setup.viewSpot2 || DEFAULT_DISPLAY_SETTINGS.viewSpot2;
  viewBaseInput.value = setup.viewBase || DEFAULT_DISPLAY_SETTINGS.viewBase;
  heroNoteInput.value = setup.heroNote || "";
}

async function loadSavedSetups() {
  try {
    const setupsQuery = query(
      collection(db, DISPLAY_SETUPS_COLLECTION),
      orderBy("createdAtMs", "desc"),
      limit(MAX_DISPLAY_SETUPS)
    );
    const snapshot = await getDocs(setupsQuery);
    setupList = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    refreshSetupSelect();

    if (!setupList.length) {
      setupStatusEl.textContent = "No saved setups yet.";
    }
  } catch (err) {
    console.error("Failed to load saved setups", err);
    setupStatusEl.textContent = "Failed to load saved setups from Firebase.";
  }
}

async function pruneDisplaySetups() {
  const overLimitQuery = query(
    collection(db, DISPLAY_SETUPS_COLLECTION),
    orderBy("createdAtMs", "desc"),
    limit(MAX_DISPLAY_SETUPS + 10)
  );
  const snapshot = await getDocs(overLimitQuery);
  if (snapshot.docs.length <= MAX_DISPLAY_SETUPS) {
    return;
  }

  const docsToDelete = snapshot.docs.slice(MAX_DISPLAY_SETUPS);
  await Promise.all(docsToDelete.map((docSnap) => deleteDoc(doc(db, DISPLAY_SETUPS_COLLECTION, docSnap.id))));
}

async function saveCurrentSetup() {
  const setupName = (setupNameInput.value || "").trim().slice(0, 40);
  if (!setupName) {
    setupStatusEl.textContent = "Enter a setup name before saving.";
    return;
  }

  const setup = readSetupFromInputs();
  try {
    await addDoc(collection(db, DISPLAY_SETUPS_COLLECTION), {
      name: setupName,
      ...setup,
      createdAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    });
    await pruneDisplaySetups();
    await loadSavedSetups();
    setupNameInput.value = "";
    setupStatusEl.textContent = `Saved setup "${setupName}".`;
  } catch (err) {
    console.error("Failed to save setup", err);
    setupStatusEl.textContent = "Failed to save setup to Firebase.";
  }
}

function loadSelectedSetup() {
  const selectedId = setupSelect.value;
  if (!selectedId) {
    setupStatusEl.textContent = "Select a setup first.";
    return;
  }

  const setup = setupList.find((item) => item.id === selectedId);
  if (!setup) {
    setupStatusEl.textContent = "Selected setup was not found.";
    return;
  }

  applySetupToInputs(setup);
  const settings = getSettingsFromInputs();
  applyDisplaySettings(settings);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  setupStatusEl.textContent = `Loaded setup "${setup.name}" and applied it.`;
}

function scanSummaryRef() {
  return doc(db, SCAN_SUMMARY_COLLECTION, SCAN_SUMMARY_DOC);
}

async function loadScanCount() {
  try {
    const snapshot = await getDoc(scanSummaryRef());
    if (!snapshot.exists()) {
      scanCountValueEl.textContent = "0";
      scanStatusEl.textContent = "Counter document not found. It will be created when first scan/reset happens.";
      return;
    }

    const data = snapshot.data();
    const totalScans = Number.isFinite(data.totalScans) ? data.totalScans : 0;
    scanCountValueEl.textContent = String(totalScans);
    scanStatusEl.textContent = "Counter loaded.";
  } catch (err) {
    console.error("Failed to load scan counter", err);
    scanStatusEl.textContent = "Failed to load scan counter. Check Firestore rules/config.";
  }
}

async function resetScanCount() {
  try {
    await setDoc(
      scanSummaryRef(),
      {
        totalScans: 0,
        lastScanAt: serverTimestamp(),
      },
      { merge: true }
    );
    scanCountValueEl.textContent = "0";
    scanStatusEl.textContent = "Scan counter reset to 0.";
  } catch (err) {
    console.error("Failed to reset scan counter", err);
    scanStatusEl.textContent = "Failed to reset scan counter. Check Firestore rules/config.";
  }
}

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const isExcel = file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls");
  try {
    if (isExcel) {
      const buffer = await file.arrayBuffer();
      pendingItems = parseExcel(buffer);
    } else {
      const text = await file.text();
      pendingItems = parseCsv(text);
    }

    if (!pendingItems.length) {
      statusEl.textContent = "No rows found. Please check the file.";
      return;
    }

    statusEl.textContent = `Loaded ${pendingItems.length} rows. Previewing first 9.`;
    updatePreview(pendingItems);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Could not read the file. Please try another file.";
  }
});

saveButton.addEventListener("click", () => {
  if (!pendingItems.length) {
    statusEl.textContent = "Load a file before saving.";
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingItems));
  statusEl.textContent = "Saved! Open the view page to see updates.";
});

clearButton.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  pendingItems = [];
  previewTable.innerHTML = "";
  statusEl.textContent = "Saved data cleared. The view page will show defaults.";
  fileInput.value = "";
});

saveSettingsButton.addEventListener("click", () => {
  const settings = getSettingsFromInputs();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  applyDisplaySettings(settings);
  statusEl.textContent = "Display settings saved.";
});

resetSettingsButton.addEventListener("click", () => {
  localStorage.removeItem(SETTINGS_KEY);
  fillSettingsInputs(DEFAULT_DISPLAY_SETTINGS);
  applyDisplaySettings(DEFAULT_DISPLAY_SETTINGS);
  statusEl.textContent = "Display settings reset to defaults.";
});

[viewSpot1Input, viewSpot2Input, viewBaseInput, adminSpot1Input, adminSpot2Input, adminBaseInput].forEach((input) => {
  input.addEventListener("input", () => {
    applyDisplaySettings(getSettingsFromInputs());
  });
});

logoFileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) {
    pendingLogoDataUrl = "";
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    if (!isValidLogoData(dataUrl)) {
      pendingLogoDataUrl = "";
      logoStatusEl.textContent = "Invalid image format. Please choose another file.";
      return;
    }
    pendingLogoDataUrl = dataUrl;
    logoStatusEl.textContent = `Logo loaded: ${file.name}. Choose side/position and click Save Logo to Slot.`;
  } catch (err) {
    pendingLogoDataUrl = "";
    logoStatusEl.textContent = "Could not read logo file. Try another image.";
  }
});

saveLogoButton.addEventListener("click", () => {
  if (!pendingLogoDataUrl) {
    logoStatusEl.textContent = "Choose a logo image before saving.";
    return;
  }

  const config = loadLogoConfig();
  const slot = selectedLogoSlot();
  config[slot.side][slot.index] = pendingLogoDataUrl;
  saveLogoConfig(config);
  pendingLogoDataUrl = "";
  logoFileInput.value = "";
  logoStatusEl.textContent = `Saved logo to ${slot.side} slot ${slot.position}.`;
});

clearLogoButton.addEventListener("click", () => {
  const config = loadLogoConfig();
  const slot = selectedLogoSlot();
  config[slot.side][slot.index] = null;
  saveLogoConfig(config);
  pendingLogoDataUrl = "";
  logoFileInput.value = "";
  logoStatusEl.textContent = `Cleared logo from ${slot.side} slot ${slot.position}.`;
});

clearAllLogosButton.addEventListener("click", () => {
  saveLogoConfig(emptyLogoConfig());
  pendingLogoDataUrl = "";
  logoFileInput.value = "";
  logoStatusEl.textContent = "Cleared all logo slots.";
});

saveSetupButton.addEventListener("click", () => {
  saveCurrentSetup();
});

loadSetupButton.addEventListener("click", () => {
  loadSelectedSetup();
});

[logoSideSelect, logoPositionSelect].forEach((input) => {
  input.addEventListener("change", refreshLogoStatus);
});

refreshScanButton.addEventListener("click", () => {
  loadScanCount();
});

resetScanButton.addEventListener("click", () => {
  resetScanCount();
});

const savedSettings = loadDisplaySettings();
fillSettingsInputs(savedSettings);
applyDisplaySettings(savedSettings);
refreshLogoStatus();
loadScanCount();
loadSavedSetups();
