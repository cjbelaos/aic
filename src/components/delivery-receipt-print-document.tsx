import type { DeliveryReceiptResponse } from "@/types/deliveryReceipt";

import { BusinessDocumentHeader } from "./business-document-print-layout";
export { businessDocumentPrintShell as deliveryReceiptPrintShell } from "./business-document-print-layout";

export function DeliveryReceiptPrintDocument({ dr }: { dr: DeliveryReceiptResponse }) {
  return (
    <main className="receipt">
      <table aria-label="Delivery receipt items">
        <colgroup><col style={{ width: "6%" }} /><col style={{ width: "72%" }} /><col style={{ width: "10%" }} /><col style={{ width: "12%" }} /></colgroup>
        <thead>
          <tr><th colSpan={4} className="heading-cell">
            <BusinessDocumentHeader title="DELIVERY RECEIPT" number={dr.drNumber > 0 ? `DR ${dr.drNumber}` : "DRAFT"} draft={dr.status === "draft" && dr.drNumber > 0} />
            <div className="details">
              <div><div className="label">Delivered to</div><div className="customer">{dr.companyName}</div><div className="multiline">{dr.address}</div><div>TIN: {dr.tin || "—"}</div></div>
              <div><div><b>Date:</b> {dr.date}</div><div><b>PO No.:</b> {dr.poNo || "—"}</div><div><b>TR No.:</b> {dr.trNo || "—"}</div></div>
            </div>
          </th></tr>
          <tr className="columns"><th scope="col">#</th><th scope="col">Description</th><th scope="col">Unit</th><th scope="col" className="qty">Quantity</th></tr>
        </thead>
        <tbody>{dr.items.map((item, index) => <tr className="item" key={index}><td>{index + 1}</td><td>{item.description || "?"}</td><td>{item.unit}</td><td className="qty">{item.quantity.toLocaleString("en-PH", { maximumFractionDigits: 6 })}</td></tr>)}</tbody>
      </table>
      <div className="summary">End of items · {dr.items.length} line item{dr.items.length === 1 ? "" : "s"}</div>
      {dr.comments && <div className="notes multiline"><div className="label">Remarks</div>{dr.comments}</div>}
      <div className="signatures">
        <div className="signature"><strong>{dr.preparedBy}</strong><span>Prepared by</span></div>
        <div className="signature"><strong>{dr.deliveredBy}</strong><span>Delivered by</span></div>
        <div className="signature"><strong>&nbsp;</strong><span>Received by / Date</span></div>
      </div>
      <p className="acknowledgment">Received the items listed above. Please print name and sign to acknowledge delivery.</p>
    </main>
  );
}
