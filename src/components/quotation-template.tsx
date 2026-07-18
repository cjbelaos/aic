"use client";

import React, { useEffect, useRef, useState, forwardRef } from "react";
import { toast } from "sonner";
import { ArrowLeft, Save, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Customer } from "@/types/customer";
import { QuotationDetail } from "@/types/quotation";
import { getDriveImageUrl } from "@/lib/signatureUpload";

interface QuotationProps {
  quotationNo: string;
  date: string;
  validity: string;
  customer: Customer;
  projectDescription: string;
  paymentTerms: string;
  deliveryTerms: string;
  warrantyTerms?: string;
  items: QuotationDetail[];
  notations?: string[];
  subTotal: number;
  discount: number;
  vatableAmount: number;
  vat: number;
  grandTotal: number;
  preparedBy: string;
  approvedBy: string;
  preparedBySignatureUrl?: string;
  approvedBySignatureUrl?: string;
  onBack: () => void;
  onConfirmSave: (payload: any, pdfBlob: Blob) => void;
  isSaving?: boolean;
}

export const QuotationTemplate = forwardRef<HTMLDivElement, QuotationProps>(
  (
    {
      quotationNo = "—",
      date = "—",
      validity = "—",
      customer,
      projectDescription = "—",
      paymentTerms = "—",
      deliveryTerms = "—",
      warrantyTerms = "—",
      items = [],
      notations = [],
      subTotal = 0,
      discount = 0,
      vatableAmount = 0,
      vat = 0,
      grandTotal = 0,
      preparedBy = "—",
      approvedBy = "—",
      preparedBySignatureUrl,
      approvedBySignatureUrl,
      onBack,
      onConfirmSave,
      isSaving = false,
    },
    ref,
  ) => {
    const internalRef = useRef<HTMLDivElement>(null);
    const quotationRef =
      (ref as React.RefObject<HTMLDivElement>) || internalRef;

    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
      }).format(value);
    };

    const handleSubmission = async (targetStatus: "DRAFT" | "SENT") => {
      const metadataPayload = {
        quotationDescription: projectDescription,
        items,
        terms: paymentTerms,
        delivery: deliveryTerms,
        warranty: warrantyTerms,
        preparedBy,
        discount,
        quotationNo,
        date,
        validity,
        notations,
        subTotal,
        vatableAmount,
        vat,
        grandTotal,
        status: targetStatus,
        customer,
      };

      if (targetStatus === "DRAFT") {
        onConfirmSave(metadataPayload, undefined as any);
        return;
      }

      const element = quotationRef.current;
      if (!element) {
        toast.error("Quotation visualization canvas element missing.");
        return;
      }

      const toastId = toast.loading(
        "Generating pixel-perfect layout canvas...",
      );

      try {
        const html2canvasPro = (await import("html2canvas-pro")).default;
        const { jsPDF } = await import("jspdf");

        await new Promise((resolve) => setTimeout(resolve, 150));

        const canvas = await html2canvasPro(element, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
        });

        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        const pdf = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4",
        });

        const pdfWidth = 210;
        const pdfHeight = 297;
        const margin = 10;
        const imgWidth = pdfWidth - margin * 2;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        let heightLeft = imgHeight;
        let position = margin;

        pdf.addImage(imgData, "JPEG", margin, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight - margin * 2;

        while (heightLeft > 0) {
          position = heightLeft - imgHeight + margin;
          pdf.addPage();
          pdf.addImage(imgData, "JPEG", margin, position, imgWidth, imgHeight);
          heightLeft -= pdfHeight - margin * 2;
        }

        const pdfBlob = pdf.output("blob");

        toast.dismiss(toastId);
        onConfirmSave(metadataPayload, pdfBlob);
      } catch (err) {
        console.error(err);
        toast.error("Failed to compile layout elements into PDF.", {
          id: toastId,
        });
      }
    };

    return (
      <div className="bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans antialiased text-slate-800 min-h-screen space-y-6 print:bg-white print:p-0 print:min-h-0 print:fixed print:inset-0 print:z-50 print:overflow-y-auto print:block">
        {/* Sticky Controls Panel Header */}
        <div className="max-w-4xl mx-auto flex items-center justify-between bg-white rounded-xl shadow-md border border-slate-100 p-4">
          <Button
            variant="ghost"
            onClick={onBack}
            disabled={isSaving}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Editor
          </Button>

          <div className="flex items-center gap-2">
            <Button
              className="bg-blue-700 hover:bg-blue-800 text-white gap-2"
              disabled={isSaving}
              onClick={() => handleSubmission("SENT")}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send to Client
            </Button>
          </div>
        </div>

        {/* Target Print / Document Render Element Container */}
        <div
          ref={quotationRef}
          className="max-w-4xl mx-auto bg-white rounded-xl shadow-md border border-slate-100 overflow-hidden print:shadow-none print:border-none print:rounded-none print:max-w-full print:w-full print:mx-0 print:my-0"
        >
          <div className="h-2 bg-gradient-to-r from-blue-600 to-indigo-600 print:break-inside-avoid"></div>

          <div className="p-8 sm:p-12 print:p-0">
            {/* Company Brand Block */}
            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-6 border-b border-slate-100 pb-8 print:flex-row print:justify-between print:pb-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 print:text-xl">
                  AERICH INNOVATION CORP.
                </h1>
                <p className="text-sm text-slate-500 mt-1 max-w-sm print:text-xs">
                  BLK 4, LOT 2 Bamboo Orchard Subdivision, Brgy. Banay Banay,
                  Cabuyao City, Laguna
                </p>
                <div className="mt-3 space-y-0.5 text-xs text-slate-500">
                  <p>
                    <span className="font-medium text-slate-700">Email:</span>{" "}
                    aerichinnovationcorp@gmail.com
                  </p>
                  <p>
                    <span className="font-medium text-slate-700">Contact:</span>{" "}
                    09171832745 / 09399063645
                  </p>
                </div>
              </div>

              <div className="text-left md:text-right print:text-right">
                <h2 className="text-4xl font-extrabold tracking-wide text-slate-400 uppercase print:text-2xl">
                  Quotation
                </h2>
                <div className="mt-4 space-y-1 text-sm text-slate-600 print:text-xs print:mt-2">
                  <p>
                    <span className="font-medium text-slate-900">
                      Quotation No:
                    </span>{" "}
                    #{quotationNo}
                  </p>
                  <p>
                    <span className="font-medium text-slate-900">Date:</span>{" "}
                    {date}
                  </p>
                  <p>
                    <span className="font-medium text-slate-900">
                      Valid Until:
                    </span>{" "}
                    {validity}
                  </p>
                </div>
              </div>
            </div>

            {/* Customer Metadata Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 my-8 text-sm print:grid-cols-2 print:gap-4 print:my-4 print:text-xs">
              <div className="bg-slate-50 p-5 rounded-lg border border-slate-100 print:bg-slate-50/50 print:p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 print:text-[10px] print:mb-1">
                  Prepared For
                </h3>
                <p className="font-semibold text-slate-900 text-base print:text-sm">
                  {customer?.contactPerson || "—"}
                </p>
                <p className="text-slate-600 mt-1">
                  {customer?.customerName || "—"}
                </p>
                <p className="text-slate-500 text-xs mt-1 print:text-[11px]">
                  {customer?.address || "—"}
                </p>
                <p className="text-slate-500 text-xs mt-2 print:text-[11px] print:mt-1">
                  {customer?.email || "—"}
                </p>
              </div>

              <div className="bg-slate-50 p-5 rounded-lg border border-slate-100 flex flex-col justify-between print:bg-slate-50/50 print:p-3">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 print:text-[10px]">
                    Project / Description
                  </h3>
                  <p className="font-medium text-slate-900 text-base uppercase print:text-sm">
                    {projectDescription}
                  </p>
                </div>
                <div className="pt-4 border-t border-slate-200/60 mt-4 text-xs text-slate-500 space-y-1 print:pt-2 print:mt-2 print:text-[11px]">
                  <p>
                    <span className="font-medium text-slate-700">
                      Payment Terms:
                    </span>{" "}
                    {paymentTerms}
                  </p>
                  <p>
                    <span className="font-medium text-slate-700">
                      Delivery:
                    </span>{" "}
                    {deliveryTerms}
                  </p>
                  <p>
                    <span className="font-medium text-slate-700">
                      Warranty:
                    </span>{" "}
                    {warrantyTerms}
                  </p>
                </div>
              </div>
            </div>

            {/* Line Items Inventory Listing */}
            <div className="mt-10 overflow-x-auto print:mt-4">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 text-slate-400 text-xs uppercase font-semibold tracking-wider bg-slate-50 print:bg-slate-100 print:text-[11px]">
                    <th className="py-3 px-4 w-[40%] print:py-2 print:px-2">
                      Product Description
                    </th>
                    <th className="py-3 px-4 text-center w-[15%] print:py-2 print:px-2">
                      QTY
                    </th>
                    <th className="py-3 px-4 text-center w-[15%] print:py-2 print:px-2">
                      Unit
                    </th>
                    <th className="py-3 px-4 text-right w-[15%] print:py-2 print:px-2">
                      Price/Unit
                    </th>
                    <th className="py-3 px-4 text-right w-[15%] print:py-2 print:px-2">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700 print:text-xs">
                  {items.map((item, index) => (
                    <tr
                      key={index}
                      className="hover:bg-slate-50/50 print:break-inside-avoid"
                    >
                      <td className="py-4 px-4 font-medium text-slate-900 print:py-2 print:px-2">
                        {item.description}
                      </td>
                      <td className="py-4 px-4 text-center print:py-2 print:px-2">
                        {item.quantity}
                      </td>
                      <td className="py-4 px-4 text-center print:py-2 print:px-2">
                        {item.unit || "—"}
                      </td>
                      <td className="py-4 px-4 text-right print:py-2 print:px-2">
                        {formatCurrency(item.unitPrice)}
                      </td>
                      <td className="py-4 px-4 text-right font-medium text-slate-900 print:py-2 print:px-2">
                        {formatCurrency(item.quantity * item.unitPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary Computations Footer Panel */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-slate-100 print:grid-cols-2 print:gap-4 print:pt-4 print:mt-4 print:break-inside-avoid">
              <div className="space-y-4">
                {notations.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 print:text-[10px] print:mb-1">
                      Notes & Notations
                    </h4>
                    <ol className="list-decimal pl-4 text-xs text-slate-500 space-y-1 print:text-[11px]">
                      {notations.map((note, idx) => (
                        <li key={idx}>{note}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>

              <div className="bg-slate-50/50 p-4 rounded-xl space-y-2 text-sm print:bg-slate-50/30 print:p-3 print:text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subTotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>Discount</span>
                    <span>-{formatCurrency(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-500 text-xs italic print:text-[11px]">
                  <span>Vatable Amount</span>
                  <span>{formatCurrency(vatableAmount)}</span>
                </div>
                <div className="flex justify-between text-slate-500 text-xs italic print:text-[11px]">
                  <span>12% VAT</span>
                  <span>{formatCurrency(vat)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900 print:text-sm print:pt-1">
                  <span>Grand Total</span>
                  <span>{formatCurrency(grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Dynamic Accountability Layout */}
            <div className="mt-16 pt-8 border-t border-slate-100 grid grid-cols-3 gap-8 text-sm print:mt-12 print:pt-4 print:text-xs print:break-inside-avoid">
              {/* Prepared By Block */}
              <div className="flex flex-col justify-between h-32">
                <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold print:text-[10px]">
                  Prepared By
                </p>
                <div>
                  <div className="relative w-full border-b border-slate-300 pb-1">
                    {preparedBySignatureUrl && (
                      <img
                        src={preparedBySignatureUrl}
                        alt="Prepared by signature"
                        className="absolute bottom-0 left-2 h-16 object-contain pointer-events-none data-[html2canvas-ignore]:hidden"
                        style={{ maxWidth: "140px" }}
                      />
                    )}
                  </div>
                  <p className="font-semibold text-slate-900 mt-2">
                    {preparedBy}
                  </p>
                </div>
              </div>

              {/* Approved By Block - only shown when an approver is selected */}
              {approvedBy ? (
                <div className="flex flex-col justify-between items-center text-center h-32">
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold print:text-[10px]">
                    Approved By
                  </p>
                  <div className="w-48 print:w-40">
                    <div className="relative w-full border-b border-slate-300 pb-1">
                      {approvedBySignatureUrl && (
                        <img
                          src={approvedBySignatureUrl}
                          alt="Approved by signature"
                          className="absolute bottom-0 left-1/2 -translate-x-1/2 h-16 object-contain pointer-events-none data-[html2canvas-ignore]:hidden"
                          style={{ maxWidth: "140px" }}
                        />
                      )}
                    </div>
                    <p className="font-semibold text-slate-900 mt-2 uppercase">
                      {approvedBy}
                    </p>
                  </div>
                </div>
              ) : (
                <div></div>
              )}

              {/* Client Acceptance Block */}
              <div className="flex flex-col justify-between items-end text-right h-32">
                <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold print:text-[10px]">
                  Client Acceptance
                </p>
                <div className="w-48 print:w-40">
                  <div className="border-b border-slate-300 pb-1">
                    <div className="h-7"></div>
                  </div>
                  <p className="text-[11px] text-slate-400 uppercase tracking-wider mt-2 print:text-[10px]">
                    Authorized Signature / Date
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

QuotationTemplate.displayName = "QuotationTemplate";
