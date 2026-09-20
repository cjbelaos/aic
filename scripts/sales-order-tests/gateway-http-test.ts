// Gateway integration test — exercises the REAL gateway client
// (src/lib/salesOrders/gateway.ts) against a real local HTTP server that
// implements the Apps Script gateway contract. Verification uses the REAL
// protocol.ts verifyCommand and crypto-hash.ts payloadHash, so the test proves
// the client's signing, error mapping, idempotent retry and replay rejection.
// The Apps Script leaf behavior (SpreadsheetApp persistence, LockService
// waitLock) still requires the live deployment proof in the writer README.

import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { sendGatewayCommand } from "../../src/lib/salesOrders/gateway.ts";
import { payloadHash } from "../../src/lib/salesOrders/crypto-hash.ts";
import { verifyCommand, type CommandEnvelope } from "../../src/lib/salesOrders/protocol.ts";
import { newUuid } from "../../src/lib/salesOrders/ids.ts";

const SECRET = "test-gateway-secret-not-for-production";

const store: {
  drafts: Record<string, { salesOrderId: string; version: number; orderStatus: string; salesOrderNo: string }>;
  receipts: Record<string, { payloadHash: string; resultJson: string }>;
  sequence: { lastNumber: number };
} = { drafts: {}, receipts: {}, sequence: { lastNumber: 0 } };
let forceBusy = false;
let lockTail: Promise<void> = Promise.resolve();

const addDraft = (id: string) => { store.drafts[id] = { salesOrderId: id, version: 1, orderStatus: "DRAFT", salesOrderNo: "" }; };

function json(res: ServerResponse, body: unknown, status: number): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

/** Serializes handlers the way LockService serializes gateway executions. */
function withLock<T>(body: () => T): Promise<T> {
  const run = lockTail.catch(() => {}).then(() => body());
  lockTail = run.then(() => {}, () => {});
  return run;
}

async function handleCommand(body: { envelope: CommandEnvelope; payload: unknown }, res: ServerResponse): Promise<void> {
  if (forceBusy) return json(res, { ok: false, code: "GATEWAY_BUSY", message: "busy", retryable: true }, 503);
  if (!verifyCommand(SECRET, body.envelope)) {
    return json(res, { ok: false, code: "GATEWAY_REJECTED", message: "Signature is invalid.", retryable: false }, 400);
  }
  if (payloadHash(body.payload) !== body.envelope.payloadHash) {
    return json(res, { ok: false, code: "GATEWAY_REJECTED", message: "payloadHash does not match the signed payload.", retryable: false }, 400);
  }
  const envelope = body.envelope;
  const salesOrderId = (body.payload as { salesOrderId: string }).salesOrderId;
  const receipt = store.receipts[envelope.commandId];
  if (receipt) {
    if (receipt.payloadHash !== envelope.payloadHash) {
      return json(res, { ok: false, code: "COMMAND_REPLAY", message: "Command ID was already used with different content.", retryable: false }, 409);
    }
    return json(res, { ok: true, replayed: true, result: JSON.parse(receipt.resultJson) }, 200);
  }
  const draft = store.drafts[salesOrderId];
  if (!draft) return json(res, { ok: false, code: "GATEWAY_REJECTED", message: "SalesOrder not found.", retryable: false }, 400);
  if (envelope.expectedVersion !== null && envelope.expectedVersion !== undefined && Number(envelope.expectedVersion) !== draft.version) {
    return json(res, { ok: false, code: "VERSION_CONFLICT", message: "Version conflict.", currentVersion: draft.version, retryable: false }, 409);
  }
  const nextVersion = draft.version + 1;
  let salesOrderNo = "";
  if (envelope.commandType === "so.confirm") {
    store.sequence.lastNumber += 1;
    salesOrderNo = `AIC-SO-2026-${String(store.sequence.lastNumber).padStart(4, "0")}`;
    draft.orderStatus = "CONFIRMED";
    draft.salesOrderNo = salesOrderNo;
  }
  draft.version = nextVersion;
  const result = { salesOrderId, version: nextVersion, salesOrderNo, applied: true };
  store.receipts[envelope.commandId] = { payloadHash: envelope.payloadHash, resultJson: JSON.stringify(result) };
  return json(res, { ok: true, replayed: false, result }, 200);
}

let server: Server;
let baseUrl = "";

async function startServer(): Promise<void> {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST") return json(res, { error: "method" }, 405);
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        return void withLock(() => handleCommand(body, res));
      } catch {
        return json(res, { ok: false, code: "MALFORMED", message: "bad json" }, 400);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

function stopServer(): void {
  try { server.close(); } catch {}
}

function makeCommand(commandType: string, salesOrderId: string, expectedVersion: number | null, payload: unknown) {
  return {
    commandId: newUuid(), commandType, salesOrderId, expectedVersion,
    actorUserId: "test-user", issuedAt: new Date().toISOString(), payload,
  };
}

/** Transport that deliberately loses the response after the server committed. */
function losingTransport() {
  let lost = false;
  return {
    lost: () => lost,
    transport: {
      async postAsJson(url: string, body: unknown): Promise<{ status: number; text: string }> {
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const text = await response.text();
        if (!lost) { lost = true; throw new Error("connection lost after server committed"); }
        return { status: response.status, text };
      },
    },
  };
}
async function main(): Promise<void> {
  process.env.SALES_ORDER_GATEWAY_URL = "http://127.0.0.1:9"; // URL is overridden below
  process.env.SALES_ORDER_GATEWAY_SECRET = SECRET;
  await startServer();
  const options = {
    urlOverride: baseUrl,
    transport: {
      postAsJson: async (url: string, body: unknown) => {
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        return { status: response.status, text: await response.text() };
      },
    },
  };

  // 1. Concurrent confirmations serialize and allocate DISTINCT numbers.
  {
    const draftA = newUuid();
    const draftB = newUuid();
    addDraft(draftA);
    addDraft(draftB);
    const payloadA = { salesOrderId: draftA };
    const payloadB = { salesOrderId: draftB };
    const results = await Promise.all([
      sendGatewayCommand<{ salesOrderNo: string }>({ command: makeCommand("so.confirm", draftA, 1, payloadA), payload: payloadA }, options),
      sendGatewayCommand<{ salesOrderNo: string }>({ command: makeCommand("so.confirm", draftB, 1, payloadB), payload: payloadB }, options),
    ]);
    const numbers = results.map((r) => r.result.salesOrderNo);
    assert.equal(new Set(numbers).size, 2, "concurrent confirmations must receive distinct numbers");
    assert.equal(numbers.every((no) => /^AIC-SO-2026-\d{4}$/.test(no)), true);
    console.log("  gateway: two concurrent confirmations serialize — distinct numbers allocated.");
  }

  // 2. Competing edit returns a 409 VERSION_CONFLICT through the real client.
  {
    const draft = newUuid();
    addDraft(draft);
    const payload = { salesOrderId: draft, market: "PH" };
    const first = await sendGatewayCommand<{ version: number }>({ command: makeCommand("so.update", draft, 1, payload), payload }, options);
    assert.equal(first.result.version, 2);
    let conflict: { code: string; currentVersion?: number } = { code: "" };
    try {
      await sendGatewayCommand({ command: makeCommand("so.update", draft, 1, payload), payload }, options);
    } catch (error) {
      conflict = (error as { toBody?: () => { code: string; currentVersion?: number } }).toBody?.() ?? { code: "" };
    }
    assert.equal(conflict?.code, "VERSION_CONFLICT", "competing edit must produce a conflict via the real client mapping");
    assert.equal(conflict?.currentVersion, 2);
    console.log("  gateway: competing edit — 409 VERSION_CONFLICT with currentVersion surfaced by the client.");
  }

  // 3. Lost response + retry with the SAME commandId produces ONE operation.
  {
    const draft = newUuid();
    addDraft(draft);
    store.sequence.lastNumber = 0;
    const commandId = newUuid();
    const payload = { salesOrderId: draft, item: "lost-response" };
    const command = { commandId, commandType: "so.confirm", salesOrderId: draft, expectedVersion: 1, actorUserId: "test-user", issuedAt: new Date().toISOString() };
    const losing = losingTransport();
    const retryOptions = { urlOverride: baseUrl, transport: losing.transport };
    const retry = () => sendGatewayCommand<{ salesOrderNo: string }>({ command: { ...command, payload }, payload }, retryOptions);
    let firstFailed = false;
    try { await retry(); } catch { firstFailed = true; }
    assert.equal(firstFailed, true, "the lost-response attempt must raise a dependency error");
    assert.equal(losing.lost(), true);
    const retried = await retry();
    assert.equal(retried.replayed, true, "retrying the SAME commandId must replay the receipt");
    assert.equal(store.drafts[draft].version, 2, "exactly one business operation");
    assert.equal(store.sequence.lastNumber, 1, "no second number allocated");
    const again = await retry();
    assert.equal(again.result.salesOrderNo, retried.result.salesOrderNo);
    console.log("  gateway: lost-response retry → one business operation, same number, no duplicate.");
  }
  await runSecondHalf(options);
}
async function runSecondHalf(options: {
  urlOverride: string;
  transport: { postAsJson(url: string, body: unknown): Promise<{ status: number; text: string }> };
}): Promise<void> {
  // 4. Same command ID with a DIFFERENT payload → 409 COMMAND_REPLAY.
  {
    const draft = newUuid();
    addDraft(draft);
    const payloadA = { salesOrderId: draft, content: "a" };
    const payloadB = { salesOrderId: draft, content: "b" };
    const firstCommand = makeCommand("so.update", draft, 1, payloadA);
    const secondCommand = { ...makeCommand("so.update", draft, 1, payloadB), commandId: firstCommand.commandId };
    await sendGatewayCommand({ command: firstCommand, payload: payloadA }, options);
    let replay = false;
    try {
      await sendGatewayCommand({ command: secondCommand, payload: payloadB }, options);
    } catch (error) {
      replay = (error as { toBody?: () => { code: string } }).toBody?.().code === "COMMAND_REPLAY";
    }
    assert.equal(replay, true, "same commandId with different content must be rejected");
    console.log("  gateway: same commandId + different payload → 409 COMMAND_REPLAY.");
  }

  // 5. Tampered payload (changed after signing) is rejected by the hash check.
  {
    const draft = newUuid();
    addDraft(draft);
    const payloadA = { salesOrderId: draft, price: 100 };
    const tamperTransport = {
      async postAsJson(_url: string, body: { envelope: unknown }): Promise<{ status: number; text: string }> {
        const response = await fetch(baseUrl, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ envelope: body.envelope, payload: { salesOrderId: draft, price: 999_999 } }),
        });
        return { status: response.status, text: await response.text() };
      },
    };
    let rejected = false;
    try {
      await sendGatewayCommand({ command: makeCommand("so.update", draft, 1, payloadA), payload: payloadA }, { urlOverride: baseUrl, transport: tamperTransport });
    } catch (error) {
      const body = (error as { toBody?: () => { code: string; message: string } }).toBody?.();
      rejected = body?.message.includes("payloadHash") === true;
    }
    assert.equal(rejected, true, "payload tampering after signing must be rejected by the server hash check");
    console.log("  gateway: tampered payload rejected — signed payloadHash validated against the actual payload.");
  }

  stopServer();
}

const run = main();
run.then(
  () => console.log("gateway-http-test passed: real client signing, serialization, conflict, idempotent retry, replay rejection, tamper rejection."),
  (error) => {
    try { stopServer(); } catch {}
    console.error("gateway-http-test FAILED:", error);
    process.exitCode = 1;
  },
);