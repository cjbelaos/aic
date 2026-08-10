"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ScheduleEntry } from "@/types/schedule";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";

type ViewMode = "month" | "week" | "day";

const COLORS = [
  "bg-blue-100 text-blue-800 border-blue-200",
  "bg-green-100 text-green-800 border-green-200",
  "bg-purple-100 text-purple-800 border-purple-200",
  "bg-amber-100 text-amber-800 border-amber-200",
  "bg-rose-100 text-rose-800 border-rose-200",
  "bg-cyan-100 text-cyan-800 border-cyan-200",
];

function technicianColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return COLORS[hash % COLORS.length];
}

interface ScheduleCalendarProps {
  entries: ScheduleEntry[];
  technicians: string[];
  loading: boolean;
  onSelectDay: (date: Date) => void;
  onSelectEntry: (entry: ScheduleEntry) => void;
  onCreateEntry: (date: Date) => void;
}

export function ScheduleCalendar({
  entries,
  technicians,
  loading,
  onSelectDay,
  onSelectEntry,
  onCreateEntry,
}: ScheduleCalendarProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [technicianFilter, setTechnicianFilter] = useState("ALL");

  const filteredEntries = useMemo(() => {
    if (technicianFilter === "ALL") return entries;
    return entries.filter((e) => e.technician === technicianFilter);
  }, [entries, technicianFilter]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, ScheduleEntry[]>();
    for (const e of filteredEntries) {
      const key = e.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [filteredEntries]);

  const navigate = (dir: 1 | -1) => {
    setCurrentDate((prev) => {
      if (viewMode === "month") return addMonths(prev, dir);
      if (viewMode === "week") return addDays(prev, dir * 7);
      return addDays(prev, dir);
    });
  };

  const goToday = () => setCurrentDate(new Date());

  const headerLabel =
    viewMode === "month"
      ? format(currentDate, "MMMM yyyy")
      : viewMode === "week"
        ? `${format(startOfWeek(currentDate), "MMM d")} – ${format(
            endOfWeek(currentDate),
            "MMM d, yyyy",
          )}`
        : format(currentDate, "EEEE, MMMM d, yyyy");

  const monthCells = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 });
    const days: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
    return days;
  }, [currentDate]);

  const weekCells = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 0 });
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) days.push(addDays(start, i));
    return days;
  }, [currentDate]);

  const renderEntriesForDay = (day: Date, maxItems?: number) => {
    const key = format(day, "yyyy-MM-dd");
    const dayEntries = entriesByDate.get(key) || [];
    const visible = maxItems ? dayEntries.slice(0, maxItems) : dayEntries;
    const hidden = maxItems ? dayEntries.length - visible.length : 0;

    return (
      <>
        {visible.map((e) => (
          <button
            key={e.id}
            onClick={(ev) => {
              ev.stopPropagation();
              onSelectEntry(e);
            }}
            className={`flex w-full items-start gap-1 rounded px-1.5 py-0.5 text-left text-xs leading-tight hover:brightness-95 ${technicianColor(
              e.technician,
            )} border`}
            title={`${e.technician} — ${e.customerName}`}
          >
            <span className="truncate font-medium">{e.customerName}</span>
            {e.deliveryReportLink && <span title="Delivery Report">PDF</span>}
            {e.serviceInvoiceLink && <span title="Service Invoice">INV</span>}
          </button>
        ))}
        {hidden > 0 && (
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              onSelectDay(day);
            }}
            className="w-full rounded px-1.5 py-0.5 text-left text-xs text-muted-foreground hover:bg-muted"
          >
            +{hidden} more
          </button>
        )}
      </>
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigate(-1)}
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigate(1)}
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <h2 className="text-lg font-semibold">{headerLabel}</h2>
        </div>

        <div className="flex items-center gap-2">
          <Select value={technicianFilter} onValueChange={setTechnicianFilter}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue placeholder="All technicians" />
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

          <div className="flex items-center rounded-full border p-0.5">
            {(["month", "week", "day"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`rounded-full px-3 py-1 text-sm capitalize transition-colors ${
                  viewMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <Button size="sm" onClick={() => onCreateEntry(currentDate)}>
            <Plus className="mr-1 h-4 w-4" /> New
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading schedule…
        </div>
      )}

      {!loading && viewMode === "month" && (
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div
              key={d}
              className="bg-muted/50 px-2 py-1 text-center text-xs font-semibold text-muted-foreground"
            >
              {d}
            </div>
          ))}
          {monthCells.map((day) => {
            const isToday = isSameDay(day, new Date());
            const inMonth = isSameMonth(day, currentDate);
            return (
              <div
                key={day.toISOString()}
                onClick={() => onSelectDay(day)}
                className={`min-h-24 cursor-pointer bg-background p-1 transition-colors hover:bg-muted/40 ${!inMonth ? "opacity-40" : ""}`}
              >
                <div
                  className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? "bg-primary font-bold text-primary-foreground" : "text-muted-foreground"}`}
                >
                  {format(day, "d")}
                </div>
                <div className="space-y-0.5">{renderEntriesForDay(day, 3)}</div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && viewMode === "week" && (
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
          {weekCells.map((day) => (
            <div key={day.toISOString()} className="bg-background">
              <div className="border-b px-2 py-1">
                <div className="text-xs font-medium text-muted-foreground">
                  {format(day, "EEE")}
                </div>
                <div
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm ${isSameDay(day, new Date()) ? "bg-primary font-bold text-primary-foreground" : ""}`}
                >
                  {format(day, "d")}
                </div>
              </div>
              <div className="space-y-1 p-1" onClick={() => onSelectDay(day)}>
                {renderEntriesForDay(day)}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && viewMode === "day" && (
        <div className="rounded-lg border">
          <div className="border-b bg-muted/40 px-4 py-3">
            <div className="text-sm font-semibold">{headerLabel}</div>
          </div>
          <div className="space-y-2 p-4">
            {(entriesByDate.get(format(currentDate, "yyyy-MM-dd")) || [])
              .length ? (
              entriesByDate.get(format(currentDate, "yyyy-MM-dd"))!.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onSelectEntry(e)}
                  className={`flex w-full items-start justify-between gap-3 rounded-md border p-3 text-left transition-shadow hover:shadow-sm ${technicianColor(
                    e.technician,
                  )}`}
                >
                  <div>
                    <div className="font-medium">{e.customerName}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.technician} • {e.controlNo}
                    </div>
                    {e.description && (
                      <div className="mt-1 text-sm">{e.description}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {e.deliveryReportLink && (
                      <Badge variant="outline">DR</Badge>
                    )}
                    {e.serviceInvoiceLink && (
                      <Badge variant="outline">SI</Badge>
                    )}
                    <Badge variant="secondary">{e.ftiStatus || "—"}</Badge>
                  </div>
                </button>
              ))
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No scheduled entries for this day.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
