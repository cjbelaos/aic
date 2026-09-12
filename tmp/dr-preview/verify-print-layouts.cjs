const fs=require('fs'),path=require('path'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),assert=require('node:assert/strict');
function load(name){const p=path.resolve('src/components',name+'.tsx');const mod={exports:{}};const js=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;new Function('require','module','exports',js)(id=>id.startsWith('./')?load(id.slice(2)):require(id),mod,mod.exports);return mod.exports;}
const {businessDocumentPrintShell}=load('business-document-print-layout');
const {DeliveryReceiptPrintDocument}=load('delivery-receipt-print-document');
const {PurchaseOrderPrintDocument}=load('purchase-order-print-document');
const base={success:true,address:'123 Sample Street, Metro Manila',tin:'000-000-000-000',date:'09/12/2026',status:'created',preparedBy:'Sample Preparer',comments:'SAMPLE ONLY — illustrative data, not actual records. <Check quantities>'};
function items(count){return Array.from({length:count},(_,i)=>({itemNo:i+1,productCode:'HIDDEN-PRODUCT-CODE',description:'Sample supply '+(i+1)+(i%4===0?' — Heavy-duty material with accessories and installation instructions. '.repeat(3):''),quantity:2,unit:'pcs',pricePerUnit:125.5,totalAmount:251}));}
for(const n of [0,1,32,80]){
const dr={...base,drNumber:3727,companyName:'SAMPLE CUSTOMER COMPANY',deliveredBy:'Sample Driver',items:items(n)};
const po={...base,poNumber:'SAMPLE-PO-001',supplierName:'SAMPLE SUPPLIER COMPANY',prNumber:'SAMPLE-PR-001',approvedBy:'Sample Approver',notedBy:'Sample Reviewer',items:items(n),totalAmount:n*251};
for(const [kind,Component,props] of [['delivery-receipt',DeliveryReceiptPrintDocument,{dr}],['purchase-order',PurchaseOrderPrintDocument,{po}]]){
const html=renderToStaticMarkup(React.createElement(Component,props));
assert.equal((html.match(/class="item"/g)||[]).length,n);assert(!html.includes('HIDDEN-PRODUCT-CODE'));assert(!html.includes('<Check quantities>'));assert(html.includes('/logo.png'));assert(html.includes('<thead>'));
if(kind==='purchase-order')assert(html.includes((n*251).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})));
if(n===32){const out=businessDocumentPrintShell.replace('<body></body>',`<body>${html}</body>`).replaceAll('/logo.png','data:image/png;base64,'+fs.readFileSync('public/logo.png').toString('base64'));fs.writeFileSync(`tmp/dr-preview/${kind}-${kind==='delivery-receipt'?'3727-':''}sample.html`,out);}
console.log(`PASS ${kind}: ${n} rows, no product code, logo, repeated header, escaped text${kind==='purchase-order'?', subtotal':''}`);
}}
