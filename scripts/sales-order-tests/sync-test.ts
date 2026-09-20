import assert from "node:assert/strict";
import {
  backoffDelayMs,
  claimSyncJob,
  completeSyncJob,
  createSyncJob,
  failSyncJobPermanently,
  isDue,
  payloadHash,
  recoverExpiredLease,
  retrySyncJob,
  supersedeSyncJob,
  validateLease,
} from "../../src/lib/salesOrders/sync.ts";

const T0 = "2026-09-19T00:00:00.000Z";
const LATER = "2026-09-19T00:00:05.000Z";

const job = createSyncJob({
  syncJobId: "00000000-0000-4000-8000-0000000000a1",
  salesOrderId: "00000000-0000-4000-8000-0000000000b1",
  orderVersion: 3,
  destinationSpreadsheetId: "dest-1",
  destinationSheetId: "tabs-1",
  nowIso: T0,
});
assert.equal(job.status, "PENDING");
assert.equal(job.attemptCount, 0);
assert.equal(isDue(job, T0), true);

// Claiming assigns a unique lease and bumps the attempt counter.
const claimed = claimSyncJob(job, { leaseToken: "tok-1", leaseOwner: "worker-a", leaseValidForMs: 60_000, nowIso: T0 });
assert.equal(claimed.status, "PROCESSING");
assert.equal(claimed.attemptCount, 1);
assert.equal(claimed.leaseOwner, "worker-a");
assert.ok(claimed.leaseExpiresAt > T0);

// Only the holder with the live token can advance the job.
assert.equal(validateLease(claimed, "tok-1", LATER), true);
assert.equal(validateLease(claimed, "wrong-token", LATER), false);
assert.equal(validateLease(claimed, "tok-1", "2026-09-19T00:02:00.000Z"), false, "lease must expire after leaseExpiresAt");

// Completion requires the token; completing clears the lease.
assert.throws(() => completeSyncJob(claimed, "wrong-token", LATER), /Lease validation failed/);
const done = completeSyncJob(claimed, "tok-1", LATER);
assert.equal(done.status, "SYNCED");
assert.equal(done.syncedAt, LATER);
assert.equal(done.leaseToken, "");
assert.equal(isDue(done, LATER), false);

// Retryable failure records backoff and requires the token.
const failing = claimSyncJob(job, { leaseToken: "tok-2", leaseOwner: "worker-a", leaseValidForMs: 60_000, nowIso: T0 });
const retried = retrySyncJob(failing, "tok-2", "HTTP_429", "rate limited", LATER, { baseDelayMs: 1_000, capDelayMs: 60_000 });
assert.equal(retried.status, "RETRY");
assert.ok(Date.parse(retried.nextAttemptAt) > Date.parse(LATER));
assert.equal(isDue(retried, LATER), false, "retry must not be due before its schedule");
assert.equal(isDue(retried, retried.nextAttemptAt), true);

// Expired leases recover to RETRY through the locked recovery path and the
// attempt counter from the failed claim is preserved for backoff purposes.
const crashed = claimSyncJob({ ...job, status: "PENDING", attemptCount: 1 }, { leaseToken: "tok-3", leaseOwner: "worker-b", leaseValidForMs: 1_000, nowIso: T0 });
const expiredMoment = "2026-09-19T00:00:02.000Z";
const recovered = recoverExpiredLease(crashed, expiredMoment);
assert.equal(recovered.status, "RETRY");
assert.equal(recovered.lastErrorCode, "LEASE_EXPIRED");
assert.equal(recovered.attemptCount, 2, "expired attempt stays advanced for backoff");

// A still-live lease must NOT be stolen.
assert.deepEqual(recoverExpiredLease(claimed, LATER), claimed);

// Permanent failure requires the token.
const permanent = failSyncJobPermanently(claimed, "tok-1", "PERMISSION_DENIED", "no access to destination", LATER);
assert.equal(permanent.status, "FAILED");
assert.equal(isDue(permanent, LATER), false);

// Superseded jobs are terminal and never published.
const superseded = supersedeSyncJob(job, 9);
assert.equal(superseded.status, "SUPERSEDED");

// Bounded exponential backoff: 1s, 2s, 4s … capped at 60s.
assert.equal(backoffDelayMs(1, { baseDelayMs: 1_000, capDelayMs: 60_000 }), 1_000);
assert.equal(backoffDelayMs(2, { baseDelayMs: 1_000, capDelayMs: 60_000 }), 2_000);
assert.equal(backoffDelayMs(7, { baseDelayMs: 1_000, capDelayMs: 60_000 }), 60_000);
assert.equal(backoffDelayMs(99, { baseDelayMs: 1_000, capDelayMs: 60_000 }), 60_000);

// Payload hashing is canonical (key order independent) and stable.
assert.equal(payloadHash({ a: 1, b: [1, 2] }), payloadHash({ b: [1, 2], a: 1 }));
assert.notEqual(payloadHash({ a: 1 }), payloadHash({ a: 2 }));

console.log("sync-test passed: claim, lease validation/expiry, completion, retry backoff, expired-lease recovery, permanent failure, supersede, hashing.");