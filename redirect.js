import { db } from "./firebase-config.js";
import {
  doc,
  increment,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const FINAL_DONATION_URL = "https://uhs-music.square.site/donation-page";
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

async function trackAndRedirect() {
  const itemName = (params.get("item") || "Unknown Item").trim();
  const amount = (params.get("amount") || "").trim();
  const itemId = sanitizeItemId(itemName);

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
