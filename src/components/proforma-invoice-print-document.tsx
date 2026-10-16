import type { ProformaInvoice } from "@/types/proformaInvoice";
import { BusinessDocumentHeader } from "./business-document-print-layout";
import { UserSignatureImage } from "./user-signature-image";
import { signerNameKey, type UserSignatureUrls } from "@/lib/userSignatures";
const money = (value: number) => value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function ProformaInvoicePrintDocument({ invoice, signatureUrls = {} }: { invoice: ProformaInvoice; signatureUrls?: UserSignatureUrls }) {
  return <>
    <style>{`.receipt .signatures { grid-template-columns: repeat(2, 1fr); gap: 48px; } .proforma-footer { break-inside: avoid; page-break-inside: avoid; } .proforma-total { margin-top: 16px; text-align: right; font-size: 15px; border-top: 2px solid #17232d; padding-top: 8px; } .receipt .business-document-header h1 { font-size: 20px; } .receipt .business-document-header .number { font-size: 15px; }`}</style>
    <main className="receipt">
      <table aria-label="Proforma Invoice items">
        <colgroup>{[5, 42, 8, 9, 17, 19].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
        <thead>
          <tr><th colSpan={6} className="heading-cell">
            <BusinessDocumentHeader title="PRO FORMA INVOICE" number={invoice.invoiceNo || "DRAFT"} />
            {invoice.status === "CANCELLED" && <p>CANCELLED</p>}
            <div className="details"><div><div className="label">Sold to</div><div className="customer">{invoice.companyName}</div><div className="multiline">{invoice.address}</div><div>TIN: {invoice.tin || "—"}</div></div>
              <div><div><b>Date:</b> {invoice.date}</div><div><b>DR No.:</b> {invoice.drNo || "—"}</div><div><b>PO No.:</b> {invoice.poNo || "—"}</div><div><b>SO No.:</b> {invoice.salesOrderNo || "—"}</div><div><b>TR No.:</b> {invoice.trNo || "—"}</div></div></div>
          </th></tr>
          <tr className="columns"><th>#</th><th>Product Name</th><th>Unit</th><th className="qty">Qty</th><th className="qty">Unit Price</th><th className="qty">Total Amount</th></tr>
        </thead>
        <tbody>{invoice.items.map((item, index) => <tr className="item" key={index}><td>{index + 1}</td><td>{item.productName}</td><td>{item.unit}</td><td className="qty">{item.quantity.toLocaleString("en-PH", { maximumFractionDigits: 6 })}</td><td className="qty">{money(item.unitPrice)}</td><td className="qty">{money(item.amount)}</td></tr>)}</tbody>
      </table>
      <div className="proforma-footer">
        <div className="proforma-total"><b>TOTAL AMOUNT DUE &nbsp; ₱ {money(invoice.totalAmount)}</b></div>
        {invoice.remarks && <div className="notes multiline"><div className="label">Remarks</div>{invoice.remarks}</div>}
        <div className="signatures"><div className="signature"><UserSignatureImage src={signatureUrls[signerNameKey(invoice.preparedBy)]} alt="Prepared by signature" /><strong>{invoice.preparedBy}</strong><span>Prepared by</span></div><div className="signature"><strong>&nbsp;</strong><span>Received by / Date</span></div></div>
        <p className="acknowledgment">Received the above items in good order and condition.</p>
      </div>
    </main>
  </>;
}
