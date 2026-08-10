export interface NewFlowItinerary {
  itineraryId: string;
  scheduleId: string;
  date: string;
  technicianId: string;
  technicianName: string;
  customerName: string;
  description: string;
  origin: string;
  destination: string;
  km: number;
  fuelPrice: number;
  tollFee: number;
  miscCode: string;
  miscAmount: number;
  fuelSubTotal: number;
  totalAmount: number;
}