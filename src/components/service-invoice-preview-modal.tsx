"use client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ServiceInvoiceResponse } from "@/types/serviceInvoice";
import { PAYMENT_LABELS } from "@/lib/serviceInvoiceTracking";
interface Props { si: ServiceInvoiceResponse | null; open: boolean; onOpenChange: (value: boolean) => void }
export function ServiceInvoicePreviewModal({ si, open, onOpenChange }: Props) {
  if (!si) return null;
  const money = (value: number) => value.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
    <DialogHeader><DialogTitle>Service Invoice #{si.invoiceNo}</DialogTitle></DialogHeader>
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div><dt className="text-muted-foreground">Customer</dt><dd>{si.companyName}</dd></div>
      <div><dt className="text-muted-foreground">Invoice date</dt><dd>{si.date}</dd></div>
      <div><dt className="text-muted-foreground">Invoice status</dt><dd className="capitalize">{si.status}</dd></div>
      <div><dt className="text-muted-foreground">Payment</dt><dd>{PAYMENT_LABELS[si.paymentStatus ?? "unpaid"]}</dd></div>
      <div><dt className="text-muted-foreground">PO number</dt><dd>{si.poNo || "None"}</dd></div>
      <div><dt className="text-muted-foreground">SO / TR number</dt><dd>{si.trNo || "None"}</dd></div>
    </dl>
    {si.statusReason && <p className="text-sm">Reason: {si.statusReason}</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left py-2">Description</th><th>Qty</th><th className="text-right">Unit price</th><th className="text-right">Amount</th></tr></thead><tbody>{si.items.map((item,index) => <tr key={index} className="border-b"><td className="py-2">{item.description}</td><td className="text-center">{item.quantity}</td><td className="text-right">{money(item.unitPrice)}</td><td className="text-right">{money(item.quantity * item.unitPrice)}</td></tr>)}</tbody></table></div>
    <p className="text-right font-semibold">Total: {money(si.items.reduce((sum,item) => sum + item.quantity * item.unitPrice,0))}</p>
    {(si.scannedFileLink || si.driveFileLink) && <Button variant="outline" asChild><a href={si.scannedFileLink || si.driveFileLink} target="_blank" rel="noopener noreferrer">View stored attachment</a></Button>}
  </DialogContent></Dialog>;
}
