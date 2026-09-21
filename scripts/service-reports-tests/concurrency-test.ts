import assert from "node:assert/strict";
import { allocateSerializedReportNumber } from "../../src/lib/serviceReports/sequences.ts";
import { ServiceReportError } from "../../src/lib/serviceReports/errors.ts";
import type { ServiceReportSequence } from "../../src/types/serviceReport.ts";

function makeLockStore() {
  let lock = { token: "", expiresAt: "0", owner: "" };
  return {
    state: { read: () => ({ ...lock }), set: (next: typeof lock) => { lock = next; } },
    async readLock() { return { ...lock }; },
    async writeLock(token: string, expiresAt: string, owner: string) { lock = { token, expiresAt, owner }; },
  };
}

function makeSeqStore() {
  const rows = new Map<string, ServiceReportSequence>();
  return {
    async readSequence(businessYear: string): Promise<ServiceReportSequence | null> {
      const row = rows.get(`AIC-SR-${businessYear}`);
      return row ? { ...row } : null;
    },
    async writeSequence(sequence: ServiceReportSequence) {
      rows.set(sequence.sequenceKey, { ...sequence });
    },
    rows,
  };
}

(async () => {
  // 1. 40 concurrent allocations are serialized and never collide.
  const lockStore = makeLockStore();
  const seqStore = makeSeqStore();
  const results = await Promise.all(
    Array.from({ length: 40 }, () =>
      allocateSerializedReportNumber({
        lockStore,
        sequenceStore: seqStore,
        businessYear: "2026",
        now: new Date(Date.UTC(2026, 8, 20, 0, 0, 0)),
      }),
    ),
  );
  assert.equal(results.length, 40);
  const numbers = results.map((r) => r.lastNumber).sort((a, b) => a - b);
  assert.deepEqual(numbers, Array.from({ length: 40 }, (_, i) => i + 1), "allocated numbers must be 1..40 with no duplicates");
  const unique = new Set(results.map((r) => r.reportNo));
  assert.equal(unique.size, 40);
  assert.equal(results[0].reportNo, "AIC-SR-2026-0001");
  assert.equal(results[39].reportNo, "AIC-SR-2026-0040");

  // 2. A stalled (unexpired) lease refuses allocation with a retryable busy error.
  const busyLock = makeLockStore();
  await busyLock.writeLock("stale-owner-token", String(Date.now() + 60_000), "another-instance");
  const seqStore2 = makeSeqStore();
  const busy = await allocateSerializedReportNumber({
    lockStore: busyLock,
    sequenceStore: seqStore2,
    businessYear: "2026",
    maxLockAttempts: 1,
    retryDelayMs: 1,
  }).then(() => null, (error: ServiceReportError) => error);
  assert.ok(busy instanceof ServiceReportError);
  assert.equal(busy.errorCode, "GATEWAY_BUSY");
  assert.equal(busy.retryable, true);
  assert.equal(busy.status, 503);

  // 3. An EXPIRED lease can be reclaimed.
  const staleLock = makeLockStore();
  await staleLock.writeLock("stale-token", String(Date.now() - 1), "another-instance");
  const seqStore3 = makeSeqStore();
  const reclaimed = await allocateSerializedReportNumber({
    lockStore: staleLock,
    sequenceStore: seqStore3,
    businessYear: "2026",
    maxLockAttempts: 2,
    retryDelayMs: 1,
  });
  assert.equal(reclaimed.reportNo, "AIC-SR-2026-0001");
  // The stale owner's lock is cleared after release.
  const finalLock = await staleLock.readLock();
  assert.equal(finalLock.token, "");

  console.log("concurrency tests passed");
})().catch((error) => {
  console.error("concurrency tests failed:", error);
  process.exitCode = 1;
});