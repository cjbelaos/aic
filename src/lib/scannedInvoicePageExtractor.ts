/**
 * Splits single pages out of a scanned batch PDF without re-rendering them.
 * The batch is parsed once; a PDF pdf-lib cannot read fails here, when the
 * batch is opened, instead of on every row at save time.
 */
export type PageExtractor = (pageIndex: number, invoiceNo: string) => Promise<File>;

export async function createPageExtractor(bytes: ArrayBuffer, filePrefix = "SI"): Promise<PageExtractor> {
  const { PDFDocument } = await import("pdf-lib");
  const source = await PDFDocument.load(bytes);
  return async (pageIndex, invoiceNo) => {
    const output = await PDFDocument.create();
    const [page] = await output.copyPages(source, [pageIndex]);
    output.addPage(page);
    const pdfBytes = await output.save();
    return new File([pdfBytes as Uint8Array<ArrayBuffer>], `${filePrefix} ${invoiceNo}.pdf`, { type: "application/pdf" });
  };
}
