// Read-only structural inventory of the AIC Google workbooks (plan §1).
//
//   node --env-file=.env.local scripts/migration/inspect-workbooks.mjs
//
// Uses the spreadsheets.readonly scope. For each workbook it records tab names,
// grid size, header row, a non-empty row count (column A) and which columns hold
// formulas in the first data row. It never writes cell values other than headers.
// Output: tmp/migration/workbook-inventory.json (git-ignored). ~3 requests per workbook.
import { google } from "googleapis";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";

const WORKBOOKS = {
  database: process.env.GOOGLE_SHEET_ID_DATABASE,
  fti: process.env.GOOGLE_SHEET_ID_FTI,
  newflow: process.env.GOOGLE_SHEET_ID_NEWFLOW,
  salesOrderDestination: process.env.SALES_ORDER_DESTINATION_SPREADSHEET_ID,
  serviceInvoiceTracker: process.env.SERVICE_INVOICE_TRACKER_SPREADSHEET_ID || "1izCz-qWLqLhAxOeUtn8qp11iLpdxRn3qnhxumutB43A",
  clientDirectory: process.env.SERVICE_INVOICE_DIRECTORY_SPREADSHEET_ID || "14G57IKQ73FCxjZyba216vZlsbsqPYsgPGsjVKzcyzwY",
};

function auth() {
  const scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    || (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE && existsSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE)
      ? readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, "utf8") : process.env.GOOGLE_PRIVATE_KEY);
  if (!raw) throw new Error("No service-account credential configured.");
  const t = raw.trim();
  if (t.startsWith("{")) {
    const j = JSON.parse(t);
    return new google.auth.JWT({ email: j.client_email || email, key: j.private_key, scopes });
  }
  return new google.auth.JWT({ email, key: t.replace(/\\n/g, "\n"), scopes });
}

const q = (name) => `'${name.replace(/'/g, "''")}'`;
const colLetter = (i) => { let s = ""; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

const sheets = google.sheets({ version: "v4", auth: auth() });
const out = { capturedAt: new Date().toISOString(), workbooks: {} };

for (const [key, id] of Object.entries(WORKBOOKS)) {
  if (!id) { out.workbooks[key] = { error: "not configured" }; continue; }
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: id, fields: "properties.title,sheets.properties(title,gridProperties,hidden)" });
    const tabs = meta.data.sheets.map((s) => s.properties);
    const ranges = tabs.flatMap((t) => [`${q(t.title)}!1:1`, `${q(t.title)}!A:A`]);
    const vals = await sheets.spreadsheets.values.batchGet({ spreadsheetId: id, ranges, majorDimension: "COLUMNS" });
    const formulas = await sheets.spreadsheets.values.batchGet({ spreadsheetId: id, ranges: tabs.map((t) => `${q(t.title)}!2:2`), valueRenderOption: "FORMULA" });
    out.workbooks[key] = {
      title: meta.data.properties.title,
      tabs: tabs.map((t, i) => {
        // Long cells are never real headers; the Config tab stores a credential in A1.
        const header = (vals.data.valueRanges[i * 2].values || []).map((c) => String(c?.[0] ?? "")).map((h) => (h.length > 60 ? "<redacted long value>" : h));
        const colA = vals.data.valueRanges[i * 2 + 1].values?.[0] || [];
        const row2 = formulas.data.valueRanges[i].values?.[0] || [];
        return {
          tab: t.title,
          hidden: !!t.hidden,
          grid: `${t.gridProperties.rowCount}x${t.gridProperties.columnCount}`,
          dataRows: Math.max(0, colA.filter((v) => String(v).trim() !== "").length - 1),
          header,
          formulaColumns: row2.map((v, c) => (String(v).startsWith("=") ? `${colLetter(c)}:${header[c] || "?"}:${String(v).replace(/\d+/g, "#").slice(0, 60)}` : null)).filter(Boolean),
        };
      }),
    };
    console.log(`${key}: ${tabs.length} tabs`);
  } catch (e) {
    out.workbooks[key] = { error: e?.response?.status ? `HTTP ${e.response.status}` : String(e.message).slice(0, 120) };
    console.log(`${key}: ${out.workbooks[key].error}`);
  }
}
mkdirSync("tmp/migration", { recursive: true });
writeFileSync("tmp/migration/workbook-inventory.json", JSON.stringify(out, null, 2));
console.log("wrote tmp/migration/workbook-inventory.json");
