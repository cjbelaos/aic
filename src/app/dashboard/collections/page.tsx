"use client";

import { useEffect, useState, useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  ArrowUpDown,
  Loader2,
  CheckCircle2,
  XCircle,
  Calendar,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntityTable } from "@/components/ui/entity-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";

// Services
import collectionService from "@/lib/services/collection.service";
import companyService from "@/lib/services/company.service";

// Types
import { Company } from "@/types/company";
import { ScheduledCollection, CollectionHistory } from "@/types/collection";

interface ScheduleFormState {
  companyId: string;
  scheduledDate: string;
  notes: string;
}

interface LogCollectionFormState {
  description: string;
  amountCollected: number;
  collectedDate: string;
}

const EMPTY_SCHEDULE_FORM: ScheduleFormState = {
  companyId: "",
  scheduledDate: new Date().toISOString().split("T")[0],
  notes: "",
};

const EMPTY_LOG_FORM: LogCollectionFormState = {
  description: "",
  amountCollected: 0,
  collectedDate: new Date().toISOString().split("T")[0],
};

export default function CollectionsPage() {
  const [scheduledList, setScheduledList] = useState<ScheduledCollection[]>([]);
  const [historyList, setHistoryList] = useState<CollectionHistory[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [loading, setLoading] = useState(true);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [logSaving, setLogSaving] = useState(false);
  const [error, setError] = useState("");

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ScheduledCollection | null>(
    null,
  );

  const [scheduleForm, setScheduleForm] =
    useState<ScheduleFormState>(EMPTY_SCHEDULE_FORM);
  const [logForm, setLogForm] =
    useState<LogCollectionFormState>(EMPTY_LOG_FORM);
  const [targetToCollect, setTargetToCollect] =
    useState<ScheduledCollection | null>(null);

  const fetchData = async () => {
    try {
      const [scheduledData, historyData, companiesData] = await Promise.all([
        collectionService.getScheduled(),
        collectionService.getHistory(),
        companyService.getAll(),
      ]);
      setScheduledList(scheduledData);
      setHistoryList(historyData);
      setCompanies(Array.isArray(companiesData) ? companiesData : []);
    } catch (err) {
      console.error("Failed to load collection data:", err);
      toast.error("Failed to load collection data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const companyMap = useMemo(() => {
    const map = new Map<string, string>();
    companies.forEach((c) => {
      map.set(c.companyId, c.companyName);
    });
    return map;
  }, [companies]);

  const companyOptions = useMemo(
    () =>
      companies.map((c) => ({
        value: c.companyId,
        label: c.companyName,
      })),
    [companies],
  );

  const handleCreateSchedule = async () => {
    if (!scheduleForm.companyId) {
      setError("Please select a company.");
      return;
    }
    if (!scheduleForm.scheduledDate) {
      setError("Scheduled date is required.");
      return;
    }

    setScheduleSaving(true);
    setError("");

    try {
      await collectionService.createSchedule({
        companyId: scheduleForm.companyId,
        scheduledDate: scheduleForm.scheduledDate,
        notes: scheduleForm.notes,
      });
      await fetchData();
      toast.success("Added company to schedule.");
      setScheduleModalOpen(false);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to schedule collection.");
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleOpenLogModal = (item: ScheduledCollection) => {
    setTargetToCollect(item);
    setLogForm({
      description: item.notes || "Regular Collection",
      amountCollected: 0,
      collectedDate: new Date().toISOString().split("T")[0],
    });
    setError("");
    setLogModalOpen(true);
  };

  const handleConfirmCancelSchedule = async () => {
    if (!cancelTarget) return;
    const displayName =
      companyMap.get(cancelTarget.companyId) || cancelTarget.companyId;
    try {
      await collectionService.updateStatus(cancelTarget.id, "CANCELLED");
      await fetchData();
      toast.success(`Cancelled collection schedule for ${displayName}.`);
    } catch (err: any) {
      toast.error("Failed to cancel collection schedule.");
    } finally {
      setCancelTarget(null);
    }
  };

  const handleSaveCollection = async () => {
    if (!targetToCollect) return;
    if (logForm.amountCollected <= 0) {
      setError("Amount collected must be greater than 0.");
      return;
    }

    setLogSaving(true);
    setError("");

    try {
      await collectionService.logCollection({
        scheduledCollectionId: targetToCollect.id,
        companyId: targetToCollect.companyId,
        description: logForm.description,
        amountCollected: logForm.amountCollected,
        collectedDate: logForm.collectedDate,
      });

      await fetchData();
      const displayName =
        companyMap.get(targetToCollect.companyId) || targetToCollect.companyId;
      toast.success(`Logged collection for ${displayName}.`);
      setLogModalOpen(false);
      setTargetToCollect(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to log collection.");
    } finally {
      setLogSaving(false);
    }
  };

  /* ── Scheduled Table Columns ── */
  const scheduledColumns: ColumnDef<ScheduledCollection>[] = [
    {
      accessorKey: "companyId",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Company Name <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => {
        const id = row.original.companyId;
        return companyMap.get(id) || id;
      },
    },
    {
      accessorKey: "scheduledDate",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Scheduled Collection Date <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      ),
    },
    {
      accessorKey: "notes",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Notes <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => row.original.notes || "-",
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
        const status = row.original.status || "PENDING";

        if (status === "CANCELLED") {
          return (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-300">
              Cancelled
            </span>
          );
        }

        return (
          <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
            Pending Schedule
          </span>
        );
      },
    },
    {
      id: "customActions",
      header: "Actions",
      cell: ({ row }) => {
        const item = row.original;
        const isCancelled = item.status === "CANCELLED";

        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              disabled={isCancelled}
              className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/50 disabled:opacity-30"
              onClick={() => handleOpenLogModal(item)}
              title={isCancelled ? "Schedule Cancelled" : "Confirm Collection"}
            >
              <CheckCircle2 className="h-4 w-4" />
              <span className="sr-only">Confirm Collection</span>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              disabled={isCancelled}
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-30"
              onClick={() => setCancelTarget(item)}
              title={isCancelled ? "Schedule Cancelled" : "Cancel Schedule"}
            >
              <XCircle className="h-4 w-4" />
              <span className="sr-only">Cancel Schedule</span>
            </Button>
          </div>
        );
      },
    },
  ];

  /* ── History Table Columns ── */
  const historyColumns: ColumnDef<CollectionHistory>[] = [
    {
      accessorKey: "collectionId",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Collection ID <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      ),
    },
    {
      accessorKey: "companyId",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Company Name <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => {
        const id = row.original.companyId;
        return companyMap.get(id) || id;
      },
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
      accessorKey: "amountCollected",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Amount Collected <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="font-medium text-emerald-600">
          {row.original.amountCollected.toLocaleString("en-PH", {
            style: "currency",
            currency: "PHP",
            minimumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      accessorKey: "collectedDate",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Collected Date <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Tabs defaultValue="scheduled" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="scheduled" className="gap-2">
            <Calendar className="h-4 w-4" /> Scheduled Collections
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" /> Collection History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scheduled">
          <EntityTable
            title="Scheduled For Collection"
            columns={scheduledColumns}
            data={scheduledList}
            loading={loading}
            onCreateNew={() => {
              setScheduleForm(EMPTY_SCHEDULE_FORM);
              setError("");
              setScheduleModalOpen(true);
            }}
          />
        </TabsContent>

        <TabsContent value="history">
          <EntityTable
            title="Collection History"
            columns={historyColumns}
            data={historyList}
            loading={loading}
          />
        </TabsContent>
      </Tabs>

      {/* Schedule Modal */}
      <Dialog open={scheduleModalOpen} onOpenChange={setScheduleModalOpen}>
        <DialogContent className="sm:max-w-[80vw] max-h-[90vh] overflow-y-auto"
            onInteractOutside={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Add Customer To Collection Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="space-y-1.5">
              <Label>Company Name *</Label>
              <SearchableSelect
                value={scheduleForm.companyId}
                onValueChange={(v) =>
                  setScheduleForm((f) => ({ ...f, companyId: v }))
                }
                options={companyOptions}
                placeholder="Select company"
                searchPlaceholder="Search company..."
                disabled={scheduleSaving}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sched-date">Scheduled Target Date *</Label>
              <Input
                id="sched-date"
                type="date"
                value={scheduleForm.scheduledDate}
                disabled={scheduleSaving}
                onChange={(e) =>
                  setScheduleForm((f) => ({
                    ...f,
                    scheduledDate: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sched-notes">Notes / Remarks</Label>
              <Input
                id="sched-notes"
                placeholder="e.g. Call confirm at 9 AM"
                value={scheduleForm.notes}
                disabled={scheduleSaving}
                onChange={(e) =>
                  setScheduleForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setScheduleModalOpen(false)}
              disabled={scheduleSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSchedule}
              disabled={scheduleSaving}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {scheduleSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Collection Modal */}
      <Dialog open={logModalOpen} onOpenChange={setLogModalOpen}>
        <DialogContent className="sm:max-w-[80vw] max-h-[90vh] overflow-y-auto"
            onInteractOutside={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Log Collection Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && <p className="text-sm text-destructive">{error}</p>}

            <p className="text-sm text-muted-foreground">
              Logging payment for:{" "}
              <strong className="text-foreground">
                {targetToCollect
                  ? companyMap.get(targetToCollect.companyId) ||
                    targetToCollect.companyId
                  : ""}
              </strong>
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="col-desc">Description *</Label>
              <Input
                id="col-desc"
                value={logForm.description}
                disabled={logSaving}
                onChange={(e) =>
                  setLogForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Check No. / Payment Details"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="col-amount">Amount Collected (PHP) *</Label>
              <Input
                id="col-amount"
                type="number"
                min={0.01}
                step="0.01"
                value={logForm.amountCollected || ""}
                disabled={logSaving}
                onChange={(e) =>
                  setLogForm((f) => ({
                    ...f,
                    amountCollected: parseFloat(e.target.value) || 0,
                  }))
                }
                placeholder="0.00"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="col-date">Date Collected *</Label>
              <Input
                id="col-date"
                type="date"
                value={logForm.collectedDate}
                disabled={logSaving}
                onChange={(e) =>
                  setLogForm((f) => ({ ...f, collectedDate: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setLogModalOpen(false)}
              disabled={logSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveCollection}
              disabled={logSaving}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {logSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{" "}
              Confirm Collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for Cancellation */}
      <ConfirmDeleteDialog
        open={!!cancelTarget}
        description={`Cancel collection schedule for "${
          cancelTarget
            ? companyMap.get(cancelTarget.companyId) || cancelTarget.companyId
            : ""
        }"?`}
        onConfirm={handleConfirmCancelSchedule}
        onClose={() => setCancelTarget(null)}
      />
    </div>
  );
}
