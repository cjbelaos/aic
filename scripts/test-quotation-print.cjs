/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { createLoader } = require("./proforma-runtime.cjs");
const load = createLoader({
  "./user-signature-image": { UserSignatureImage: () => null },
  "@/lib/userSignatures": { signerNameKey: name => name || "" },
});
const { QuotationPrintDocument } = load("src/components/quotation-print-document.tsx");
for (const pricingMode of ["PER_LINE", "SINGLE_TOTAL"]) {
  for (const discount of [0, 112]) {
    const quotation = {
      quotationNo: "Q-001", customer: "Test", date: "2026-11-03",
      items: [{ description: "Work", quantity: 1, unit: "lot", unitPrice: 1120 }],
      notation: [], pricingMode, singleTotalPrice: 1120,
      discount, shippingFee: 112, amount: 1232 - discount,
    };
    const html = renderToStaticMarkup(React.createElement(QuotationPrintDocument, { quotation }));
    const text = html.replace(/<[^>]*>/g, "");
    assert.ok(text.includes("Quotation Validity: Feb 1, 2027"));
    assert.ok(text.includes("Conforme by / date"));
    assert.ok(!text.includes("Client acceptance"));
    assert.ok(text.includes(`Less Discount (PHP): ${discount.toFixed(2)}`));
    assert.ok(text.includes(`Grand Total VAT Inc. (PHP): ${discount ? "1,120.00" : "1,232.00"}`));
    assert.ok(text.includes(`Vatable Amount (PHP): ${discount ? "1,000.00" : "1,100.00"}`));
    assert.ok(text.includes(`VAT (PHP): ${discount ? "120.00" : "132.00"}`));
    assert.ok(text.indexOf("Less Discount") < text.indexOf("Grand Total"));
    assert.ok(text.indexOf("Grand Total") < text.indexOf("Vatable Amount"));
    assert.ok(text.indexOf("Vatable Amount") < text.indexOf("VAT (PHP)"));
  }
}
for (const [date, expected] of [
  ["2026-11-03", "Feb 1, 2027"],
  ["Nov 3, 2026", "Feb 1, 2027"],
  ["Oct 31, 2026", "Jan 29, 2027"],
  ["2028-01-01", "Mar 31, 2028"],
  ["", "—"],
  ["invalid", "—"],
]) {
  const html = renderToStaticMarkup(React.createElement(QuotationPrintDocument, {
    quotation: { date, quotationNo: "Q-001", items: [], notation: [], amount: 0, discount: 0 },
  }));
  assert.ok(html.includes(`<div><b>Date:</b> ${date}</div><div><b>Quotation Validity:</b> ${expected}</div>`));
}
console.log("Quotation print tests passed (zero/nonzero discount, both pricing modes, shipping, VAT).");
