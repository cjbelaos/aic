import type { PrView } from "@/components/purchase-requests/api";
import { BusinessDocumentHeader } from "./business-document-print-layout";
import { UserSignatureImage } from "./user-signature-image";
import { signerNameKey, type UserSignatureUrls } from "@/lib/userSignatures";

const qty = (value: number) => value.toLocaleString("en-PH", { maximumFractionDigits: 4 });

/** A4 Purchase Request, same layout and styles as the PO print. */
export function PurchaseRequestPrintDocument({ pr, signatureUrls = {} }: { pr: PrView; signatureUrls?: UserSignatureUrls }) {
  return (
    <main className="receipt">
      <table aria-label="Purchase request items">
        <colgroup>{[5, 14, 33, 8, 8, 16, 16].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
        <thead>
          <tr><th colSpan={7} className="heading-cell">
            <BusinessDocumentHeader title="PURCHASE REQUEST" number={pr.prNo || "DRAFT"} draft={pr.status === "DRAFT"} />
            <div className="details">
              <div>
                <div className="label">Sales order</div><div className="customer">{pr.salesOrderNoSnapshot}</div>
                <div>{pr.customerNameSnapshot}</div><div className="multiline">{pr.deliveryAddressSnapshot}</div>
                <div><b>Quotation No.:</b> {pr.quotationNoSnapshot || "—"}</div>
              </div>
              <div>
                <div><b>Date requested:</b> {pr.requestedDate}</div>
                <div><b>Needed by:</b> {pr.neededByDate || "—"}</div>
                <div><b>Requested by:</b> {pr.requestedByName}</div>
              </div>
            </div>
          </th></tr>
          <tr className="columns"><th scope="col">#</th><th scope="col">Code</th><th scope="col">Description</th><th scope="col" className="qty">Qty</th><th scope="col">Unit</th><th scope="col">For</th><th scope="col">Remarks</th></tr>
        </thead>
        <tbody>{pr.lines.map((line, index) => (
          <tr className="item" key={line.prItemId}>
            <td>{index + 1}</td><td>{line.productCodeSnapshot}</td><td>{line.productNameSnapshot}</td>
            <td className="qty">{qty(line.quantity)}</td><td>{line.unitSnapshot}</td><td>{line.forLabel || "—"}</td><td>{line.remarks || "—"}</td>
          </tr>
        ))}</tbody>
      </table>
      <div className="summary">End of items · {pr.lines.length} line items</div>
      {pr.purpose && <div className="notes multiline"><div className="label">Purpose / job notes</div>{pr.purpose}</div>}
      <div className="signatures" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="signature"><UserSignatureImage src={signatureUrls[signerNameKey(pr.requestedByName)]} alt="Requested by signature" /><strong>{pr.requestedByName || " "}</strong><span>Requested by</span></div>
        <div className="signature"><UserSignatureImage alt="Received by signature" /><strong>{" "}</strong><span>Received by</span></div>
      </div>
      <p className="acknowledgment">Signature over printed name</p>
    </main>
  );
}
