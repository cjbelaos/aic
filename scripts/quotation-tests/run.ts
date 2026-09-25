// Quotation focused test runner. Run with:
//   npx tsc -p scripts/quotation-tests/tsconfig.json && node tmp/quotation-tests/out/scripts/quotation-tests/run.js
// (or `npm run test:quotations`).

import "./pricing-test.ts";
import "./row-mapping-test.ts";
import "./text-case-test.ts";

console.log("All quotation focused tests passed.");
