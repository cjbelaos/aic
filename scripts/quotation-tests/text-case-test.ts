// Focused tests for the Quotations text rule: every free-text field is stored,
// displayed and printed in UPPERCASE, whether the value was typed or pasted.

import assert from "node:assert/strict";
import { upperText, upperTextList } from "../../src/lib/quotationText.ts";

// Typed lowercase text becomes uppercase.
assert.equal(upperText("portable ro parts"), "PORTABLE RO PARTS");
// Pasted mixed-case text (a paste fires the same change path) becomes uppercase.
assert.equal(upperText("Mixed Case Copied text"), "MIXED CASE COPIED TEXT");
assert.equal(upperText("Repair diag & 3x Filter (20\")"), "REPAIR DIAG & 3X FILTER (20\")");
// Already-uppercase values are unchanged (idempotent, so re-saving is stable).
assert.equal(upperText("PORTABLE RO PARTS"), "PORTABLE RO PARTS");
assert.equal(upperText(upperText("already upper")), "ALREADY UPPER");
// Surrounding and inner whitespace is preserved; only the case changes.
assert.equal(upperText("  spaced  pasted  "), "  SPACED  PASTED  ");
assert.equal(upperText("line one\nline two"), "LINE ONE\nLINE TWO");
// Empty/absent values stay safe.
assert.equal(upperText(""), "");
assert.equal(upperText(undefined), "");
assert.equal(upperText(null), "");
// Non-text primitives are coerced, never crash.
assert.equal(upperText(123), "123");
// Notation lists keep their order and length.
assert.deepEqual(upperTextList(["first note", "Second Note"]), ["FIRST NOTE", "SECOND NOTE"]);
assert.deepEqual(upperTextList([]), []);
assert.deepEqual(upperTextList(["", "x"]), ["", "X"]);

console.log("Quotation text case tests passed.");
