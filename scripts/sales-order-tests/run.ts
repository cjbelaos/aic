// Phase 1/2 focused test runner. Run with:
//   node scripts/sales-order-tests/run.ts
// (Node 24 natively executes .ts; add --disable-warning=MODULE_TYPELESS_PACKAGE_JSON to silence the ESM detection notice).

import "./money-test.ts";
import "./domain-test.ts";
import "./sync-test.ts";
import "./protocol-test.ts";
import "./validation-test.ts";
import "./concurrency-test.ts";
import "./gateway-http-test.ts";

console.log("All sales-order focused tests passed.");