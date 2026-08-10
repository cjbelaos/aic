export interface NewFlowFTIDetail {
  date: string;
  technicianName: string;
  customerName: string;
  description: string;
  km: number;
  fuelPrice: number;
  tollFee: number;
  fuelSubTotal: number;
  totalAmount: number;
}

export interface NewFlowFTIRequest {
  controlNo: string;
  userId: string;
  status: string;
  dateCreated: string;
  ftiFileLink?: string;
  totalAmount?: number;
  details?: NewFlowFTIDetail[];
}