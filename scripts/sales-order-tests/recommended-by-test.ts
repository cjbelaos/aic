import assert from "node:assert/strict";
import {
  COMPANY_INBOX,
  noticeRecipients,
  purchaseRequestNoticeEmail,
  recommenderOptions,
  resolveRecommendedBy,
  shouldSendRecommenderNotice,
} from "../../src/lib/recommendedBy.ts";

const tech = { userId: "u1", username: "jtech", fullName: "Juan Tech", email: "T@x.com", departmentId: 1, positionId: 5 };
const manager = { userId: "u2", username: "amgr", fullName: "Ana Manager", email: "m@x.com", departmentId: 1, positionId: 6 };
const admin = { userId: "u3", username: "admin", fullName: "Admin Person", email: "a@x.com", departmentId: 2, positionId: 6 };
const users = [tech, manager, admin];
const positions = [{ positionId: 5, positionTitle: "Technician" }, { positionId: 6, positionTitle: "After Sales Manager" }];

assert.equal(COMPANY_INBOX, "aerichinnovationcorp@gmail.com");

// Only After Sales users are offered, sorted by name.
assert.deepEqual(recommenderOptions(users), [
  { userId: "u2", fullName: "Ana Manager" },
  { userId: "u1", fullName: "Juan Tech" },
]);

// Blank means no recommender; known After Sales user resolves its name server-side.
const blank = { recommendedByUserId: "", recommendedByName: "" };
assert.deepEqual(resolveRecommendedBy("", users), blank);
assert.deepEqual(resolveRecommendedBy(undefined, users), blank);
assert.deepEqual(resolveRecommendedBy(" u1 ", users), { recommendedByUserId: "u1", recommendedByName: "Juan Tech" });
const notAfterSales = { error: "The recommending technician must be an After Sales user." };
assert.deepEqual(resolveRecommendedBy("u3", users), notAfterSales);
assert.deepEqual(resolveRecommendedBy("nope", users), notAfterSales);

// Technician in To; After Sales managers and the company inbox in CC.
assert.deepEqual(noticeRecipients("u1", users, positions), { to: "t@x.com", cc: ["m@x.com", COMPANY_INBOX] });
// A manager who recommended is not repeated in CC.
assert.deepEqual(noticeRecipients("u2", users, positions), { to: "m@x.com", cc: [COMPANY_INBOX] });
// No email on the technician's account: nothing to send.
assert.equal(noticeRecipients("u1", [{ ...tech, email: " " }, manager], positions), null);
assert.equal(noticeRecipients("missing", users, positions), null);
// CC is de-duplicated case-insensitively.
const dupManager = { ...manager, userId: "u4", email: "AERICHINNOVATIONCORP@gmail.com" };
assert.deepEqual(noticeRecipients("u1", [tech, manager, dupManager], positions), { to: "t@x.com", cc: ["m@x.com", COMPANY_INBOX] });

// Only the first time an order becomes CONFIRMED.
assert.equal(shouldSendRecommenderNotice(null, "CONFIRMED"), true);
assert.equal(shouldSendRecommenderNotice("DRAFT", "CONFIRMED"), true);
assert.equal(shouldSendRecommenderNotice("ON_HOLD", "CONFIRMED"), false);
assert.equal(shouldSendRecommenderNotice(null, "DRAFT"), false);

// Email copy escapes user-entered text.
const email = purchaseRequestNoticeEmail({
  salesOrderNo: "AIC-SO-2026-0001",
  customer: "A & B <Co>",
  quotationNo: "Q-100",
  technicianName: "Juan Tech",
  items: [{ description: "Pump \"X\" replacement", quantity: 2, unit: "pc" }],
  orderUrl: "https://app.example/dashboard/sales-orders/so1",
  purchaseRequestUrl: "https://app.example/dashboard/purchase-requests",
});
assert.equal(email.subject, "Purchase Request needed: AIC-SO-2026-0001 (A & B <Co>)");
assert.ok(email.html.includes("A &amp; B &lt;Co&gt;"));
assert.ok(!email.html.includes("<Co>"));
assert.ok(email.html.includes("Pump &quot;X&quot; replacement"));
assert.ok(email.html.includes("Q-100"));
assert.ok(email.html.includes("https://app.example/dashboard/sales-orders/so1"));
assert.ok(email.html.includes("https://app.example/dashboard/purchase-requests"));
// No quotation: the "from quotation" phrase is omitted.
const direct = purchaseRequestNoticeEmail({
  salesOrderNo: "AIC-SO-2026-0002", customer: "C", quotationNo: "", technicianName: "Juan Tech",
  items: [], orderUrl: "u", purchaseRequestUrl: "p",
});
assert.ok(!direct.html.includes("from quotation"));

console.log("recommended-by tests passed.");
