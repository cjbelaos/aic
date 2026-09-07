"use client";

import { PurchaseOrderResponse } from "@/types/purchaseOrder";

/**
 * Reusable Purchase Order form — the HTML print layout.

 * This is the canonical PO document layout, used by:
 *  - the dev simulation page (/dev/purchase-order-form-sim),
 *  -the real preview modal (dashboard → Purchase Orders),
 *  -the client-side PDF generation for print / Google Drive upload.

 *  All document CSS is scoped here so it applies wherever the form is mounted
 * (including offscreen containers used for PDF capture).
 */

const MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatDateMMMMDDYYYY(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return dateStr;


  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatNumber(n: number): string {
  return MONEY.format(n);
}

function formatMoney(n: number): string {
  return `₱${MONEY.format(n)}`;
}

const PO_FORM_STYLES = `
  .po-container {
    max-width: 800px;
    margin: 0 auto;
    border:  1px solid #000;
    padding: 15px;
    background: #fff;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    font-size: 12px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .po-header-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .po-header-left { width: 65%; vertical-align: top; }
  .po-header-right { width: 35%; border:  1px solid #000; text-align: center; vertical-align: top; }
  .po-company-title { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
  .po-title { font-size:  18px; font-weight: bold; padding: 8px 0; border-bottom: 1px solid #000; }
  .po-meta-table { width: 100%; border-collapse: collapse; }
  .po-meta-table td { border-bottom:  1px solid #000; padding: 4px; font-size: 11px; }
  .po-meta-table tr:last-child td { border-bottom: none; }
  .po-section-banner {
    background-color: #2b3e70;
    color: #fff;
    font-weight: bold;
    text-align: center;
    padding:  4px;
    font-size: 12px;
  }
  .po-vendor-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .po-vendor-table td { width: 50%; vertical-align: top; padding: 6px; border:  1px solid #ccc; }
  .po-items-table { width: 100%; border-collapse: collapse; }
  .po-items-table th {
    background-color: #2b3e70;
    color: #fff;
    font-weight: bold;
    padding:  5px;
    border:  1px solid #2b3e70;
    font-size: 11px;
    text-transform: uppercase;
  }
  .po-items-table td {
    border:  1px solid #000;
    padding: 4px 6px;
    font-size: 11px;
    height: 18px;
  }
  .po-text-center { text-align: center; }
  .po-text-right { text-align: right; }
  .po-subtotal-row td { border: none; padding-top: 8px; font-weight: bold; }
  .po-subtotal-amount { border-bottom:  3px double #000 !important; }
  .po-comments-box { border:  1px solid #000; margin-top: 10px; width: 60%; }
  .po-comments-header {
    background-color: #bfbfbf;
    font-weight: bold;
    padding:  4px 8px;
    border-bottom:  1px solid #000;
  }
  .po-comments-content { min-height: 50px; padding: 6px; }
  .po-signatures-table { width: 100%; margin-top: 30px; border-collapse: collapse; }
  .po-signatures-table td { vertical-align: bottom; padding: 5px; }
  .po-sig-line {
    border-bottom:  1px solid #000;
    text-align: center;
    font-weight: bold;
    padding-bottom: 2px;
  }
  .po-sig-caption { text-align: center; font-size: 10px; margin-top: 2px; }

  @media print {
    .po-container { border: none; padding: 10mm; }
  }
  @page { size: letter; margin:  10mm; }
`;
export function PurchaseOrderForm({
  po,
  minRows = 6,
}: {
  po: PurchaseOrderResponse;
  minRows?: number;
}) {
  const items = Array.isArray(po.items) ? po.items : [];
  const displayRows = Math.max(items.length, minRows);
  const subtotal = po.totalAmount ?? items.reduce( ( sum , item ) => sum + ( item.totalAmount ?? item.quantity * ( item.pricePerUnit ??  ​0 ) ) ,  ​0 ) ;

  const dateStr = formatDateMMMMDDYYYY(po.date);
  const isDraft = po.poNumber ?.startsWith("DRAFT-") ?? false;

  return (
    <>
      <style>{PO_FORM_STYLES}</style>
      <div className="po-container">
        {/* Header */}
        <table className="po-header-table">
          <tbody>
            <tr>
              <td className="po-header-left">
                <div className="po-company-title">AERICH INNOVATION CORP.</div>
                <div>BLK 4 LOT 2 BAMBOO ORCHARD BANAY - BANAY</div>
                <div>CABUYAO CITY, LAGUNA</div>
                <div>aerichinnovationcorp@gmail.com</div>
                <div>0939 - 910 - juxtaposition0597</div>
              </td>
              <td className="po-header-right">
                <div className="po-title">PURCHASE ORDER</div>
                <table className="po-meta-table">
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: "bold", width: "30%" }}>DATE</td>
                      <td>{dateStr || "—"}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: "bold" }}>PO #</td>
                      <td>{isDraft ? "DRAFT" : po.poNumber}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Vendor / Ship To Banner */}
        <div className="po-section-banner">VENDOR</div>
        <table className="po-vendor-table">
          <tbody>
            <tr>
              <td>
                <strong>{po.supplierName}</strong>
                <br />
                {po.address || "—"}
                <br />
                {po.tin || "—"}
              </td>
              <td>
                <strong>Aerich Innovation Corp.</strong>
                <br />
                Banay - Banay Cabuyao City, Laguna
                <br />
                0968-267-7913 / 0939-910-0597
              </td>
            </tr>
          </tbody>
        </table>

        {/* Line Items */}
        <table className="po-items-table">
          <thead>
            <tr>
              <th style={{ width: "8%" }}>ITEM #</th>
              <th style={{ width: "42%" }}>DESCRIPTION</th>
              <th style={{ width: "10%" }}>QTY</th>
              <th style={{ width: "10%" }}>UNIT</th>
              <th style={{ width: "15%" }}>UNIT PRICE</th>
              <th style={{ width: "15%" }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
{Array.from( { length: displayRows } ).map( ( _ , i ) => {
              const item = items[i];
              const total = item
                ? (item.totalAmount ?? item.quantity * (item.pricePerUnit ?? 0))
                : undefined;
              return (
                <tr key={i}>
                  <td className="po-text-center">{i + 1}</td>
                  <td>{item?.description ?? ""}</td>
                  <td className="po-text-center">{item?.quantity ?? ""}</td>
                  <td className="po-text-center">{item?.unit ?? ""}</td>
                  <td className="po-text-right">
                    {item?.pricePerUnit ? formatNumber(item.pricePerUnit) : ""}
                  </td>
                  <td className="po-text-right">
                    {item ? formatMoney(total ?? 0) : "-"}
                  </td>
                </tr>
              );
            })}
            {/* Subtotal row */}
            <tr className="po-subtotal-row">
              <td colSpan={4} style={{ border: "none" }} />
              <td className="po-text-right" style={{ border: "none", fontWeight: "bold" }}>
                SUBTOTAL
              </td>
              <td className="po-text-right po-subtotal-amount" style={{ fontWeight: "bold" }}>
                {formatMoney(subtotal)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Comments Box */}
        <div className="po-comments-box">
          <div className="po-comments-header">Comments or Special Instructions</div>
          <div className="po-comments-content">{po.comments || ""}</div>
        </div>

        {/* Signatures */}
        <table className="po-signatures-table">
          <tbody>
            <tr>
              <td style={{ width: "12%" }}>Prepared by:</td>
              <td style={{ width: "35%" }}>
                <div className="po-sig-line">{po.preparedBy || "—"}</div>
                <div className="po-sig-caption">Signature Over Printed Name</div>
              </td>
              <td style={{ width: "6%" }} />
              <td style={{ width: "12%" }}>Approved by:</td>
              <td style={{ width: "35%" }}>
                <div className="po-sig-line">{po.approvedBy || "—"}</div>
                <div className="po-sig-caption">Signature Over Printed Name</div>
              </td>
            </tr>
            <tr>
              <td colSpan={5} style={{ height: "15px" }} />
            </tr>
            <tr>
              <td>Noted by:</td>
              <td>
                <div className="po-sig-line">{po.notedBy || "—"}</div>
                <div className="po-sig-caption">Signature Over Printed Name</div>
              </td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

export default PurchaseOrderForm;