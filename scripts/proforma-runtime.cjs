/* eslint-disable @typescript-eslint/no-require-imports */
// Small runtime for maintenance scripts; uses the installed TypeScript compiler.
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
function createLoader(mocks = {}) {
  const cache = new Map();
  function load(filename) {
    let file = path.resolve(filename);
    if (!fs.existsSync(file)) file += fs.existsSync(file + ".ts") ? ".ts" : ".tsx";
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} }; cache.set(file, loadedModule);
    const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const localRequire = id => Object.hasOwn(mocks, id) ? mocks[id] : id.startsWith("@/") ? load(path.join("src", id.slice(2))) : id.startsWith(".") ? load(path.resolve(path.dirname(file), id)) : require(id);
    new Function("require", "module", "exports", js)(localRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return load;
}
module.exports = { createLoader };
