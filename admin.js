const STORAGE_KEY = "bandDonationItems";
const fileInput = document.getElementById("fileInput");
const saveButton = document.getElementById("saveButton");
const clearButton = document.getElementById("clearButton");
const statusEl = document.getElementById("status");
const previewTable = document.getElementById("previewTable");

let pendingItems = [];

const headerMap = {
  heading: ["heading", "title", "item", "need"],
  description: ["description", "details", "desc"],
  quantity: ["quantity", "qty", "count", "amount"],
  value: ["value", "dollar", "price", "cost", "amount $", "amount"],
};

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
