import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/liquidation-validation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { getVatReferenceError, getVatVendorError } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const receipt = { date: "2026-10-07", description: "Test receipt", category: "Other", amount: 100, vat: 12 };
assert.match(getVatReferenceError([receipt]), /Receipt item 1:/);
assert.match(getVatReferenceError([{ ...receipt, siNumber: " \t\n" }]), /document reference/);
for (const field of ["siNumber", "orNumber", "drNumber", "crNumber", "bsNumber", "checkNo", "cvNo", "refNo"]) {
  assert.equal(getVatReferenceError([{ ...receipt, [field]: " REF-001 " }]), null, field);
}
assert.equal(getVatReferenceError([{ ...receipt, vat: undefined }]), null);
assert.equal(getVatReferenceError([{ ...receipt, vat: 0 }]), null);
assert.match(getVatReferenceError([{ ...receipt, siNumber: "SI-1" }, receipt]), /Receipt item 2:/);
assert.equal(getVatReferenceError([]), null);
console.log("Liquidation VAT document-reference checks passed.");

const vendor = { supplierName: "Supplier", address: "Supplier address", tin: "000-000-000" };
assert.equal(getVatVendorError([{ ...receipt, ...vendor }]), null);
for (const [field, label] of [["supplierName", "Supplier Name"], ["address", "Supplier Address"], ["tin", "TIN"]]) {
  for (const value of [undefined, "", " \t\n"]) {
    assert.ok(getVatVendorError([{ ...receipt, ...vendor, [field]: value }]).includes(label));
  }
}
for (const vat of [undefined, 0]) {
  assert.equal(getVatVendorError([{ ...receipt, ...vendor, tin: undefined, vat }]), null);
  for (const [field, label] of [["supplierName", "Supplier Name"], ["address", "Supplier Address"]]) {
    for (const value of [undefined, "", " \t\n"]) {
      assert.ok(getVatVendorError([{ ...receipt, ...vendor, vat, [field]: value }]).includes(label));
    }
  }
}
assert.match(getVatVendorError([{ ...receipt, ...vendor }, receipt]), /Receipt item 2:/);
assert.equal(getVatVendorError([]), null);
console.log("Liquidation VAT vendor-information checks passed.");
