# Scanned Copy File Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Name scanned copies `DR|SR|SI-{MM}-{DD}-{YYYY}-{No.}-{Customer}`, mark replaced scans, file Sales Invoice scans in the new folder, and rename/move existing scanned copies with a dry-run-first script.

**Architecture:** One dependency-free naming module (`src/lib/scannedCopyFileName.ts`) used by the three upload routes and, via TS transpile, by a Node `.mjs` script. A small Drive helper renames the previous scan on replace.

**Tech Stack:** Next.js route handlers, googleapis (Sheets via service account, Drive via OAuth refresh token), plain Node assert tests.

**Spec:** `docs/superpowers/specs/2026-11-28-scanned-copy-file-names-design.md`

## Global Constraints

- Dates: DR = `DeliveryReceipts` col B `DeliveryDate`; SR/SI = `ServiceInvoices` / `SalesInvoices` col B `Date`. Output `MM-DD-YYYY`.
- Customer = Companies col C name matched by `companyId` (or `comp_<row>` id), fallback the stored id.
- Strip only `/ \ : * ? " < > |` and control chars (→ space), collapse whitespace.
- Replaced suffix: ` (replaced YYYY-MM-DD)` before the extension, Manila date.
- New Sales Invoice folder: `1OvWCCqVw0KOSO48KjhcVhcvsweSKG7qY`.
- Drive writes use the OAuth upload client (`getDriveUploadClient`).

## Review Focus

1. Legacy Service/Sales Invoice scans recognised only by the `SI-SCANNED_` name → script must write `scannedFileLink` into col T before renaming, or they show "Not scanned".
2. Record with blank/unparseable date → upload uses Manila today + warning; script skips and lists.
3. Customer name with `/` (e.g. `A/B TRADING`) → no Drive "path" confusion; sanitized.
4. Replace where the previous link is not a Drive file / not editable → upload still succeeds with a warning.
5. Re-running the script after apply → zero changes.

---

### Task 1: Naming module

**Files:** Create `src/lib/scannedCopyFileName.ts`; Test `scripts/test-scanned-copy-file-name.cjs`; add `test:scanned-copy-file-name` to `package.json`.

**Produces:**
- `type ScannedCopyPrefix = "DR" | "SR" | "SI"`
- `scanDateParts(stored: string): { mm: string; dd: string; yyyy: string } | null` — accepts `YYYY-MM-DD[...]` and `M/D/YYYY`.
- `sanitizeFileNamePart(value: string): string`
- `scanExtension(fileNameOrEmpty: string, mimeType?: string): string` — `.pdf|.jpg|.png|.webp`, from name else mime, default `.pdf`.
- `scannedCopyFileName(input: { prefix; date: string; number: string; customer: string; extension: string; today?: string }): { name: string; usedToday: boolean }`
- `replacedFileName(name: string, isoDate: string): string`
- `driveFileIdFromLink(link: string): string | null` — `/d/<id>` or `?id=<id>`.
- `manilaIsoDate(now?: Date): string`

- [ ] Write the test asserting: `DR-11-27-2026-4110-ALABANG MEDICAL CENTER.pdf`; `11/5/2026` → `11-05-2026`; `ZODIAC HEALTH VENTURES INC. (HCCH)` unchanged; `A/B: C` → `A B C`; blank date uses `today` and `usedToday: true`; `replacedFileName("X.pdf","2026-11-28")` → `X (replaced 2026-11-28).pdf`; link id extraction both forms; `manilaIsoDate(new Date("2026-11-27T17:00:00Z"))` → `2026-11-28`.
- [ ] Run `node scripts/test-scanned-copy-file-name.cjs` → fails (module missing).
- [ ] Implement; run → passes. Commit.

### Task 2: Upload routes

**Files:** Create `src/lib/scannedCopyDrive.ts` (`markReplacedScan(drive, link, opts?: { onlyIfNamePrefix?: string }): Promise<string | undefined>` returns a warning string on failure, undefined on success/no-op). Modify the three `upload-scanned/route.ts` files.

- DR: name from `receipt.date`, `drNumber`, resolved company name; rename the row's previous `scannedFileLink` (col AB — extend `findDeliveryReceiptForScan` to return it, range `A2:AB`) before recording the new one.
- SR/SI: read the invoice row `A:T`; name from B, A, company of C; previous scan = T metadata `scannedFileLink`, else J with `onlyIfNamePrefix: "SI-SCANNED_"`. Sales folder constant → new folder.
- Warnings (`usedToday`, replace failure) are joined into the existing `statusWarning` (DR) / `trackerWarning` (SR) / new `warning` field merged into `statusWarning` (SI) that the dialog already shows.
- [ ] `npx tsc --noEmit -p .` and `npx eslint` on touched files pass. Commit.

### Task 3: Rename script

**Files:** Create `scripts/rename-scanned-copies.mjs`; add `scans:rename` (dry run) and `scans:rename:apply` to `package.json`.

- Loads Task 1 module by TS transpile; Sheets via service account (same `credentials()` as `repair-delivery-drive-links.mjs`); Drive via OAuth env.
- Fails fast if the new SI folder can't be read.
- Per record with a scanned copy: `files.get(name,parents,trashed,capabilities/canRename)` → target name (+ target folder for SI). Skip reasons: `not-a-drive-link`, `not-found`, `no-edit-access`, `no-date`, `trashed`.
- Legacy SR/SI (no T `scannedFileLink`, J name starts `SI-SCANNED_`): on apply, write T metadata `scannedFileLink` = J first.
- Writes CSV `tmp/rename-scanned-copies-<mode>-<timestamp>.csv` and prints counts. `--apply` performs updates sequentially.
- [ ] Run the dry run against live data; inspect CSV. Commit.
