"use client";

import { useEffect, useState, useCallback } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Eye, Pencil, Trash2, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { Button } from "@/components/ui/button";
import { EntityTable } from "@/components/ui/entity-table";
import {
  QuotationForm,
  QuotationFormPayload,
} from "@/components/quotation-form";
import { QuotationTemplate } from "@/components/quotation-template";
import quotationService, {
  SaveQuotationPayload,
} from "@/lib/services/quotation.service";
import { Quotation } from "@/types/quotation";
import { Customer } from "@/types/customer";

// Exports data safely using ExcelJS buffer streams
function exportToExcel(rows: Quotation[]) {
  if (rows.length === 0) {
    toast.error("No quotation records found to export.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Quotations");

  worksheet.columns = [
    { header: "Customer", key: "customer", width: 25 },
    { header: "Description", key: "description", width: 25 },
    { header: "Amount", key: "amount", width: 20 },
    { header: "Discount", key: "discount", width: 15 },
    { header: "Reference Number", key: "quotationNo", width: 25 },
    { header: "File", key: "file", width: 25 },
    { header: "Date", key: "date", width: 15 },
    { header: "Prepared By", key: "preparedBy", width: 35 },
    { header: "Approved By", key: "approvedBy", width: 35 },
    { header: "Sent By", key: "sentBy", width: 35 },
    { header: "Status", key: "status", width: 20 },
  ];

  rows.forEach((r) => {
    worksheet.addRow({
      customer: (r.customer as any)?.customerName || r.customer,
      description: r.description,
      amount: r.amount,
      discount: r.discount || 0,
      quotationNo: r.quotationNo,
      file: r.file,
      date: r.date,
      preparedBy: r.preparedBy,
      approvedBy: r.approvedBy,
      sentBy: r.sentBy,
      status: r.status || "DRAFT",
    });
  });

  workbook.xlsx
    .writeBuffer()
    .then((buffer) => {
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "quotations.xlsx";
      link.click();
      window.URL.revokeObjectURL(url);
    })
    .catch((err) => {
      console.error("Excel generation failed:", err);
      toast.error("Failed to generate Excel download file.");
    });
}

interface ImportQuotationRow {
  customer: string;
  description: string;
  amount: number;
  discount: number;
  quotationNo: string;
  file: string;
  date: string;
  preparedBy: string;
  approvedBy?: string;
}

type ViewMode = "list" | "create" | "view" | "edit";

export default function QuotationsPage() {
  const [data, setData] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(
    null,
  );
  const [viewQuotationData, setViewQuotationData] =
    useState<QuotationFormPayload | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  const loadQuotations = async () => {
    try {
      const quotations = await quotationService.getAll();
      setData(quotations);
    } catch {
      toast.error("Failed to load quotations.");
    }
  };

  useEffect(() => {
    loadQuotations().finally(() => setLoading(false));
  }, []);

  /** Convert a Quotation from the API/Sheets into QuotationFormPayload for the form */
  const toFormPayload = useCallback((quot: Quotation): QuotationFormPayload => {
    let parsedDate: Date;
    try {
      parsedDate = quot.date ? new Date(quot.date) : new Date();
      if (isNaN(parsedDate.getTime())) parsedDate = new Date();
    } catch {
      parsedDate = new Date();
    }

    const customer: Customer = {
      id: "",
      customerName:
        typeof quot.customer === "object" && quot.customer !== null
          ? (quot.customer as any).customerName || String(quot.customer)
          : String(quot.customer || ""),
      contactPerson: "",
      address: "",
      email: "",
      contactNumber: "",
      tin: "",
    };

    if (typeof quot.customer === "object" && quot.customer !== null) {
      const c = quot.customer as any;
      customer.contactPerson = c.contactPerson || "";
      customer.address = c.address || "";
      customer.email = c.email || "";
      customer.contactNumber = c.contactNumber || "";
      customer.tin = c.tin || "";
      customer.id = c.id || "";
    }

    return {
      quotationNo: quot.quotationNo || "",
      date: parsedDate,
      validity: new Date(parsedDate.getTime() + 90 * 24 * 60 * 60 * 1000),
      customer,
      quotationDescription: quot.description || "",
      items: (quot.items || []).map((item) => ({
        quotationNo: item.quotationNo,
        description: item.description || "",
        quantity: item.quantity || 0,
        unit: item.unit || "",
        unitPrice: item.unitPrice || 0,
      })),
      notations: quot.notation || [],
      subTotal: quot.items
        ? (quot.items as any[]).reduce(
            (sum: number, item: any) =>
              sum + (item.quantity || 0) * (item.unitPrice || 0),
            0,
          )
        : quot.amount || 0,
      discount: quot.discount || 0,
      terms: quot.terms || "",
      delivery: quot.delivery || "",
      warranty: quot.warranty || "",
      preparedBy: quot.preparedBy || "",
      approvedBy: quot.approvedBy || "",
      status: quot.status || "DRAFT",
      vat: 0,
      vatableAmount: 0,
      grandTotal: Math.max(
        ((quot.items as any[]) || []).reduce(
          (sum: number, item: any) =>
            sum + (item.quantity || 0) * (item.unitPrice || 0),
          0,
        ) - (quot.discount || 0),
        0,
      ),
    };
  }, []);

  /** Handle "View" action - fetch full quot data and show read-only */
  const handleView = async (quot: Quotation) => {
    try {
      setLoading(true);
      let fullQuot = await quotationService.getByRefNo(quot.quotationNo);
      if (!fullQuot) {
        fullQuot = quot;
      }
      const payload = toFormPayload(fullQuot);
      setSelectedQuotation(fullQuot);
      setViewQuotationData(payload);
      setViewMode("view");
    } catch {
      const payload = toFormPayload(quot);
      setSelectedQuotation(quot);
      setViewQuotationData(payload);
      setViewMode("view");
    } finally {
      setLoading(false);
    }
  };

  /** Handle "Edit" action - load into editable form */
  const handleEdit = async (quot: Quotation) => {
    try {
      setLoading(true);
      let fullQuot = await quotationService.getByRefNo(quot.quotationNo);
      if (!fullQuot) fullQuot = quot;
      const payload = toFormPayload(fullQuot);
      setSelectedQuotation(fullQuot);
      setViewQuotationData(payload);
      setViewMode("edit");
    } catch {
      const payload = toFormPayload(quot);
      setSelectedQuotation(quot);
      setViewQuotationData(payload);
      setViewMode("edit");
    } finally {
      setLoading(false);
    }
  };

  /** Handle "Delete" action */
  const handleDelete = async (quotationNo: string) => {
    if (!window.confirm("Are you sure you want to delete this quotation?"))
      return;
    try {
      setSaving(true);
      await quotationService.deleteByRefNo(quotationNo);
      toast.success("Quotation deleted successfully.");
      setViewMode("list");
      setSelectedQuotation(null);
      setViewQuotationData(null);
      await loadQuotations();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete quotation.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  /**
   * FORM SUBMISSION HANDLER
   * Handles both create and edit modes with simplified flow:
   * - CREATE: Saves new quotation with DRAFT or SENT status
   * - EDIT: Updates existing quotation
   */
  const handleFormSubmit = async (
    formPayload: QuotationFormPayload,
    pdfBlob?: Blob,
    statusOnly?: boolean,
  ) => {
    setSaving(true);

    try {
      // Check if status-only update (from view mode Send to Client)
      if (statusOnly && selectedQuotation) {
        // ===== STATUS-ONLY: Update status to SENT =====
        await quotationService.updateStatusOnly(
          selectedQuotation.quotationNo,
          "SENT",
        );

        // Send email if PDF blob is provided
        if (pdfBlob) {
          try {
            const customerName = formPayload.customer?.customerName || "";
            const customerEmail = formPayload.customer?.email || "";

            if (customerEmail) {
              const emailResult = await quotationService.sendEmail({
                quotationNo: selectedQuotation.quotationNo,
                customer: customerName,
                email: customerEmail,
                quotationDescription: formPayload.quotationDescription,
                grandTotal: formPayload.grandTotal,
                pdfBlob: pdfBlob,
              });

              if (emailResult.success) {
                toast.success(
                  `Quotation sent successfully to ${customerName}.`,
                );
              } else {
                toast.error("Status updated but email failed to send.");
              }
            } else {
              toast.warning(
                "No email address found for customer. Status updated but email not sent.",
              );
            }
          } catch (emailError) {
            console.error("Email send error:", emailError);
            toast.error("Status updated but email failed to send.");
          }
        } else {
          toast.success("Quotation sent successfully.");
        }

        setViewMode("list");
        setSelectedQuotation(null);
        setViewQuotationData(null);
        await loadQuotations();
        return;
      }

      // Check if we're in edit mode (has selectedQuotation)
      if (selectedQuotation && viewMode === "edit") {
        // ===== EDIT MODE: Update existing quotation =====
        const quotationNo = selectedQuotation.quotationNo;

        const updatePayload = {
          customer: formPayload.customer?.customerName || "",
          description: formPayload.quotationDescription || "",
          amount: formPayload.grandTotal || 0,
          discount: formPayload.discount || 0,
          quotationNo: quotationNo,
          file: selectedQuotation.file || "",
          date: formPayload.date?.toISOString().split("T")[0] || "",
          preparedBy: formPayload.preparedBy || "",
          approvedBy: selectedQuotation.approvedBy || "",
          sentBy: selectedQuotation.sentBy || "",
          items: formPayload.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
          })),
          notation: formPayload.notations || [],
          terms: formPayload.terms || "",
          delivery: formPayload.delivery || "",
          warranty: formPayload.warranty || "",
          status: formPayload.status || "DRAFT",
        };

        await quotationService.updateByRefNo(quotationNo, updatePayload as any);
        toast.success("Quotation updated successfully.");

        setViewMode("list");
        setSelectedQuotation(null);
        setViewQuotationData(null);
        await loadQuotations();
        return;
      }

      // ===== CREATE MODE: New quotation =====
      // Ensure validity is a valid date
      let validUntilDate = formPayload.validity;
      if (!validUntilDate || isNaN(validUntilDate.getTime())) {
        const date = formPayload.date || new Date();
        validUntilDate = new Date(date.getTime() + 90 * 24 * 60 * 60 * 1000);
      }

      // Determine status based on form status
      const finalStatus = formPayload.status === "SENT" ? "SENT" : "DRAFT";

      // Prepare save payload
      const payload: SaveQuotationPayload = {
        customer: formPayload.customer,
        quotationDescription: formPayload.quotationDescription || "",
        items: formPayload.items || [],
        terms: formPayload.terms || "",
        delivery: formPayload.delivery || "",
        warranty: formPayload.warranty || "",
        preparedBy: formPayload.preparedBy || "",
        approvedBy: formPayload.approvedBy || "",
        discount: formPayload.discount || 0,
        quotationNo: formPayload.quotationNo || "",
        dateIssued:
          formPayload.date?.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }) || "",
        validUntil:
          validUntilDate?.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }) || "",
        notations: formPayload.notations || [],
        subTotal: formPayload.subTotal || 0,
        vatableAmount: formPayload.vatableAmount || 0,
        vat: formPayload.vat || 0,
        grandTotal: formPayload.grandTotal || 0,
        status: finalStatus,
      };
      console.log(payload);
      // Save the quotation first (sends PDF to Drive if SENT and pdfBlob provided)
      const result = await quotationService.saveQuotation(payload, pdfBlob);

      if (!result.success) {
        toast.error(result.message || "Failed to save quotation.");
        return;
      }

      // If status is SENT and we have a PDF blob, also send the email
      if (finalStatus === "SENT" && pdfBlob) {
        try {
          const customerName = formPayload.customer?.customerName || "";
          const customerEmail = formPayload.customer?.email || "";

          if (!customerEmail) {
            toast.warning(
              "No email address found for customer. Quotation saved but email not sent.",
            );
          } else {
            const emailResult = await quotationService.sendEmail({
              quotationNo: payload.quotationNo,
              customer: customerName,
              email: customerEmail,
              quotationDescription: payload.quotationDescription,
              grandTotal: payload.grandTotal,
              pdfBlob: pdfBlob,
            });

            if (emailResult.success) {
              toast.success(`Quotation sent successfully to ${customerName}.`);
            } else {
              toast.error("Quotation saved but email failed to send.");
            }
          }
        } catch (emailError) {
          console.error("Email send error:", emailError);
          toast.error("Quotation saved but email failed to send.");
        }
      } else if (finalStatus === "SENT" && !pdfBlob) {
        toast.warning(
          "Quotation marked as SENT but no PDF was generated for Drive upload or email.",
        );
      }

      setViewMode("list");
      setSelectedQuotation(null);
      setViewQuotationData(null);
      await loadQuotations();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save quotation.";
      toast.error(message);
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  /** Handle Import */
  const handleImport = async (file: File) => {
    let toastId: string | number | undefined;

    try {
      const dataBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(dataBuffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        toast.error("The selected workbook contains no worksheets.");
        return;
      }

      const quotationsToImport: ImportQuotationRow[] = [];
      const headers: string[] = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          row.eachCell((cell) => {
            headers.push(String(cell.value || "").trim());
          });
          return;
        }

        const rowData: Record<string, any> = {};
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const headerName = headers[colNumber - 1];
          if (headerName) {
            let cellValue = cell.value;
            if (
              cellValue &&
              typeof cellValue === "object" &&
              "result" in cellValue
            ) {
              cellValue = (cellValue as any).result;
            }
            rowData[headerName] = cellValue;
          }
        });

        quotationsToImport.push({
          customer: String(rowData["Customer"] || "").trim(),
          description: String(rowData["Description"] || "").trim(),
          amount: parseFloat(rowData["Amount"]) || 0,
          discount: parseFloat(rowData["Discount"]) || 0,
          quotationNo: String(
            rowData["Reference Number"] || rowData["RefNo"] || "",
          ).trim(),
          file: String(rowData["File"] || "").trim(),
          date: String(rowData["Date"] || "").trim(),
          preparedBy: String(
            rowData["Prepared By"] || rowData["PreparedBy"] || "",
          ).trim(),
        });
      });

      if (quotationsToImport.length === 0) {
        toast.error("No valid quotation found inside the selected workbook.");
        return;
      }

      toastId = toast.loading("Importing records...");

      let successCount = 0;
      let failCount = 0;

      for (const quotation of quotationsToImport) {
        try {
          const importPayload: QuotationFormPayload = {
            quotationNo: quotation.quotationNo || "",
            date: new Date(),
            validity: new Date(),
            customer: {
              id: "",
              customerName: quotation.customer,
              contactPerson: "",
              address: "",
              email: "",
              contactNumber: "",
              tin: "",
            },
            quotationDescription: quotation.description || "",
            items: [],
            subTotal: quotation.amount || 0,
            discount: quotation.discount || 0,
            terms: "",
            delivery: "",
            warranty: "",
            preparedBy: quotation.preparedBy || "",
            approvedBy: quotation.approvedBy || "",
            status: "DRAFT",
            vat: 0,
            vatableAmount: 0,
            grandTotal: quotation.amount || 0,
          };

          const importApiPayload: SaveQuotationPayload = {
            customer: importPayload.customer,
            quotationDescription: importPayload.quotationDescription || "",
            items: importPayload.items || [],
            terms: importPayload.terms || "",
            delivery: importPayload.delivery || "",
            warranty: importPayload.warranty || "",
            preparedBy: importPayload.preparedBy || "",
            discount: importPayload.discount || 0,
            quotationNo: importPayload.quotationNo || "",
            dateIssued:
              importPayload.date?.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }) || "",
            validUntil:
              importPayload.validity?.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }) || "",
            notations: importPayload.notations || [],
            subTotal: importPayload.subTotal || 0,
            vatableAmount: importPayload.vatableAmount || 0,
            vat: importPayload.vat || 0,
            grandTotal: importPayload.grandTotal || 0,
            status: "DRAFT",
          };

          const res = await quotationService.saveQuotation(importApiPayload);
          if (res.success) successCount++;
          else failCount++;
        } catch {
          failCount++;
        }
      }

      await loadQuotations();

      if (failCount === 0) {
        toast.success(`Successfully imported ${successCount} quotations.`, {
          id: toastId,
        });
      } else {
        toast.warning(
          `Imported ${successCount} quotations. ${failCount} failed.`,
          { id: toastId },
        );
      }
    } catch (err) {
      console.error("Import error:", err);
      toast.error("Failed to complete workbook import parsing layout.", {
        id: toastId,
      });
    }
  };

  const handleBackToList = () => {
    setViewMode("list");
    setSelectedQuotation(null);
    setViewQuotationData(null);
  };

  /**
   * Build columns dynamically
   */
  const columns: ColumnDef<Quotation>[] = [
    {
      accessorKey: "quotationNo",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Quotation No <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      ),
    },
    {
      accessorKey: "customer",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Customer <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="text-blue-600 font-medium">
          {(row.original.customer as any)?.customerName ??
            row.original.customer ??
            ""}
        </span>
      ),
    },
    {
      accessorKey: "description",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Description <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      ),
    },
    {
      accessorKey: "amount",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Amount <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => {
        const val = row.original.amount || 0;
        return new Intl.NumberFormat("en-PH", {
          style: "currency",
          currency: "PHP",
        }).format(val);
      },
    },
    {
      accessorKey: "discount",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Discount <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => {
        const val = row.original.discount || 0;
        return new Intl.NumberFormat("en-PH", {
          style: "currency",
          currency: "PHP",
        }).format(val);
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Status <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => {
        const status = row.original.status || "DRAFT";
        const statusColors = {
          DRAFT: "bg-yellow-100 text-yellow-800",
          SENT: "bg-green-100 text-green-800",
        };
        return (
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${
              statusColors[status as keyof typeof statusColors] ||
              "bg-gray-100 text-gray-800"
            }`}
          >
            {status}
          </span>
        );
      },
    },
    {
      accessorKey: "file",
      header: "File",
      cell: ({ row }) => {
        const url = row.original.file;
        const status = row.original.status || "DRAFT";

        if (status === "SENT" && url) {
          return (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline text-xs"
            >
              View File
            </a>
          );
        }

        if (status === "DRAFT") {
          return (
            <span className="text-yellow-600 text-xs">Draft (No File)</span>
          );
        }

        return <span className="text-muted-foreground text-xs">—</span>;
      },
    },
    {
      accessorKey: "date",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Date <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      ),
    },
    {
      accessorKey: "preparedBy",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Prepared By <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  // Add actions column - show Edit/Delete for DRAFT quotations only
  columns.push({
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const status = row.original.status || "DRAFT";
      const isSent = status === "SENT";

      return (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="View"
            onClick={() => handleView(row.original)}
          >
            <Eye className="h-4 w-4" />
          </Button>

          {/* Edit button - only for DRAFT quotations */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-blue-600"
            title={isSent ? "Cannot edit sent quotation" : "Edit"}
            onClick={() => handleEdit(row.original)}
            disabled={isSent}
          >
            <Pencil className="h-4 w-4" />
          </Button>

          {/* Delete button - only for DRAFT quotations */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            title={isSent ? "Cannot delete sent quotation" : "Delete"}
            onClick={() => handleDelete(row.original.quotationNo)}
            disabled={isSent}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      );
    },
  });

  // Render: Create Mode
  if (viewMode === "create") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Create Quotation</h1>
          <Button
            variant="outline"
            onClick={handleBackToList}
            disabled={saving}
          >
            Back to List
          </Button>
        </div>
        <QuotationForm
          onSubmit={handleFormSubmit}
          onCancel={handleBackToList}
          isSaving={saving}
        />
      </div>
    );
  }

  // Render: View Mode - Preview (template with Send to Client)
  if (viewMode === "view" && viewQuotationData && previewMode) {
    const formattedDate =
      viewQuotationData.date?.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }) || "";
    const formattedValidity =
      viewQuotationData.validity?.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }) || "";

    return (
      <QuotationTemplate
        quotationNo={viewQuotationData.quotationNo}
        date={formattedDate}
        validity={formattedValidity}
        customer={viewQuotationData.customer}
        projectDescription={viewQuotationData.quotationDescription}
        items={viewQuotationData.items}
        paymentTerms={viewQuotationData.terms}
        deliveryTerms={viewQuotationData.delivery}
        warrantyTerms={viewQuotationData.warranty}
        notations={
          Array.isArray(viewQuotationData.notations)
            ? viewQuotationData.notations.map((n: any) =>
                typeof n === "string" ? n : n.notation || "",
              )
            : []
        }
        subTotal={viewQuotationData.subTotal}
        discount={viewQuotationData.discount}
        vatableAmount={viewQuotationData.vatableAmount}
        vat={viewQuotationData.vat}
        grandTotal={viewQuotationData.grandTotal}
        preparedBy={viewQuotationData.preparedBy}
        approvedBy={viewQuotationData.approvedBy}
        onBack={() => setPreviewMode(false)}
        onConfirmSave={(payload, pdfBlob) =>
          handleFormSubmit(payload, pdfBlob, true)
        }
        isSaving={saving}
      />
    );
  }

  // Render: View Mode (read-only)
  if (viewMode === "view" && viewQuotationData) {
    const isSent = selectedQuotation?.status === "SENT";

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">View Quotation</h1>
          <div className="flex gap-2">
            {/* Preview button */}
            {!isSent && (
              <Button
                variant="outline"
                onClick={() => setPreviewMode(true)}
                disabled={saving}
                className="gap-2 border-blue-600 text-blue-600"
              >
                <Eye className="h-4 w-4" />
                Preview
              </Button>
            )}

            {/* Edit button - only for DRAFT quotations */}
            {!isSent && (
              <Button
                variant="outline"
                onClick={() => {
                  if (selectedQuotation) handleEdit(selectedQuotation);
                }}
                disabled={saving}
                className="gap-2"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            )}

            <Button
              variant="outline"
              onClick={handleBackToList}
              disabled={saving}
            >
              Back to List
            </Button>
          </div>
        </div>
        <QuotationForm
          initialData={viewQuotationData}
          onSubmit={handleFormSubmit}
          onCancel={handleBackToList}
          onDelete={
            selectedQuotation && !isSent
              ? () => handleDelete(selectedQuotation.quotationNo)
              : undefined
          }
          isSaving={saving}
          readOnly={true}
          isViewMode={true}
        />
      </div>
    );
  }

  // Render: Edit Mode
  if (viewMode === "edit" && viewQuotationData) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Edit Quotation</h1>
          <Button
            variant="outline"
            onClick={handleBackToList}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
        <QuotationForm
          initialData={viewQuotationData}
          onSubmit={handleFormSubmit}
          onCancel={handleBackToList}
          isSaving={saving}
          readOnly={false}
        />
      </div>
    );
  }

  // Default: List Mode
  return (
    <EntityTable
      title="Quotation List"
      columns={columns}
      data={data}
      loading={loading}
      onCreateNew={() => setViewMode("create")}
      onExport={exportToExcel}
      onImport={handleImport}
    />
  );
}
