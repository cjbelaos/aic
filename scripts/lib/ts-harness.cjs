/* eslint-disable @typescript-eslint/no-require-imports -- Test harness: loads app TypeScript modules in Node. */
// Loads src/ TypeScript modules for script tests: transpiles on the fly, resolves "@/…" and relative
// imports, and substitutes mocks by import id. Each harness has its own module cache.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function createHarness(mocks = {}) {
  const cache = new Map();
  const resolveTs = (base) => [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
  function load(file) {
    const full = path.resolve(file);
    if (cache.has(full)) return cache.get(full).exports;
    const mod = { exports: {} };
    cache.set(full, mod);
    const output = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const req = (id) => Object.hasOwn(mocks, id) ? mocks[id]
      : id.startsWith('@/') ? load(resolveTs(path.join('src', id.slice(2))))
      : id.startsWith('.') ? load(resolveTs(path.join(path.dirname(full), id))) : require(id);
    new Function('require', 'module', 'exports', output)(req, mod, mod.exports);
    return mod.exports;
  }
  return { load };
}

/** Points the app at the staging database as aic_web with DATA_BACKEND=postgres; returns false when unavailable. */
function usePostgresStaging() {
  const url = process.env.TEST_DATABASE_URL || process.env.STAGING_APP_DATABASE_URL;
  if (!url) return false;
  process.env.DATABASE_URL = url;
  process.env.DATA_BACKEND = 'postgres';
  delete process.env.ACCESS_ALLOWED_USER_IDS;
  return true;
}

async function closePool() {
  if (globalThis.__aicPgPool) { await globalThis.__aicPgPool.end(); globalThis.__aicPgPool = undefined; }
}

/** Tiny runner: named async tests, prints ok/FAIL, sets the exit code. */
async function run(name, tests) {
  let failed = 0;
  for (const [label, fn] of tests) {
    try { await fn(); console.log(`ok   ${label}`); }
    catch (error) { failed++; console.log(`FAIL ${label}\n     ${error && error.message}`); }
  }
  console.log(failed ? `${name}: ${failed} failed` : `${name}: all ${tests.length} passed`);
  if (failed) process.exitCode = 1;
}

module.exports = { createHarness, usePostgresStaging, closePool, run };
