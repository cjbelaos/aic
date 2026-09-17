import { isDraftQuotationReference } from "@/lib/quotationReference";
import type { Quotation } from "@/types/quotation";
import { BusinessDocumentHeader } from "./business-document-print-layout";
import { UserSignatureImage } from "./user-signature-image";
import { signerNameKey, type UserSignatureUrls } from "@/lib/userSignatures";

const money = (value: number) => value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function QuotationPrintDocument({ quotation: q, signatureUrls = {} }: { quotation: Quotation; signatureUrls?: UserSignatureUrls }) {
  const subtotal = q.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return <main className="receipt">
    <table aria-label="Quotation items">
      <colgroup>{[6, 42, 10, 10, 16, 16].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
      <thead>
        <tr><th colSpan={6} className="heading-cell">
          <BusinessDocumentHeader title="QUOTATION" number={isDraftQuotationReference(q.quotationNo) ? "" : q.quotationNo} draft={isDraftQuotationReference(q.quotationNo)} />
          <div className="details"><div><div className="label">Prepared for</div><div className="customer">{q.customer}</div><div className="multiline">{q.description}</div></div><div><b>Date:</b> {q.date}</div></div>
        </th></tr>
        <tr className="columns"><th scope="col">#</th><th scope="col">Description</th><th scope="col" className="qty">Qty</th><th scope="col">Unit</th><th scope="col" className="qty">Unit price</th><th scope="col" className="qty">Amount</th></tr>
      </thead>
      <tbody>{q.items.map((item, index) => <tr className="item" key={index}><td>{index + 1}</td><td>{item.description}</td><td className="qty">{item.quantity.toLocaleString("en-PH", { maximumFractionDigits: 6 })}</td><td>{item.unit}</td><td className="qty">{money(item.unitPrice)}</td><td className="qty">{money(item.quantity * item.unitPrice)}</td></tr>)}</tbody>
    </table>
    <div className="summary">End of items · {q.items.length} line items<br />Subtotal (PHP): {money(subtotal)}{(q.shippingFee || 0) > 0 && <><br />Shipping fee (PHP): {money(q.shippingFee || 0)}</>}{q.discount > 0 && <><br />Discount (PHP): {money(q.discount)}</>}<br /><strong>Grand total (PHP): {money(q.amount)}</strong></div>
    {(q.terms || q.delivery || q.warranty) && <div className="notes multiline">{q.terms && <div><b>Payment terms:</b> {q.terms}</div>}{q.delivery && <div><b>Delivery:</b> {q.delivery}</div>}{q.warranty && <div><b>Warranty:</b> {q.warranty}</div>}</div>}
    {q.notation.length > 0 && <div className="notes"><div className="label">Notes &amp; notations</div><ol>{q.notation.map((note, index) => <li className="multiline" key={index}>{note.notation}</li>)}</ol></div>}
    <div className="signatures">
      <div className="signature"><UserSignatureImage src={signatureUrls[signerNameKey(q.preparedBy)]} alt="Prepared by signature" /><strong>{q.preparedBy || "\u00a0"}</strong><span>Prepared by</span></div>
      <div className="signature"><UserSignatureImage src={signatureUrls[signerNameKey(q.approvedBy)]} alt="Approved by signature" /><strong>{q.approvedBy || "\u00a0"}</strong><span>Approved by</span></div>
      <div className="signature"><strong>{"\u00a0"}</strong><span>Client acceptance / date</span></div>
    </div>
  </main>;
}
