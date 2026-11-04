import type { Quotation } from './quotation';

export interface QuotationHistoryEntry {
  sendId: string;
  quotationNo: string;
  revision: number;
  state: 'SENDING' | 'SENT' | 'FAILED' | 'UNCERTAIN' | 'LEGACY';
  file: string;
  snapshot: Quotation;
  sentBy: string;
  recipient: string;
  sentAt: string;
  messageId: string;
  error: string;
  snapshotToken: string;
}
