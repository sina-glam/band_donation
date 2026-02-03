const STORAGE_KEY = "bandDonationItems";
const QR_SIZE = 136;

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

const ROTATE_SECONDS = 8;
const CARDS_PER_VIEW = 6;

const defaultItems = [
  {
    heading: "New Music Stands",
    description: "Sturdy stands for marching and concert rehearsals.",
    quantity: "12",
    value: "$45",
  },
  {
    heading: "Percussion Heads",
    description: "Replace worn drum heads before competition season.",
    quantity: "8",
    value: "$35",
  },
  {
    heading: "Concert Attire",
    description: "Formal wear so every student looks stage-ready.",
    quantity: "20",
    value: "$60",
  },
  {
    heading: "Travel Fund",
    description: "Help cover buses to festivals and showcases.",
    quantity: "6",
    value: "$250",
  },
  {
    heading: "Instrument Repair",
    description: "Quick fixes for valves, reeds, and pads.",
    quantity: "15",
    value: "$40",
  },
  {
    heading: "New Sheet Music",
    description: "Fresh arrangements for fall and winter concerts.",
    quantity: "10",
    value: "$75",
  },
  {
    heading: "Band Camp Meals",
    description: "Fuel students during summer rehearsals.",
    quantity: "30",
    value: "$12",
  },
  {
    heading: "Uniform Cleaning",
    description: "Keep uniforms sharp all season long.",
    quantity: "18",
    value: "$25",
  },
  {
    heading: "Soloist Scholarships",
    description: "Support auditions, lessons, and leadership roles.",
    quantity: "4",
    value: "$150",
  },
];

function loadItems() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultItems;
  }

  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data) && data.length) {
      return data;
    }
  } catch (err) {
    console.warn("Failed to parse stored items", err);
  }

  return defaultItems;
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

    const formUrl =
      "https://sina-glam.github.io/redirect/?x=" +
      encodeURIComponent(item.description);
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
