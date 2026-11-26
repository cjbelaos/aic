// Child-row writes (DR items and every other child tab) — focused tests.
//
// New child rows are added with values.append. Google appends after the "table"
// it detects in the given range, starting at that table's first column. With a
// multi-column range (A2:L), blank rows plus empty J/K columns made Google treat
// column L alone as the table, so DR items 4100 and 4104-4109 landed in L:W and
// read back as empty. Anchoring the range on column A pins the start column.

import assert from "node:assert/strict";
import type { sheets_v4 } from "googleapis";
import { replaceChildRowsInPlace } from "../../src/lib/sheetChildRows.ts";

const appends: { range: string; values: unknown[][] }[] = [];
const fake = {
  spreadsheets: {
    values: {
      batchUpdate: async () => ({ data: {} }),
      append: async (args: { range: string; requestBody: { values: unknown[][] } }) => {
        appends.push({ range: args.range, values: args.requestBody.values });
        return { data: {} };
      },
    },
    get: async () => ({ data: { sheets: [{ properties: { title: "DeliveryReceiptItems", sheetId: 7 } }] } }),
    batchUpdate: async () => ({ data: {} }),
  },
} as unknown as sheets_v4.Sheets;

const row = ["4109", "1", "PROD-000204", "CO-2020-0204", "SEDIMENT FILTER", "1", "PC", "active", "id", "", "", "WH-3:1"];

void (async () => {
await replaceChildRowsInPlace({
  sheets: fake,
  spreadsheetId: "sheet",
  sheetName: "DeliveryReceiptItems",
  columnCount: 12,
  existingRows: [],
  values: [row, row],
});

assert.equal(appends.length, 1);
assert.equal(appends[0].range, "DeliveryReceiptItems!A2:A", "append must be anchored on column A so rows start at column A");
assert.deepEqual(appends[0].values, [row, row], "full-width rows are still sent");

console.log("child-rows tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
