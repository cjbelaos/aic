"use client";

import { format } from "date-fns";
import { computeFuelCost } from "@/types/fti";

// ── Shared Types ──────────────────────────────
export interface ExpresswaySegment {
  id: string;
  group: string;
  entry: string;
  exit: string;
  tollFee: number;
}

export interface DestinationPreview {
  id: string;
  name: string;
  address?: string;
  segments: ExpresswaySegment[];
  distanceKm?: number;
}

export interface DraftItinerary {
  id: string;
  date: string;
  itinerary: string;
  description: string;
  km: number;
  fuelPrice: number;
  tollFee: number;
  miscellaneous: string;
  miscellaneousDescription?: string;
  miscAmount: number;
  fuelAmount?: number;
  totalAmount: number;
  origin: string;
  originAddress?: string;
  destinations: DestinationPreview[];
}

// ── Helpers ────────────────────────────────────
function toFixed2(n: number): string {
  return (n || 0).toFixed(2);
}

// ── Component ─────────────────────────────────
interface FTIPrintDocumentProps {
  batchItems: DraftItinerary[];
  ftiRef: string;
  technician: string;
  fullName: string;
  kmPerLiter?: number;
  id?: string;
  approvedBy?: string;
  approvedBySignatureUrl?: string;
}

/**
 * Reusable printable FTI form document.
 * Used by the preview modal (id="fti-preview-content") and by page.tsx
 * (id="fti-print-content") for direct PDF generation without preview.
 */
export default function FTIPrintDocument({
  batchItems,
  ftiRef,
  technician,
  fullName,
  kmPerLiter = 12,
  id = "fti-preview-content",
  approvedBy,
  approvedBySignatureUrl,
}: FTIPrintDocumentProps) {
  // Helper to calculate fuel amount: (KM / kmPerLiter) * Fuel Price
  const getItemFuel = (item: DraftItinerary) => {
    if (item.fuelAmount !== undefined && item.fuelAmount > 0) {
      return item.fuelAmount;
    }
    return computeFuelCost(item.km, item.fuelPrice, kmPerLiter);
  };

  const getItemTotal = (item: DraftItinerary) => {
    const fuel = getItemFuel(item);
    return (item.tollFee || 0) + (item.miscAmount || 0) + fuel;
  };

  const totalToll = batchItems.reduce((s, i) => s + (i.tollFee || 0), 0);
  const totalMiscAmount = batchItems.reduce(
    (s, i) => s + (i.miscAmount || 0),
    0,
  );
  const totalFuel = batchItems.reduce((s, i) => s + getItemFuel(i), 0);
  const totalAmount = batchItems.reduce((s, i) => s + getItemTotal(i), 0);

  const TOTAL_ROWS = 18;
  const emptyRowsCount = Math.max(0, TOTAL_ROWS - batchItems.length);

  const nowFormatted = format(new Date(), "EEEE, dd MMMM yyyy, HH:mm:ss");

  return (
    <div
      id={id}
      className="bg-white text-black p-8 rounded border space-y-4 text-xs select-none min-w-[850px] mx-auto shadow-sm"
      style={{ fontFamily: "Arial, sans-serif" }}
    >
      {/* ── Elegant Header with Logo ── */}
      <div className="bg-white border-t-4 border-b-2 border-[#00a2e8] py-4 px-6 relative flex items-center justify-between shadow-xs rounded-t">
        {/* Logo on Left */}
        <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center">
          <img
            src="/logo.png"
            alt="Company Logo"
            className="h-20 w-auto object-contain"
          />
        </div>

        {/* Centered Company Details */}
        <div className="text-center w-full px-28 space-y-0.5">
          <h1 className="text-2xl font-black tracking-wider text-slate-900 uppercase">
            AERICH INNOVATION CORP.
          </h1>
          <p className="text-xs text-slate-700 font-medium">
            BLK 4, LOT 2 Bamboo Orchard Subdivision, Brgy. Banay Banay, Cabuyao
            City, Laguna
          </p>
          <div className="flex justify-center gap-4 text-[11px] text-slate-600 font-normal pt-0.5">
            <p>
              <span className="font-semibold text-slate-800">Email:</span>{" "}
              aerichinnovationcorp@gmail.com
            </p>
            <p>
              <span className="font-semibold text-slate-800">Contact:</span>{" "}
              09171832745 / 09399063645
            </p>
          </div>
        </div>
      </div>

      {/* ── Meta Header ── */}
      <div className="flex justify-between items-start text-xs pt-2">
        <div className="space-y-1">
          <p>
            <span className="inline-block w-20 text-gray-700 font-medium">
              Technician
            </span>
            <span className="font-semibold text-slate-900">{technician}</span>
          </p>
          <p>
            <span className="inline-block w-20 text-gray-700 font-medium">
              Date:
            </span>
            <span>{nowFormatted}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-700 whitespace-nowrap">
            FTI REF
          </span>
          <div className="bg-gray-100 border border-gray-300 rounded px-3 h-7 flex items-center justify-center text-xs font-mono text-gray-900 min-w-[200px] text-center font-bold leading-none select-text">
            {ftiRef}
          </div>
        </div>
      </div>

      {/* ── Title ── */}
      <h2 className="text-center font-bold text-base pt-2 pb-1 uppercase tracking-wide text-slate-800">
        Itinerary Budget Request Form
      </h2>

      {/* ── Data Table ── */}
      <table className="w-full border-collapse border border-black text-[11px]">
        <thead>
          <tr className="bg-gray-100 text-gray-800 border-b border-black font-semibold">
            <th className="border-r border-black px-1.5 py-1 text-center w-[10%]">
              Date
            </th>
            <th className="border-r border-black px-1.5 py-1 text-center w-[18%]">
              Itinerary
            </th>
            <th className="border-r border-black px-1.5 py-1 text-center w-[20%]">
              Description
            </th>
            <th className="border-r border-black px-1.5 py-1 text-center w-[6%]">
              KM
            </th>
            <th className="border-r border-black px-1.5 py-1 text-center w-[7%]">
              Fuel Price
            </th>
            <th className="border-r border-black px-1.5 py-1 text-center w-[6%]">
              TOLL
            </th>
            <th className="border-r border-black px-1.5 py-1 text-center w-[11%]">
              Misc
            </th>
            <th className="border-r border-black px-1.5 py-1 text-center w-[8%]">
              Misc. Amount
            </th>
            <th className="border-r border-black px-1.5 py-1 text-center w-[7%]">
              FUEL
            </th>
            <th className="px-1.5 py-1 text-center w-[7%]">TOTAL AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {/* Active Batch Items */}
          {batchItems.map((item) => {
            const itemFuel = getItemFuel(item);
            const itemTotal = getItemTotal(item);
            return (
              <tr key={item.id} className="border-b border-black text-black">
                <td className="border-r border-black px-1.5 py-0.5 text-left">
                  {item.date}
                </td>
                <td className="border-r border-black px-1.5 py-0.5 text-left">
                  {item.itinerary}
                </td>
                <td className="border-r border-black px-1.5 py-0.5 text-left">
                  {item.description}
                </td>
                <td className="border-r border-black px-1.5 py-0.5 text-right font-mono">
                  {item.km}
                </td>
                <td className="border-r border-black px-1.5 py-0.5 text-right font-mono">
                  {item.fuelPrice}
                </td>
                <td className="border-r border-black px-1.5 py-0.5 text-right font-mono">
                  {item.tollFee || ""}
                </td>
                <td className="border-r border-black px-1.5 py-0.5 text-left">
                  {item.miscellaneousDescription || ""}
                </td>
                <td className="border-r border-black px-1.5 py-0.5 text-right font-mono">
                  {item.miscAmount ? item.miscAmount : ""}
                </td>
                <td className="border-r border-black px-1.5 py-0.5 text-right font-mono">
                  {toFixed2(itemFuel)}
                </td>
                <td className="px-1.5 py-0.5 text-right font-mono font-semibold">
                  {toFixed2(itemTotal)}
                </td>
              </tr>
            );
          })}

          {/* Clean Empty Rows */}
          {Array.from({ length: emptyRowsCount }).map((_, i) => (
            <tr key={`empty-${i}`} className="border-b border-black">
              <td className="border-r border-black px-1.5 py-1">&nbsp;</td>
              <td className="border-r border-black px-1.5 py-1">&nbsp;</td>
              <td className="border-r border-black px-1.5 py-1">&nbsp;</td>
              <td className="border-r border-black px-1.5 py-1">&nbsp;</td>
              <td className="border-r border-black px-1.5 py-1">&nbsp;</td>
              <td className="border-r border-black px-1.5 py-1">&nbsp;</td>
              <td className="border-r border-black px-1.5 py-1">&nbsp;</td>
              <td className="border-r border-black px-1.5 py-1">&nbsp;</td>
              <td className="border-r border-black px-1.5 py-1">&nbsp;</td>
              <td className="px-1.5 py-1">&nbsp;</td>
            </tr>
          ))}

          {/* Subtotal Row */}
          <tr className="border-b border-black font-semibold">
            <td className="border-r border-black px-1.5 py-0.5" colSpan={5}>
              &nbsp;
            </td>
            <td className="border-r border-black px-1.5 py-0.5 text-right font-mono">
              {totalToll || ""}
            </td>
            <td className="border-r border-black px-1.5 py-0.5">&nbsp;</td>
            <td className="border-r border-black px-1.5 py-0.5 text-right font-mono">
              {totalMiscAmount || ""}
            </td>
            <td className="border-r border-black px-1.5 py-0.5 text-right font-mono">
              {toFixed2(totalFuel)}
            </td>
            <td className="px-1.5 py-0.5 text-right font-mono">&nbsp;</td>
          </tr>

          {/* Grand Total Row */}
          <tr className="font-semibold bg-gray-50">
            <td className="border-r border-black px-1.5 py-1" colSpan={6}>
              &nbsp;
            </td>
            <td
              className="border-r border-black px-1.5 py-1 text-left text-gray-800 font-bold"
              colSpan={2}
            >
              Total Requested Budget
            </td>
            <td className="border-r border-black px-1.5 py-1">&nbsp;</td>
            <td className="px-1.5 py-1 text-right font-mono text-black font-bold text-xs">
              {toFixed2(totalAmount)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Signature Section ── */}
      <div className="pt-12 text-xs flex justify-between items-start">
        <div className="w-1/3">
          <p className="font-normal text-gray-800">
            Prepared by:{" "}
            <span className="font-semibold text-slate-900">
              {fullName || technician}
            </span>
          </p>
        </div>

        <div className="w-1/3">
          <div className="inline-flex items-center gap-1">
            <span className="font-normal text-gray-800">Approved by:</span>
            <div className="relative inline-block">
              {/* Centered signature floating directly above the full name */}
              {approvedBy && approvedBySignatureUrl && (
                <img
                  src={approvedBySignatureUrl}
                  alt="Approver Signature"
                  className="absolute left-1/2 -bottom-1 -translate-x-1/2 h-16 w-auto object-contain pointer-events-none filter contrast-125 z-10"
                />
              )}
              <span className="font-semibold text-slate-900 px-1">
                {approvedBy || ""}
              </span>
            </div>
          </div>
        </div>

        <div className="w-1/3 space-y-8">
          <p className="font-normal text-gray-800">Released Cash by:</p>
          <p className="font-normal text-gray-800">
            Received And Acknowledge by:
          </p>
        </div>
      </div>
    </div>
  );
}
