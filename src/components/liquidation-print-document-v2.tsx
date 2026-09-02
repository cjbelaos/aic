"use client";

import { format } from "date-fns";
import type { ReceiptItemV2Input } from "@/types/liquidation-v2";

interface LiquidationPrintDocumentV2Props {
  controlNo: string;
  fullName: string;
  items: ReceiptItemV2Input[];
  /** Miscellaneous codes (e.g. "MEAL") derived from miscellaneousService.getAll(). */
  categories: string[];
  /** Maps miscellaneous code → description (e.g. "MEAL" → "Meal") for display. */
  miscLookup?: Map<string, string>;
  id?: string;
  approvedBy?: string;
  approvedBySignatureUrl?: string;
}

function toFixed2(n: number): string {
  return (n || 0).toFixed(2);
}

/**
 * ISOLATED SANDBOX printable Expense Liquidation V2 — full accounting ledger
 * layout. Renders vendor info, document references (SI/OR/DR/CR/BS),
 * accounting columns (Check No, CV No, Particulars), tax columns
 * (Gross Amount, VAT, EWT) and Net Amount, plus totals and signatures.
 */
export default function LiquidationPrintDocumentV2({
  controlNo,
  fullName,
  items,
  miscLookup,
  id = "liquidation-preview-content",
  approvedBy,
  approvedBySignatureUrl,
}: LiquidationPrintDocumentV2Props) {
  // Vendor info is taken from the first item (sandbox: batch-level fields).
  const vendor = items[0] || ({} as Partial<ReceiptItemV2Input>);

  const netOf = (it: ReceiptItemV2Input): number => {
    if (it.grossAmount != null && !isNaN(it.grossAmount)) {
      return Math.max(
        0,
        (it.grossAmount || 0) - (it.vat || 0) - (it.ewt || 0),
      );
    }
    return it.amount || 0;
  };

  const grossTotal = items.reduce((s, it) => s + (it.grossAmount ?? 0), 0);
  const vatTotal = items.reduce((s, it) => s + (it.vat || 0), 0);
  const ewtTotal = items.reduce((s, it) => s + (it.ewt || 0), 0);
  const netTotal = items.reduce((s, it) => s + netOf(it), 0);

  const sortedItems = [...items].sort((a, b) => a.date.localeCompare(b.date));
  const nowFormatted = format(new Date(), "EEEE, dd MMMM yyyy, HH:mm:ss");

  const refLines = (it: ReceiptItemV2Input): string[] => {
    // V2 no longer captures per-document dates — the receipt item Date applies.
    const lines: string[] = [];
    if (it.siNumber) lines.push(`SI: ${it.siNumber}`);
    if (it.orNumber) lines.push(`OR: ${it.orNumber}`);
    if (it.drNumber) lines.push(`DR: ${it.drNumber}`);
    if (it.crNumber) lines.push(`CR: ${it.crNumber}`);
    if (it.bsNumber) lines.push(`BS: ${it.bsNumber}`);
    return lines;
  };

  return (
    <div
      id={id}
      className="bg-white text-black p-8 rounded border space-y-4 text-xs select-none min-w-[1500px] mx-auto shadow-sm"
      style={{ fontFamily: "Arial, sans-serif" }}
    >
      {/* ── Header (mirrors production printable document) ── */}
      <div className="bg-white border-t-4 border-b-2 border-[#00a2e8] py-4 px-6 relative flex items-center justify-between shadow-xs rounded-t">
        <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
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

      {/* ── TESTING banner ── */}
      <div className="border border-amber-400 bg-amber-50 text-amber-800 px-4 py-2 rounded text-center font-bold uppercase tracking-widest">
        [TESTING] Expense Liquidation V2 — Sandbox Data Only
      </div>
{/* ── Meta Header ── */}
      <div className="flex justify-between items-start text-xs pt-2">
        <div className="space-y-1">
          <p>
            <span className="inline-block w-24 text-gray-700 font-medium">
              Requested By
            </span>
            <span className="font-semibold text-slate-900">{fullName}</span>
          </p>
          <p>
            <span className="inline-block w-24 text-gray-700 font-medium">
              Date:
            </span>
            <span>{nowFormatted}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-700 whitespace-nowrap">
            REF NO
          </span>
          <div className="bg-gray-100 border border-gray-300 rounded px-3 h-7 flex items-center justify-center text-xs font-mono text-gray-900 min-w-[200px] text-center font-bold leading-none select-text">
            {controlNo || "—"}
          </div>
        </div>
      </div>

      {/* ── Title ── */}
      <h2 className="text-center font-bold text-base pt-2 pb-1 uppercase tracking-wide text-slate-800">
        Expense Liquidation V2 — Accounting Ledger
      </h2>

      {/* ── Vendor Information Block ── */}
      <table className="w-full border-collapse border border-black text-[11px]">
        <tbody>
          <tr className="border-b border-black">
            <td className="border-r border-black bg-gray-100 px-2 py-1 font-semibold text-gray-700 w-[130px]">
              Supplier Name
            </td>
            <td className="border-r border-black px-2 py-1 font-semibold">
              {vendor.supplierName || "—"}
            </td>
            <td className="border-r border-black bg-gray-100 px-2 py-1 font-semibold text-gray-700 w-[80px]">
              TIN
            </td>
            <td className="border-r border-black px-2 py-1 font-mono">
              {vendor.tin || "—"}
            </td>
            <td className="border-r border-black bg-gray-100 px-2 py-1 font-semibold text-gray-700 w-[80px]">
              Ref No
            </td>
            <td className="px-2 py-1 font-mono">{vendor.refNo || "—"}</td>
          </tr>
          <tr>
            <td className="border-r border-black bg-gray-100 px-2 py-1 font-semibold text-gray-700">
              Address
            </td>
            <td className="px-2 py-1" colSpan={5}>
              {vendor.address || "—"}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Ledger Table ── */}
      <table className="w-full border-collapse border border-black text-[10.5px]">
        <thead>
          <tr className="border-b border-black bg-gray-50">
            <th className="border-r border-black px-1 py-1 text-left font-semibold text-gray-800 w-[60px]">
              Date
            </th>
            <th className="border-r border-black px-1 py-1 text-left font-semibold text-gray-800 w-[85px]">
              Code
            </th>
            <th className="border-r border-black px-1 py-1 text-left font-semibold text-gray-800 w-[180px]">
              Description / Particulars
            </th>
            <th className="border-r border-black px-1 py-1 text-left font-semibold text-gray-800 w-[190px]">
              Invoice / Document Reference
            </th>
            <th className="border-r border-black px-1 py-1 text-center font-semibold text-gray-800 w-[70px]">
              Check No
            </th>
            <th className="border-r border-black px-1 py-1 text-center font-semibold text-gray-800 w-[60px]">
              CV No
            </th>
            <th className="border-r border-black px-1 py-1 text-right font-semibold text-gray-800 w-[95px]">
              Gross Amount
            </th>
            <th className="border-r border-black px-1 py-1 text-right font-semibold text-gray-800 w-[80px]">
              VAT
            </th>
            <th className="border-r border-black px-1 py-1 text-right font-semibold text-gray-800 w-[80px]">
              EWT
            </th>
            <th className="px-1 py-1 text-right font-semibold text-gray-800 w-[95px]">
              Net Amount
            </th>
          </tr>
        </thead>
        <tbody>
{sortedItems.length === 0 && (
            <tr className="border-b border-black">
              <td
                colSpan={10}
                className="px-2 py-4 text-center text-gray-400 italic"
              >
                No receipt items on record.
              </td>
            </tr>
          )}
          {sortedItems.map((item, index) => {
            const refs = refLines(item);
            return (
              <tr
                key={`${item.date}-${index}`}
                className="border-b border-black align-top"
              >
                <td className="border-r border-black px-1.5 py-1 whitespace-nowrap">
                  {item.date}
                </td>
                <td className="border-r border-black px-1.5 py-1">
                  <span className="font-semibold">
                    {miscLookup?.get(item.miscellaneousCode) ||
                      item.miscellaneousCode}
                  </span>
                  <span className="block text-[9px] text-gray-500">
                    {item.miscellaneousCode}
                  </span>
                </td>
                <td className="border-r border-black px-1.5 py-1">
                  <span className="font-medium">{item.description}</span>
                  {item.supplierName && (
                    <span className="block text-[9px] text-gray-500">
                      {item.supplierName}
                    </span>
                  )}
                </td>
                <td className="border-r border-black px-1.5 py-1">
                  {refs.length > 0 ? (
                    <div className="space-y-0.5">
                      {refs.map((ref, i) => (
                        <div
                          key={i}
                          className="font-mono text-[9.5px] whitespace-nowrap"
                        >
                          {ref}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="border-r border-black px-1.5 py-1 text-center font-mono">
                  {item.checkNo || ""}
                </td>
                <td className="border-r border-black px-1.5 py-1 text-center font-mono">
                  {item.cvNo || ""}
                </td>
                <td className="border-r border-black px-1.5 py-1 text-right font-mono">
                  {item.grossAmount != null && !isNaN(item.grossAmount)
                    ? toFixed2(item.grossAmount)
                    : ""}
                </td>
                <td className="border-r border-black px-1.5 py-1 text-right font-mono">
                  {item.vat != null && !isNaN(item.vat)
                    ? toFixed2(item.vat)
                    : ""}
                </td>
                <td className="border-r border-black px-1.5 py-1 text-right font-mono">
                  {item.ewt != null && !isNaN(item.ewt)
                    ? toFixed2(item.ewt)
                    : ""}
                </td>
                <td className="px-1.5 py-1 text-right font-mono font-semibold">
                  {toFixed2(netOf(item))}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black bg-gray-50 font-bold">
            <td className="px-2 py-1" colSpan={6}>
              TOTAL
            </td>
            <td className="border-l border-black px-1.5 py-1 text-right font-mono">
              {toFixed2(grossTotal)}
            </td>
            <td className="border-r border-black px-1.5 py-1 text-right font-mono">
              {toFixed2(vatTotal)}
            </td>
            <td className="border-r border-black px-1.5 py-1 text-right font-mono">
              {toFixed2(ewtTotal)}
            </td>
            <td className="px-1.5 py-1 text-right font-mono">
              {toFixed2(netTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
{/* ── Summary block (bottom right) ── */}
      <div className="flex justify-end pt-2">
        <div className="w-80 space-y-1 border border-black rounded-sm px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-800 font-medium">
              Total Gross Amount
            </span>
            <span className="font-mono font-semibold">
              {toFixed2(grossTotal)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-800 font-medium">Less: VAT</span>
            <span className="font-mono font-semibold">
              ({toFixed2(vatTotal)})
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-800 font-medium">Less: EWT</span>
            <span className="font-mono font-semibold">
              ({toFixed2(ewtTotal)})
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-black pt-1 mt-1">
            <span className="text-gray-800 font-bold">Net Amount Payable</span>
            <span className="font-mono font-bold">{toFixed2(netTotal)}</span>
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
              {approvedBy && approvedBySignatureUrl && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={approvedBySignatureUrl}
                    alt="Approver Signature"
                    className="absolute left-1/2 -bottom-1 -translate-x-1/2 h-16 w-auto object-contain pointer-events-none filter contrast-125 z-10"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </>
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