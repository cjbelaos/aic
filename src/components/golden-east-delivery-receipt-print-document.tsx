import type { DeliveryReceiptResponse } from "@/types/deliveryReceipt";
import { printSerialLine } from "@/lib/deliverySerials";
import { UserSignatureImage } from "./user-signature-image";
import { signerNameKey, type UserSignatureUrls } from "@/lib/userSignatures";

// Golden East Resource Trading, OPC letterhead for DRs Aerich delivers on their
// behalf. Copied from Golden East's own Google Sheets DR template. Keeps the same
// outer shape as DeliveryReceiptPrintDocument (one table whose thead holds the
// header) so businessDocumentPdf.tsx paginates it unchanged.

const MIN_BODY_ROWS = 12;

export function GoldenEastDeliveryReceiptPrintDocument({ dr, signatureUrls = {} }: { dr: DeliveryReceiptResponse; signatureUrls?: UserSignatureUrls }) {
  const fillerRows = Math.max(0, MIN_BODY_ROWS - dr.items.length - (dr.forCompanyName ? 1 : 0));
  return (
    <>
      <style>{`
        @page { margin: 0; }
        @media print { .receipt { padding: 12mm; } }
        .ge-doc, .ge-doc table { font: 11px/1.35 Arial, sans-serif; color: #000; }
        .ge-head { display: grid; grid-template-columns: 1fr 34%; border: 1px solid #000; }
        .ge-brand { display: flex; align-items: center; gap: 14px; padding: 8px 10px; }
        .ge-brand img { height: 60px; width: auto; }
        .ge-brand-name { flex: 1; text-align: center; font-size: 18px; font-weight: 700; line-height: 1.2; }
        .ge-title { border-left: 1px solid #000; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 8px; }
        .ge-title h1 { margin: 0; font-size: 18px; font-weight: 700; text-align: center; line-height: 1.15; }
        .ge-no { font-weight: 700; color: #FF0000; }
        .ge-no b { font-size: 16px; margin-left: 8px; }
        .ge-bar { height: 8px; background: #2F5496; border-inline: 1px solid #000; }
        .ge-details { display: grid; grid-template-columns: 1fr 34%; border: 1px solid #000; border-top: 0; }
        .ge-details > div { padding: 4px 8px; }
        .ge-details > div + div { border-left: 1px solid #000; }
        .ge-row { display: grid; grid-template-columns: 62px 1fr; gap: 6px; }
        .ge-row span:first-child { font-weight: 700; }
        .ge-doc .ge-cols th { background: #2F5496; color: #fff; font-weight: 700; font-size: 10px; text-align: center; padding: 3px 4px; border: 1px solid #000; }
        .ge-doc tbody td { border: 1px solid #000; padding: 3px 6px; height: 20px; vertical-align: top; }
        .ge-doc tbody tr { break-inside: avoid; page-break-inside: avoid; }
        .ge-c { text-align: center; }
        .ge-for { color: #FF0000; font-weight: 700; }
        .ge-serials { font-size: 0.85em; margin-top: 2px; }
        .ge-band { background: #B4C6E7; border: 1px solid #000; border-top: 0; font-weight: 700; padding: 3px 8px; }
        .ge-comments { border: 1px solid #000; border-top: 0; padding: 4px 8px; }
        .ge-sign { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; border: 1px solid #000; border-top: 0; padding: 10px 12px 14px; break-inside: avoid; page-break-inside: avoid; }
        .ge-sig { display: flex; flex-direction: column; align-items: center; text-align: center; margin-top: 6px; }
        .ge-sig .e-signature-image { margin: 0 auto -2px; }
        .ge-sig strong { display: block; width: 85%; min-height: 18px; border-bottom: 1px solid #000; font-weight: 400; }
        .ge-sig span { font-size: 10px; }
        .ge-label { font-size: 10px; }
      `}</style>
      <main className="receipt ge-doc">
        <table aria-label="Delivery receipt items">
          <colgroup><col style={{ width: "10%" }} /><col style={{ width: "12%" }} /><col style={{ width: "58%" }} /><col style={{ width: "20%" }} /></colgroup>
          <thead>
            <tr><th colSpan={4} className="heading-cell" style={{ padding: 0 }}>
              <div className="ge-head">
                <div className="ge-brand">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/golden-east-logo-print.png" alt="Golden East Resource Trading, OPC logo" />
                  <div className="ge-brand-name">GOLDEN EAST<br />RESOURCE TRADING OPC</div>
                </div>
                <div className="ge-title">
                  <h1>DELIVERY<br />RECEIPT</h1>
                  <div className="ge-no">NO :<b>{dr.drNumber > 0 ? dr.drNumber : "DRAFT"}</b></div>
                  {dr.status === "draft" && dr.drNumber > 0 && <div className="ge-no">DRAFT</div>}
                </div>
              </div>
              <div className="ge-bar" />
              <div className="ge-details">
                <div>
                  <div className="ge-row"><span>Name:</span><span>{dr.companyName}</span></div>
                  <div className="ge-row"><span>Address:</span><span className="multiline">{dr.address}</span></div>
                  <div className="ge-row"><span>TIN:</span><span>{dr.tin || "—"}</span></div>
                </div>
                <div>
                  <div className="ge-row"><span>Date:</span><span>{dr.date}</span></div>
                  <div className="ge-row"><span>PO NO.</span><span>{dr.poNo || ""}</span></div>
                  <div className="ge-row"><span>TR#:</span><span>{dr.trNo || ""}</span></div>
                </div>
              </div>
            </th></tr>
            <tr className="ge-cols"><th scope="col">QTY</th><th scope="col">UNIT</th><th scope="col">DESCRIPTION</th><th scope="col">UNIT PRICE</th></tr>
          </thead>
          <tbody>
            {dr.items.map((item, index) => (
              <tr key={index}>
                <td className="ge-c">{item.quantity.toLocaleString("en-PH", { maximumFractionDigits: 6 })}</td>
                <td className="ge-c">{item.unit}</td>
                <td>{item.description || "?"}{printSerialLine(item) && <div className="ge-serials">{printSerialLine(item)}</div>}</td>
                <td />
              </tr>
            ))}
            {dr.forCompanyName && <tr><td /><td /><td className="ge-for">FOR: {dr.forCompanyName}</td><td /></tr>}
            {Array.from({ length: fillerRows }, (_, i) => <tr key={`blank-${i}`}><td /><td /><td /><td /></tr>)}
          </tbody>
        </table>
        <div className="ge-band">Comments or Special Instructions</div>
        {dr.comments && <div className="ge-comments multiline">{dr.comments}</div>}
        <div className="ge-sign">
          <div>
            <div className="ge-label">Prepared by:</div>
            <div className="ge-sig"><UserSignatureImage src={signatureUrls[signerNameKey(dr.preparedBy)]} alt="Prepared by signature" /><strong>{dr.preparedBy}</strong><span>Signature Over Printed Name</span></div>
            <div className="ge-label" style={{ marginTop: 10 }}>Delivered by:</div>
            <div className="ge-sig"><UserSignatureImage src={signatureUrls[signerNameKey(dr.deliveredBy)]} alt="Delivered by signature" /><strong>{dr.deliveredBy}</strong><span>Signature Over Printed Name</span></div>
          </div>
          <div>
            <div className="ge-label" style={{ textAlign: "center" }}>Received the above goods in good order and condition</div>
            <div className="ge-sig" style={{ marginTop: 32 }}><strong>&nbsp;</strong><span>Signature Over Printed Name</span></div>
          </div>
        </div>
      </main>
    </>
  );
}
