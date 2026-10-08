/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Sheets and authentication fixtures. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
function load(file,mocks={}) {
  const fixture={exports:{}};
  const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  new Function('require','module','exports',output)(id=>Object.hasOwn(mocks,id)?mocks[id]:id.startsWith('@/')?{}:id.startsWith(".") ? load(path.resolve(path.dirname(file), id.endsWith(".ts") ? id : `${id}.ts`), mocks) : require(id),fixture,fixture.exports);
  return fixture.exports;
}
async function main() {
  const tracking=load('src/lib/serviceInvoiceTracking.ts');
  const summary=load('src/lib/serviceInvoiceSummary.ts',{'./serviceInvoiceTracking':tracking});
  const filters=load('src/lib/serviceInvoiceFilters.ts',{'./serviceInvoiceTracking':tracking,'./serviceInvoiceSummary':summary});
  assert.deepEqual(tracking.parseInvoiceMetadata('COMPLETED'),{status:'COMPLETED'});
  assert.equal(tracking.paymentStatusFor('paid',{}),'full');
  assert.equal(tracking.paymentStatusFor('created',{}),'unpaid');
  const empty={customers:[],categories:[],dateFrom:'',dateTo:'',month:''};
  const combo={customerId:'c1',date:'2026-10-02',category:'Parts / Consumables',categorySource:'manual',manualCategories:['Parts','Consumables'],paymentStatus:'partial',scannedStatus:'scanned',status:'created'};
  assert(filters.matchesInvoiceFilters(combo,{...empty,categories:['Parts'],paymentStatuses:['partial'],scannedStatuses:['scanned']}));
  assert(filters.matchesInvoiceFilters(combo,{...empty,categories:['Project','Consumables']}));
  assert(!filters.matchesInvoiceFilters(combo,{...empty,categories:['PMS']}));
  assert(!filters.matchesInvoiceFilters(combo,{...empty,scannedStatuses:['not_scanned']}));
  assert(!filters.matchesInvoiceFilters(combo,{...empty,paymentStatuses:['full']}));
  let row=Array(21).fill(''); row[0]='1001';row[1]='2026-10-02';row[2]='c1';row[3]='Admin';row[8]='created';row[12]='tech';row[13]='Technician';row[20]='TR_NUMBER';
  row[19]=JSON.stringify({manualCategories:['Parts'],status:'COMPLETED',fulfillmentIds:['f1'],custom:'preserve'});
  let writes=[]; let filesRead=0; let fixtureRows;
  const sheets={spreadsheets:{values:{
    get:async({range})=>({data:{values:range.endsWith('A2:A')?(fixtureRows||[row]).map(item=>[item[0]]):range.endsWith('A2:U')?(fixtureRows||[row]):range.endsWith('T2')?[[row[19]]]:range.endsWith('T3')?[['{}']]:range.startsWith('ServiceInvoiceItems')?[]:[row]}}),
    batchUpdate:async(request)=>{writes.push(request);for(const entry of request.requestBody.data){if(entry.range.endsWith('T2'))row[19]=entry.values[0][0];if(entry.range.endsWith('G2:I2'))row[8]=entry.values[0][2];if(entry.range.endsWith('J2'))row[9]=entry.values[0][0];}},
    update:async(request)=>{writes.push(request);if(request.range.endsWith('A2:U2'))row=request.requestBody.values[0];},
  }}};
  const drive={files:{get:async({fileId})=>{filesRead++;if(fileId==='inaccessible')throw new Error('Denied');return {data:{name:fileId==='scan'?'SI-SCANNED_1001_test.pdf':'SI-10-2026-1001_Acme.pdf',trashed:false}};}}};
  const storage=load('src/lib/serviceInvoiceSheets.ts',{
    './serviceInvoiceTracking':tracking,
    '@/lib/googleSheets':{getSheetsClient:async()=>sheets,getDatabaseSpreadsheetId:async()=>'fixture',getDriveUploadClient:async()=>drive},
    '@/lib/serviceInvoiceFilters':filters,
    '@/lib/companySheets':{getCompanies:async()=>[]},
    '@/lib/documentHandoverSheets':{getDocumentHandovers:async()=>[]},
  });
  await storage.updateServiceInvoicePayment('1001','partial','admin');
  let metadata=JSON.parse(row[19]);assert.equal(metadata.paymentStatus,'partial');assert.equal(metadata.custom,'preserve');assert.deepEqual(metadata.fulfillmentIds,['f1']);assert.equal(metadata.paymentHistory[0].changedBy,'admin');assert.equal(metadata.paymentHistory[0].previousStatus,'unpaid');
  const before=writes.length;
  await assert.rejects(storage.cancelAndCreateCorrectedServiceInvoice('1001','admin','Correction'),/Resolve recorded payments/);
  await assert.rejects(storage.updateServiceInvoice('1001',{status:'void',statusReason:'Error'},'admin'),/Resolve recorded payments/);
  await assert.rejects(storage.deleteServiceInvoice('1001'),/Resolve recorded payments/);
  assert.equal(writes.length,before);
  await assert.rejects(storage.updateServiceInvoicePayment('1001','invalid','admin'),/Invalid payment/);
  await storage.updateServiceInvoicePayment('1001','unpaid','admin');
  await assert.rejects(storage.cancelAndCreateCorrectedServiceInvoice('1001','admin','  '),/reason is required/);
  await assert.rejects(storage.updateServiceInvoice('1001',{status:'void'},'admin'),/reason is required/);
  await storage.recordServiceInvoiceScan('1001','https://drive.google.com/file/d/newscan/view','uploader');
  metadata=JSON.parse(row[19]);assert.equal(metadata.scannedBy,'uploader');assert.equal(metadata.paymentStatus,'unpaid');assert.equal(metadata.custom,'preserve');assert.equal(metadata.status,'COMPLETED');
  const result=await storage.updateServiceInvoice('1001',{status:'void',statusReason:' Wrong paper number '},'admin');
  assert.equal(result.status,'void');metadata=JSON.parse(row[19]);assert.equal(metadata.statusReason,'Wrong paper number');assert.equal(metadata.statusHistory[0].changedBy,'admin');assert.equal(metadata.scannedFileLink,'https://drive.google.com/file/d/newscan/view');
  row[8]='draft';await assert.rejects(storage.updateServiceInvoicePayment('1001','full','admin'),/active invoices/);
  row[8]='paid';row[19]='{}';await storage.updateServiceInvoicePayment('1001','partial','admin');assert.equal(row[8],'created');assert.equal(JSON.parse(row[19]).paymentHistory[0].previousStatus,'full');
  row[8]='created'; row[19]=JSON.stringify({paymentStatus:'unpaid',manualCategories:['Parts'],scannedFileLink:'https://drive.google.com/file/d/newscan/view'});
  const draft=row.slice(); draft[0]='DRAFT-2';draft[8]='draft';draft[19]=JSON.stringify({replacesInvoiceNo:'1001'});
  fixtureRows=[row,draft];
  assert.equal(await storage.cancelAndCreateCorrectedServiceInvoice('1001','admin','Correct paper number'),'DRAFT-2');
  metadata=JSON.parse(row[19]);assert.equal(metadata.statusReason,'Correct paper number');assert.equal(metadata.statusHistory[0].status,'cancelled');assert.equal(metadata.scannedFileLink,'https://drive.google.com/file/d/newscan/view');
  const base=row.slice();base[8]='paid';base[19]='';
  const scanned=base.slice();scanned[0]='1002';scanned[9]='https://drive.google.com/file/d/scan/view';
  const generated=base.slice();generated[0]='1003';generated[9]='https://drive.google.com/file/d/generated/view';
  const inaccessible=base.slice();inaccessible[0]='1004';inaccessible[9]='https://drive.google.com/file/d/inaccessible/view';
  fixtureRows=[scanned,generated,inaccessible];
  const list=await storage.getServiceInvoices();
  assert.equal(list.find(item=>item.invoiceNo==='1002').scannedStatus,'scanned');
  assert.equal(list.find(item=>item.invoiceNo==='1003').scannedStatus,'not_scanned');
  assert.equal(list.find(item=>item.invoiceNo==='1004').scanVerificationPending,true);
  assert(list.every(item=>item.status==='created'&&item.paymentStatus==='full'));
  const reads=filesRead;await storage.regenerateStoredServiceInvoicePdfsForDr(1);assert.equal(filesRead,reads);
  let session=new Response(null,{status:401});let paymentCalls=0;
  const route=load('src/app/api/service-invoices/[invoiceNo]/route.ts',{
    '@/lib/auth/session':{requireAuthenticatedSession:async()=>session,isAdminUser:user=>user.admin},
    '@/lib/serviceInvoiceTracking':tracking,
    '@/lib/serviceInvoiceSheets':{updateServiceInvoicePayment:async(no,value,user)=>{tracking.validatePaymentStatus(value);assert.equal(user,'admin');paymentCalls++;}},
  });
  const context={params:Promise.resolve({invoiceNo:'1001'})};
  const request=body=>new Request('http://test',{method:'PATCH',body:JSON.stringify(body)});
  assert.equal((await route.PATCH(request({paymentStatus:'partial'}),context)).status,401);
  session={userId:'staff',admin:false};assert.equal((await route.PATCH(request({paymentStatus:'partial'}),context)).status,403);assert.equal(paymentCalls,0);
  session={userId:'admin',admin:true};assert.equal((await route.PATCH(request({paymentStatus:'partial'}),context)).status,200);assert.equal(paymentCalls,1);
  assert.equal((await route.PATCH(request({paymentStatus:'bad'}),context)).status,400);
  assert.equal((await route.PUT(request({paymentStatus:'unpaid'}),context)).status,400);
  const disabledPdf=load('src/app/api/service-invoices/save-pdf/route.ts',{'@/lib/auth/session':{requireAuthenticatedSession:async()=>session}});
  assert.equal((await disabledPdf.POST()).status,410);
  // Upload persistence uses the signed actor; the service must send the invoice number.
  let scanSaved;
  const upload=load('src/app/api/service-invoices/upload-scanned/route.ts',{
    '@/lib/auth/session':{requireAuthenticatedSession:async()=>session},
    '@/lib/googleSheets':{getSheetsClient:async()=>sheets,getDatabaseSpreadsheetId:async()=>'fixture',getDriveUploadClient:async()=>({files:{create:async()=>({data:{id:'newscan'}})},permissions:{create:async()=>{}}})},
    '@/lib/serviceInvoiceSheets':{recordServiceInvoiceScan:async(no,link,actor)=>{scanSaved={no,link,actor};}},
  });
  const form=new FormData();form.append('invoiceNo','1002');form.append('file',new File(['PDF fixture'],'scan.pdf',{type:'application/pdf'}));
  assert.equal((await upload.POST(new Request('http://test',{method:'POST',body:form}))).status,200);
  assert.deepEqual(scanSaved,{no:'1002',link:'https://drive.google.com/file/d/newscan/view',actor:'admin'});
  let posted;
  const service=load('src/lib/services/service-invoice.service.ts',{axios:{post:async(_url,data)=>{posted=data;return {data:{fileLink:'scan'}};}}}).default;
  await service.uploadScanned('1002',new File(['PDF fixture'],'scan.pdf',{type:'application/pdf'}));
  assert.equal(posted.get('invoiceNo'),'1002');
  const report=summary.buildServiceInvoiceSummaryReport([{...combo,invoiceNo:'1001',companyName:'Acme',createdAt:'2026-10-02T00:00:00Z',items:[{quantity:2,unitPrice:100}]}],'all');
  assert.equal(report.paymentTotals.partial.amount,200);assert.equal(report.scannedTotals.scanned.count,1);assert.equal(report.categories[0].category,'Parts / Consumables');
  console.log('PASS tracking history, legacy Paid/scans, category combinations, admin payment gate, paid cancellation/void/delete protection, reasons, preserved scan evidence and report totals');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
