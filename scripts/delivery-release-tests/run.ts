// Delivery Release focused test runner. Run with:
//   node tmp/delivery-release-tests/out/scripts/delivery-release-tests/run.js

import "./reference-test.ts";
import "./serials-test.ts";
import "./sales-order-lines-test.ts";
import "./sources-test.ts";
import "./print-form-test.ts";
import "./child-rows-test.ts";

console.log("All delivery-release focused tests passed.");
