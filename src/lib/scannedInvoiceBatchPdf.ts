/**
 * Browser-only: splits a scanned Service Invoice batch PDF into pages, renders a
 * thumbnail per page, and reads the red invoice number with OCR. Load it with
 * `await import("@/lib/scannedInvoiceBatchPdf")` so the heavy libraries
 * (pdfjs, tesseract.js, pdf-lib) only download when someone uses the feature.
 */
import { inkMask, pickInvoiceNumber, isUncertainRead, typicalDigitLength, type ScanProfile } from "./scannedInvoiceBatch";
import { createPageExtractor, type PageExtractor } from "./scannedInvoicePageExtractor";

export interface ScannedPage {
  pageIndex: number;
  thumbnailUrl: string;
  /** Full-page image large enough to read the customer name and signature. */
  previewUrl: string;
  /** Zoomed crop of the red number area, shown beside the input to check digits. */
  numberCropUrl: string;
  detectedNo: string | null;
  /** Low OCR confidence or an unusual digit count: shown as "Check number". */
  uncertain: boolean;
}

export interface ScannedBatch {
  pages: ScannedPage[];
  /** Copies one original page (no re-rendering) into `SI <invoiceNo>.pdf`. */
  extractPage: PageExtractor;
  /** Revokes the page image URLs. */
  dispose: () => void;
}

/** Scale 3 (~216 dpi) read the 2026-11-25 sample batch 9/9; scale 2 misread 1599 as 1598. */
const RENDER_SCALE = 3;
const THUMBNAIL_WIDTH = 480;
const PREVIEW_WIDTH = 1200;

function canvasToBlobUrl(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("Could not encode page image."))), type, quality);
  });
}

function scaledCopy(source: HTMLCanvasElement, width: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round((source.height / source.width) * width);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Renders and reads pages one at a time; onProgress(done, total). */
export async function analyzeScannedPdf(
  file: File,
  profile: ScanProfile,
  onProgress?: (done: number, total: number) => void,
): Promise<ScannedBatch> {
  const bytes = await file.arrayBuffer();
  // Opened with pdf-lib first: a PDF it can't split fails now, not after every row is checked.
  const extractPage = await createPageExtractor(bytes.slice(0), profile.filePrefix);
  const area = profile.crop;

  // Legacy build: polyfills newer JS (Map#getOrInsertComputed, Math.sumPrecise, Uint8Array#toHex) for older Chrome/Edge/Safari.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const { createWorker, PSM } = await import("tesseract.js");

  const urls: string[] = [];
  const pages: ScannedPage[] = [];
  const confidences: number[] = [];
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  try {
    const pdf = await loadingTask.promise;
    worker = await createWorker("eng");
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

      const x = Math.round(canvas.width * area.x0);
      const y = Math.round(canvas.height * area.y0);
      const w = Math.round(canvas.width * (area.x1 - area.x0));
      const h = Math.round(canvas.height * (area.y1 - area.y0));
      const crop = document.createElement("canvas");
      crop.width = w;
      crop.height = h;
      crop.getContext("2d")!.drawImage(canvas, x, y, w, h, 0, 0, w, h);
      const numberCropUrl = await canvasToBlobUrl(crop, "image/jpeg", 0.85);
      urls.push(numberCropUrl);

      const masked = document.createElement("canvas");
      masked.width = w;
      masked.height = h;
      masked.getContext("2d")!.putImageData(new ImageData(inkMask(profile, context.getImageData(x, y, w, h).data) as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
      const { data } = await worker.recognize(masked);

      const thumbnailUrl = await canvasToBlobUrl(scaledCopy(canvas, THUMBNAIL_WIDTH), "image/jpeg", 0.8);
      urls.push(thumbnailUrl);
      const previewUrl = await canvasToBlobUrl(scaledCopy(canvas, Math.min(PREVIEW_WIDTH, canvas.width)), "image/jpeg", 0.85);
      urls.push(previewUrl);

      pages.push({ pageIndex: n - 1, thumbnailUrl, previewUrl, numberCropUrl, detectedNo: pickInvoiceNumber(data.text), uncertain: false });
      confidences.push(data.confidence);
      page.cleanup();
      canvas.width = canvas.height = 0; // release the large page bitmap before the next page
      onProgress?.(n, pdf.numPages);
    }
  } catch (error) {
    urls.forEach((url) => URL.revokeObjectURL(url));
    throw error;
  } finally {
    await worker?.terminate();
    await loadingTask.destroy();
  }
  const typicalLength = typicalDigitLength(pages.map((page) => page.detectedNo));
  pages.forEach((page, i) => (page.uncertain = isUncertainRead(page.detectedNo, confidences[i], typicalLength)));
  return { pages, extractPage, dispose: () => urls.forEach((url) => URL.revokeObjectURL(url)) };
}
