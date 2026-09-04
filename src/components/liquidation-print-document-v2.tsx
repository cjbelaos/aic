"use client";

import { format } from "date-fns";
import type { ReceiptItemV2Input } from "@/types/liquidation-v2";

interface LiquidationPrintDocumentV2Props {
  controlNo: string;
  fullName: string;
  items: ReceiptItemV2Input[];
  /** Category codes (e.g. "MEAL") derived from miscellaneousService.getAll(). */
  categories: string[];
  /** Maps miscellaneous code → description (e.g. "MEAL" → "Meal") for display. */
  miscLookup?: Map<string, string>;
  /** FTI Total Amount of the linked ControlNo. */
  advances: number;
  id?: string;
  approvedBy?: string;
  approvedBySignatureUrl?: string;
}

function toFixed2(n: number): string {
  return (n || 0).toFixed(2);
}

/**
 * Reusable printable Expense Liquidation report.
 * Renders the pivot table (Date | Description | <categories...> | Others | Total),
 * a subtotal row per category, a grand total row, and the
 * Subtotal / Advances / Total Reimbursement summary block.
 */
export default function LiquidationPrintDocumentV2({
  controlNo,
  fullName,
  items,
  categories,
  miscLookup,
  advances,
  id = "liquidation-preview-content",
  approvedBy,
  approvedBySignatureUrl,
}: LiquidationPrintDocumentV2Props) {
  // V2 receipts record the net amount in `amount` and the VAT-inclusive
  // gross in `grossAmount`. Use gross (falling back to net) so the printed
  // pivot matches the amounts shown in the V2 form's Receipt Items table.
  const amountOf = (it: ReceiptItemV2Input): number =>
    it.grossAmount ?? it.amount ?? 0;
  // Categories used as column headers — exclude "Others" since there's a
  // dedicated catch-all "Others" column in the pivot table.
  const activeCategories = categories.filter((c) => c !== "Others" && c);
  // Anything whose category is not a known miscellaneous description falls
  // into the "Others" catch-all column.
  const isKnown = (cat: string) => activeCategories.includes(cat);

  const subtotal = items.reduce((s, i) => s + amountOf(i), 0);
  // Dynamic settlement label/value based on comparison of expenses vs advances.
  const difference = subtotal - advances;
  const hasAdvances = advances > 0;
  const hasAmountToReturn = hasAdvances && difference < 0;
  const settlement =
    hasAmountToReturn
      ? { label: "Amount to Return" }
      : !hasAdvances
        ? { label: "Total Reimbursement" }
        : difference > 0
          ? {
              label: "Total Reimbursement",
              hint: "(Positive Amount — Company pays employee)",
            }
          : { label: "Net Amount Due / Settled", hint: "(₱0.00)" };
  const settlementValue = hasAmountToReturn
    ? Math.abs(difference)
    : !hasAdvances || difference === 0
      ? difference === 0
        ? 0
        : subtotal
      : difference;

  const catTotal = (cat: string) =>
    items
      .filter((i) => i.miscellaneousCode === cat)
      .reduce((s, i) => s + amountOf(i), 0);

  // Only include category columns that have at least one item using them.
  const usedCategories = activeCategories.filter((cat) => catTotal(cat) > 0);

  const othersTotal = items
    .filter((i) => !isKnown(i.miscellaneousCode))
    .reduce((s, i) => s + amountOf(i), 0);
  const showOthersColumn = othersTotal > 0;

  // Sort items by date ascending for display.
  const sortedItems = [...items].sort((a, b) => a.date.localeCompare(b.date));

  const nowFormatted = format(new Date(), "EEEE, dd MMMM yyyy, HH:mm:ss");

  return (
    <div
      id={id}
      className="bg-white text-black p-8 rounded border space-y-4 text-xs select-none min-w-[850px] mx-auto shadow-sm"
      style={{ fontFamily: "Arial, sans-serif" }}
    >
      {/* ── Header (mirrors FTI printable document) ── */}
      <div className="bg-white border-t-4 border-b-2 border-[#00a2e8] py-4 px-6 relative flex items-center justify-between shadow-xs rounded-t">
        <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center">
          <img
            src="/logo.png"
            alt="Company Logo"
            className="h-20 w-auto object-contain"
          />
        </div>
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
            <span className="font-semibold text-slate-900">{fullName}</span>
          </p>
          <p>
            <span className="inline-block w-20 text-gray-700 font-medium">
              Date:
            </span>
            <span>{nowFormatted}</span>
          </p>
        </div>
        {advances > 0 && (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-700 whitespace-nowrap">
              FTI REF
            </span>
            <div className="bg-gray-100 border border-gray-300 rounded px-3 h-7 flex items-center justify-center text-xs font-mono text-gray-900 min-w-[200px] text-center font-bold leading-none select-text">
              {controlNo}
            </div>
          </div>
        )}
      </div>

      {/* ── Title ── */}
      <h2 className="text-center font-bold text-base pt-2 pb-1 uppercase tracking-wide text-slate-800">
        Expense Liquidation Form
      </h2>

      {/* ── Pivot Table ── */}
      <table className="w-full border-collapse border border-black text-[11px]">
        <thead>
          <tr className="border-b border-black">
            <th className="border-r border-black px-1.5 py-1 text-center w-[12%] font-medium text-gray-800">
              Date
            </th>
            <th className="border-r border-black px-1.5 py-1 text-center w-[22%] font-medium text-gray-800">
              Description
            </th>
            {usedCategories.map((cat) => (
              <th
                key={cat}
                className="border-r border-black px-1.5 py-1 text-center font-medium text-gray-800"
              >
                {miscLookup?.get(cat) || cat}
              </th>
            ))}
            {showOthersColumn && (
              <th className="border-r border-black px-1.5 py-1 text-center font-medium text-gray-800">
                Others
              </th>
            )}
            <th className="px-1.5 py-1 text-center font-medium text-gray-800">Total</th>
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((item, index) => (
            <tr
              key={`${item.date}-${item.miscellaneousCode}-${index}`}
              className="border-b border-black text-black"
            >
              <td className="border-r border-black px-1.5 py-0.5 text-left whitespace-nowrap">
                {item.date}
              </td>
              <td className="border-r border-black px-1.5 py-0.5 text-left">
                {item.description}
              </td>
              {usedCategories.map((cat) => (
                <td
                  key={cat}
                  className="border-r border-black px-1.5 py-0.5 text-right font-mono"
                >
                  {item.miscellaneousCode === cat ? toFixed2(amountOf(item)) : ""}
                </td>
              ))}
              {showOthersColumn && (
                <td className="border-r border-black px-1.5 py-0.5 text-right font-mono">
                  {!isKnown(item.miscellaneousCode) ? toFixed2(amountOf(item)) : ""}
                </td>
              )}
              <td className="px-1.5 py-0.5 text-right font-mono font-semibold">
                {toFixed2(amountOf(item))}
              </td>
            </tr>
          ))}

          {/* ── Subtotal row (per-category sums) ── */}
          <tr className="border-b border-black font-semibold bg-gray-50">
            <td className="border-r border-black px-1.5 py-1" colSpan={2}>
              Subtotal
            </td>
            {usedCategories.map((cat) => (
              <td
                key={cat}
                className="border-r border-black px-1.5 py-1 text-right font-mono"
              >
                {catTotal(cat) ? toFixed2(catTotal(cat)) : ""}
              </td>
            ))}
            {showOthersColumn && (
              <td className="border-r border-black px-1.5 py-1 text-right font-mono">
                {othersTotal ? toFixed2(othersTotal) : ""}
              </td>
            )}
            <td className="px-1.5 py-1 text-right font-mono font-bold">
              {toFixed2(subtotal)}
            </td>
          </tr>

          {/* ── Grand Total row ── */}
          <tr className="font-semibold bg-gray-50">
            <td
              className="border-r border-black px-1.5 py-1 text-left text-gray-800 font-bold"
              colSpan={usedCategories.length + 2 + (showOthersColumn ? 1 : 0)}
            >
              Grand Total
            </td>
            <td className="px-1.5 py-1 text-right font-mono text-black font-bold text-xs">
              {toFixed2(subtotal)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Summary block (bottom right) ── */}
      <div className="flex justify-end pt-2">
        <div className="w-72 space-y-1 border border-black rounded-sm px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-800 font-medium">Total Expenses</span>
            <span className="font-mono font-semibold">
              {toFixed2(subtotal)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-800 font-medium">Cash Advances</span>
            <span className="font-mono font-semibold">
              {toFixed2(advances)}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-black pt-1 mt-1">
            <span className="text-gray-800 font-bold">
              {settlement.label}
              {settlement.hint && (
                <span className="block text-[9px] font-normal text-gray-600">
                  {settlement.hint}
                </span>
              )}
            </span>
            <span className="font-mono font-bold">
              {settlementValue === 0
                ? toFixed2(0)
                : `${settlementValue > 0 ? "" : "-"}${toFixed2(
                    Math.abs(settlementValue),
                  )}`}
            </span>
          </div>
        </div>
      </div>

      {/* ── Signature Section ── */}
      <div className="pt-12 text-xs flex justify-between items-start">
        <div className="w-1/3">
          <p className="font-normal text-gray-800">
            Prepared by:{" "}
            <span className="font-semibold text-slate-900">{fullName}</span>
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
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
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
