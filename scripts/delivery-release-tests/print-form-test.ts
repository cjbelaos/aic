// Golden East DR print form and FOR client — focused tests.
//
// The print form is chosen from the DR's company id; the FOR client must be a
// company billed to the DR's company (Companies column I).

import assert from "node:assert/strict";
import {
  billingCompanyOptions,
  deliveredToParty,
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

// Billing company dropdown: active customers other than the company itself, by name.
{
  const all = [
    { companyId: "COMP-96", companyName: "GOLDEN EAST RESOURCE TRADING, OPC", companyType: "Customer", status: "active" },
    { companyId: "COMP-24", companyName: "B.BRAUN AVITUM PHILIPPINES INC.", companyType: "Both", status: "active" },
    { companyId: "COMP-25", companyName: "B.BRAUN AVITUM PHILS. INC.", companyType: "Supplier", status: "active" },
    { companyId: "COMP-50", companyName: "CLOSED CLINIC", companyType: "Customer", status: "inactive" },
    { companyId: "COMP-122", companyName: "HOLY FAMILY HOSPITAL - PADRE GARCIA", companyType: "Customer", status: "active" },
  ];
  assert.deepEqual(billingCompanyOptions(all, "COMP-122"), [
    { value: "COMP-24", label: "B.BRAUN AVITUM PHILIPPINES INC. (COMP-24)" },
    { value: "COMP-96", label: "GOLDEN EAST RESOURCE TRADING, OPC (COMP-96)" },
  ]);
  assert.equal(billingCompanyOptions(all, "").length, 3); // new company: nothing to exclude
}
console.log("billing-company options tests passed.");

// "Delivered to": the FOR client on the Golden East form; the DR's company otherwise.
{
  const dr = { companyName: "GOLDEN EAST RESOURCE TRADING, OPC", address: "LIPA CITY", tin: "638-269-239-000",
    forCompanyName: "HOLY FAMILY HOSPITAL - PADRE GARCIA", forCompanyAddress: "PADRE GARCIA, BATANGAS", forCompanyTin: "111-222-333-000" };
  assert.deepEqual(deliveredToParty(dr, "golden-east"), { name: "HOLY FAMILY HOSPITAL - PADRE GARCIA", address: "PADRE GARCIA, BATANGAS", tin: "111-222-333-000" });
  assert.deepEqual(deliveredToParty(dr, "aerich"), { name: "GOLDEN EAST RESOURCE TRADING, OPC", address: "LIPA CITY", tin: "638-269-239-000" });
  const noFor = { companyName: "GOLDEN EAST RESOURCE TRADING, OPC", address: "LIPA CITY", tin: "638-269-239-000" };
  assert.deepEqual(deliveredToParty(noFor, "golden-east"), { name: "GOLDEN EAST RESOURCE TRADING, OPC", address: "LIPA CITY", tin: "638-269-239-000" });
  // FOR client with no address/TIN on record prints blanks, not Golden East's details.
  assert.deepEqual(deliveredToParty({ ...noFor, forCompanyName: "PRIMELUCK RENAL CARE INC." }, "golden-east"), { name: "PRIMELUCK RENAL CARE INC.", address: "", tin: "" });
}
console.log("delivered-to tests passed.");
