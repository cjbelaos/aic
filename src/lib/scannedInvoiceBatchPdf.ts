/**
 * Browser-only: splits a scanned Service Invoice batch PDF into pages, renders a
 * thumbnail per page, and reads the red invoice number with OCR. Load it with
 * `await import("@/lib/scannedInvoiceBatchPdf")` so the heavy libraries
 * (pdfjs, tesseract.js, pdf-lib) only download when someone uses the feature.
 */
import { NUMBER_CROP, pickInvoiceNumber, redInkMask, isUncertainRead, typicalDigitLength } from "./scannedInvoiceBatch";

export interface ScannedPage {
  pageIndex: number;
  thumbnailUrl: string;
  /** Zoomed crop of the red number area, shown beside the input to check digits. */
  numberCropUrl: string;
  detectedNo: string | null;
  /** Low OCR confidence or an unusual digit count: shown as "Check number". */
  uncertain: boolean;
}

/** Scale 3 (~216 dpi) read the 2026-11-25 sample batch 9/9; scale 2 misread 1599 as 1598. */
const RENDER_SCALE = 3;
const THUMBNAIL_WIDTH = 480;

function canvasToBlobUrl(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("Could not encode page image."))), type, quality);
  });
}

/** Renders and reads pages one at a time; onProgress(done, total). */
export async function analyzeScannedPdf(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<{ pages: ScannedPage[]; dispose: () => void }> {
  // Legacy build: polyfills newer JS (Map#getOrInsertComputed, Math.sumPrecise, Uint8Array#toHex) for older Chrome/Edge/Safari.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const { createWorker, PSM } = await import("tesseract.js");

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  const worker = await createWorker("eng");
  const urls: string[] = [];
  const pages: ScannedPage[] = [];
  const confidences: number[] = [];
  try {
    await worker.setParameters({ tessedit_char_whitelist: "0123456789", tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
    onProgress?.(0, pdf.numPages);
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas is not available in this browser.");
      await page.render({ canvas, canvasContext: context, viewport }).promise;

      const x = Math.round(canvas.width * NUMBER_CROP.x0);
      const y = Math.round(canvas.height * NUMBER_CROP.y0);
      const w = Math.round(canvas.width * (NUMBER_CROP.x1 - NUMBER_CROP.x0));
      const h = Math.round(canvas.height * (NUMBER_CROP.y1 - NUMBER_CROP.y0));
      const crop = document.createElement("canvas");
      crop.width = w;
      crop.height = h;
      crop.getContext("2d")!.drawImage(canvas, x, y, w, h, 0, 0, w, h);
      const numberCropUrl = await canvasToBlobUrl(crop, "image/jpeg", 0.85);

      const masked = document.createElement("canvas");
      masked.width = w;
      masked.height = h;
      masked.getContext("2d")!.putImageData(new ImageData(redInkMask(context.getImageData(x, y, w, h).data) as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
      const { data } = await worker.recognize(masked);

      const thumb = document.createElement("canvas");
      thumb.width = THUMBNAIL_WIDTH;
      thumb.height = Math.round((canvas.height / canvas.width) * THUMBNAIL_WIDTH);
      thumb.getContext("2d")!.drawImage(canvas, 0, 0, thumb.width, thumb.height);
      const thumbnailUrl = await canvasToBlobUrl(thumb, "image/jpeg", 0.8);

      urls.push(thumbnailUrl, numberCropUrl);
      pages.push({ pageIndex: n - 1, thumbnailUrl, numberCropUrl, detectedNo: pickInvoiceNumber(data.text), uncertain: false });
      confidences.push(data.confidence);
      page.cleanup();
      canvas.width = canvas.height = 0; // release the large page bitmap before the next page
      onProgress?.(n, pdf.numPages);
    }
  } catch (error) {
    urls.forEach((url) => URL.revokeObjectURL(url));
    throw error;
  } finally {
    await worker.terminate();
    await loadingTask.destroy();
  }
  const typicalLength = typicalDigitLength(pages.map((page) => page.detectedNo));
  pages.forEach((page, i) => (page.uncertain = isUncertainRead(page.detectedNo, confidences[i], typicalLength)));
  return { pages, dispose: () => urls.forEach((url) => URL.revokeObjectURL(url)) };
}

/** Copies one original page (no re-rendering) into its own PDF named `SI <invoiceNo>.pdf`. */
export async function extractPagePdf(file: File, pageIndex: number, invoiceNo: string): Promise<File> {
  const { PDFDocument } = await import("pdf-lib");
  const source = await PDFDocument.load(await file.arrayBuffer());
  const output = await PDFDocument.create();
  const [page] = await output.copyPages(source, [pageIndex]);
  output.addPage(page);
  const bytes = await output.save();
  return new File([bytes as Uint8Array<ArrayBuffer>], `SI ${invoiceNo}.pdf`, { type: "application/pdf" });
}
