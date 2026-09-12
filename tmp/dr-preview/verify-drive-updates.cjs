const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
async function check(kind,linked,found=true){
 const updates=[],creates=[],lookups=[];let persisted;
 const row=Array(13).fill('');row[0]=kind==='deliveries'?'3727':'PO-1';row[kind==='deliveries'?11:12]=linked?'https://drive.google.com/file/d/existing-file/view':'';
 const drive={files:{list:async x=>{lookups.push(x);return {data:{files:[]}}},update:async x=>{updates.push(x);return {}},create:async x=>{creates.push(x);return {data:{id:'new-file'}}}}};
 const sheets={spreadsheets:{values:{get:async()=>({data:{values:found?[row]:[]}}),update:async x=>{persisted=x;return {}}}}};
 const mocks={'next/server':{NextResponse:{json:(body,opts)=>({body,status:opts?.status??200})}},'@/lib/auth/session':{requireAuthenticatedSession:async()=>({userId:'test'})},'@/lib/googleSheets':{getSheetsClient:async()=>sheets,getDatabaseSpreadsheetId:async()=>'test',getDriveUploadClient:async()=>drive,resolveDriveFolderPath:async()=>'folder',MONTH_NAMES:['Jan'],escapeDriveQueryValue:x=>x},'@/lib/deliverySheets':{populateAndExportDeliveryReceiptFormPdf:()=>{throw Error('Should use new PDF')}}};
 const js=ts.transpileModule(fs.readFileSync(`src/app/api/${kind}/save-pdf/route.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const m={exports:{}};new Function('require','module','exports',js)(id=>mocks[id]??require(id),m,m.exports);
 const result=await m.exports.POST({json:async()=>({drNumber:3727,poNumber:'PO-1',companyName:'Changed customer',supplierName:'Supplier',deliveryDate:'2026-01-02',date:'2026-01-02',pdfBase64:Buffer.from('%PDF-1.4 test').toString('base64')})});
 if(!found){assert.equal(result.status,404);assert.equal(creates.length+updates.length,0);}else{assert.equal(result.status,200);assert.equal(updates.length,linked?1:0);assert.equal(creates.length,linked?0:1);assert.equal(result.body.fileId,linked?'existing-file':'new-file');assert(persisted);if(linked){assert.equal(lookups.length,0);assert(updates[0].requestBody.name);}}
 console.log(`PASS ${kind}: ${!found?'missing record causes no upload':linked?'update preserves linked file ID after rename':'first save creates file and persists link'}`);
}
(async()=>{for(const kind of ['deliveries','purchase-orders']){await check(kind,true);await check(kind,false);await check(kind,false,false)}})().catch(e=>{console.error(e);process.exitCode=1});
