// Durable outbound synchronization state machine (SalesOrderSyncJobs).
// Pure logic: no network, no Sheets. Lease acquisition/validation and expiry
// recovery are exercised by focused tests and used by the Next.js worker,
// always through the authenticated Apps Script gateway lock.

import { payloadHash } from "./crypto-hash.ts";
import type { SalesOrderSyncJob, SyncJobStatus } from "../../types/salesOrder.ts";

export const SYNC_JOB_STATES: readonly SyncJobStatus[] = [
  "PENDING",
  "PROCESSING",
  "RETRY",
  "SYNCED",
  "FAILED",
  "SUPERSEDED",
];

export function createSyncJob(input: {
  syncJobId: string;
  salesOrderId: string;
  orderVersion: number;
  destinationSpreadsheetId: string;
  destinationSheetId: string;
  nowIso: string;
}): SalesOrderSyncJob {
  return {
    syncJobId: input.syncJobId,
    salesOrderId: input.salesOrderId,
    orderVersion: input.orderVersion,
    destinationSpreadsheetId: input.destinationSpreadsheetId,
    destinationSheetId: input.destinationSheetId,
    status: "PENDING",
    attemptCount: 0,
    nextAttemptAt: input.nowIso,
    lastErrorCode: "",
    lastErrorMessage: "",
    leaseToken: "",
    leaseOwner: "",
    leaseExpiresAt: "",
    createdAt: input.nowIso,
    lastAttemptAt: "",
    syncedAt: "",
  };
}

function isDatetime(value: string): boolean {
  return value.length > 0 && !Number.isNaN(Date.parse(value));
}

function hasLiveLease(job: SalesOrderSyncJob, token: string, nowIso: string): boolean {
  if (!job.leaseToken || job.leaseToken !== token) return false;
  if (!isDatetime(job.leaseExpiresAt)) return false;
  return Date.parse(job.leaseExpiresAt) > Date.parse(nowIso);
}
export function claimSyncJob(job: SalesOrderSyncJob, input: { leaseToken: string; leaseOwner: string; leaseValidForMs: number; nowIso: string }): SalesOrderSyncJob {
  if (job.status === "PROCESSING" || job.status === "SYNCED" || job.status === "FAILED" || job.status === "SUPERSEDED") {
    throw new Error(`Job ${job.syncJobId} is in state ${job.status} and cannot be claimed.`);
  }
  const leaseExpires = new Date(Date.parse(input.nowIso) + input.leaseValidForMs).toISOString();
  return {
    ...job,
    status: "PROCESSING",
    attemptCount: job.attemptCount + 1,
    leaseToken: input.leaseToken,
    leaseOwner: input.leaseOwner,
    leaseExpiresAt: leaseExpires,
    lastAttemptAt: input.nowIso,
    nextAttemptAt: input.nowIso,
  };
}

export function validateLease(job: SalesOrderSyncJob, token: string, nowIso: string): boolean {
  if (job.status !== "PROCESSING" && job.status !== "RETRY") return false;
  return hasLiveLease(job, token, nowIso);
}

export function completeSyncJob(job: SalesOrderSyncJob, token: string, nowIso: string): SalesOrderSyncJob {
  if (!validateLease(job, token, nowIso)) throw new Error("Lease validation failed; the job cannot be completed.");
  return {
    ...job,
    status: "SYNCED",
    syncedAt: nowIso,
    nextAttemptAt: "",
    lastErrorCode: "",
    lastErrorMessage: "",
    leaseToken: "",
    leaseOwner: "",
    leaseExpiresAt: "",
  };
}
export function failSyncJobPermanently(job: SalesOrderSyncJob, token: string, code: string, message: string, nowIso: string): SalesOrderSyncJob {
  if (!validateLease(job, token, nowIso)) throw new Error("Lease validation failed; the job cannot be failed.");
  return {
    ...job,
    status: "FAILED",
    lastErrorCode: code,
    lastErrorMessage: message.slice(0, 500),
    leaseToken: "",
    leaseOwner: "",
    leaseExpiresAt: "",
    nextAttemptAt: "",
  };
}

export function retrySyncJob(
  job: SalesOrderSyncJob,
  token: string,
  code: string,
  message: string,
  nowIso: string,
  options: { baseDelayMs: number; capDelayMs: number },
): SalesOrderSyncJob {
  if (!validateLease(job, token, nowIso)) throw new Error("Lease validation failed; the job cannot be retried.");
  const delay = backoffDelayMs(job.attemptCount, options);
  const nextAttemptAt = new Date(Date.parse(nowIso) + delay).toISOString();
  return {
    ...job,
    status: "RETRY",
    lastErrorCode: code,
    lastErrorMessage: message.slice(0, 500),
    nextAttemptAt,
    leaseToken: "",
    leaseOwner: "",
    leaseExpiresAt: "",
  };
}
export function recoverExpiredLease(job: SalesOrderSyncJob, nowIso: string): SalesOrderSyncJob {
  if (job.status !== "PROCESSING") return job;
  if (isDatetime(job.leaseExpiresAt) && Date.parse(job.leaseExpiresAt) > Date.parse(nowIso)) return job;
  return {
    ...job,
    status: "RETRY",
    nextAttemptAt: nowIso,
    lastErrorCode: "LEASE_EXPIRED",
    lastErrorMessage: "The processing lease expired before completion; the job was returned to retry.",
    leaseToken: "",
    leaseOwner: "",
    leaseExpiresAt: "",
  };
}

export function supersedeSyncJob(job: SalesOrderSyncJob, newerOrderVersion: number): SalesOrderSyncJob {
  return {
    ...job,
    status: "SUPERSEDED",
    lastErrorCode: "SUPERSEDED",
    lastErrorMessage: `Superseded by order version ${newerOrderVersion}.`,
    leaseToken: "",
    leaseOwner: "",
    leaseExpiresAt: "",
    nextAttemptAt: "",
  };
}

export function backoffDelayMs(attemptCount: number, options: { baseDelayMs: number; capDelayMs: number }): number {
  if (options.baseDelayMs <= 0 || options.capDelayMs <= 0) throw new Error("Backoff delays must be positive.");
  if (options.capDelayMs < options.baseDelayMs) throw new Error("Backoff cap must be at least the base delay.");
  return Math.min(options.capDelayMs, options.baseDelayMs * 2 ** Math.max(0, attemptCount - 1));
}
export function isDue(job: SalesOrderSyncJob, nowIso: string): boolean {
  if (job.status !== "PENDING" && job.status !== "RETRY") return false;
  if (!job.nextAttemptAt) return job.status === "PENDING";
  return Date.parse(job.nextAttemptAt) <= Date.parse(nowIso);
}

export function syncStatusForUi(job: SalesOrderSyncJob | null): "NONE" | "PENDING" | "PROCESSING" | "RETRY" | "SYNCED" | "FAILED" | "SUPERSEDED" {
  if (!job) return "NONE";
  return job.status;
}

export { payloadHash };