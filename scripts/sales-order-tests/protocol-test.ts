import assert from "node:assert/strict";
import { COMMAND_PROTOCOL_VERSION, signCommand, verifyCommand } from "../../src/lib/salesOrders/protocol.ts";
import type { CommandEnvelope } from "../../src/lib/salesOrders/protocol.ts";

const SECRET = "test-secret";
const command = {
  commandId: "11111111-1111-4111-8111-111111111111",
  commandType: "so.confirm",
  salesOrderId: "22222222-2222-4222-8222-222222222222",
  expectedVersion: 3,
  actorUserId: "U-7",
  issuedAt: new Date().toISOString(),
  payload: { lines: [{ salesOrderIdLine: 1, quantity: 5 }] },
};

const envelope = signCommand(SECRET, command);
assert.equal(envelope.version, COMMAND_PROTOCOL_VERSION);
assert.ok(envelope.signature.length > 0);
assert.equal(verifyCommand(SECRET, envelope), true, "authentic envelope verifies");
assert.equal(verifyCommand("wrong-secret", envelope), false, "wrong secret fails");
assert.equal(verifyCommand(SECRET, { ...envelope, payloadHash: "tampered" }), false, "tampered hash fails");

// Freshness window: stale envelopes are rejected.
const oldEnvelope = signCommand(SECRET, { ...command, issuedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() });
assert.equal(verifyCommand(SECRET, oldEnvelope, { now: new Date() }), false, "expired envelope is rejected");

// Future-dated (clock skew) is tolerated up to the default window.
const futureEnvelope = signCommand(SECRET, { ...command, issuedAt: new Date(Date.now() + 2 * 60 * 1000).toISOString() });
assert.equal(verifyCommand(SECRET, futureEnvelope), true);

// Version-number commands remain signed (no downgrade surface).
const unsupported = signCommand(SECRET, { ...command, issuedAt: new Date().toISOString() });
const bumped: CommandEnvelope = { ...unsupported, version: 999 as unknown as 1 };
assert.equal(verifyCommand(SECRET, bumped), false, "protocol version must match");

console.log("protocol-test passed: HMAC signature, secret/tamper detection, freshness window, version pinning.");