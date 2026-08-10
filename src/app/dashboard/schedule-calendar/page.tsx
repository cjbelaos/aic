"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduleCalendar } from "@/components/schedule-calendar";
import { ScheduleEventModal } from "@/components/schedule-event-modal";
import scheduleService from "@/lib/services/schedule.service";
import type {
  ScheduleEntry,
  CreateSchedulePayload,
  FTILinkOption,
} from "@/types/schedule";

export default function ScheduleCalendarPage() {
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [ftiOptions, setFtiOptions] = useState<FTILinkOption[]>([]);
  const [technicians, setTechnicians] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState(new Date());
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntry | null>(
    null,
  );

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [entriesData, optionsData] = await Promise.all([
        scheduleService.getEntries(),
        scheduleService.getFTILinkOptions(),
      ]);
      setEntries(entriesData);
      setFtiOptions(optionsData);
      const techs = Array.from(
        new Set([
          ...entriesData.map((e) => e.technician),
          ...optionsData.map((o) => o.technician),
        ]),
      ).filter(Boolean);
      setTechnicians(techs);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load schedule.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSave = async (
    payload: CreateSchedulePayload,
    entryId?: string,
  ): Promise<ScheduleEntry | null> => {
    const saved = entryId
      ? await scheduleService.updateEntry(entryId, payload)
      : await scheduleService.createEntry(payload);
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === saved.id);
      if (idx === -1) return [saved, ...prev];
      const next = [...prev];
      next[idx] = saved;
      return next;
    });
    toast.success(
      entryId ? "Schedule entry updated." : "Schedule entry created.",
    );
    return saved;
  };

  const handleUpload = async (
    file: File,
    kind: "deliveryReport" | "serviceInvoice",
    entryId: string,
    customerName: string,
    date: string,
  ): Promise<string | null> => {
    const res = await scheduleService.uploadAttachment(
      file,
      kind,
      entryId,
      customerName,
      date,
    );
    toast.success("Attachment uploaded to Google Drive.");
    return res.fileLink;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Schedule Calendar</h1>
        <p className="text-sm text-muted-foreground">
          Link technician FTIs and attach Delivery Reports / Service Invoices.
        </p>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Field Technician Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleCalendar
            entries={entries}
            technicians={technicians}
            loading={loading}
            onSelectDay={(d) => {
              setModalDate(d);
              setSelectedEntry(null);
              setModalOpen(true);
            }}
            onSelectEntry={(e) => {
              setSelectedEntry(e);
              setModalOpen(true);
            }}
            onCreateEntry={(d) => {
              setModalDate(d);
              setSelectedEntry(null);
              setModalOpen(true);
            }}
          />
        </CardContent>
      </Card>
      <ScheduleEventModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initialDate={modalDate}
        technicians={technicians}
        ftiOptions={ftiOptions}
        entry={selectedEntry}
        onSave={handleSave}
        onUpload={handleUpload}
      />
    </div>
  );
}
