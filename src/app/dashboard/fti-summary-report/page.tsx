"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, FileText } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DatePicker } from "@/components/ui/date-picker";
import { format } from "date-fns";

// ── Types ─────────────────────────────────────
interface SummaryData {
  totalToll: number;
  totalMiscAmount: number;
  totalFuel: number;
  totalKm: number;
  totalEntries: number;
  totalAmount: number;
}

interface SummaryResponse {
  summary: SummaryData;
  entries: any[];
  technicians: string[];
  selectedTechnician: string;
  dateFrom: string;
  dateTo: string;
}

// ── Component ─────────────────────────────────
export default function FTISummaryReportPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [technicians, setTechnicians] = useState<string[]>([]);
  const [selectedTechnician, setSelectedTechnician] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [isFetching, setIsFetching] = useState(false);

  // Fetch technicians list and initial data
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/fti/summary");
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to load");
        }
        const result: SummaryResponse = await res.json();
        setData(result);
        setTechnicians(result.technicians);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to load summary",
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Fetch with filters
  const fetchSummary = useCallback(async () => {
    setIsFetching(true);
    try {
      const params = new URLSearchParams();
      if (selectedTechnician) params.set("technician", selectedTechnician);
      if (dateFrom) params.set("dateFrom", format(dateFrom, "yyyy-MM-dd"));
      if (dateTo) params.set("dateTo", format(dateTo, "yyyy-MM-dd"));

      const res = await fetch(`/api/fti/summary?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load");
      }
      const result: SummaryResponse = await res.json();
      setData(result);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load summary",
      );
    } finally {
      setIsFetching(false);
    }
  }, [selectedTechnician, dateFrom, dateTo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const summary = data?.summary;
  const formattedEntries = data?.entries || [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>FTI Summary Report</CardTitle>
          <CardDescription>
            View summary of total toll, miscellaneous, fuel, and total
            kilometers for a selected user within a date range.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* ── Filters ── */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Technician</Label>
              <Select
                value={selectedTechnician}
                onValueChange={(v) =>
                  setSelectedTechnician(v === "__all__" ? "" : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All technicians" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All technicians</SelectItem>
                  {technicians.map((tech) => (
                    <SelectItem key={tech} value={tech}>
                      {tech}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Date From</Label>
              <DatePicker value={dateFrom} onChange={(d) => setDateFrom(d)} />
            </div>

            <div className="space-y-1.5">
              <Label>Date To</Label>
              <DatePicker value={dateTo} onChange={(d) => setDateTo(d)} />
            </div>

            <div className="flex items-end">
              <Button
                onClick={fetchSummary}
                disabled={isFetching}
                className="w-full"
              >
                {isFetching ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                Generate Report
              </Button>
            </div>
          </div>

          {/* ── Summary Cards ── */}
          {summary && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">
                      Total Entries
                    </p>
                    <p className="text-2xl font-bold">{summary.totalEntries}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">
                      Total Toll (₱)
                    </p>
                    <p className="text-2xl font-bold text-blue-600">
                      ₱{summary.totalToll.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">
                      Total Misc (₱)
                    </p>
                    <p className="text-2xl font-bold text-orange-600">
                      ₱{summary.totalMiscAmount.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">
                      Total Fuel (₱)
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      ₱{summary.totalFuel.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">
                      Total Distance (KM)
                    </p>
                    <p className="text-2xl font-bold text-purple-600">
                      {summary.totalKm.toFixed(2)} km
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Grand Total */}
              <div className="bg-primary/5 border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Grand Total Amount
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Toll + Misc + Fuel
                    </p>
                  </div>
                  <p className="text-3xl font-bold text-primary">
                    ₱{summary.totalAmount.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* ── Detailed Entries Table ── */}
              {formattedEntries.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Technician</TableHead>
                        <TableHead>Itinerary</TableHead>
                        <TableHead className="text-right">KM</TableHead>
                        <TableHead className="text-right">Toll (₱)</TableHead>
                        <TableHead className="text-right">Misc (₱)</TableHead>
                        <TableHead className="text-right">Fuel (₱)</TableHead>
                        <TableHead className="text-right">Total (₱)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {formattedEntries.map((entry: any, idx: number) => {
                        const fuel =
                          ((entry.kilometer || 0) / 12) *
                          (entry.fuelPrice || 0);
                        const total =
                          (entry.tollFee || 0) + (entry.miscAmount || 0) + fuel;
                        return (
                          <TableRow key={idx}>
                            <TableCell>{entry.date}</TableCell>
                            <TableCell>{entry.technician}</TableCell>
                            <TableCell className="uppercase">
                              {entry.itinerary}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {entry.kilometer.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {entry.tollFee.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {entry.miscAmount.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {fuel.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold">
                              {total.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}

          {!summary && !loading && (
            <div className="text-center py-8 text-muted-foreground">
              No data available. Click "Generate Report" to load summary.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
