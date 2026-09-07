"use client";

import { useState } from "react";
import { PurchaseOrderForm } from "@/components/purchase-order-form";
import { PurchaseOrderResponse } from "@/types/purchaseOrder";
import { generatePurchaseOrderPdfBase64 } from "@/lib/purchaseOrderPdf";

/**
 * DEV-ONLY simulation of the Purchase Order form print layout.
 *
 * Reuses the same <PurchaseOrderForm> component (and PDF pipeline) as the
 * real Purchase Order flow — no Google Sheets / Drive calls are made here.
 *
 * Open in dev: http://localhost:3000/dev/purchase-order-form-sim
 */

const MOCK_PO: PurchaseOrderResponse = {
  success: true,
  poNumber: "AIC-VTALTE-797",
  date: "2026-07-06",
  supplierName: "VITALITE TRADING CORP.",
  address: "438 DEL MONTE AVE., SIENNA QUEZON CITY",
  tin: "008-103-058-000",
  preparedBy: "DAN PAUL B. BALUBAR",
  approvedBy: "APOLLO M. ARQUIZA",
  notedBy: "AERIAN PAUL C. ARQUIZA",
  comments:
    "Deliver within 3 working days from date of this PO. Attach official receipt and delivery confirmation.",
  items: [
    {
      itemNo: 1,
      description: "1/4 elbow jaco fittings (male)",
      quantity: 100,
      unit: "pcs",
      pricePerUnit: 80,
      totalAmount: 8000,
    },
    {
      itemNo: 2,
      description: "1/4 straight jaco fittings (male)",
      quantity:  57,
      unit: "pcs",
      pricePerUnit:  80,
      totalAmount:  4560,
    },
    {
      itemNo:  3,
      description: "inside reducer 1/2 to 1/4 threaded",
      quantity:  150,
      unit: "pcs",
      pricePerUnit:  6.5,
      totalAmount:  975,
    },
    {
      itemNo:  4,
      description: "inside reducer 3/4 to 1/2",
      quantity:  100,
      unit: "pcs",
      pricePerUnit:  5.5,
      totalAmount:  550,
    },
  ],
  status: "printed",
  totalAmount: 14085,
};

const INITIAL_ROWS = 6;

const TOOLBAR_STYLES = `
  .sim-toolbar {
    max-width: 800px;
    margin:  0 auto 14px;
    display: flex;
    align-items: center;
    gap:  12px;
    flex-wrap: wrap;
    border:  1px dashed #94a3b8;
    border-radius: 8px;
    padding:  10px 14px;
    background: #f8fafc;
    font-size: 12px;
    font-family: Arial, Helvetica, sans-serif;
    color: #334155;
  }
  .sim-toolbar-title { font-weight: 700; font-size: 14px; color: #0f172a; }
  .sim-toolbar-note { color: #64748b; flex:  1 1 220px; min-width: 220px; }
  .sim-btn {
    font: inherit;
    font-weight: 600;
    border:  1px solid #2b3e70;
    border-radius: 6px;
    padding:  7px 14px;
    cursor: pointer;
    background: #2b3e70;
    color: #fff;
  }
  .sim-btn:hover { background: #223154; }
  .sim-btn--ghost { background: #fff; color: #2b3e70; }
  .sim-btn--ghost:hover { background: #eef2fa; }
  .sim-btn:disabled { opacity: 0.6; cursor: progress; }

  @media print {
    .sim-toolbar { display: none !important; }
  }
`;

export default function PurchaseOrderFormSimPage() {
  const [pdfBusy, setPdfBusy] = useState(false);

  const isDev = process.env.NODE_ENV === "development";
  if (!isDev) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-sm text-muted-foreground">
        This simulation page is only available in development mode.
      </main>
    );
  }

  const handlePrint = () => window.print();

  const handleDownloadPdf = async () => {
    setPdfBusy(true);
    try {
      const base64 = await generatePurchaseOrderPdfBase64(MOCK_PO);
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i =  0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "purchase-order-form-mock.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.warn("HTML PDF generation failed:", e);
      alert("Failed to generate the PDF. Use Print → Save as PDF instead.");
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <main>
      <style>{TOOLBAR_STYLES}</style>

      {/* Toolbar — hidden when printing */}
      <div className="sim-toolbar">
        <div>
          <div className="sim-toolbar-title">Purchase Order — Form Simulation</div>
          <div className="sim-toolbar-note">
            Sample data only · no Google Sheets/Drive calls · dev-only page
          </div>
        </div>
        <button className="sim-btn sim-btn--ghost" onClick={handlePrint}>
          Print / Save as PDF
        </button>
        <button className="sim-btn" onClick={handleDownloadPdf} disabled={pdfBusy}>
          {pdfBusy ? "Generating…" : "Download PDF (letter)"}
        </button>
      </div>

      <PurchaseOrderForm po={MOCK_PO} minRows={INITIAL_ROWS} />
    </main>
  );
}