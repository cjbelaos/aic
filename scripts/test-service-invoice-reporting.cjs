/* eslint-disable @typescript-eslint/no-require-imports -- Isolated TypeScript test harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks = {}) {
  const fixture = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', output)(id => Object.hasOwn(mocks, id) ? mocks[id] : require(id), fixture, fixture.exports);
  return fixture.exports;
}
async function main() {
  const tracking = load('src/lib/serviceInvoiceTracking.ts');
  const summary = load('src/lib/serviceInvoiceSummary.ts', { './serviceInvoiceTracking': tracking });
  const { matchesInvoiceFilters } = load('src/lib/serviceInvoiceFilters.ts', { './serviceInvoiceSummary': summary, './serviceInvoiceTracking': tracking });
  const defaults = { customers: [], categories: [], dateFrom: '', dateTo: '', month: '' };
  const invoice = { invoiceNo: 'SI-1', date: '2026-09-30', createdAt: '2026-10-01T16:00:00Z', customerId: 'c1', companyName: 'Acme', status: 'created', items: [{description:'Repair pump',quantity:2,unitPrice:150.25}] };
  assert(matchesInvoiceFilters(invoice, {...defaults,createdFrom:'2026-10-02',createdTo:'2026-10-02',dateFrom:'2026-09-30',dateTo:'2026-09-30'}));
  assert(!matchesInvoiceFilters({...invoice,createdAt:'2026-10-01T15:59:59Z'}, {...defaults,createdFrom:'2026-10-02'}));
  assert(!matchesInvoiceFilters(invoice, {...defaults,createdTo:'2026-10-01'}));
  assert(!matchesInvoiceFilters(invoice, {...defaults,createdFrom:'2026-10-02',dateFrom:'2026-10-01'}));
  assert(!matchesInvoiceFilters(invoice, {...defaults,createdFrom:'2026-10-03',createdTo:'2026-10-01'}));
  assert(matchesInvoiceFilters({...invoice,createdAt:''},defaults));
  assert(!matchesInvoiceFilters({...invoice,createdAt:''},{...defaults,createdFrom:'2026-10-01'}));
  assert(matchesInvoiceFilters(invoice,{...defaults,search:'ACME',statuses:['created'],customers:['c1']}));
  assert(matchesInvoiceFilters(invoice,{...defaults,search:'pump'}));
  assert(!matchesInvoiceFilters(invoice,{...defaults,statuses:['paid']}));
  assert(!matchesInvoiceFilters({...invoice,status:'deleted'},defaults));
  const rows = Array.from({length:25}, (_, index) => ({...invoice,invoiceNo:`SI-${index}`,createdAt:index===0?'':invoice.createdAt,status:index<20?'created':'draft'}));
  const report = summary.buildServiceInvoiceSummaryReport(rows,'all');
  assert.equal(report.overall.count,25);
  assert.equal(report.overall.amount,7512.5);
  assert.equal(report.totals.active.count,20);
  assert.equal(report.totals.draft.amount,1502.5);
  assert.equal(report.customers[0].total.count,25);
  assert.equal(summary.buildServiceInvoiceSummaryReport(rows,'today',undefined,undefined,new Date('2026-10-02T00:00:00Z')).overall.count,24);
  assert.deepEqual(summary.reportRange('week',undefined,undefined,new Date('2026-10-04T00:00:00Z')), {startDate:'2026-09-28',endDate:'2026-10-04'});
  let session = null;
  const redirect = path => {throw new Error(`redirect:${path}`);};
  const auth = {getSession:async()=>session,isAdminUser:user=>user.admin};
  const Page = load('src/app/dashboard/service-invoices/page.tsx',{'next/navigation':{redirect},'@/lib/auth/session':auth,'./service-invoices-client':{default:'InvoiceClient'}}).default;
  await assert.rejects(Page(),/redirect:\//);
  session = {admin:false}; assert.equal((await Page()).props.isAdmin,false);
  session = {admin:true}; assert.equal((await Page()).props.isAdmin,true);
  const Legacy = load('src/app/dashboard/service-invoice-summary/page.tsx',{'next/navigation':{redirect},'@/lib/auth/session':auth}).default;
  await assert.rejects(Legacy(),/redirect:\/dashboard\/service-invoices\?tab=summary/);
  session = {admin:false}; await assert.rejects(Legacy(),/redirect:\/dashboard$/);
  // Exercise the real Excel exporter and inspect the resulting workbook across pagination boundaries.
  const ExcelJS = require('exceljs');
  let workbook;
  class CapturedWorkbook { constructor() {workbook = new ExcelJS.Workbook(); return workbook;} }
  let downloaded;
  let pdf;
  const { jsPDF } = require('jspdf');
  class CapturedPdf {
    constructor(options) { pdf = new jsPDF(options); pdf.save = filename => { downloaded = filename; return pdf; }; return pdf; }
  }
  const originalDocument = global.document;
  global.document = {createElement:()=>({click(){downloaded=this.download;}})};
  const reporting = load('src/components/service-invoice-reporting.tsx',{
    '@/lib/serviceInvoiceTracking': tracking,
    react:{useState:()=>[false,()=>{}]},
    '@/components/ui/button':{Button:'button'},
    '@/components/ui/card':{Card:'div',CardHeader:'div',CardContent:'div',CardTitle:'h3'},
    '@/components/ui/table':Object.fromEntries(['Table','TableBody','TableCell','TableHead','TableHeader','TableRow'].map(key=>[key,'div'])),
    sonner:{toast:{error:message=>{throw new Error(message);}}},
    exceljs:{...ExcelJS,Workbook:CapturedWorkbook},
    jspdf:{jsPDF:CapturedPdf},
  }).default;
  const tree = reporting({report,filters:['Creation date: Any','Invoice date: Any','Search: None'],loading:false,showSummary:false});
  const button = tree.props.children[0].props.children[0];
  button.props.onClick();
  for(let i=0;i<100 && !downloaded;i++) await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(downloaded,'service-invoices-filtered.xlsx');
  assert.equal(workbook.getWorksheet('Invoices').rowCount,26);
  assert.equal(workbook.getWorksheet('Summary').getRow(7).getCell(2).value,25);
  assert.equal(workbook.getWorksheet('Filters').rowCount,3);
  const reloaded = new ExcelJS.Workbook(); await reloaded.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.equal(reloaded.getWorksheet('Invoices').getRow(26).getCell(7).value,300.5);
  downloaded = undefined;
  tree.props.children[0].props.children[1].props.onClick();
  for(let i=0;i<100 && !downloaded;i++) await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(downloaded,'service-invoices-filtered.pdf');
  assert(pdf.getNumberOfPages() >= 2);
  const pdfText = pdf.output();
  assert(pdfText.includes('Creation date: Any'));
  assert(pdfText.includes('SI-24'));
  assert(pdfText.includes('7,512.50'));
  global.document = originalDocument;
  console.log('PASS shared date/status/search filters, PH midnight, missing timestamps, totals across 25 rows, admin gates, redirect and real Excel/PDF exports');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
