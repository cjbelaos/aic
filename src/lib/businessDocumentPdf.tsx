"use client";

import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { businessDocumentPrintShell } from "@/components/business-document-print-layout";

/** Render the shared HTML layout at A4 width, breaking between measured rows. */
export async function generateBusinessDocumentPdf(content: ReactNode): Promise<string> {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;pointer-events:none";
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  const loaded = new Promise<void>((resolve) => { frame.onload = () => resolve(); });
  frame.srcdoc = businessDocumentPrintShell;
  document.body.appendChild(frame);
  let root: ReturnType<typeof createRoot> | undefined;
  try {
    await loaded;
    const doc = frame.contentDocument!;
    const mount = doc.createElement("div");
    doc.body.appendChild(mount);
    root = createRoot(mount);
    flushSync(() => root!.render(content));
    await doc.fonts.ready;
    await Promise.all(Array.from(mount.querySelectorAll("img")).map(img => img.decode()));
    const source = mount.querySelector<HTMLElement>(".receipt");
    const sourceTable = source?.querySelector("table");
    if (!source || !sourceTable) throw new Error("Printable document was not found.");

    const pages: HTMLElement[] = [];
    const maxHeight = 273 * 96 / 25.4; // A4 minus 12mm top/bottom margins.
    const newPage = () => {
      const page = doc.createElement("main");
      page.className = "receipt";
      page.style.cssText = "width:186mm;max-width:none;margin:0;padding:0;display:flow-root";
      doc.body.appendChild(page);
      pages.push(page);
      return page;
    };
    const addTable = (page: HTMLElement) => {
      const table = sourceTable.cloneNode(true) as HTMLTableElement;
      table.tBodies[0].replaceChildren();
      page.appendChild(table);
      return table;
    };
    let page = newPage();
    let table = addTable(page);
    const fits = () => page.getBoundingClientRect().height <= maxHeight - 2;
    for (const row of Array.from(sourceTable.tBodies[0].rows)) {
      const clone = row.cloneNode(true) as HTMLElement;
      table.tBodies[0].appendChild(clone);
      if (!fits() && table.tBodies[0].rows.length > 1) {
        clone.remove();
        page = newPage();
        table = addTable(page);
        table.tBodies[0].appendChild(clone);
      }
      if (!fits()) throw new Error("One item is too tall for an A4 page. Shorten its description before saving the PDF.");
    }
    for (const block of Array.from(source.children).filter(child => child !== sourceTable)) {
      const clone = block.cloneNode(true) as HTMLElement;
      page.appendChild(clone);
      if (!fits()) {
        clone.remove();
        page = newPage();
        // Keep the document identity on continuation pages containing notes/signatures.
        const heading = sourceTable.tHead?.rows[0].cells[0].cloneNode(true) as HTMLElement | undefined;
        if (heading) { const header = doc.createElement("div"); header.innerHTML = heading.innerHTML; page.appendChild(header); }
        page.appendChild(clone);
      }
      if (!fits()) throw new Error("The remarks or signature block is too tall for A4. Shorten it before saving the PDF.");
    }
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: 794 });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 12, 12, 186, canvas.height * 186 / canvas.width);
      pdf.setFontSize(8);
      pdf.text(`Page ${i + 1} of ${pages.length}`, 198, 290, { align: "right" });
    }
    return pdf.output("datauristring").split(",")[1];
  } finally {
    root?.unmount();
    frame.remove();
  }
}
