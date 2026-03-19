const STORAGE_KEY = "bandDonationItems";
const SETTINGS_KEY = "bandDonationDisplaySettings";
const LOGO_STORAGE_KEY = "bandDonationLogos";
const ITEM_LOOKUP_STORAGE_KEY = STORAGE_KEY;
const QR_SIZE = 136;

const DEFAULT_DISPLAY_SETTINGS = {
  viewSpot1: "#dceeff",
  viewSpot2: "#edf4ff",
  viewBase: "#f5f1ea",
  adminSpot1: "#dceeff",
  adminSpot2: "#edf4ff",
  adminBase: "#f5f1ea",
  heroNote: "",
  showEmptyLogoPlaceholders: true,
};

function isHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || "");
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
      showEmptyLogoPlaceholders:
        typeof parsed.showEmptyLogoPlaceholders === "boolean"
          ? parsed.showEmptyLogoPlaceholders
          : DEFAULT_DISPLAY_SETTINGS.showEmptyLogoPlaceholders,
    };
  } catch (err) {
    console.warn("Failed to parse display settings", err);
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }
}

function applyDisplaySettings(settings) {
  const root = document.documentElement;
  root.style.setProperty("--view-bg-spot-1", settings.viewSpot1);
  root.style.setProperty("--view-bg-spot-2", settings.viewSpot2);
  root.style.setProperty("--view-bg-base", settings.viewBase);
  root.style.setProperty("--admin-bg-spot-1", settings.adminSpot1);
  root.style.setProperty("--admin-bg-spot-2", settings.adminSpot2);
  root.style.setProperty("--admin-bg-base", settings.adminBase);

  const heroNoteEl = document.getElementById("heroNote");
  if (heroNoteEl) {
    if (settings.heroNote) {
      heroNoteEl.textContent = settings.heroNote;
      heroNoteEl.style.display = "block";
    } else {
      heroNoteEl.textContent = "";
      heroNoteEl.style.display = "none";
    }
  }
}

function loadLogoConfig() {
  const empty = { left: [null, null, null, null, null], right: [null, null, null, null, null] };
  const raw = localStorage.getItem(LOGO_STORAGE_KEY);
  if (!raw) {
    return empty;
  }

  try {
    const parsed = JSON.parse(raw);
    ["left", "right"].forEach((side) => {
      const source = Array.isArray(parsed?.[side]) ? parsed[side] : [];
      empty[side] = empty[side].map((_, index) => {
        const value = source[index];
        if (typeof value === "string" && value.startsWith("data:image/")) {
          return value;
        }
        return null;
      });
    });
    return empty;
  } catch (err) {
    console.warn("Failed to parse stored logos", err);
    return empty;
  }
}

function updateLogoLayout(leftVisible, rightVisible) {
  const contentRow = document.querySelector(".content-row");
  if (!contentRow) return;

  if (leftVisible && rightVisible) {
    contentRow.style.gridTemplateColumns = "110px minmax(0, 1fr) 110px";
  } else if (leftVisible || rightVisible) {
    contentRow.style.gridTemplateColumns = "110px minmax(0, 1fr)";
  } else {
    contentRow.style.gridTemplateColumns = "minmax(0, 1fr)";
  }
}

function renderLogoRail(containerId, logos, showEmptyLogoPlaceholders) {
  const rail = document.getElementById(containerId);
  if (!rail) return false;

  rail.innerHTML = "";
  const visibleLogos = showEmptyLogoPlaceholders ? logos : logos.filter(Boolean);

  visibleLogos.forEach((logoSrc) => {
    const slot = document.createElement("div");
    slot.className = "logo-slot";
    if (logoSrc) {
      const img = document.createElement("img");
      img.src = logoSrc;
      img.alt = "Sponsor logo";
      slot.appendChild(img);
    } else {
      slot.textContent = "LOGO";
    }
    rail.appendChild(slot);
  });

  const hasVisibleSlots = visibleLogos.length > 0;
  rail.style.display = hasVisibleSlots ? "grid" : "none";
  return hasVisibleSlots;
}

function renderLogos() {
  const logos = loadLogoConfig();
  const settings = loadDisplaySettings();
  const leftVisible = renderLogoRail("leftLogoRail", logos.left, settings.showEmptyLogoPlaceholders);
  const rightVisible = renderLogoRail("rightLogoRail", logos.right, settings.showEmptyLogoPlaceholders);
  updateLogoLayout(leftVisible, rightVisible);
}

function makeQrElement(text) {
  const holder = document.createElement("div");
  holder.className = "qr";
  new QRCode(holder, {
    text,
    width: QR_SIZE,
    height: QR_SIZE,
    colorDark: "#111522",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H,
  });
  return holder;
}

function getRedirectBaseUrl() {
  return "https://sina-glam.github.io/redirect/";
}

const ROTATE_SECONDS = 8;
const CARDS_PER_VIEW = 6;

const defaultItems = [
  {
    shortId: "nms",
    heading: "New Music Stands",
    description: "Sturdy stands for marching and concert rehearsals.",
    quantity: "12",
    value: "$45",
  },
  {
    shortId: "ph",
    heading: "Percussion Heads",
    description: "Replace worn drum heads before competition season.",
    quantity: "8",
    value: "$35",
  },
  {
    shortId: "ca",
    heading: "Concert Attire",
    description: "Formal wear so every student looks stage-ready.",
    quantity: "20",
    value: "$60",
  },
  {
    shortId: "tf",
    heading: "Travel Fund",
    description: "Help cover buses to festivals and showcases.",
    quantity: "6",
    value: "$250",
  },
  {
    shortId: "ir",
    heading: "Instrument Repair",
    description: "Quick fixes for valves, reeds, and pads.",
    quantity: "15",
    value: "$40",
  },
  {
    shortId: "nsm",
    heading: "New Sheet Music",
    description: "Fresh arrangements for fall and winter concerts.",
    quantity: "10",
    value: "$75",
  },
  {
    shortId: "bcm",
    heading: "Band Camp Meals",
    description: "Fuel students during summer rehearsals.",
    quantity: "30",
    value: "$12",
  },
  {
    shortId: "uc",
    heading: "Uniform Cleaning",
    description: "Keep uniforms sharp all season long.",
    quantity: "18",
    value: "$25",
  },
  {
    shortId: "ss",
    heading: "Soloist Scholarships",
    description: "Support auditions, lessons, and leadership roles.",
    quantity: "4",
    value: "$150",
  },
];

function createShortItemId(heading, index, usedIds) {
  const base = (heading || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 5) || "item";
  let candidate = base;
  let suffix = 0;

  while (!candidate || usedIds.has(candidate)) {
    suffix += 1;
    candidate = (base + suffix.toString(36)).slice(0, 7);
  }

  usedIds.add(candidate);
  return candidate || `item${index.toString(36)}`;
}

function normalizeItems(items) {
  const usedIds = new Set();

  return items.map((item, index) => {
    const existingId =
      typeof item.shortId === "string" && /^[a-z0-9_-]{1,12}$/i.test(item.shortId.trim())
        ? item.shortId.trim().toLowerCase()
        : "";
    const shortId = existingId && !usedIds.has(existingId) ? existingId : createShortItemId(item.heading, index, usedIds);
    usedIds.add(shortId);

    return {
      shortId,
      heading: String(item.heading || "").trim(),
      description: String(item.description || "").trim(),
      quantity: String(item.quantity || "").trim(),
      value: String(item.value || "").trim(),
    };
  });
}

function loadItems() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return normalizeItems(defaultItems);
  }

  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data.length) {
      return normalizeItems(data);
    }
  } catch (err) {
    console.warn("Failed to parse stored items", err);
  }

  return normalizeItems(defaultItems);
}

function renderCards(items, startIndex) {
  const grid = document.getElementById("cardGrid");
  grid.innerHTML = "";

  for (let i = 0; i < CARDS_PER_VIEW; i += 1) {
    const item = items[startIndex + i] || {
      heading: "Open Need",
      description: "Add more opportunities in the admin page.",
      quantity: "-",
      value: "-",
    };

    const formUrl = getRedirectBaseUrl() + "?i=" + encodeURIComponent(item.shortId);
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <div>
        <h2>${item.heading}</h2>
        <p>${item.description}</p>
      </div>
      <div class="metrics">
        <div class="metric">${item.quantity}<span>Quantity</span></div>
        <div class="value">${item.value}<span></span></div>
      </div>
    `;
    card.appendChild(makeQrElement(formUrl));
    grid.appendChild(card);
  }
}

applyDisplaySettings(loadDisplaySettings());
renderLogos();

const items = loadItems();
let offset = 0;

function showNextSet() {
  renderCards(items, offset);
  offset += CARDS_PER_VIEW;
  if (offset >= items.length) {
    offset = 0;
  }
}

showNextSet();
if (items.length > CARDS_PER_VIEW) {
  setInterval(showNextSet, ROTATE_SECONDS * 1000);
}
