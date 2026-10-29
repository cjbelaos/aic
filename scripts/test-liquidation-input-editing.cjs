/* eslint-disable @typescript-eslint/no-require-imports -- Render the real field without loading browser services. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const stub = new Proxy({}, { get: (_, name) => name });
const compiled = ts.transpileModule(
  fs.readFileSync('src/components/liquidation-form.tsx', 'utf8') + '\nexport { FieldWithGuide };',
  { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const fixture = { exports: {} };
new Function('require', 'module', 'exports', compiled)(
  id => id === 'react' || id === 'react/jsx-runtime' ? require(id) : stub,
  fixture, fixture.exports,
);
function findInput(node) {
  if (!node || typeof node !== 'object') return undefined;
  if (node.type === 'Input') return node;
  const children = node.props?.children;
  return (Array.isArray(children) ? children : [children]).flat(Infinity).map(findInput).find(Boolean);
}

let text = 'BOY TOY MAKE';
let caret = 3;
const field = findInput(fixture.exports.FieldWithGuide({
  label: 'Supplier Name', value: text, uppercase: true, onChange: next => {
    // A controlled input preserves selection only if React receives its current DOM value.
    if (input.value !== next) { input.value = next; caret = next.length; }
    text = next;
  },
}));
assert.ok(field.props.className.includes('uppercase'), 'Display remains uppercase');
const input = { value: text };
for (const key of ' and girl') {
  input.value = text.slice(0, caret) + key + text.slice(caret);
  const expectedCaret = ++caret;
  field.props.onChange({ target: input, currentTarget: input });
  assert.equal(caret, expectedCaret, 'Insertion must not jump to the end');
}
assert.equal(text.toUpperCase(), 'BOY AND GIRL TOY MAKE');
input.value = 'BOY and GIRL TOY MAKE';
caret = 12;
field.props.onChange({ target: input, currentTarget: input });
assert.equal(text, 'BOY and GIRL TOY MAKE', 'Keep pasted/mobile-keyboard text unchanged while editing');
assert.equal(caret, 12, 'Lowercase text must not reset selection');
console.log('Liquidation input middle-insertion and paste regression checks passed.');
