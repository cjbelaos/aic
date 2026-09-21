// Delivery Release reference — focused tests.
//
// Covers both reference modes (a selected Sales Order, or a manually typed legacy
// TR Number), their mutual exclusivity on create and edit, and the display of
// historical records. The mapping under test is the same one the Sheets layer and
// the API routes use, so a regression here is a regression in production.

import assert from "node:assert/strict";
import {
  DELIVERY_REFERENCE_COLUMN,
  DELIVERY_REFERENCE_ENTER_TR_NUMBER_ERROR,
  DELIVERY_REFERENCE_FIELD_LABEL,
  DELIVERY_REFERENCE_MODE_CHOICES,
  DELIVERY_REFERENCE_SELECT_SALES_ORDER_ERROR,
  DELIVERY_SALES_ORDER_ID_COLUMN,
  TR_NUMBER_FIELD_LABEL,
  deliveryReferenceDisplay,
  deliveryReferenceFromRow,
  deliveryReferenceKindLabel,
  deliveryReferenceRowValues,
  legacyTrNumberForRecord,
  referenceModeForRecord,
  resolveDeliveryReference,
} from "../../src/lib/deliveryReference.ts";

/** Builds a DeliveryReceipts row (A:S) with only the reference columns set. */
function receiptRow(reference: string, salesOrderId: string): string[] {
  const row = new Array<string>(DELIVERY_SALES_ORDER_ID_COLUMN + 1).fill("");
  row[0] = "3700";
  row[DELIVERY_REFERENCE_COLUMN] = reference;
  row[DELIVERY_SALES_ORDER_ID_COLUMN] = salesOrderId;
  return row;
}

// Contract: label, mode choices and the unchanged column positions.
assert.equal(DELIVERY_REFERENCE_FIELD_LABEL, "Sales Order / TR Number");
assert.equal(TR_NUMBER_FIELD_LABEL, "TR Number");
assert.deepEqual(DELIVERY_REFERENCE_MODE_CHOICES.map((choice) => choice.value), ["SALES_ORDER", "TR_NUMBER"]);
assert.equal(DELIVERY_REFERENCE_COLUMN, 4, "reference column stays E");
assert.equal(DELIVERY_SALES_ORDER_ID_COLUMN, 18, "Sales Order link stays column S");

// 1. Create with a selected Sales Order: column E shows the Sales Order number
//    and column S stores the immutable link.
const createdWithSalesOrder = deliveryReferenceRowValues({
  referenceMode: "SALES_ORDER",
  salesOrderId: "so-1001",
  salesOrderNo: "AIC-SO-2026-0001",
});
assert.deepEqual(createdWithSalesOrder, { reference: "AIC-SO-2026-0001", salesOrderId: "so-1001" });
const createdRef = deliveryReferenceFromRow(
  receiptRow(createdWithSalesOrder.reference, createdWithSalesOrder.salesOrderId),
);
assert.equal(createdRef.referenceMode, "SALES_ORDER");
assert.equal(createdRef.isLinkedToSalesOrder, true);
assert.equal(createdRef.salesOrderNo, "AIC-SO-2026-0001");
assert.equal(legacyTrNumberForRecord(createdRef), "", "a linked release has no manual TR number");
assert.equal(deliveryReferenceDisplay(createdRef), "AIC-SO-2026-0001");
assert.equal(deliveryReferenceKindLabel(createdRef), "Sales Order");

// 2. Create with a manual TR Number: trimmed into column E, no Sales Order link,
//    so the fulfillment integration can never post against it.
const createdWithTr = deliveryReferenceRowValues({
  referenceMode: "TR_NUMBER",
  salesOrderId: "so-must-be-cleared",
  trNo: "  TR-8891  ",
});
assert.deepEqual(createdWithTr, { reference: "TR-8891", salesOrderId: "" });
const trRef = deliveryReferenceFromRow(receiptRow(createdWithTr.reference, createdWithTr.salesOrderId));
assert.equal(trRef.referenceMode, "TR_NUMBER");
assert.equal(trRef.isLinkedToSalesOrder, false);
assert.equal(trRef.salesOrderNo, "");
assert.equal(trRef.trNo, "TR-8891");
assert.equal(deliveryReferenceDisplay(trRef), "TR-8891");
assert.equal(deliveryReferenceKindLabel(trRef), "TR Number");

// 3. Edit switching Sales Order -> TR Number: the manual TR number replaces the
//    stored reference and column S is cleared.
const currentSoRow = { trNo: "AIC-SO-2026-0001", salesOrderId: "so-1001" };
const switchedToTr = deliveryReferenceRowValues(
  { referenceMode: "TR_NUMBER", trNo: "TR-4477" },
  currentSoRow,
);
assert.deepEqual(switchedToTr, { reference: "TR-4477", salesOrderId: "" });
const switchedTrRef = deliveryReferenceFromRow(receiptRow(switchedToTr.reference, switchedToTr.salesOrderId));
assert.equal(switchedTrRef.isLinkedToSalesOrder, false, "the Sales Order link must be cleared");
assert.equal(deliveryReferenceDisplay(switchedTrRef), "TR-4477");
assert.equal(referenceModeForRecord({ salesOrderId: undefined, trNo: "TR-4477" }), "TR_NUMBER");
assert.equal(legacyTrNumberForRecord({ salesOrderId: undefined, trNo: "TR-4477" }), "TR-4477");

// 4. Edit switching TR Number -> Sales Order: the Sales Order number replaces the
//    legacy value and the immutable link is stored again.
const currentTrRow = { trNo: "TR-8891", salesOrderId: "" };
const switchedToSo = deliveryReferenceRowValues(
  { referenceMode: "SALES_ORDER", salesOrderId: "so-2002", salesOrderNo: "AIC-SO-2026-0002" },
  currentTrRow,
);
assert.deepEqual(switchedToSo, { reference: "AIC-SO-2026-0002", salesOrderId: "so-2002" });
const switchedSoRef = deliveryReferenceFromRow(receiptRow(switchedToSo.reference, switchedToSo.salesOrderId));
assert.equal(switchedSoRef.isLinkedToSalesOrder, true);
assert.equal(legacyTrNumberForRecord(switchedSoRef), "", "the manual TR number must be cleared");
assert.equal(deliveryReferenceDisplay(switchedSoRef), "AIC-SO-2026-0002");
assert.equal(referenceModeForRecord({ salesOrderId: "so-2002", trNo: switchedSoRef.displayReference }), "SALES_ORDER");
assert.equal(legacyTrNumberForRecord({ salesOrderId: "so-2002", trNo: switchedSoRef.displayReference }), "", "the edit form must not pre-fill the SO number as a TR number");

// 5. Legacy TR-only records keep rendering their TR number.
const legacy = deliveryReferenceFromRow(receiptRow("TR-1540", ""));
assert.equal(legacy.referenceMode, "TR_NUMBER");
assert.equal(legacy.isLinkedToSalesOrder, false);
assert.equal(deliveryReferenceDisplay(legacy), "TR-1540");
assert.equal(referenceModeForRecord({ salesOrderId: undefined, trNo: "TR-1540" }), "TR_NUMBER");
assert.equal(legacyTrNumberForRecord({ salesOrderId: undefined, trNo: "TR-1540" }), "TR-1540");
// A historical value that looks like a Sales Order number but has no stored link
// is still shown exactly as stored: history is never re-derived or rewritten.
const legacySoLooking = deliveryReferenceFromRow(receiptRow("AIC-SO-2025-0009", ""));
assert.equal(legacySoLooking.referenceMode, "TR_NUMBER");
assert.equal(deliveryReferenceDisplay(legacySoLooking), "AIC-SO-2025-0009");
// Unlinked releases stay unlinked and stay valid (the reference is optional).
const unlinked = deliveryReferenceFromRow(receiptRow("", ""));
assert.equal(unlinked.displayReference, "");
assert.equal(deliveryReferenceDisplay({}), "");
assert.equal(deliveryReferenceKindLabel({}), "");
assert.equal(referenceModeForRecord({}), "SALES_ORDER", "forms open on the current flow");

// Mutual exclusivity, enforced by the resolver the API routes call.
const exclusiveTr = resolveDeliveryReference({ referenceMode: "TR_NUMBER", salesOrderId: "so-1", trNo: "TR-1" });
assert.equal(exclusiveTr.salesOrderId, "");
assert.equal(exclusiveTr.trNo, "TR-1");
const exclusiveSo = resolveDeliveryReference({ referenceMode: "SALES_ORDER", salesOrderId: "so-1", salesOrderNo: "AIC-SO-1", trNo: "TR-1" });
assert.equal(exclusiveSo.salesOrderId, "so-1");
assert.equal(exclusiveSo.trNo, "AIC-SO-1", "the Sales Order number wins while the Sales Order mode is engaged");

// Validation: each engaged mode requires its own value.
assert.equal(resolveDeliveryReference({ referenceMode: "SALES_ORDER" }).error, DELIVERY_REFERENCE_SELECT_SALES_ORDER_ERROR);
assert.equal(resolveDeliveryReference({ referenceMode: "TR_NUMBER", trNo: "   " }).error, DELIVERY_REFERENCE_ENTER_TR_NUMBER_ERROR);
assert.equal(resolveDeliveryReference({ referenceMode: "TR_NUMBER", trNo: "TR-1" }).error, undefined);
assert.equal(
  deliveryReferenceRowValues({ referenceMode: "TR_NUMBER", trNo: "" }, { trNo: "TR-keep", salesOrderId: "so-keep" }).error,
  DELIVERY_REFERENCE_ENTER_TR_NUMBER_ERROR,
);

// Backward compatibility: a payload without a mode keeps the previous mapping, so
// historical rows and any older caller are untouched.
assert.deepEqual(
  deliveryReferenceRowValues({ salesOrderId: "so-9", salesOrderNo: "AIC-SO-9", trNo: "TR-9" }),
  { reference: "AIC-SO-9", salesOrderId: "so-9" },
);
assert.deepEqual(
  deliveryReferenceRowValues({ salesOrderNo: "AIC-SO-9", trNo: "TR-9" }),
  { reference: "AIC-SO-9", salesOrderId: "" },
);
assert.deepEqual(
  deliveryReferenceRowValues({}, { trNo: "TR-stored", salesOrderId: "so-stored" }),
  { reference: "TR-stored", salesOrderId: "so-stored" },
);
assert.deepEqual(
  deliveryReferenceRowValues({ trNo: "TR-supplied" }, { trNo: "TR-stored", salesOrderId: "so-stored" }),
  { reference: "TR-supplied", salesOrderId: "so-stored" },
);

console.log("delivery-release reference tests passed");

