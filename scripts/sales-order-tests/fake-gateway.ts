// In-memory simulation of the Apps Script command gateway: a single lock
// serializes cooperating writes, version+idempotency guards protect the
// authoritative store, and the SalesOrderSequence tab allocates numbers inside
// the lock. This lets the Phase 1 spike prove overlapping executions serialize
// and that idempotent retries never allocate duplicate numbers.

import { formatSalesOrderNo, nextSalesOrderNo } from "../../src/lib/salesOrders/domain.ts";
import { payloadHash } from "../../src/lib/salesOrders/sync.ts";

export class GatewayConflictError extends Error {
  readonly currentVersion: number;
  constructor(message: string, currentVersion: number) {
    super(message);
    this.currentVersion = currentVersion;
  }
}

export class GatewayReplayError extends Error {}

export interface GatewayDraft {
  salesOrderId: string;
  version: number;
  orderStatus: "DRAFT" | "CONFIRMED";
  salesOrderNo: string;
}

export interface GatewayStore {
  drafts: GatewayDraft[];
  sequence: { lastNumber: number };
  commandReceipts: Record<string, { payloadSignature: string; resultVersion: number }>;
}

export function createStore(): GatewayStore {
  return { drafts: [], sequence: { lastNumber: 0 }, commandReceipts: {} };
}

export function addDraft(store: GatewayStore, salesOrderId: string): GatewayDraft {
  const draft: GatewayDraft = { salesOrderId, version: 1, orderStatus: "DRAFT", salesOrderNo: "" };
  store.drafts.push(draft);
  return draft;
}

export function getDraft(store: GatewayStore, salesOrderId: string): GatewayDraft | null {
  for (const draft of store.drafts) if (draft.salesOrderId === salesOrderId) return draft;
  return null;
}

/**
 * Executes `body` while holding the gateway lock. A promise queue models the
 * Apps Script LockService: concurrent invocations serialize; each lock holder
 * observes committed state written by earlier holders before it runs.
 */
export class LockedChannel {
  private tail: Promise<void> = Promise.resolve();
  run<T>(tag: string, body: () => Promise<T> | T): Promise<T> {
    const next = this.tail.catch(() => {}).then(async () => body());
    this.tail = next.then(() => {}, () => {});
    return next;
  }
}

/** Confirm inside the lock: idempotent receipt, version guard, one number. */
export async function confirmWithinLock(
  channel: LockedChannel,
  store: GatewayStore,
  input: { salesOrderId: string; commandId: string; payloadSignature: string; expectedVersion: number; year: string },
): Promise<{ salesOrderNo: string; version: number; replayed: boolean }> {
  return channel.run("confirm", () => {
    const existing = store.commandReceipts[input.commandId];
    if (existing) {
      if (existing.payloadSignature !== input.payloadSignature) {
        throw new GatewayReplayError("Command ID was already used with a different payload.");
      }
      const draft = getDraft(store, input.salesOrderId);
      return { salesOrderNo: draft?.salesOrderNo ?? "", version: existing.resultVersion, replayed: true };
    }
    const draft = getDraft(store, input.salesOrderId);
    if (!draft) throw new Error("Order not found.");
    if (draft.version !== input.expectedVersion) {
      throw new GatewayConflictError(`Version conflict: expected ${input.expectedVersion}, current ${draft.version}.`, draft.version);
    }
    draft.salesOrderNo = nextSalesOrderNo({ businessYear: input.year, lastNumber: store.sequence.lastNumber });
    store.sequence.lastNumber += 1;
    draft.version += 1; // order mutated: header + history + receipt commit as one batch
    draft.orderStatus = "CONFIRMED";
    store.commandReceipts[input.commandId] = {
      payloadSignature: input.payloadSignature,
      resultVersion: draft.version,
    };
    return { salesOrderNo: draft.salesOrderNo, version: draft.version, replayed: false };
  });
}

export { formatSalesOrderNo, payloadHash };