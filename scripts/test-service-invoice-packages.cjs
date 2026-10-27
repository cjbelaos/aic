/* eslint-disable @typescript-eslint/no-require-imports -- Isolated server tests with in-memory Sheets. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", js)(id => Object.hasOwn(mocks, id) ? mocks[id] : id.startsWith("@/") ? {} : id.startsWith(".") ? load(path.resolve(path.dirname(file), id.endsWith(".ts") ? id : `${id}.ts`), mocks) : require(id), mod, mod.exports);
  return mod.exports;
}


const { invoiceTotals, resolveInvoiceDiscount, hydrateInvoiceDiscount } = load("src/lib/serviceInvoiceDiscounts.ts");
const presentation = load("src/lib/serviceInvoicePresentation.ts");
const PrintDocument = load("src/components/service-invoice-print-document.tsx", { "@/lib/serviceInvoiceDiscounts": { invoiceTotals }, "@/lib/serviceInvoicePresentation": presentation }).default;
const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
const items = [{ description: 'CARBON DIGITAL CONTROL VALVE 4"', quantity: 1, unitPrice: 35000 }, { description: "CONVERSION FROM FLECK TO DIGITAL CONTROL VALVE; DISMANTLING AND INSTALLATION OF NEW CONTROL VALVE", quantity: 1, unitPrice: 0, includedInPackage: true }];
const context = { version: 1, serviceCompanyId: "COMP-336", serviceCompanyName: "HEMOTEK RENAL CENTER INC. - CABANATUAN" };
const discount = resolveInvoiceDiscount(items);
const reloaded = items.map(({ includedInPackage, ...item }) => item);
hydrateInvoiceDiscount(reloaded, JSON.parse(JSON.stringify(discount)));
assert.equal(reloaded[1].includedInPackage, true, "Package flags survive persisted discount snapshots");
assert.equal(invoiceTotals({ items: [{...items[1], unitPrice: 999}, items[0]] }).grandTotal, 35000, "Included quantities never add charges");
const si = { invoiceKind: "service", invoiceNo: "1773", date: "2026-10-27", companyName: "HEMOTEK RENAL CENTER INC", address: "PACO, MANILA", tin: "", preparedBy: "", items: reloaded, serviceContext: context, discountAmount: 0 };
const html = renderToStaticMarkup(React.createElement(PrintDocument, { si }));
const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(match => [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(cell => cell[1].replace(/<[^>]+>/g, "").trim()));
assert.deepEqual(rows[1].slice(1), ["1", "", ""], "Included line prints quantity only, with no zero amount");
assert.deepEqual(rows[2].slice(1), ["", "", ""], "Branch notation has no numeric values");
assert.match(rows[2][0], /CABANATUAN/);
assert.equal(invoiceTotals(si).grandTotal, 35000);
const legacyHtml = renderToStaticMarkup(React.createElement(PrintDocument, { si: { ...si, serviceContext: undefined, items: items.map(({ includedInPackage, ...item }) => item) } }));
assert.ok(!legacyHtml.includes("Service location:"), "Legacy invoices gain no notation implicitly");
const source = { salesOrderItemId: "SO-L1", productId: "P1", description: "Valve", lineStatus: "ACTIVE", priceSource: "MANUAL", unitPrice: 100, taxMode: "VAT_EXCLUSIVE", taxRate: 0.12, quantity: 50 };
const copied = presentation.invoiceItemsFromDelivery([{ description: "Valve", quantity: 2, productId: "P1", productCode: "V", unit: "pc" }], [source]);
assert.equal(copied[0].quantity, 2, "Use DR quantity, not total SO quantity");
assert.ok(Math.abs(copied[0].unitPrice - 112) < 0.001);
assert.equal(copied[0].salesOrderItemId, "SO-L1");
assert.equal(presentation.invoiceItemsFromDelivery([{ description: "Unknown", quantity: 3 }], [source])[0].unitPrice, 0);
assert.equal(presentation.invoiceItemsFromDelivery([{ description: "Valve", quantity: 3, productId: "P1" }], [source, source])[0].unitPrice, 0, "Ambiguous matches require manual pricing");
fs.mkdirSync("tmp/invoice-print-check", { recursive: true });
fs.writeFileSync("tmp/invoice-print-check/si-1773.html", `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:white">${html}</body></html>`);
console.log("PASS package persistence, totals, printed numeric blanks, branch notation, legacy isolation, DR quantity and SO price mapping");

const { invoiceCoarseFromRow } = load("src/lib/serviceReports/invoiceRow.ts");
const row = Array(21).fill(""); row[0] = "1773"; row[2] = "COMP-114"; row[19] = JSON.stringify({ serviceContext: context });
assert.equal(invoiceCoarseFromRow(row).customerId, "COMP-336", "Service reports stay at the service branch, not the payer");
row[19] = "";
assert.equal(invoiceCoarseFromRow(row).customerId, "COMP-114", "Legacy service report source remains unchanged");
