import assert from "node:assert/strict";
import { addedTypedLineIndices, mergePickedIntoLines } from "../../src/lib/purchaseRequests/domain.ts";

type L = { productId: string; quantity: number; prLinks?: { prItemId: string; quantity: number }[]; tag?: string };
const make = (p: { productId: string; quantity: number; prLinks: { prItemId: string; quantity: number }[] }): L => ({ ...p, tag: "new" });

// new product → new line
assert.deepEqual(mergePickedIntoLines<L>([], [{ productId: "P1", quantity: 5, prLinks: [{ prItemId: "A", quantity: 5 }] }], make),
  [{ productId: "P1", quantity: 5, prLinks: [{ prItemId: "A", quantity: 5 }], tag: "new" }]);

// same product as an existing manual line → adds qty and links, keeps the line
assert.deepEqual(mergePickedIntoLines<L>([{ productId: "P1", quantity: 2, tag: "old" }], [{ productId: "P1", quantity: 3, prLinks: [{ prItemId: "A", quantity: 3 }] }], make),
  [{ productId: "P1", quantity: 5, prLinks: [{ prItemId: "A", quantity: 3 }], tag: "old" }]);

// same PR line picked again → its link quantity accumulates instead of duplicating
assert.deepEqual(mergePickedIntoLines<L>([{ productId: "P1", quantity: 3, prLinks: [{ prItemId: "A", quantity: 3 }] }], [{ productId: "P1", quantity: 1, prLinks: [{ prItemId: "A", quantity: 1 }, { prItemId: "B", quantity: 0.5 }] }], make),
  [{ productId: "P1", quantity: 4, prLinks: [{ prItemId: "A", quantity: 4 }, { prItemId: "B", quantity: 0.5 }] }]);

// blank lines (no product) are never merged into
assert.equal(mergePickedIntoLines<L>([{ productId: "", quantity: 1 }], [{ productId: "P2", quantity: 1, prLinks: [{ prItemId: "C", quantity: 1 }] }], make).length, 2);

// typed picks (no product) never merge with each other or with product lines
{
  const typedA = { productId: "", quantity: 2, prLinks: [{ prItemId: "T1", quantity: 2 }] };
  const typedB = { productId: "", quantity: 3, prLinks: [{ prItemId: "T2", quantity: 3 }] };
  assert.equal(mergePickedIntoLines<L>([], [typedA, typedB], make).length, 2);
  assert.equal(mergePickedIntoLines<L>([{ productId: "P1", quantity: 1 }], [typedA], make).length, 2);
}

// newly appended typed lines are reported so the PO form shows their description input
{
  const prev: L[] = [{ productId: "P1", quantity: 1 }, { productId: "", quantity: 2, tag: "manual" }];
  const merged = mergePickedIntoLines<L>(prev, [
    { productId: "P1", quantity: 3, prLinks: [{ prItemId: "A", quantity: 3 }] },
    { productId: "", quantity: 2, prLinks: [{ prItemId: "T1", quantity: 2 }] },
    { productId: "P2", quantity: 1, prLinks: [{ prItemId: "B", quantity: 1 }] },
    { productId: "", quantity: 4, prLinks: [{ prItemId: "T2", quantity: 4 }] },
  ], make);
  assert.deepEqual(addedTypedLineIndices(prev.length, merged), [2, 4]);
}
