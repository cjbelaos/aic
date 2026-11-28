import { randomUUID } from "node:crypto";
import { manilaToday } from "@/lib/contractStatus";
import { deactivateProduct } from "@/lib/productSheets";
import { findUsages, planReplacement } from "./classify";
import {
  appendAuditRows, appendAuditStart, applyCellEdits, applySalesOrderEdit, ensureAuditTabs, finishAudit, readReplacementSnapshot,
} from "./sheets";
import type { ProductUsage, ReplacementPlan, ReplacementResult } from "./types";

// ── Bell list cache ──────────────────────────────────────────
const USAGE_CACHE_TTL_MS = 5 * 60_000;
let usageCache: { usages: ProductUsage[]; expires: number } | null = null;
let inFlight: Promise<ProductUsage[]> | null = null;

export function invalidateUsageCache(): void {
  usageCache = null;
}

/** In-progress document lines still using an inactive product (cached for 5 minutes). */
export async function getInactiveProductUsages(): Promise<ProductUsage[]> {
  if (usageCache && usageCache.expires > Date.now()) return usageCache.usages;
  if (!inFlight) {
    inFlight = readReplacementSnapshot()
      .then(({ snapshot }) => {
        const usages = findUsages(snapshot, manilaToday());
        usageCache = { usages, expires: Date.now() + USAGE_CACHE_TTL_MS };
        return usages;
      })
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

export async function previewReplacement(fromProductId: string, toProductId: string, actor: string): Promise<ReplacementPlan> {
  const { snapshot } = await readReplacementSnapshot();
  return planReplacement(snapshot, fromProductId, toProductId, manilaToday(), actor, new Date().toISOString());
}

/**
 * Swaps `fromProductId` for `toProductId` on every in-progress document, then
 * deactivates the duplicate. Sheets has no transactions, so every write is
 * recorded first and a failure part-way is reported as `partial`, never success.
 */
export async function applyReplacement(fromProductId: string, toProductId: string, actor: string): Promise<ReplacementResult> {
  const loaded = await readReplacementSnapshot();
  const nowIso = new Date().toISOString();
  const plan = planReplacement(loaded.snapshot, fromProductId, toProductId, manilaToday(), actor, nowIso);
  const replacementId = `REPL-${nowIso.slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 8)}`;
  const skipped = [...plan.skipped];
  const errors: string[] = [];
  let applied = 0;

  await ensureAuditTabs();
  await appendAuditStart(replacementId, fromProductId, toProductId, actor, nowIso);
  try {
    const cellChanges = plan.changes.filter((u) => u.documentType !== "salesOrder").length + plan.conflicts.length;
    await applyCellEdits(plan.cellEdits);
    applied += cellChanges;
    await appendAuditRows(replacementId, plan.cellEdits, new Date().toISOString());

    for (const edit of plan.salesOrderEdits) {
      const orderUsages = plan.changes.filter((u) => u.documentType === "salesOrder" && u.documentId === edit.salesOrderId);
      try {
        const rows = await applySalesOrderEdit(edit, loaded, plan.to, actor, new Date().toISOString(), replacementId);
        await appendAuditRows(replacementId, rows, new Date().toISOString());
        applied += orderUsages.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${orderUsages[0]?.documentNo ?? edit.salesOrderId}: ${message}`);
        skipped.push(...orderUsages.map((u) => ({ ...u, disposition: "needs_manual" as const, reason: `not updated: ${message}` })));
      }
    }

    if (plan.from.status === "active") await deactivateProduct(plan.from.productId, actor);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    invalidateUsageCache();
  }

  const status = errors.length ? "partial" : "completed";
  await finishAudit(replacementId, status, new Date().toISOString(), errors.join("; ")).catch(() => undefined);
  return { replacementId, status, applied, skipped, conflicts: plan.conflicts, ...(errors.length ? { error: errors.join("; ") } : {}) };
}
