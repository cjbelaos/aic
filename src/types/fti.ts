export type FTIStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REQUESTED_FOR_CHANGE";

export interface FTIRequest {
  controlNo: string;
  userId: string;
  status: string;
  dateCreated: string;
  ftiFileLink?: string;
  totalAmount?: number;
  approverUserId?: string;
  dateApproved?: string;
  approvalComment?: string;
}

export interface FTIDetails {
  detailId: string;
  controlNo: string;
  date: string;
  itinerary: string;
  description: string;
  km: number;
  fuelPrice: number;
  fuelSubTotal: number;
  tollFee: number;
}

export interface FTILegs {
  legId: string;
  detailId: string;
  controlNo: string;
  originName: string;
  originAddress: string;
  destName: string;
  destAddress: string;
  tollFee: number;
  distanceKm: number;
}

export interface FTIExpenses {
  expenseId: string;
  detailId: string;
  miscCode: string;
  amount: number;
}

export interface FTIRequestSummary extends FTIRequest {
  userName: string;
  totalAmount: number;
}

export interface FTIDetailInput {
  detailId?: string;
  date: string;
  itinerary: string;
  description: string;
  km: number;
  fuelPrice: number;
  fuelSubTotal?: number;
  tollFee: number;
  expenses?: { miscCode: string; amount: number }[];
  legs?: FTILegsInput[];
}

export interface FTILegsInput {
  legId?: string;
  originName: string;
  originAddress: string;
  destName: string;
  destAddress: string;
  tollFee: number;
  distanceKm: number;
}

export interface FTIRequestFull extends FTIRequest {
  userName: string;
  totalAmount: number;
  canApprove?: boolean;
  details: (FTIDetails & { expenses: FTIExpenses[]; legs: FTILegs[] })[];
}

/** Fuel cost formula: (km / kmPerLiter) × fuel price per liter */
export function computeFuelCost(
  km: number,
  fuelPrice: number,
  kmPerLiter: number = 12,
): number {
  if (kmPerLiter <= 0) kmPerLiter = 12;
  return (km / kmPerLiter) * fuelPrice;
}

export function computeDetailTotal(
  detail: Pick<FTIDetails, "km" | "fuelPrice" | "tollFee" | "fuelSubTotal">,
  expenses: Pick<FTIExpenses, "amount">[] = [],
): number {
  const fuel =
    detail.fuelSubTotal !== undefined
      ? detail.fuelSubTotal
      : computeFuelCost(detail.km, detail.fuelPrice);
  const misc = expenses.reduce((s, e) => s + e.amount, 0);
  return fuel + detail.tollFee + misc;
}

export function isEditableStatus(status: string): boolean {
  const upper = status.toUpperCase();
  return upper === "DRAFT" || upper === "REQUESTED_FOR_CHANGE";
}
