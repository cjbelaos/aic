/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS harness installs a TypeScript require hook. */
// Regression checks against the actual shared React components, without a browser dependency.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...rest) {
  if (request.startsWith('@/')) request = path.resolve(__dirname, '../src', request.slice(2));
  return originalResolve.call(this, request, parent, ...rest);
};
for (const extension of ['.tsx', '.ts']) {
  require.extensions[extension] = (module, filename) => {
    const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
      fileName: filename,
    });
    module._compile(result.outputText, filename);
  };
}
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup } = require('../src/components/ui/select.tsx');
const { SearchableSelect } = require('../src/components/ui/searchable-select.tsx');
const { DatePickerInput, DatePicker, MonthPickerInput, parseDateValue } = require('../src/components/ui/date-picker.tsx');
const { findSelectChildren, optionText } = require('../src/components/ui/select-options.tsx');
const h = React.createElement;
const options = n => Array.from({ length: n }, (_, i) => ({ value: String(i), label: `Choice ${i}` }));
const select = (n, extra = {}) => h(Select, { value: '0', ...extra },
  h(SelectTrigger, { id: 'choices', 'aria-label': 'Choices' }, h(SelectValue, { placeholder: 'Choose' })),
  h(SelectContent, null, h(SelectGroup, null, options(n).map(o => h(SelectItem, { key: o.value, value: o.value }, o.label)))));
for (const n of [0, 1, 5, 6, 10]) {
  for (const element of [select(n), h(SearchableSelect, { options: options(n), value: '0', onValueChange: () => {} })]) {
    const html = renderToStaticMarkup(element);
    assert.equal(html.includes('data-slot="select-trigger"'), n <= 5, `Incorrect dropdown for ${n} choices`);
  }
}
const large = renderToStaticMarkup(select(6, { disabled: true }));
assert.match(large, /id="choices"/);
assert.match(large, /aria-label="Choices"/);
assert.match(large, /disabled=""/);
assert.match(large, /Choice 0/);
assert.equal(findSelectChildren(select(6).props.children, SelectItem).length, 6);
assert.equal(optionText(h('span', null, 'Nested', h('strong', null, 'label'))), 'Nested label');
assert.doesNotThrow(() => renderToStaticMarkup(h(SearchableSelect, { options: [{ value: '', label: 'Automatic match' }], value: '', onValueChange: () => {} })));
assert.equal(parseDateValue('2026-10-05').getDate(), 5);
assert.equal(parseDateValue('2026-10-05').getMonth(), 9);
assert.equal(parseDateValue('2026-02-30'), undefined);
assert.equal(parseDateValue(''), undefined);
const date = renderToStaticMarkup(h(DatePickerInput, { id: 'due-date', value: '2026-10-05', disabled: true, onChange: () => {} }));
assert.match(date, /Oct 5, 2026/);
assert.match(date, /id="due-date"/);
assert.match(date, /disabled=""/);
assert.equal(date.includes('type="date"'), false);
assert.match(renderToStaticMarkup(h(DatePicker, { value: undefined, onChange: () => {} })), /Select date/);
assert.match(renderToStaticMarkup(h(MonthPickerInput, { value: '2026-10', onChange: () => {} })), /Oct 2026/);
const bounded = DatePickerInput({ value: '2026-10-05', min: '2026-10-01', max: '2026-10-31', onChange: value => { boundedValue = value; } });
let boundedValue;
const picker = React.Children.toArray(bounded.props.children).find(child => React.isValidElement(child) && child.type === DatePicker);
assert.equal(picker.props.disabled[0].before.getDate(), 1);
assert.equal(picker.props.disabled[1].after.getDate(), 31);
picker.props.onChange(new Date(2026, 9, 12));
assert.equal(boundedValue, '2026-10-12');
picker.props.onChange(undefined);
assert.equal(boundedValue, '');
console.log('Form controls: threshold, nested choices, accessibility, disabled state, empty values, local dates, cleared dates, and month values passed.');

const { Calendar } = require('../src/components/ui/calendar.tsx');
const calendar = Calendar({ captionLayout: 'dropdown' });
const dropdown = calendar.props.components.Dropdown;
let navigationValue;
const navigation = dropdown({ options: [{ value: 9, label: 'October', disabled: false }, { value: 10, label: 'November', disabled: true }], value: 9, 'aria-label': 'Choose month', onChange: event => { navigationValue = event.target.value; } });
assert.equal(navigation.props.value, '9');
navigation.props.onValueChange('10');
assert.equal(navigationValue, '10');
assert.equal(findSelectChildren(navigation.props.children, SelectItem)[1].props.disabled, true);
const calendarHtml = renderToStaticMarkup(h(Calendar, { captionLayout: 'dropdown', defaultMonth: new Date(2026, 9, 1), startMonth: new Date(2024, 0, 1), endMonth: new Date(2028, 11, 1) }));
// Radix may render an aria-hidden native select for form integration.
for (const nativeSelect of calendarHtml.match(/<select\b[^>]*>/g) ?? []) assert.match(nativeSelect, /aria-hidden="true"/);
assert.match(calendarHtml, /aria-label="Choose the Month"/);
assert.match(calendarHtml, /aria-label="Choose the Year"/);
assert.match(calendarHtml, /data-slot="select-trigger"/);
console.log('Calendar dropdowns: shared Select rendering, month/year labels, navigation values, and disabled choices passed.');
