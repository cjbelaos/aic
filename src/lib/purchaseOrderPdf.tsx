"use client";

import { createRoot } from "react-dom/client";
import { PurchaseOrderForm } from "@/components/purchase-order-form";
import { PurchaseOrderResponse } from "@/types/purchaseOrder";

/**
 * Client-side PO → A4 PDF generation.
 *
 * Imperatively mounts the shared <PurchaseOrderForm> offscreen,
 * renders it with html2canvas-pro, and encodes it as an A4-size PDF
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

    // The <PurchaseOrderForm> fragment renders its <style> tag first, so
    // `firstElementChild` is the <style> node, not the printable document.
    // Capturing the invisible 0×0 <style> element yields an empty canvas whose
    // toDataURL() carries no valid PNG signature, which makes jsPDF throw
    // "wrong PNG signature". Always target the rendered .po-container instead.
    const element = container.querySelector<HTMLElement>(".po-container");
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
    // A4 size — the printed PO form standard.

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Multi-page slicing — the tall HTML document (which can hold up to 50
    // line items) is split into A4-sized slices, one per PDF page, so rows
    // stay readable instead of being squashed onto a single page.
    const totalPages = Math.max(1, Math.ceil(imgHeight / pageHeight));
    const sliceHeightPx = (canvas.height * pageHeight) / imgHeight;

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage();

      const srcY = page * sliceHeightPx;
      const sliceHeight = Math.min(sliceHeightPx, canvas.height - srcY);
      if (sliceHeight <= 0) break;

      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeight;
      const ctx = sliceCanvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0,
        srcY,
        sliceCanvas.width,
        sliceHeight,
        0,
        0,
        sliceCanvas.width,
        sliceHeight,
      );

      const pngDataUrl = sliceCanvas.toDataURL("image/png");
      if (!pngDataUrl || !pngDataUrl.split(",")[1]) {
        throw new Error(
          "Captured an empty document image — cannot build the PO PDF.",
        );
      }
      pdf.addImage(
        pngDataUrl,
        "PNG",
        0,
        0,
        imgWidth,
        (sliceHeight * imgWidth) / sliceCanvas.width,
      );
    }

    const dataUri = pdf.output("datauristring");
    return dataUri.split(",")[1] ?? "";
  } finally {
    root.unmount();
    container.remove();
  }
}