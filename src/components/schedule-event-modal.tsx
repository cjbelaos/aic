"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  FileUp,
  Link2,
  Loader2,
  Paperclip,
  User,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ScheduleEntry,
  CreateSchedulePayload,
  FTILinkOption,
} from "@/types/schedule";
import { format } from "date-fns";

interface ScheduleEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate: Date;
  technicians: string[];
  ftiOptions: FTILinkOption[];
  entry: ScheduleEntry | null; // null = create mode
  onSave: (
    payload: CreateSchedulePayload,
    entryId?: string,
  ) => Promise<ScheduleEntry | null>;
  onUpload: (
    file: File,
    kind: "deliveryReport" | "serviceInvoice",
    entryId: string,
    customerName: string,
    date: string,
  ) => Promise<string | null>;
}

export function ScheduleEventModal({
  open,
  onOpenChange,
  initialDate,
  technicians,
  ftiOptions,
  entry,
  onSave,
  onUpload,
}: ScheduleEventModalProps) {
  const [controlNo, setControlNo] = useState("");
  const [technician, setTechnician] = useState("");
  const [date, setDate] = useState(format(initialDate, "yyyy-MM-dd"));
  const [customerName, setCustomerName] = useState("");
  const [description, setDescription] = useState("");
  const [ftiStatus, setFtiStatus] = useState("");
  const [deliveryReportLink, setDeliveryReportLink] = useState("");
  const [serviceInvoiceLink, setServiceInvoiceLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<
    "deliveryReport" | "serviceInvoice" | null
  >(null);

  const filteredOptions = useMemo(() => {
    if (!technician) return ftiOptions;
    return ftiOptions.filter((o) => o.technician === technician);
  }, [technician, ftiOptions]);

  useEffect(() => {
    if (!open) return;
    if (entry) {
      setControlNo(entry.controlNo);
      setTechnician(entry.technician);
      setDate(entry.date);
      setCustomerName(entry.customerName);
      setDescription(entry.description || "");
      setFtiStatus(entry.ftiStatus || "");
      setDeliveryReportLink(entry.deliveryReportLink || "");
      setServiceInvoiceLink(entry.serviceInvoiceLink || "");
    } else {
      setControlNo("");
      setTechnician("");
      setDate(format(initialDate, "yyyy-MM-dd"));
      setCustomerName("");
      setDescription("");
      setFtiStatus("");
      setDeliveryReportLink("");
      setServiceInvoiceLink("");
    }
  }, [open, entry, initialDate]);

  const handleSelectOption = (value: string) => {
    const option = ftiOptions.find((o) => o.controlNo === value);
    if (!option) return;
    setControlNo(option.controlNo);
    setTechnician(option.technician);
    setDate(option.date);
    setCustomerName(option.customerName);
    setDescription(option.description || "");
    setFtiStatus(option.status || "");
  };

  const handleSave = async () => {
    if (!controlNo || !date || !technician || !customerName) {
      toast.error("Please select an FTI, technician, date, and customer.");
      return;
    }
    setSaving(true);
    try {
      await onSave(
        {
          controlNo,
          detailId: controlNo,
          date,
          technician,
          customerName,
          description,
          ftiStatus,
          deliveryReportLink: deliveryReportLink || undefined,
          serviceInvoiceLink: serviceInvoiceLink || undefined,
        },
        entry?.id,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save schedule entry.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (
    kind: "deliveryReport" | "serviceInvoice",
    file: File,
  ) => {
    if (!entry) {
      toast.error("Save the entry first before uploading attachments.");
      return;
    }
    setUploading(kind);
    try {
      const link = await onUpload(
        file,
        kind,
        entry.id,
        entry.customerName,
        entry.date,
      );
      if (link) {
        if (kind === "deliveryReport") setDeliveryReportLink(link);
        else setServiceInvoiceLink(link);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {entry ? "Edit Schedule Entry" : "New Schedule Entry"}
          </DialogTitle>
          <DialogDescription>
            Link an FTI, then attach Delivery Report / Service Invoice PDFs.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* FTI selector */}
          <div className="grid gap-2">
            <Label htmlFor="fti-option">FTI Reference (customer + date)</Label>
            <Select value={controlNo} onValueChange={handleSelectOption}>
              <SelectTrigger id="fti-option">
                <SelectValue placeholder="Select an FTI row…" />
              </SelectTrigger>
              <SelectContent>
                {filteredOptions.map((o) => (
                  <SelectItem key={o.controlNo} value={o.controlNo}>
                    {o.controlNo} — {o.customerName} ({o.date})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Technician */}
          <div className="grid gap-2">
            <Label>Technician</Label>
            <Select
              value={technician}
              onValueChange={(v) => setTechnician(v === "ALL" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filter by technician…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All technicians</SelectItem>
                {technicians.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date + Customer */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Customer Name</Label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer / company"
              />
            </div>
          </div>

          {/* Description */}
          <div className="grid gap-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Work performed, service notes…"
            />
          </div>

          {/* Attachment uploads */}
          <div className="grid gap-3 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Paperclip className="h-4 w-4" />
              Attachments
            </div>

            <div className="grid gap-2">
              <Label className="text-xs">
                Delivery Report
                {deliveryReportLink && (
                  <a
                    href={deliveryReportLink}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    <Link2 className="h-3 w-3" /> view
                  </a>
                )}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="application/pdf"
                  className="h-9 text-xs file:h-9"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload("deliveryReport", f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-xs">
                Service Invoice
                {serviceInvoiceLink && (
                  <a
                    href={serviceInvoiceLink}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    <Link2 className="h-3 w-3" /> view
                  </a>
                )}
              </Label>
              <Input
                type="file"
                accept="application/pdf"
                className="h-9 text-xs file:h-9"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload("serviceInvoice", f);
                  e.target.value = "";
                }}
              />
            </div>

            {uploading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Uploading{" "}
                {uploading === "deliveryReport"
                  ? "Delivery Report"
                  : "Service Invoice"}
                …
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !!uploading}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              "Save Entry"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ScheduleEventModal;
