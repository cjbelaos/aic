import type { PurchaseOrderResponse } from "@/types/purchaseOrder";
import { BusinessDocumentHeader } from "./business-document-print-layout";

const money = (value: number) => value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PurchaseOrderPrintDocument({ po }: { po: PurchaseOrderResponse }) {
  const subtotal = po.totalAmount ?? po.items.reduce((sum, item) => sum + (item.totalAmount ?? item.quantity * item.pricePerUnit), 0);
  const shipName = po.shipToName || "Aerich Innovation Corp.";
  const shipAddress = po.shipToAddress || "BLK 4 LOT 2 BAMBOO ORCHARD BANAY - BANAY\\nCABUYAO CITY, LAGUNA";
  const shipContact = po.shipToContact || "0968-267-7913 / 0939-910-0597";
  return (
    <main className="receipt">
      <table aria-label="Purchase order items">
        <colgroup>{[6, 42, 10, 10, 16, 16].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
        <thead>
          <tr><th colSpan={6} className="heading-cell">
            <BusinessDocumentHeader title="PURCHASE ORDER" number={po.poNumber || "DRAFT"} draft={po.status === "draft" && !po.poNumber.startsWith("DRAFT")} />
            <div className="details">
              <div><div className="label">Supplier</div><div className="customer">{po.supplierName}</div><div className="multiline">{po.address}</div><div>TIN: {po.tin || "—"}</div></div>
              <div><div><b>Date:</b> {po.date}</div><div><b>PR No.:</b> {po.prNumber || "—"}</div><div className="label">Ship to</div><b>Aerich Innovation Corp.</b><div>Banay - Banay Cabuyao City, Laguna</div><div>0968-267-7913 / 0939-910-0597</div></div>
            </div>
          </th></tr>
          <tr className="columns"><th scope="col">#</th><th scope="col">Description</th><th scope="col" className="qty">Qty</th><th scope="col">Unit</th><th scope="col" className="qty">Unit price</th><th scope="col" className="qty">Amount</th></tr>
        </thead>
        <tbody>{po.items.map((item, index) => <tr className="item" key={index}><td>{index + 1}</td><td>{item.description || "—"}</td><td className="qty">{item.quantity.toLocaleString("en-PH", { maximumFractionDigits: 6 })}</td><td>{item.unit}</td><td className="qty">{money(item.pricePerUnit)}</td><td className="qty">{money(item.totalAmount ?? item.quantity * item.pricePerUnit)}</td></tr>)}</tbody>
      </table>
      <div className="summary">End of items · {po.items.length} line items<br /><strong>Subtotal (PHP): {money(subtotal)}</strong></div>
      {po.comments && <div className="notes multiline"><div className="label">Comments or special instructions</div>{po.comments}</div>}
      <div className="signatures">
        <div className="signature"><strong>{po.preparedBy || "\u00a0"}</strong><span>Prepared by</span></div>
        <div className="signature"><strong>{po.approvedBy || "\u00a0"}</strong><span>Approved by</span></div>
        <div className="signature"><strong>{po.notedBy || "\u00a0"}</strong><span>Noted by</span></div>
      </div>
      <p className="acknowledgment">Signature over printed name</p>
    </main>
  );
}
