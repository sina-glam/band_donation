import { db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const FINAL_DONATION_URL = "https://uhs-music.square.site/donation-page";
const STORAGE_KEY = "bandDonationItems";
const DONATION_ITEMS_COLLECTION = "donation_items";
const params = new URLSearchParams(window.location.search);
const statusEl = document.getElementById("status");

function sanitizeItemId(value) {
  return (value || "unknown_item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "unknown_item";
}

function redirectNow() {
  window.location.replace(FINAL_DONATION_URL);
}

function decodePayload() {
  const shortId = (params.get("i") || "").trim().toLowerCase();
  if (shortId) {
    return {
      shortId,
      itemName: "",
      amount: "",
    };
  }

  const encodedPayload = params.get("d");
  if (!encodedPayload) {
    return {
      shortId: "",
      itemName: (params.get("item") || "Unknown Item").trim(),
      amount: (params.get("amount") || "").trim(),
    };
  }

  try {
    let decodedJson = "";

    if (typeof LZString !== "undefined" && typeof LZString.decompressFromEncodedURIComponent === "function") {
      decodedJson = LZString.decompressFromEncodedURIComponent(encodedPayload) || "";
    }

    if (!decodedJson) {
      decodedJson = decodeURIComponent(encodedPayload);
    }

    const parsed = JSON.parse(decodedJson);
    return {
      shortId: typeof parsed.id === "string" ? parsed.id.trim().toLowerCase() : "",
      itemName: typeof parsed.i === "string" ? parsed.i.trim() : "Unknown Item",
      amount: typeof parsed.a === "string" ? parsed.a.trim() : "",
    };
  } catch (err) {
    console.error("Payload decode failed", err);
    return {
      shortId: "",
      itemName: "Unknown Item",
      amount: "",
    };
  }
}

function loadItemFromLocalStorage(shortId) {
  if (!shortId) {
    return null;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const items = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(items)) {
      return null;
    }

    const item = items.find((entry) => String(entry.shortId || "").toLowerCase() === shortId);
    if (!item) {
      return null;
    }

    return {
      shortId,
      itemName: String(item.description || item.heading || "").trim(),
      amount: String(item.value || "").trim(),
    };
  } catch (err) {
    console.warn("Local item lookup failed", err);
    return null;
  }
}

async function loadItemFromFirestore(shortId) {
  if (!shortId) {
    return null;
  }

  try {
    const snapshot = await getDoc(doc(db, DONATION_ITEMS_COLLECTION, shortId));
    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data();
    return {
      shortId,
      itemName: String(data.description || data.heading || "").trim(),
      amount: String(data.value || "").trim(),
    };
  } catch (err) {
    console.error("Firestore item lookup failed", err);
    return null;
  }
}

async function trackAndRedirect() {
  const decoded = decodePayload();
  const lookedUpItem =
    loadItemFromLocalStorage(decoded.shortId) ||
    (await loadItemFromFirestore(decoded.shortId));
  const itemName = lookedUpItem?.itemName || decoded.itemName;
  const amount = lookedUpItem?.amount || decoded.amount;
  const itemId = lookedUpItem?.shortId || decoded.shortId || sanitizeItemId(itemName);

  try {
    await Promise.all([
      setDoc(
        doc(db, "scan_summary", "global"),
        {
          totalScans: increment(1),
          lastScanAt: serverTimestamp(),
        },
        { merge: true }
      ),
      setDoc(
        doc(db, "scan_items", itemId),
        {
          shortId: itemId,
          itemName,
          amount,
          totalScans: increment(1),
          lastScanAt: serverTimestamp(),
        },
        { merge: true }
      ),
    ]);
  } catch (err) {
    console.error("Scan tracking failed", err);
    if (statusEl) {
      statusEl.textContent = "Tracking issue detected. Redirecting now...";
    }
  }

  redirectNow();
}

setTimeout(redirectNow, 2500);
trackAndRedirect();
