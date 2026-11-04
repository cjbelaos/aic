/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { createLoader } = require("./proforma-runtime.cjs");

async function run() {
  const sent = [];
  let fail = true;
  let committedReceipt = null;
  const axios = {
    post: async (url, body) => {
      sent.push({ url, body });
      if (url.endsWith("send-email") && fail) throw new Error("Connection interrupted");
      return { data: { success: true, fileLink: "saved" } };
    },
    get: async url => ({ data: committedReceipt ? [committedReceipt] : [{ sendId: "history", url }] }),
  };
  const service = createLoader({ axios }).call(null, "src/lib/services/quotation.service.ts").default;
  const payload = { quotationNo: "Q-001", customer: "Client", email: "client@example.test", cc: ["sales.aerichinnovationcorp@gmail.com"], quotationDescription: "Repair", grandTotal: 100, snapshotToken: "saved-snapshot", pdfBlob: new Blob(["%PDF-1.4"], { type: "application/pdf" }) };
  const originalError = console.error;
  console.error = () => {};
  try { await assert.rejects(() => service.sendEmail(payload), /Connection interrupted/); }
  finally { console.error = originalError; }
  fail = false;
  await service.sendEmail(payload);
  assert.equal(sent[0].body.get("sendId"), sent[1].body.get("sendId"), "An interrupted attempt retains its send identity");
  assert.equal(sent[1].body.get("snapshotToken"), "saved-snapshot");
  assert.equal(sent[1].body.get("quotationNo"), "Q-001");
  assert.deepEqual(JSON.parse(sent[1].body.get("cc")), payload.cc);
  assert.equal(sent[1].body.get("file").type, "application/pdf");
  await service.sendEmail(payload);
  assert.notEqual(sent[1].body.get("sendId"), sent[2].body.get("sendId"), "An intentional resend after acknowledgement gets its own receipt");
  await service.savePdfToDrive("Q-001", "JVBERi0=", "saved-snapshot");
  assert.deepEqual(sent[3].body, { quotationNo: "Q-001", pdfBase64: "JVBERi0=", snapshotToken: "saved-snapshot" });
  const history = await service.getHistory("Q/001");
  assert.equal(history[0].url, "/api/quotations/Q%2F001/history");
  fail = true;
  console.error = () => {};
  try { await assert.rejects(service.sendEmail(payload), /Connection interrupted/); } finally { console.error = originalError; }
  const lostRequest = sent.at(-1);
  committedReceipt = { sendId: lostRequest.body.get("sendId"), quotationNo: "Q-001", state: "SENT", revision: 1, file: "immutable-sent.pdf" };
  const beforeRecovery = sent.length;
  const recovered = await service.recoverPendingSend("Q-001");
  assert.equal(recovered.data.recovered, true); assert.equal(recovered.data.revision, 1); assert.equal(sent.length, beforeRecovery, "Lost success response must be recovered before generating/sending a newer snapshot");
  assert.equal(await service.recoverPendingSend("Q-001"), null);
  console.log("Quotation client tests passed (send tokens, retry identity, PDF guards, authenticated history path).");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
