// node --test scripts/migration/convert.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { convert, FAIL, buildImport, loadOrder } from "./convert.mjs";

test("text keeps leading zeros and blanks become null", () => {
  assert.equal(convert("t", "00123", "00123"), "00123");
  assert.equal(convert("t", "", ""), null);
  assert.equal(convert("t", "  ", undefined), null);
});

test("integers and exact numerics", () => {
  assert.equal(convert("i", "1,234", 1234), 1234);
  assert.equal(convert("i", "7", "7"), 7);
  assert.equal(convert("i", "1.5", 1.5), FAIL);
  assert.equal(convert("i", "-1764230400", -1764230400), -1764230400); // DR draft placeholder
  assert.equal(convert("n", "₱1,234.50", 1234.5), "1234.5");
  assert.equal(convert("n", "0.1", 0.1), "0.1");
  assert.equal(convert("n", "1,234.50", "1,234.50"), "1234.50");
  assert.equal(convert("n", "N/A", "N/A"), FAIL);
  assert.equal(convert("n", "NULL", "NULL"), null);
  assert.equal(convert("t", "NULL", "NULL"), "NULL");
});

test("booleans and json", () => {
  assert.equal(convert("b", "TRUE", true), true);
  assert.equal(convert("b", "FALSE", "FALSE"), false);
  assert.equal(convert("b", "yes", "yes"), FAIL);
  assert.deepEqual(convert("j", '{"a":1}', '{"a":1}'), { a: 1 });
  assert.equal(convert("j", "{bad", "{bad"), FAIL);
});

test("dates and timestamps", () => {
  assert.equal(convert("d", "2026-11-27", 46353), "2026-11-27");
  assert.equal(convert("d", "2026-11-27", "2026-11-27"), "2026-11-27");
  assert.equal(convert("d", "2026-02-30", "2026-02-30"), FAIL);
  assert.equal(convert("d", "11/27/2026", "11/27/2026"), FAIL);
  // 46353.5 = 2026-11-27 12:00 wall clock
  assert.equal(convert("ts", "2026-11-27 12:00:00", 46353.5), "2026-11-27T12:00:00.000Z");
  assert.equal(convert("tm", "2026-11-27 12:00:00", 46353.5), "2026-11-27T04:00:00.000Z");
  assert.equal(convert("tm", "2026-11-27 12:00:00", "2026-11-27 12:00:00"), "2026-11-27T04:00:00.000Z");
  assert.equal(convert("ts", "2026-11-27T01:02:03.456Z", "2026-11-27T01:02:03.456Z"), "2026-11-27T01:02:03.456Z");
  assert.equal(convert("ts", "yesterday", "yesterday"), FAIL);
});

test("load order puts parents first", () => {
  const order = loadOrder();
  const at = (t) => order.indexOf(t);
  assert.ok(at("users") < at("fti_requests"));
  assert.ok(at("fti_requests") < at("fti_details"));
  assert.ok(at("fti_details") < at("fti_legs"));
  assert.ok(at("delivery_receipts") < at("service_invoices"));
  assert.ok(at("sales_order_items") < at("delivery_receipt_items"));
});

test("buildImport rejects duplicate keys and nulls orphans without leaking secrets", async () => {
  const { TABLES } = await import("./schema-map.mjs");
  const tabs = Object.fromEntries(TABLES.map((t) => [t.tab, { formatted: [[]], raw: [[]] }]));
  const users = [["UserId", "Username", "Password_Hash", "UserRoleId"], ["u1", "a", "h1", "1"], ["u1", "b", "h2", "1"], ["u2", "c", "h3", "9"]];
  tabs.Users = { formatted: users, raw: users };
  const roles = [["UserRoleId", "Description"], ["1", "Admin"]];
  tabs.UserRoles = { formatted: roles, raw: roles };
  const { tables, report } = buildImport({ tabs });
  assert.equal(tables.get("users").rows.length, 2);
  assert.equal(report.rejected.users[0].source_row, 3);
  assert.equal(report.orphans["users.user_role_id"], 1);
  const u2 = tables.get("users").rows.find((r) => r.user_id === "u2");
  assert.equal(u2.user_role_id, null);
  assert.deepEqual(u2.import_raw, { UserRoleId: "9" });
  assert.ok(!JSON.stringify(report).includes("h1"));
});

test("buildImport excludes stale draft-placeholder DR items but keeps live drafts' items", async () => {
  const { TABLES } = await import("./schema-map.mjs");
  const tabs = Object.fromEntries(TABLES.map((t) => [t.tab, { formatted: [[]], raw: [[]] }]));
  const drs = [["DRNumber", "Status"], ["4090", "printed"], ["-1795000000", "draft"]];
  tabs.DeliveryReceipts = { formatted: drs, raw: drs };
  const items = [["DeliveryReceiptId", "ItemNo"], ["4090", "1"], ["-1795356477", "1"], ["-1795000000", "1"]];
  tabs.DeliveryReceiptItems = { formatted: items, raw: items };
  const { tables, report } = buildImport({ tabs });
  assert.deepEqual(tables.get("delivery_receipt_items").rows.map((r) => r.dr_number), [4090, -1795000000]);
  assert.deepEqual(report.excluded.delivery_receipt_items.map((x) => x.source_row), [3]);
  assert.equal(report.orphans["delivery_receipt_items.dr_number"], undefined);
  assert.equal(report.tables.delivery_receipt_items.loaded, 2);
});

test("buildImport keeps a reused contact ID under a traceable new key", async () => {
  const { TABLES } = await import("./schema-map.mjs");
  const tabs = Object.fromEntries(TABLES.map((t) => [t.tab, { formatted: [[]], raw: [[]] }]));
  const contacts = [["ContactId", "FullName"], ["cont_25", "A"], ["cont_25", "B"]];
  tabs.CompanyContacts = { formatted: contacts, raw: contacts };
  const { tables, report } = buildImport({ tabs });
  assert.deepEqual(tables.get("company_contacts").rows.map((r) => r.contact_id), ["cont_25", "cont_25~r3"]);
  assert.deepEqual(tables.get("company_contacts").rows[1].import_raw, { contact_id: "cont_25" });
  assert.equal(report.rejected.company_contacts, undefined);
  assert.equal(report.rekeyed.company_contacts[0].source_row, 3);
});
