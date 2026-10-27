/* Read-only by default. --apply explicitly migrates the authorized SI 1773 and HEMOTEK mappings. */
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('src/lib/googleSheets.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(require, mod, mod.exports);
async function main() {
  const sheets = await mod.exports.getSheetsClient();
  const spreadsheetId = await mod.exports.getDatabaseSpreadsheetId();
  const ranges = ['Companies!A1:I2000', 'ServiceInvoices!A1:U5000', 'ServiceInvoiceItems!A1:G20000'];
  const result = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });
  const [companies, invoices, items] = result.data.valueRanges.map(r => r.values || []);
  const branches = companies.map((r,i) => ({ row:i+1, id:r[0], name:r[2], address:r[4], billing:r[8] })).filter(r => /HEMOTEK/i.test(r.name || ''));
  const found = invoices.map((r,i)=>({row:i+1,values:r})).filter(r=>String(r.values[0])==='1773');
  const lines = items.map((r,i)=>({row:i+1,values:r})).filter(r=>String(r.values[0])==='1773');
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ companyHeaders: companies[0], branches, invoice:found, items:lines }, null, 2)); return; }
  const expectedIds = ['COMP-115','COMP-116','COMP-117','COMP-118','COMP-322','COMP-323','COMP-327','COMP-330','COMP-332','COMP-334','COMP-335','COMP-336','COMP-339'];
  if (found.length !== 1 || lines.length !== 2) throw new Error('SI 1773 changed; inspect again.');
  const invoice = found[0];
  const meta = JSON.parse(invoice.values[19] || '{}');
  if (meta.packageBillingMigration === 'hemotek-si1773-v1') { console.log('SI 1773 migration already applied.'); return; }
  if (invoice.values[2] !== 'COMP-336' || invoice.values[11] !== '3941' || invoice.values[8] !== 'created') throw new Error('SI 1773 identity/status changed.');
  if (Number(lines[0].values[2]) !== 1 || Number(lines[0].values[3]) !== 35000 || Number(lines[0].values[4]) !== 35000 || Number(lines[1].values[2]) !== 1 || Number(lines[1].values[3]) !== 0 || Number(lines[1].values[4]) !== 0) throw new Error('Package prices or quantities changed.');
  if (meta.discountData?.discountAmount !== 0 || meta.discountData?.itemDiscounts?.length !== 2) throw new Error('Discount snapshot changed.');
  if (companies[0][8] && companies[0][8] !== 'BillingCompanyId') throw new Error('Companies column I is already occupied.');
  const payer = branches.find(c => c.id === 'COMP-114');
  if (!payer || payer.address !== 'PACO, MANILA') throw new Error('Paco payer could not be verified.');
  const mappings = expectedIds.map(id => {
    const matches = branches.filter(c => c.id === id);
    if (matches.length !== 1 || (matches[0].billing && matches[0].billing !== 'COMP-114')) throw new Error(`Conflicting mapping for ${id}`);
    return matches[0];
  });
  const snapshot = JSON.stringify(result.data.valueRanges);
  const fresh = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });
  if (JSON.stringify(fresh.data.valueRanges) !== snapshot) throw new Error('Sheet changed during inspection; rerun.');
  const changedAt = new Date().toISOString();
  const nextMeta = { ...meta, serviceContext: { version: 1, serviceCompanyId: 'COMP-336', serviceCompanyName: mappings.find(c => c.id === 'COMP-336').name }, discountData: { ...meta.discountData, itemDiscounts: meta.discountData.itemDiscounts.map((line,i) => i === 1 ? { ...line, includedInPackage: true } : line) }, packageBillingMigration: 'hemotek-si1773-v1', packageBillingMigrationAt: changedAt };
  const data = [
    { range: 'Companies!I1', values: [['BillingCompanyId']] },
    ...mappings.map(c => ({ range: `Companies!I${c.row}`, values: [['COMP-114']] })),
    { range: `ServiceInvoices!C${invoice.row}`, values: [['COMP-114']] },
    { range: `ServiceInvoices!T${invoice.row}`, values: [[JSON.stringify(nextMeta)]] },
  ];
  const backup = data.map(change => ({ range: change.range, values: change.range === 'Companies!I1' ? [[companies[0][8] || '']] : change.range.startsWith('Companies!') ? [[companies[Number(change.range.split('!I')[1])-1][8] || '']] : change.range.includes('!C') ? [[invoice.values[2]]] : [[invoice.values[19]]] }));
  fs.mkdirSync('tmp/invoice-migration', { recursive: true });
  const backupPath = `tmp/invoice-migration/si1773-${Date.now()}.json`;
  fs.writeFileSync(backupPath, JSON.stringify({ changedAt, spreadsheetId, backup, applied: data }, null, 2));
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data } });
  const verified = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: data.map(d => d.range) });
  verified.data.valueRanges.forEach((range,i) => { if (JSON.stringify(range.values) !== JSON.stringify(data[i].values)) throw new Error(`Verification failed: ${data[i].range}`); });
  const afterItems = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: lines.map(l => `ServiceInvoiceItems!A${l.row}:G${l.row}`) });
  afterItems.data.valueRanges.forEach((range,i) => { if (JSON.stringify(range.values?.[0]) !== JSON.stringify(lines[i].values)) throw new Error('Invoice item values unexpectedly changed.'); });
  console.log(JSON.stringify({ applied: true, invoiceNo: '1773', billingCompanyId: 'COMP-114', total: 35000, includedLine: 2, mappedBranches: mappings.length, backupPath }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
