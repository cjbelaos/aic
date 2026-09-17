const fs = require("fs");
const p = "src/app/dashboard/payment-terms/page.tsx";
let s = fs.readFileSync(p, "utf8").replaceAll("\r\n", "\n");
const from = `<EntityTable title="Payment Terms" columns={columns} data={data} loading={loading} onCreateNew={isAdmin ? openCreate : undefined} onEdit={isAdmin ? openEdit : undefined}/>`;
const to = `<EntityTable title="Payment Terms" columns={columns} data={data} loading={loading} onCreateNew={isAdmin ? openCreate : undefined} onEdit={isAdmin ? openEdit : undefined} mobileLayout={{ primary: ["paymentTermId", "name", "dueDays", "downPaymentPercent"], labels: { paymentTermId: "Payment term ID", code: "Code", name: "Name", description: "Description", dueDays: "Due days", downPaymentPercent: "Down payment", balanceTerms: "Balance terms", sortOrder: "Order", status: "Status", actions: "Actions" } }}/>`;
if (!s.includes(from)) throw new Error("target pattern not found");
s = s.replace(from, to);
fs.writeFileSync(p, s);
console.log("patched");
