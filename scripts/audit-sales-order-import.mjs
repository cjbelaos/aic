// Phase 5 — Sales Order import AUDIT (dry-run, read-only).
// Reads a frozen legacy snapshot (JSON) with bounded ranges. NEVER WRITES.
// Prints: tab rows, tracker grouping + header consistency, missing-value audit,
// and a review queue of unresolved values (no invented data).
//   node scripts/audit-sales-order-import.mjs [--snapshot snapshot.json]
// Self-test: node scripts/audit-sales-order-import.mjs --self-test

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv.length > index + 1 ? process.argv[index + 1] : null;
}

const CATEGORY_ALLOWLIST = new Set(["Consumables", "Services/ Repair", "Project", "Parts", "Supplies", "Treatment Package", "PMS"]);
const isBlank = (value) => value === undefined || value === null || String(value).trim() === "";

function hashRow(row) {
  return createHash("sha256").update(JSON.stringify(row)).digest("hex").slice(0, 16);
}

function auditValues(rows) {
  const counters = { total: rows.length, missingQty: 0, missingUnitAmount: 0, missingTotal: 0, missingSku: 0, missingCategory: 0 };
  const categoryCounts = {};
  for (const row of rows) {
    if (isBlank(row.qty)) counters.missingQty += 1;
    if (isBlank(row.unitAmount)) counters.missingUnitAmount += 1;
    if (isBlank(row.total)) counters.missingTotal += 1;
    if (isBlank(row.sku)) counters.missingSku += 1;
    const category = String(row.category ?? "").trim();
    if (!isBlank(category) && CATEGORY_ALLOWLIST.has(category)) {
      categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
    } else {
      counters.missingCategory += 1;
      categoryCounts.UNRECOGNIZED = (categoryCounts.UNRECOGNIZED ?? 0) + 1;
    }
  }
  return { counters, categoryCounts };
}

function groupByTracker(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(row.trackerNo ?? "").trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const out = [];
  for (const [trackerNo, lines] of groups) {
    const customers = new Set(lines.map((line) => String(line.customer ?? "").trim()).filter(Boolean));
    const categories = new Set(lines.map((line) => String(line.category ?? "").trim()).filter(Boolean));
    out.push({
      trackerNo,
      lineCount: lines.length,
      customers: [...customers],
      categories: [...categories],
      conflicts: [...(customers.size > 1 ? ["customer"] : []), ...(categories.size > 1 ? ["category"] : [])],
    });
  }
  return out.sort((a, b) => a.trackerNo.localeCompare(b.trackerNo));
}

function buildReviewQueue(rows, groups) {
  const queue = [];
  rows.forEach((row, index) => {
    if (isBlank(row.qty) || isBlank(row.unitAmount) || isBlank(row.total)) {
      queue.push({ sourceRow: index + 2, trackerNo: row.trackerNo, issue: "incomplete line (quantity, unit amount or total missing)" });
    }
  });
  for (const group of groups) {
    if (group.conflicts.length > 0) queue.push({ trackerNo: group.trackerNo, issue: `grouping conflict: ${group.conflicts.join(", ")}` });
    if (group.trackerNo === "") queue.push({ issue: "blank tracker number rows" });
  }
  const seen = new Set();
  return queue.filter((entry) => { const key = JSON.stringify(entry); if (seen.has(key)) return false; seen.add(key); return true; });
}

export function analyzeSnapshot(snapshot) {
  const trackerRows = (snapshot.tracker ?? []).map((row, index) => ({
    sourceRow: index + 2,
    trackerNo: row[0], dateReceived: row[1], category: row[2], poRef: row[3], customer: row[4],
    remarks: row[5], sku: row[6], productName: row[7], description: row[8], qty: row[9], unitAmount: row[10],
    discount: row[11], vat: row[12], total: row[13], poLink: row[14], quotationLink: row[15],
    importedStatus: row[19], manualStatus: row[21], rowHash: hashRow(row),
  }));
  const groups = groupByTracker(trackerRows);
  const { counters, categoryCounts } = auditValues(trackerRows);
  const uniqueSourceHashes = new Set(trackerRows.map((row) => row.rowHash));
  return {
    source: { spreadsheetId: snapshot.spreadsheetId ?? "", snapshotId: snapshot.id ?? "", tabs: snapshot.tabs ?? [] },
    rows: trackerRows.length,
    uniqueRowHashes: uniqueSourceHashes.size,
    duplicateRowHashes: trackerRows.length - uniqueSourceHashes.size,
    groupCount: groups.length,
    groups,
    counters,
    categoryCounts,
    reviewQueue: buildReviewQueue(trackerRows, groups),
  };
}
async function main() {
  if (process.argv.includes("--self-test")) {
    const synthetic = {
      id: "self-test-snapshot",
      tabs: ["Sales Order Tracker", "Services/ Repair"],
      tracker: [
        ["1296", "2026-09-01", "Parts", "PO-0001", "ACME", "", "SKU-1", "Bolt", "Bolt M6", 10, 5, 0, 50, "", "", "", "Delivered", "Completed"],
        ["1296", "2026-09-01", "Parts", "PO-0001", "ACME", "", "SKU-1", "Bolt", "Bolt M6", 5, 5, 0, 25, "", "", "", "Delivered", "Completed"],
        ["1297", "2026-09-02", "Services/ Repair", "", "Beta", "", "SRV-1", "Labor", "Repair labor", 2, 800, 0, 1600, "", "", "", "", "Pending"],
        ["", "2026-09-02", "Parts", "", "Gamma", "", "SKU-9", "Nut", "Nut", null, 3, 0, 6, "", "", "", "", ""],
      ],
    };
    const report = analyzeSnapshot(synthetic);
    const countCheck = report.rows === 4 && report.groupCount === 3;
    const zeroDup = report.duplicateRowHashes === 0;
    const hasReview = report.reviewQueue.length > 0;
    if (!(countCheck && zeroDup && hasReview)) {
      console.error("audit self-test FAILED", JSON.stringify(report));
      process.exitCode = 1;
      return;
    }
    console.log("audit-sales-order-import self-test passed: grouping, missing-value audit, review queue, zero duplicate hashes.");
    return;
  }

  const snapshotPath = argValue("--snapshot");
  if (snapshotPath) {
    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
    console.log(reportText(analyzeSnapshot(snapshot)));
    return;
  }

  console.log(reportText(analyzeSnapshot({ id: "local-only", tracker: [], tabs: [] })));
  console.log("Blocker: provide --snapshot (frozen JSON) or a connected credential to audit the real workbook.");
}

function reportText(report) {
  return [
    `Snapshot: ${report.source.snapshotId || "local"} (${report.source.spreadsheetId || "n/a"})`,
    `Tracker rows: ${report.rows}  groups: ${report.groupCount}  unique hashes: ${report.uniqueRowHashes}  duplicate hashes: ${report.duplicateRowHashes}`,
    `Missing values: qty=${report.counters.missingQty} unitAmount=${report.counters.missingUnitAmount} total=${report.counters.missingTotal} sku=${report.counters.missingSku} category=${report.counters.missingCategory}`,
    `Category counts: ${JSON.stringify(report.categoryCounts)}`,
    `Review queue entries: ${report.reviewQueue.length}`,
    JSON.stringify(report, null, 2),
  ].join("\n");
}

process.exitCode = await main();