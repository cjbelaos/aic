"use client";

import { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import quotationService from '@/lib/services/quotation.service';
import { quotationRevisionLabel, quotationSnapshotToken } from '@/lib/quotationRevision';
import type { QuotationRecipients } from '@/lib/quotationRecipients';
import type { Quotation } from '@/types/quotation';

const errorMessage = (error: unknown) => (isAxiosError(error) ? error.response?.data?.message : undefined) || (error instanceof Error ? error.message : 'Unable to send quotation.');

export function QuotationSendReview({ quotation, onClose, onSent }: { quotation: Quotation; onClose: () => void; onSent: () => void }) {
  const [recipients, setRecipients] = useState<QuotationRecipients | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    quotationService.getRecipients(quotation.quotationNo).then(value => { if (active) setRecipients(value); }).catch(error => { if (active) setError(errorMessage(error)); });
    return () => { active = false; };
  }, [quotation.quotationNo]);
  const send = async () => {
    if (!recipients || busy) return;
    setBusy(true); setError('');
    try {
      const recovered = await quotationService.recoverPendingSend(quotation.quotationNo);
      if (recovered) { toast.success(recovered.message); onSent(); return; }
      const latest = await quotationService.getByRefNo(quotation.quotationNo);
      if (!latest || quotationSnapshotToken(latest) !== quotationSnapshotToken(quotation)) throw new Error('The quotation changed. Close this review and reopen the latest quotation before sending.');
      const { generateQuotationPdfBase64 } = await import('@/lib/quotationPdf');
      const base64 = await generateQuotationPdfBase64(latest);
      const pdfBlob = new Blob([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], { type: 'application/pdf' });
      const result = await quotationService.sendEmail({ quotationNo: latest.quotationNo, customer: latest.customer, email: recipients.to, cc: recipients.cc, snapshotToken: quotationSnapshotToken(latest), quotationDescription: latest.description, grandTotal: latest.amount, pdfBlob });
      if (!result.success) throw new Error(result.message);
      toast.success(result.message); onSent();
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Review quotation recipients</DialogTitle></DialogHeader>
      <p className="text-sm">{quotationRevisionLabel(quotation)} · {quotation.customer}</p>
      {!recipients && !error && <p role="status">Loading company contacts…</p>}
      {recipients && <dl className="space-y-3 text-sm">
        <div><dt className="font-semibold">To — primary contact</dt><dd className="break-all">{recipients.to}</dd></div>
        <div><dt className="font-semibold">CC</dt><dd><ul className="space-y-1">{recipients.cc.map(email => <li className="break-all" key={email}>{email}</li>)}</ul></dd></div>
      </dl>}
      <p className="text-sm text-muted-foreground">Recipients come from the company contacts. Other contacts and the Aerich sales address are included automatically. To change recipients, cancel and update the company contacts.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || !recipients} onClick={() => void send()}>{busy ? 'Sending…' : 'Confirm & send'}</Button></div>
    </DialogContent>
  </Dialog>;
}
