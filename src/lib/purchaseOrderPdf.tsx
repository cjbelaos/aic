"use client";

import { createRoot } from "react-dom/client";
import { PurchaseOrderForm } from "@/components/purchase-order-form";
import { PurchaseOrderResponse } from "@/types/purchaseOrder";

/**
 * Client-side PO → letter-size PDF generation.
 *
 * Imperatively mounts the shared <PurchaseOrderForm> offscreen,
 * renders it with html2canvas-pro, and encodes it as a letter-size PDF
 * via jsPDF — the same pipeline used by the service-invoice HTML mode.

 * Returns a raw base64 string (no data: prefix) ready for Drive upload or blob printing.
 */

export async function generatePurchaseOrderPdfBase64(
  po: PurchaseOrderResponse,
): Promise<string> {
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;top:0;left:-99999px;width:800px;background:#fff;pointer-events:none;z-index:-1;";
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(<PurchaseOrderForm po={po} />);

  // Let React commit and fonts/layout settle.

  try {
    await new Promise((r) => setTimeout(r, 300));
    const element = container.firstElementChild as HTMLElement;
    if (!element) throw new Error("PO form element not found.");

    const html2canvas = (await import("html2canvas-pro")).default;
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: 900,
      windowHeight: element.scrollHeight,
    });

    const { jsPDF } = await import("jspdf");
    // Letter size — matches the previous Sheets/A4 export used by the real PO pipeline.

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "letter",
      compress: true,
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = Math.min((canvas.height * imgWidth) / canvas.width, pageHeight);
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, imgWidth, imgHeight);

    const dataUri = pdf.output("datauristring");
    return dataUri.split(",")[1] ?? "";
  } finally {
    root.unmount();
    container.remove();
  }
}