import assert from "node:assert/strict";
import { GatewayConflictError, GatewayReplayError, LockedChannel, addDraft, confirmWithinLock, createStore, getDraft, payloadHash } from "./fake-gateway.ts";
import { newUuid } from "../../src/lib/salesOrders/ids.ts";

async function main(): Promise<void> {
  // Overlapping confirmations serialize: two different drafts confirmed
  // concurrently receive DISTINCT sequence numbers.
  const store = createStore();
  const channel = new LockedChannel();
  const draftA = addDraft(store, newUuid());
  const draftB = addDraft(store, newUuid());
  const results = await Promise.all([
    confirmWithinLock(channel, store, { salesOrderId: draftA.salesOrderId, commandId: newUuid(), payloadSignature: payloadHash({ orderId: draftA.salesOrderId }), expectedVersion: 1, year: "2026" }),
    confirmWithinLock(channel, store, { salesOrderId: draftB.salesOrderId, commandId: newUuid(), payloadSignature: payloadHash({ orderId: draftB.salesOrderId }), expectedVersion: 1, year: "2026" }),
  ]);
  assert.equal(results[0].replayed, false);
  assert.equal(results[1].replayed, false);
  assert.notEqual(results[0].salesOrderNo, results[1].salesOrderNo, "concurrent confirmations must receive distinct numbers");
  assert.equal(new Set(results.map((r) => r.salesOrderNo)).size, 2);
  assert.ok(results.every((r) => /^AIC-SO-2026-\d{4}$/.test(r.salesOrderNo)));
  assert.equal(getDraft(store, draftA.salesOrderId)?.version, 2);
  console.log("  gate 1: two concurrent confirmations serialize — distinct sales order numbers allocated.");
// Competing edits on the SAME order: the second confirmation must fail with
  // a version conflict, never overwrite the first, and never allocate a number.
  {
    const store2 = createStore();
    const channel2 = new LockedChannel();
    const draft = addDraft(store2, newUuid());
    const winners: string[] = [];
    const results2 = await Promise.allSettled([
      confirmWithinLock(channel2, store2, { salesOrderId: draft.salesOrderId, commandId: newUuid(), payloadSignature: "sig-1", expectedVersion: 1, year: "2026" }).then((r) => { winners.push(r.salesOrderNo); return r; }),
      confirmWithinLock(channel2, store2, { salesOrderId: draft.salesOrderId, commandId: newUuid(), payloadSignature: "sig-2", expectedVersion: 1, year: "2026" }).then((r) => { winners.push(r.salesOrderNo); return r; }),
    ]);
    const conflict = results2.find((result) => result.status === "rejected")?.reason;
    assert.ok(conflict instanceof GatewayConflictError, "the second confirmation must hit a version conflict");
    assert.equal((conflict as GatewayConflictError).currentVersion, 2);
    assert.equal(winners.length, 1, "only one confirmation may succeed for one draft");
    assert.equal(store2.sequence.lastNumber, 1, "no duplicate number allocation");
    console.log("  gate 2: stale-version conflict — competing edit rejected, no second SO number allocated.");
  }

  // Idempotent retry: replaying the same command ID and payload returns the
  // recorded result and does NOT allocate another number.
  {
    const store3 = createStore();
    const channel3 = new LockedChannel();
    const draft = addDraft(store3, newUuid());
    const commandId = newUuid();
    const signature = payloadHash({ orderId: draft.salesOrderId, market: "PH" });
    const first = await confirmWithinLock(channel3, store3, { salesOrderId: draft.salesOrderId, commandId, payloadSignature: signature, expectedVersion: 1, year: "2026" });
    const retried = await confirmWithinLock(channel3, store3, { salesOrderId: draft.salesOrderId, commandId, payloadSignature: signature, expectedVersion: 1, year: "2026" });
    assert.equal(retried.replayed, true);
    assert.equal(retried.salesOrderNo, first.salesOrderNo, "retry must return the same order number");
    assert.equal(store3.sequence.lastNumber, 1, "retrying the same command must not consume another number");
    assert.equal(getDraft(store3, draft.salesOrderId)?.version, 2);
    console.log("  gate 3: idempotent retry — same command ID replays the recorded receipt without duplicates.");
  }

  // The same command ID with a DIFFERENT payload is a replay rejection.
  {
    const store4 = createStore();
    const channel4 = new LockedChannel();
    const draft = addDraft(store4, newUuid());
    const commandId = newUuid();
    await confirmWithinLock(channel4, store4, { salesOrderId: draft.salesOrderId, commandId, payloadSignature: "sig-a", expectedVersion: 1, year: "2026" });
    let rejected = false;
    try {
      await confirmWithinLock(channel4, store4, { salesOrderId: draft.salesOrderId, commandId, payloadSignature: "sig-b", expectedVersion: 1, year: "2026" });
    } catch (error) {
      rejected = error instanceof GatewayReplayError;
    }
    assert.equal(rejected, true, "same command ID with a different payload must be rejected");
    console.log("  gate 4: command replay rejection — same ID, different payload, 409.");
  }
}

const run = main();
run.then(
  () => console.log("concurrency-test passed: serialization, distinct numbering, stale-version conflict, idempotent retry, replay rejection."),
  (error) => {
    console.error("concurrency-test FAILED:", error);
    process.exitCode = 1;
  },
);