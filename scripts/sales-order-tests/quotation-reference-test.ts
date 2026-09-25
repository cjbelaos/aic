// Quotation reference modes — the default existing-quotation selection and the
// manual external quotation number, including mutual exclusivity and the
// non-empty requirement. Pure module: no Google or React boundaries.

import assert from "node:assert/strict";
import {
  EXTERNAL_QUOTATION_REQUIRED_ERROR,
  INPUT_EXTERNAL_QUOTATION_LABEL,
  SELECT_EXISTING_QUOTATION_LABEL,
  isSalesOrderQuotationSource,
  normalizeExternalQuotationNo,
  resolveSalesOrderQuotation,
  salesOrderQuotationDisplay,
} from "../../src/lib/salesOrders/quotationReference.ts";

// The exact switch labels the creation flow renders.
assert.equal(INPUT_EXTERNAL_QUOTATION_LABEL, "Input External Quotation Number");
assert.equal(SELECT_EXISTING_QUOTATION_LABEL, "Select Existing Quotation");

// 1. Existing-quotation selection is preserved exactly (the default).
const internal = resolveSalesOrderQuotation({ quotationSource: "INTERNAL", quotationNo: "  QT-001 " });
assert.equal(internal.source, "INTERNAL");
assert.equal(internal.quotationNo, "QT-001");
assert.equal(internal.error, undefined);
// A blank selection stays optional: a quotation-free order is still valid.
assert.equal(resolveSalesOrderQuotation({ quotationSource: "INTERNAL" }).error, undefined);

// 2. An external quotation number is saved as typed (trimmed) with no internal record.
const external = resolveSalesOrderQuotation({ quotationSource: "EXTERNAL", externalQuotationNo: "  EXT-8891 " });
assert.equal(external.source, "EXTERNAL");
assert.equal(external.quotationNo, "EXT-8891");
assert.equal(external.error, undefined);

// 3. An external number is required before submission.
const missingExternal = resolveSalesOrderQuotation({ quotationSource: "EXTERNAL", externalQuotationNo: "   " });
assert.equal(missingExternal.quotationNo, "");
assert.equal(missingExternal.error, EXTERNAL_QUOTATION_REQUIRED_ERROR);

// 4. Modes are mutually exclusive: one reference is stored, never both.
assert.equal(resolveSalesOrderQuotation({ quotationSource: "EXTERNAL", quotationNo: "QT-001", externalQuotationNo: "EXT-1" }).quotationNo, "EXT-1");
assert.equal(resolveSalesOrderQuotation({ quotationSource: "INTERNAL", quotationNo: "QT-001", externalQuotationNo: "EXT-1" }).quotationNo, "QT-001");

// 5. Legacy payloads without a mode keep their previous behaviour.
const legacy = resolveSalesOrderQuotation({ quotationNo: "QT-002" });
assert.equal(legacy.source, null);
assert.equal(legacy.quotationNo, "QT-002");
assert.equal(legacy.error, undefined);
assert.deepEqual(resolveSalesOrderQuotation(), { source: null, quotationNo: "" });
// An unknown mode is treated as absent rather than rejected here; the request
// validator rejects it explicitly.
assert.equal(resolveSalesOrderQuotation({ quotationSource: "SOMETHING", quotationNo: "QT-9" }).source, null);

// 6. Helpers.
assert.equal(isSalesOrderQuotationSource("EXTERNAL"), true);
assert.equal(isSalesOrderQuotationSource("external"), false);
assert.equal(normalizeExternalQuotationNo("  X-1  "), "X-1");
assert.equal(salesOrderQuotationDisplay({ quotationNo: "EXT-1" }), "EXT-1");
assert.equal(salesOrderQuotationDisplay({}), "");

console.log("quotation-reference-test passed: internal default, external entry, mutual exclusivity, required value, legacy payloads.");
