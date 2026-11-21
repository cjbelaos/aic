import type { PrView } from "@/components/purchase-requests/api";
import { BusinessDocumentHeader } from "./business-document-print-layout";
import { UserSignatureImage } from "./user-signature-image";
import { signerNameKey, type UserSignatureUrls } from "@/lib/userSignatures";

const qty = (value: number) => value.toLocaleString("en-PH", { maximumFractionDigits: 4 });
const CAPTION = "SIGNATURE OVER PRINTED NAME / DESIGNATION / DATE";
const APPROVERS = [
  { name: "MAY C. ARQUIZA", title: "CHIEF FINANCE OFFICER" },
  { name: "ENGR. APOLLO M. ARQUIZA", title: "CHIEF EXECUTIVE OFFICER" },
];

// Scoped to the PR print so the shared .signatures styles (used by the PO print) stay untouched.
const SIGNATORY_STYLES = `
  .pr-signatories { display: grid; grid-template-columns: 1fr 1fr; column-gap: 48px; row-gap: 22px; margin-top: 26px; break-inside: avoid; page-break-inside: avoid; }
  .pr-signatory h4 { margin: 0; font-size: 13px; font-weight: 700; letter-spacing: .02em; }
  .pr-signatory .sign-space { height: 46px; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
  .pr-signatory .sign-space img { max-height: 36px; }
  .pr-signatory .sign-name { font-size: 12px; font-weight: 700; text-align: center; }
  .pr-signatory .sign-line { border-bottom: 1px solid #17232d; }
  .pr-signatory .caption { margin-top: 3px; font-size: 10px; }
  .pr-signatory .approver { margin-top: 14px; }
  .pr-signatory .approver strong { display: block; font-size: 13px; }
  .pr-signatory .approver span { font-size: 10px; }
`;

function SignLine({ heading, signature, name }: { heading: string; signature?: React.ReactNode; name?: string }) {
  return (
    <div className="pr-signatory">
      <h4>{heading}</h4>
      <div className="sign-space">{signature}{name && <div className="sign-name">{name}</div>}</div>
      <div className="sign-line" />
      <div className="caption">{CAPTION}</div>
    </div>
  );
}

/** A4 Purchase Request, same layout and styles as the PO print. */
export function PurchaseRequestPrintDocument({ pr, signatureUrls = {} }: { pr: PrView; signatureUrls?: UserSignatureUrls }) {
  const forLabel = pr.requestType === "CONTRACT" ? "Contract" : pr.requestType === "NONE" ? "Request" : "Sales order";
  const forValue = pr.requestType === "CONTRACT" ? pr.contractNoSnapshot : pr.requestType === "NONE" ? "—" : pr.salesOrderNoSnapshot;
  return (
    <main className="receipt">
      <style>{SIGNATORY_STYLES}</style>
      <table aria-label="Purchase request items">
        <colgroup>{[5, 14, 33, 8, 8, 16, 16].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
        <thead>
          <tr><th colSpan={7} className="heading-cell">
            <BusinessDocumentHeader title="PURCHASE REQUEST" number={pr.prNo || "DRAFT"} draft={pr.status === "DRAFT"} />
            <div className="details">
              <div>
                <div className="label">{forLabel}</div><div className="customer">{forValue || "—"}</div>
                {pr.customerNameSnapshot && <div>{pr.customerNameSnapshot}</div>}
                {pr.requestType === "SALES_ORDER" && <div className="multiline">{pr.deliveryAddressSnapshot}</div>}
                {pr.requestType === "SALES_ORDER" && <div><b>Quotation No.:</b> {pr.quotationNoSnapshot || "—"}</div>}
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
      <div className="pr-signatories">
        <SignLine heading="REQUESTED BY:" name={pr.requestedByName} signature={<UserSignatureImage src={signatureUrls[signerNameKey(pr.requestedByName)]} alt="Requested by signature" />} />
        <SignLine heading="NOTED BY:" />
        <SignLine heading="REVIEWED BY:" />
        <div className="pr-signatory">
          <h4>APPROVED BY:</h4>
          {APPROVERS.map((a) => <div key={a.name} className="approver"><strong>{a.name}</strong><span>{a.title}</span></div>)}
        </div>
      </div>
    </main>
  );
}
