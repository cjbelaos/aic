import assert from "node:assert/strict";
import {
  formatServiceReportNo,
  isValidServiceReportNo,
  nextReportNumber,
  canTransition,
  isLockedStatus,
  analyseSignaturePng,
  verifyMeaningfulSignature,
} from "../../src/lib/serviceReports/domain.ts";
import {
  meaningfulSignaturePng,
  emptySignaturePng,
  shortMarkSignaturePng,
} from "./png-util.ts";
import { sha256HexBuffer } from "../../src/lib/serviceReports/commands.ts";

// Number formatting
assert.equal(formatServiceReportNo("2026", 1), "AIC-SR-2026-0001");
assert.equal(formatServiceReportNo("2027", 1298), "AIC-SR-2027-1298");
assert.equal(nextReportNumber({ businessYear: "2026", lastNumber: 0 }), "AIC-SR-2026-0001");
assert.equal(nextReportNumber({ businessYear: "2027", lastNumber: 1297 }), "AIC-SR-2027-1298");
assert.equal(isValidServiceReportNo("AIC-SR-2026-0001"), true);
assert.equal(isValidServiceReportNo("AIC-SR-2026-0000"), false);
assert.equal(isValidServiceReportNo("1297"), false);
assert.equal(isValidServiceReportNo("AIC-SR-2026-1298"), true);

// Transitions
assert.equal(canTransition("DRAFT", "READY_FOR_ACKNOWLEDGMENT"), true);
assert.equal(canTransition("DRAFT", "VOID"), true);
assert.equal(canTransition("READY_FOR_ACKNOWLEDGMENT", "ACKNOWLEDGED"), true);
assert.equal(canTransition("READY_FOR_ACKNOWLEDGMENT", "DRAFT"), false);
assert.equal(canTransition("ACKNOWLEDGED", "PDF_FAILED"), true);
assert.equal(canTransition("PDF_FAILED", "ACKNOWLEDGED"), true);
assert.equal(canTransition("VOID", "DRAFT"), false);
assert.equal(canTransition("ACKNOWLEDGED", "DRAFT"), false);

// Locked statuses
assert.equal(isLockedStatus("ACKNOWLEDGED"), true);
assert.equal(isLockedStatus("PDF_FAILED"), true);
assert.equal(isLockedStatus("VOID"), true);
assert.equal(isLockedStatus("DRAFT"), false);
assert.equal(isLockedStatus("READY_FOR_ACKNOWLEDGMENT"), false);

// Signature analysis --- honest PNG decode
const meaningful = analyseSignaturePng(meaningfulSignaturePng());
assert.equal(meaningful.ok, true, "meaningful png should parse");
assert.ok(meaningful.inkedPixels > 1000, `expected a lot of ink, got ${meaningful.inkedPixels}`);
assert.ok(meaningful.bbox !== undefined);
const meaningfulDiag = Math.hypot(meaningful.bbox.maxX - meaningful.bbox.minX, meaningful.bbox.maxY - meaningful.bbox.minY);
assert.ok(meaningfulDiag > 100, "meaningful signature must span the canvas");

const empty = analyseSignaturePng(emptySignaturePng());
assert.equal(empty.ok, true);
assert.equal(empty.inkedPixels, 0);

const shortMark = analyseSignaturePng(shortMarkSignaturePng());
assert.equal(shortMark.ok, true);
assert.ok(shortMark.inkedPixels > 0 && shortMark.inkedPixels < 400);

assert.equal(verifyMeaningfulSignature(meaningful).ok, true);
const emptyVerdict = verifyMeaningfulSignature(empty);
assert.equal(emptyVerdict.ok, false);
assert.match(emptyVerdict.reason, /empty/i);
const shortVerdict = verifyMeaningfulSignature(shortMark);
assert.equal(shortVerdict.ok, false);
assert.match(shortVerdict.reason, /too short/i);

// Not-a-PNG is rejected by the server gate
const notPng = analyseSignaturePng(Buffer.from("hello, definitely not a png", "utf8"));
assert.equal(notPng.ok, false);

// SHA-256 is deterministic and 64 hex chars
const png = meaningfulSignaturePng();
const digest = sha256HexBuffer(png);
assert.match(digest, /^[0-9a-f]{64}$/);
assert.equal(sha256HexBuffer(png), digest);

console.log("domain tests passed");