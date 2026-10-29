/* eslint-disable @typescript-eslint/no-require-imports -- Isolated shared input behavior checks. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(id => id in mocks ? mocks[id] : require(id), mod, mod.exports);
  return mod.exports;
}
async function main() {
  const selection = load('src/lib/input-caret.ts');
  const mocks = { '@/lib/input-caret': selection, '@/lib/utils': { cn: (...args) => args.filter(Boolean).join(' ') } };
  const controls = [load('src/components/ui/input.tsx', mocks).Input, load('src/components/ui/textarea.tsx', mocks).Textarea];
  for (const Component of controls) {
    let value = 'BOY TOY MAKE';
    const input = { value, selectionStart: 3, selectionEnd: 3, selectionDirection: 'none',
      ownerDocument: {}, setSelectionRange(start, end, direction) {
        this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction;
      } };
    input.ownerDocument.activeElement = input;
    let calls = 0;
    const props = Component({ value, onChange: event => {
      calls++;
      value = event.target.value.toUpperCase();
      // Simulate React committing the transformed controlled value; native assignment moves the caret.
      if (input.value !== value) { input.value = value; input.selectionStart = input.selectionEnd = value.length; }
    } }).props;
    for (const character of ' and girl') {
      const caret = input.selectionStart;
      input.value = input.value.slice(0, caret) + character + input.value.slice(input.selectionEnd);
      input.selectionStart = input.selectionEnd = caret + 1;
      props.onChange({ target: input, currentTarget: input, nativeEvent: {} });
      await Promise.resolve();
      assert.equal(input.selectionStart, caret + 1, `${Component.name}: keep insertion after BOY`);
    }
    assert.equal(value, 'BOY AND GIRL TOY MAKE');
    assert.equal(calls, 9, 'Invoke the original handler exactly once per change');

    input.value = 'BOY and GIRL TOY MAKE'; input.selectionStart = 4; input.selectionEnd = 7; input.selectionDirection = 'backward';
    props.onChange({ target: input, currentTarget: input, nativeEvent: {} });
    await Promise.resolve();
    assert.deepEqual([input.selectionStart, input.selectionEnd, input.selectionDirection], [4, 7, 'backward']);

    input.value = 'straße ende'; input.selectionStart = input.selectionEnd = 6;
    props.onChange({ target: input, currentTarget: input, nativeEvent: {} });
    await Promise.resolve();
    assert.equal(input.value, 'STRASSE ENDE');
    assert.equal(input.selectionStart, 7, 'Map expanded uppercase characters before the caret');

    input.value = 'boy toy'; input.selectionStart = input.selectionEnd = 3;
    props.onChange({ target: input, currentTarget: input, nativeEvent: {} });
    input.ownerDocument.activeElement = {};
    await Promise.resolve();
    assert.equal(input.selectionStart, 7, 'Do not change selection after focus leaves');
    input.ownerDocument.activeElement = input;

    const unchanged = Component({ onChange: () => {} }).props;
    input.value = 'Case sensitive'; input.selectionStart = input.selectionEnd = 4;
    unchanged.onChange({ target: input, currentTarget: input, nativeEvent: {} });
    await Promise.resolve();
    assert.equal(input.value, 'Case sensitive', 'Never normalize fields implicitly');
    assert.equal(input.selectionStart, 4);

    const lower = Component({ onChange: event => {
      input.value = event.target.value.toLowerCase(); input.selectionStart = input.selectionEnd = input.value.length;
    } }).props;
    input.value = 'BOY TOY'; input.selectionStart = input.selectionEnd = 3;
    lower.onChange({ target: input, currentTarget: input, nativeEvent: {} });
    await Promise.resolve();
    assert.equal(input.value, 'boy toy'); assert.equal(input.selectionStart, 3);

    input.value = 'boy toy'; input.selectionStart = input.selectionEnd = 3;
    props.onChange({ target: input, currentTarget: input, nativeEvent: { isComposing: true } });
    await Promise.resolve();
    assert.equal(input.selectionStart, 7, 'Do not force selection while a mobile/IME composition is active');

    const differentFormat = Component({ onChange: () => { input.value = 'different content'; input.selectionStart = input.selectionEnd = 17; } }).props;
    input.value = 'original'; input.selectionStart = input.selectionEnd = 3;
    differentFormat.onChange({ target: input, currentTarget: input, nativeEvent: {} });
    await Promise.resolve();
    assert.equal(input.selectionStart, 17, 'Do not guess selection for unrelated formatting');

    const numeric = { value: '123', selectionStart: null, selectionEnd: null, selectionDirection: null };
    unchanged.onChange({ target: numeric, currentTarget: numeric, nativeEvent: {} });
    await Promise.resolve();
    assert.equal(numeric.value, '123');
    assert.equal(Component({ type: 'file' }).props.onChange, undefined);
  }
  console.log('Shared Input/Textarea caret, selection, Unicode, focus and unchanged-field checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
