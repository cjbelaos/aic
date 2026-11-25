/**
 * Manual check (not CI): runs the browser's number-reading pipeline in Node on a
 * real scanned batch and prints the invoice number read from each page.
 *
 * Usage: node scripts/verify-scanned-batch-sample.mjs <scan.pdf> [expected,numbers,...]
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createCanvas, ImageData } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createWorker, PSM } from "tesseract.js";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = fs.readFileSync("src/lib/scannedInvoiceBatch.ts", "utf8");
const rules = { exports: {} };
new Function("module", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(rules, rules.exports);
const { NUMBER_CROP, redInkMask, pickInvoiceNumber } = rules.exports;

const [file, expectedArg] = process.argv.slice(2);
if (!file) throw new Error("Pass the scanned PDF path.");
const expected = expectedArg ? expectedArg.split(",") : [];

pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")).href;
const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)) }).promise;
const worker = await createWorker("eng");
await worker.setParameters({ tessedit_char_whitelist: "0123456789", tessedit_pageseg_mode: PSM.SINGLE_BLOCK });

let correct = 0;
for (let n = 1; n <= pdf.numPages; n++) {
  const page = await pdf.getPage(n);
  const viewport = page.getViewport({ scale: 3 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;

  const x = Math.round(canvas.width * NUMBER_CROP.x0), y = Math.round(canvas.height * NUMBER_CROP.y0);
  const w = Math.round(canvas.width * (NUMBER_CROP.x1 - NUMBER_CROP.x0)), h = Math.round(canvas.height * (NUMBER_CROP.y1 - NUMBER_CROP.y0));
  const crop = canvas.getContext("2d").getImageData(x, y, w, h);
  const masked = createCanvas(w, h);
  masked.getContext("2d").putImageData(new ImageData(redInkMask(crop.data), w, h), 0, 0);

  const { data } = await worker.recognize(masked.toBuffer("image/png"));
  const read = pickInvoiceNumber(data.text);
  const want = expected[n - 1];
  if (want && read === want) correct++;
  console.log(`page ${n}: read ${read ?? "-"}${want ? `  expected ${want} ${read === want ? "OK" : "MISS"}` : ""}`);
}
await worker.terminate();
if (expected.length) console.log(`${correct}/${expected.length} correct`);
