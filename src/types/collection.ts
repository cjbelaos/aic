export interface ScheduledCollection {
  id: string;
  companyId: string;
  companyName: string;
  scheduledDate: string; // ISO date string (e.g., YYYY-MM-DD)
  notes?: string;
  status: "PENDING" | "COLLECTED" | "CANCELLED";
}

export interface CollectionHistory {
  collectionId: string;
  companyId: string;
  companyName: string;
  description: string;
  amountCollected: number;
  collectedDate: string;
}

export interface CreateScheduledCollectionPayload {
  companyId: string;
  scheduledDate: string;
  notes?: string;
}

export interface LogCollectionPayload {
  scheduledCollectionId: string;
  companyId: string;
  description: string;
  amountCollected: number;
  collectedDate: string;
}
