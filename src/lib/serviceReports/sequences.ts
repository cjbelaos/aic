// Service Reports — serialized report-number allocation.
// Numbers are unique even under concurrent acknowledgment traffic by locking:
//  1) In-process: a module promise chain queues allocators on one instance.
//  2) Cross-process: an expiring lease in ServiceReportSequences!G1:I1.
// A stalled writer's lease expires automatically. Pure over small read/write
// ports so tests exercise the real algorithm against in-memory stores.

import { randomBytes } from "node:crypto";
import { formatServiceReportNo } from "./domain.ts";
import { dependencyUnavailable, gatewayBusy } from "./errors.ts";
import type { ServiceReportSequence } from "../../types/serviceReport.ts";

export const SERVICE_REPORTS_SEQUENCE_PREFIX = "AIC-SR";
export const SEQUENCE_KEY_PREFIX = "AIC-SR";
export const SEQUENCE_LOCK_LEASE_MS = 8_000;
export const SEQUENCE_LOCK_RETRY_DELAY_MS = 120;

export interface SequenceLockStore {
  readLock(): Promise<{ token: string; expiresAt: string; owner: string }>;
  writeLock(token: string, expiresAt: string, owner: string): Promise<void>;
}

export interface SequenceRowStore {
  readSequence(businessYear: string): Promise<ServiceReportSequence | null>;
  writeSequence(sequence: ServiceReportSequence): Promise<void>;
}

export interface AllocateReportNumberOptions {
  lockStore: SequenceLockStore;
  sequenceStore: SequenceRowStore;
  businessYear: string;
  now?: Date;
  maxLockAttempts?: number;
  retryDelayMs?: number;
  leaseMs?: number;
  newToken?: () => string;
}

export interface AllocationResult {
  reportNo: string;
  lastNumber: number;
}

function defaultNewToken(): string {
  return Buffer.from(randomBytes(16)).toString("hex");
}

/** In-process mutex: one allocation per instance at a time. */
const allocationQueue: { enqueue: <T>(task: () => Promise<T>) => Promise<T> } = (() => {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      const next = tail.then(task, task);
      tail = next.catch(() => undefined);
      return next;
    },
  };
})();

/** Optimistic write-and-verify lease; returns a lease only when we own it. */
async function acquireLease(
  lockStore: SequenceLockStore,
  options: {
    leaseMs: number;
    maxAttempts: number;
    retryDelayMs: number;
    newToken: () => string;
    now: Date;
  },
): Promise<{ token: string; owner: string; expiresAt: number } | null> {
  const owner = options.now.toISOString();
  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    let current: { token: string; expiresAt: string; owner: string } = { token: "", expiresAt: "", owner: "" };
    try {
      current = await lockStore.readLock();
    } catch (error) {
      throw dependencyUnavailable(`Could not read the report-number lock: ${error instanceof Error ? error.message : String(error)}`);
    }
    const expiresAtMs = Number.parseInt(String(current.expiresAt || "0"), 10);
    const isFree = !current.token || expiresAtMs <= options.now.getTime();
    if (isFree) {
      const token = options.newToken();
      const expiresAt = options.now.getTime() + options.leaseMs;
      try {
        await lockStore.writeLock(token, String(expiresAt), owner);
      } catch (error) {
        throw dependencyUnavailable(`Could not acquire the report-number lock: ${error instanceof Error ? error.message : String(error)}`);
      }
      const verified = await lockStore.readLock();
      if (verified.token === token) {
        return { token, owner, expiresAt };
      }
    }
    if (attempt < options.maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs));
    }
  }
  return null;
}

async function releaseLease(
  lockStore: SequenceLockStore,
  token: string,
  owner: string,
): Promise<void> {
  try {
    const current = await lockStore.readLock();
    if (current.token === token && current.owner === owner) {
      await lockStore.writeLock("", "", "");
    }
  } catch {
    // A failed release is safe: the lease expires on its own.
  }
}

/** Allocates the next AIC-SR-YYYY-NNNN number; 503 retryable when locked. */
export function allocateSerializedReportNumber(options: AllocateReportNumberOptions): Promise<AllocationResult> {
  return allocationQueue.enqueue(() => allocateSerializedReportNumberUnlocked(options));
}

async function allocateSerializedReportNumberUnlocked(options: AllocateReportNumberOptions): Promise<AllocationResult> {
  const now = options.now ?? new Date();
  const leaseMs = options.leaseMs ?? SEQUENCE_LOCK_LEASE_MS;
  const maxAttempts = options.maxLockAttempts ?? 5;
  const retryDelayMs = options.retryDelayMs ?? SEQUENCE_LOCK_RETRY_DELAY_MS;
  const newToken = options.newToken ?? defaultNewToken;

  const lease = await acquireLease(options.lockStore, { leaseMs, maxAttempts, retryDelayMs, newToken, now });
  if (!lease) {
    throw gatewayBusy("The report-number allocation lock is busy. Retry shortly.");
  }

  try {
    const current = await options.sequenceStore.readSequence(options.businessYear);
    const lastNumber = current?.lastNumber ?? 0;
    const next = lastNumber + 1;
    const sequence: ServiceReportSequence = {
      sequenceKey: `${SEQUENCE_KEY_PREFIX}-${options.businessYear}`,
      prefix: SERVICE_REPORTS_SEQUENCE_PREFIX,
      businessYear: options.businessYear,
      lastNumber: next,
      updatedAt: now.toISOString(),
    };
    await options.sequenceStore.writeSequence(sequence);
    return {
      reportNo: formatServiceReportNo(options.businessYear, next),
      lastNumber: next,
    };
  } finally {
    await releaseLease(options.lockStore, lease.token, lease.owner);
  }
}