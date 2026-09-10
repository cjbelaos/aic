import { existsSync, readFileSync } from "node:fs";
import { google } from "googleapis";

const APPLY = process.argv.includes("--apply");
const spreadsheetId = process.env.GOOGLE_SHEET_ID_DATABASE;
if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID_DATABASE.");

function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    if (raw.trim().startsWith("-----BEGIN")) {
      return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: raw.replace(/\\n/g, "\n") };
    }
    const parsed = JSON.parse(raw);
    return { email: parsed.client_email, key: parsed.private_key.replace(/\\n/g, "\n") };
  }
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (keyFile && existsSync(keyFile)) {
    const file = readFileSync(keyFile, "utf8").trim();
    if (file.startsWith("-----BEGIN")) {
      return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: file };
    }
    const parsed = JSON.parse(file);
    return { email: parsed.client_email, key: parsed.private_key.replace(/\\n/g, "\n") };
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n") };
  }
  throw new Error("Configure service-account credentials before running the V2 audit.");
}

const auth = new google.auth.JWT({ ...credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });
const read = async (range) => (await sheets.spreadsheets.values.get({ spreadsheetId, range })).data.values ?? [];
const number = (value) => Number.parseFloat(String(value ?? "").replace(/[\u20b1$,]/g, "")) || 0;
const norm = (value) => String(value ?? "").trim().toLowerCase();
const id = (prefix, n) => `${prefix}-${String(n).padStart(6, "0")}`;

const [products, prices, companies, categories, units, purchaseOrders, purchaseOrderItems, deliveryItems] = await Promise.all([
  read("Products!A2:H"), read("CustomerPrices!A2:C"), read("Companies!A2:H"),
  read("ProductCategories!A2:B"), read("ProductUnits!A2:B"),
  read("PurchaseOrders!A2:Q"), read("PurchaseOrderItems!A2:G"), read("DeliveryReceiptItems!A2:E"),
]);

const categoryCodes = new Set(categories.map((r) => norm(r[0])));
const unitCodes = new Set(units.map((r) => norm(r[0])));
const companyById = new Map(companies.map((r) => [norm(r[0]), r]));
const companyByName = new Map();
for (const row of companies) {
  const key = norm(row[2]);
  const list = companyByName.get(key) ?? [];
  list.push(row); companyByName.set(key, list);
}

const grouped = new Map();
const issues = [];
for (const [index, row] of products.entries()) {
  const code = String(row[0] ?? "").trim();
  if (!code) { issues.push({ sheet: "Products", row: index + 2, issue: "Missing ProductCode" }); continue; }
  const key = norm(code); const list = grouped.get(key) ?? []; list.push({ row, rowNumber: index + 2 }); grouped.set(key, list);
}

const categoryRowsV2 = categories
  .filter((row) => String(row[0] ?? "").trim())
  .map((row, index) => [id("PCAT", index + 1), String(row[0]).trim(), String(row[1] ?? row[0]).trim(), "active"]);
const categoryIdByCode = new Map(categoryRowsV2.map((row) => [norm(row[1]), row[0]]));
const allUnitCodes = new Map(units.filter((row) => String(row[0] ?? "").trim()).map((row) => [norm(row[0]), [String(row[0]).trim(), String(row[1] ?? row[0]).trim()]]));
for (const product of products) {
  const unitCode = String(product[4] ?? "").trim();
  if (unitCode && !allUnitCodes.has(norm(unitCode))) allUnitCodes.set(norm(unitCode), [unitCode, unitCode]);
}
const unitRowsV2 = [...allUnitCodes.values()].map(([code, name], index) => [id("UNIT", index + 1), code, name, "active"]);
const unitIdByCode = new Map(unitRowsV2.map((row) => [norm(row[1]), row[0]]));

const productsV2 = [];
const supplierProductsV2 = [];
const productIdByCode = new Map();
let productSequence = 1, supplierSequence = 1;
for (const rows of grouped.values()) {
  const first = rows[0].row;
  const canonical = [norm(first[1]), norm(first[2]), norm(first[4])];
  for (const candidate of rows.slice(1)) {
    const value = [norm(candidate.row[1]), norm(candidate.row[2]), norm(candidate.row[4])];
    if (value.some((part, i) => part !== canonical[i])) issues.push({ sheet: "Products", row: candidate.rowNumber, issue: `Canonical conflict for ProductCode ${first[0]}` });
  }
  const productId = id("PROD", productSequence++); productIdByCode.set(norm(first[0]), productId);
  const categoryId = categoryIdByCode.get(norm(first[2]));
  const unitId = unitIdByCode.get(norm(first[4]));
  if (!categoryId || !unitId) { issues.push({ sheet: "Products", productCode: first[0], issue: "Unable to resolve V2 category or unit ID" }); continue; }
  productsV2.push([productId, first[0], first[1], categoryId, unitId, number(first[6]), "active", new Date().toISOString(), "migration", "", ""]);
  if (!categoryCodes.has(norm(first[2]))) issues.push({ sheet: "Products", productCode: first[0], issue: `Unknown category ${first[2]}` });
  if (!unitCodes.has(norm(first[4]))) issues.push({ sheet: "Products", productCode: first[0], issue: `Unknown unit ${first[4]}` });
  for (const entry of rows) {
    const supplierId = String(entry.row[7] ?? "").trim();
    if (!supplierId) { issues.push({ sheet: "Products", row: entry.rowNumber, issue: "No SupplierId; supplier offering not generated" }); continue; }
    const supplier = companyById.get(norm(supplierId));
    if (!supplier || !["supplier", "both"].includes(norm(supplier[1]))) { issues.push({ sheet: "Products", row: entry.rowNumber, issue: `Invalid supplier ${supplierId}` }); continue; }
    const description = String(entry.row[3] ?? "").trim();
    supplierProductsV2.push([id("SP", supplierSequence++), productId, supplierId, "", description || String(first[1] ?? ""), description, number(entry.row[5]), rows.indexOf(entry) === 0, "active", new Date().toISOString(), "migration", "", ""]);
  }
}

const customerPricesV2 = [];
let priceSequence = 1;
for (const [index, row] of prices.entries()) {
  const customerMatches = companyByName.get(norm(row[0])) ?? [];
  const customer = customerMatches.filter((c) => ["customer", "both"].includes(norm(c[1])));
  const productId = productIdByCode.get(norm(row[1]));
  if (customer.length !== 1 || !productId) {
    issues.push({ sheet: "CustomerPrices", row: index + 2, issue: customer.length !== 1 ? "Customer name is missing or ambiguous" : `Unknown product ${row[1]}` });
    continue;
  }
  customerPricesV2.push([id("CPP", priceSequence++), customer[0][0], productId, "", number(row[2]), "", "", "active", new Date().toISOString(), "migration", "", ""]);
}

const supplierProductsBySupplierAndDescription = new Map();
for (const row of supplierProductsV2) {
  for (const description of [row[4], row[5]]) {
    if (norm(description)) supplierProductsBySupplierAndDescription.set(`${norm(row[2])}|${norm(description)}`, row);
  }
}
const poSupplierByNumber = new Map(purchaseOrders.map((row) => [String(row[0] ?? "").trim(), String(row[2] ?? "").trim()]));
const purchaseOrderItemsV2 = [];
for (const row of purchaseOrderItems) {
  const poNumber = String(row[0] ?? "").trim();
  const supplierProduct = supplierProductsBySupplierAndDescription.get(`${norm(poSupplierByNumber.get(poNumber))}|${norm(row[2])}`);
  if (!poNumber || !supplierProduct) continue;
  purchaseOrderItemsV2.push([poNumber, Number(row[1]) || 0, supplierProduct[0], supplierProduct[1], row[2] ?? "", Number(row[3]) || 0, row[4] ?? "", number(row[5]), number(row[6])]);
}
const deliveryReceiptItemsV2 = [];
const deliveryItemNumbers = new Map();
for (const row of deliveryItems) {
  const productCode = String(row[1] ?? "").trim();
  const productId = productIdByCode.get(norm(productCode));
  if (!productId || !String(row[0] ?? "").trim()) continue;
  const receiptId = String(row[0]).trim();
  const itemNo = (deliveryItemNumbers.get(receiptId) ?? 0) + 1;
  deliveryItemNumbers.set(receiptId, itemNo);
  deliveryReceiptItemsV2.push([receiptId, itemNo, productId, productCode, "", Number(row[2]) || 0, row[3] ?? "", row[4] ?? "active"]);
}

const report = {
  mode: APPLY ? "apply" : "audit-only",
  source: { productRows: products.length, uniqueProducts: grouped.size, customerPriceRows: prices.length, purchaseOrderItemRows: purchaseOrderItems.length, deliveryItemRows: deliveryItems.length },
  proposed: { productCategoriesV2: categoryRowsV2.length, productUnitsV2: unitRowsV2.length, productsV2: productsV2.length, supplierProductsV2: supplierProductsV2.length, customerPricesV2: customerPricesV2.length, purchaseOrderItemsV2: purchaseOrderItemsV2.length, deliveryReceiptItemsV2: deliveryReceiptItemsV2.length },
  issueCount: issues.length,
  issues,
};
console.log(JSON.stringify(report, null, 2));
if (!APPLY) process.exit(issues.length ? 2 : 0);

const headers = {
  ProductCategoriesV2: ["ProductCategoryId", "CategoryCode", "CategoryName", "Status"],
  ProductUnitsV2: ["UnitId", "UnitCode", "UnitName", "Status"],
  ProductsV2: ["ProductId", "ProductCode", "ProductName", "ProductCategoryId", "UnitId", "DefaultSellingPrice", "Status", "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy"],
  SupplierProductsV2: ["SupplierProductId", "ProductId", "SupplierId", "SupplierProductCode", "SupplierProductName", "SupplierDescription", "CostPerUnit", "IsPreferredSupplier", "Status", "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy"],
  CustomerPricesV2: ["CustomerProductPriceId", "CustomerId", "ProductId", "CustomerProductName", "PricePerUnit", "EffectiveFrom", "EffectiveTo", "Status", "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy"],
  PurchaseOrderItemsV2: ["PurchaseOrderId", "ItemNo", "SupplierProductId", "ProductId", "DescriptionSnapshot", "Quantity", "UnitSnapshot", "CostPerUnitSnapshot", "TotalAmount"],
  DeliveryReceiptItemsV2: ["DeliveryReceiptId", "ItemNo", "ProductId", "ProductCodeSnapshot", "DescriptionSnapshot", "Quantity", "UnitSnapshot", "Status"],
};
const metadata = await sheets.spreadsheets.get({ spreadsheetId });
const existingTabs = new Set((metadata.data.sheets ?? []).map((s) => s.properties?.title));
const missing = Object.keys(headers).filter((name) => !existingTabs.has(name));
if (missing.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) } });
for (const [name, columns] of Object.entries(headers)) {
  await sheets.spreadsheets.values.update({ spreadsheetId, range: `${name}!A1`, valueInputOption: "RAW", requestBody: { values: [columns] } });
}

// Idempotent application: append only records whose business key is not already present.
const appendMissing = async (sheet, rows, keyForRow) => {
  const existing = await read(`${sheet}!A2:Z`); const keys = new Set(existing.map(keyForRow));
  const missingRows = rows.filter((r) => !keys.has(keyForRow(r)));
  if (missingRows.length) await sheets.spreadsheets.values.append({ spreadsheetId, range: `${sheet}!A2`, valueInputOption: "USER_ENTERED", requestBody: { values: missingRows } });
  console.log(`${sheet}: appended ${missingRows.length}, retained ${existing.length}`);
};
await appendMissing("ProductCategoriesV2", categoryRowsV2, (row) => norm(row[1]));
await appendMissing("ProductUnitsV2", unitRowsV2, (row) => norm(row[1]));
await appendMissing("ProductsV2", productsV2, (row) => norm(row[1]));
await appendMissing("SupplierProductsV2", supplierProductsV2, (row) => norm(row[0]));
await appendMissing("CustomerPricesV2", customerPricesV2, (row) => norm(row[0]));
await appendMissing("PurchaseOrderItemsV2", purchaseOrderItemsV2, (row) => `${norm(row[0])}|${row[1]}`);
await appendMissing("DeliveryReceiptItemsV2", deliveryReceiptItemsV2, (row) => `${norm(row[0])}|${row[1]}`);

const productRowsInV2 = await read("ProductsV2!A2:K");
const productMigrationByCode = new Map(productsV2.map((row) => [norm(row[1]), row]));
const productUpdates = productRowsInV2.flatMap((row, index) => {
  const migrated = productMigrationByCode.get(norm(row[1]));
  return migrated ? [{ range: `ProductsV2!D${index + 2}:E${index + 2}`, values: [[migrated[3], migrated[4]]] }] : [];
});
if (productUpdates.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data: productUpdates } });
