// Golden East DR print form and FOR client — focused tests.
//
// The print form is chosen from the DR's company id; the FOR client must be a
// company billed to the DR's company (Companies column I).

import assert from "node:assert/strict";
import {
  defaultDeliveryReceiptPrintForm,
  forCompanyOptions,
  validateForCompany,
} from "../../src/lib/deliveryPrintForm.ts";

const cos = [
  { companyId: "COMP-96", companyName: "GOLDEN EAST RESOURCE TRADING, OPC", status: "active" },
  { companyId: "COMP-122", companyName: "HOLY FAMILY HOSPITAL - PADRE GARCIA", status: "active", billingCompanyId: "COMP-96" },
  { companyId: "COMP-900", companyName: "PRIMELUCK RENAL CARE INC.", status: "Active", billingCompanyId: "COMP-96" },
  { companyId: "COMP-901", companyName: "OLD CLINIC", status: "inactive", billingCompanyId: "COMP-96" },
  { companyId: "COMP-115", companyName: "HEMOTEK - CANDON", status: "active", billingCompanyId: "COMP-114" },
];
const WRONG_FOR = "The FOR client must be a company billed to this DR's company.";

// Print form defaults by company id only.
assert.equal(defaultDeliveryReceiptPrintForm({ companyId: "COMP-96" }), "golden-east");
assert.equal(defaultDeliveryReceiptPrintForm({ companyId: " COMP-96 " }), "golden-east");
assert.equal(defaultDeliveryReceiptPrintForm({ companyId: "COMP-122" }), "aerich");
assert.equal(defaultDeliveryReceiptPrintForm({}), "aerich");

// FOR options: active companies billed to the DR's company, by name.
assert.deepEqual(forCompanyOptions(cos, "COMP-96"), [
  { value: "COMP-122", label: "HOLY FAMILY HOSPITAL - PADRE GARCIA" },
  { value: "COMP-900", label: "PRIMELUCK RENAL CARE INC." },
]);
assert.deepEqual(forCompanyOptions(cos, "COMP-24"), []);
assert.deepEqual(forCompanyOptions(cos, ""), []);

// FOR validation: blank always allowed; must be billed to the DR's company.
assert.equal(validateForCompany(cos, "COMP-96", undefined), null);
assert.equal(validateForCompany(cos, "COMP-96", ""), null);
assert.equal(validateForCompany(cos, "COMP-96", "COMP-122"), null);
assert.equal(validateForCompany(cos, "COMP-96", "COMP-901"), null); // inactive but still billed to it
assert.equal(validateForCompany(cos, "COMP-96", "COMP-115"), WRONG_FOR);
assert.equal(validateForCompany(cos, "COMP-96", "COMP-404"), WRONG_FOR);
assert.equal(validateForCompany(cos, "COMP-96", "COMP-96"), WRONG_FOR);

console.log("print-form tests passed.");
