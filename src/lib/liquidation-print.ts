/** Presentation-only printing and PDF export for the liquidation form. */
export async function printLiquidation(element: HTMLElement): Promise<void> {
  const frame = document.createElement("iframe");
  frame.title = "Liquidation print document";
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0";
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) throw new Error("Print frame unavailable");
    doc.title = "Expense Liquidation";
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'));
    const loaded = styles.map((source) => {
      const copy = source.cloneNode(true) as HTMLElement;
      const ready = copy instanceof HTMLLinkElement
        ? new Promise<void>((resolve, reject) => {
            copy.onload = () => resolve();
            copy.onerror = () => reject(new Error("Print styles unavailable"));
          })
        : Promise.resolve();
      doc.head.appendChild(copy);
      return ready;
    });
    const overrides = doc.createElement("style");
    overrides.textContent = `
      @page { size: A4 portrait; margin: 8mm; }
      html, body { width: auto !important; min-height: 0 !important; margin: 0; padding: 0; background: white; }
      .liquidation-document { width: 100% !important; min-width: 0 !important; padding: 0 !important; border: 0; box-shadow: none; }
      thead { display: table-header-group; }
      tr, .liquidation-summary, .liquidation-signatures { break-inside: avoid; }
    `;
    doc.head.appendChild(overrides);
    doc.body.appendChild(element.cloneNode(true));
    await Promise.all(loaded);
    await doc.fonts.ready;
    await Promise.all(Array.from(doc.images).map((img) => img.decode().catch(() => undefined)));
    await new Promise<void>((resolve) => win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve())));
    // Keep the frame alive while browsers with asynchronous print dialogs use it.
    win.addEventListener("afterprint", () => frame.remove(), { once: true });
    win.focus();
    win.print();
    window.setTimeout(() => frame.remove(), 300000);
  } catch (error) {
    frame.remove();
    throw error;
  }
}

export async function generateLiquidationPdf(element: HTMLElement): Promise<Blob> {
  await document.fonts.ready;
  await Promise.all(Array.from(element.querySelectorAll("img")).map((img) => img.decode().catch(() => undefined)));
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"), import("jspdf"),
  ]);
  const canvas = await html2canvas(element, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 8;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const height = pdf.internal.pageSize.getHeight() - margin * 2;
  const pagePixels = Math.floor(height * canvas.width / width);
  const bounds = element.getBoundingClientRect();
  const scale = canvas.height / bounds.height;
  // Prefer breaks before rows and entire summary/signature blocks over cutting text.
  const blocks = Array.from(element.querySelectorAll("tr, .liquidation-summary, .liquidation-signatures"))
    .map((node) => {
      const rect = node.getBoundingClientRect();
      return { top: Math.floor((rect.top - bounds.top) * scale), bottom: Math.ceil((rect.bottom - bounds.top) * scale) };
    });
  let offset = 0;
  while (offset < canvas.height) {
    let end = Math.min(offset + pagePixels, canvas.height);
    const crossing = blocks.find((block) => block.top < end && block.bottom > end && block.top > offset);
    if (crossing) end = crossing.top;
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = end - offset;
    const context = slice.getContext("2d");
    if (!context) throw new Error("PDF canvas unavailable");
    context.drawImage(canvas, 0, offset, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
    if (offset > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL("image/png"), "PNG", margin, margin, width, slice.height * width / canvas.width);
    offset = end;
  }
  return pdf.output("blob");
}
