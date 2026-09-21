// Service Report focused test runner. Run with:
//   node tmp/service-reports-tests/out/scripts/service-reports-tests/run.js

import "./domain-test.ts";
import "./auth-test.ts";
import "./validation-test.ts";
import "./service-test.ts";
import "./acknowledge-test.ts";
import "./concurrency-test.ts";
import "./api-auth-test.ts";
import "./water-treatment-test.ts";
import "./report-mapper-test.ts";

console.log("All service-report focused tests passed.");