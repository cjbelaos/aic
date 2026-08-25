"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Loader2,
  Plus,
  AlertTriangle,
  Clock,
  Trash2,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";

// Services
import contractService from "@/lib/services/contract.service";
import contractItemService from "@/lib/services/contract-item.service";
import contractReleaseService from "@/lib/services/contractRelease.service";
import companyService from "@/lib/services/company.service";
import productService from "@/lib/services/product.service";
import userService from "@/lib/services/user.service";
import deliveryService from "@/lib/services/delivery.service";

// Types
import { ContractWithItems } from "@/types/contract";
import { ContractPeriodSummary } from "@/types/contract-release";
import { Product } from "@/types/product";
import { DeliveryReceiptResponse } from "@/types/deliveryReceipt";
import { format } from "date-fns";
import { DeliveryReceiptPreviewModal } from "@/components/delivery-receipt-preview-modal";

/* ── Status Badge Helper ─────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    {
      variant: "default" | "secondary" | "destructive" | "outline";
      label: string;
    }
  > = {
    Completed: { variant: "default", label: "Done" },
    Partial: { variant: "secondary", label: "Partial" },
    Pending: { variant: "outline", label: "Pending" },
    Overdue: { variant: "destructive", label: "Overdue" },
  };
  const c = config[status] || { variant: "outline" as const, label: status };
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

/* ── Simple Table Component ──────────────────────────── */
function SimpleTable<T extends Record<string, any>>({
  columns,
  data,
  loading,
}: {
  columns: {
    key: string;
    header: string;
    render?: (row: T) => React.ReactNode;
  }[];
  data: T[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No data available.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key}>{col.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, idx) => (
            <TableRow key={(row as any).periodId || (row as any).id || idx}>
              {columns.map((col) => (
                <TableCell key={col.key}>
                  {col.render ? col.render(row) : String(row[col.key] ?? "-")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ── Release Row Type ────────────────────────────────── */
interface ReleaseRow {
  contractItemId: string;
  productCode: string;
  productName: string;
  entitledQty: number;
  quantity: number;
  unit: string;
}

/* ── Page ────────────────────────────────────────────── */
export default function ContractReleasesPage() {
  const [contracts, setContracts] = useState<ContractWithItems[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Release dialog state
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releaseContractId, setReleaseContractId] = useState<string>("");
  const [releaseRows, setReleaseRows] = useState<ReleaseRow[]>([]);
  const [releasedBy, setReleasedBy] = useState("");
  const [releaseDate, setReleaseDate] = useState<Date | undefined>(new Date());
  const [remarks, setRemarks] = useState("");

  // Period summaries for selected contract
  const [selectedContractId, setSelectedContractId] = useState<string | null>(
    null,
  );
  const [periodSummaries, setPeriodSummaries] = useState<
    ContractPeriodSummary[]
  >([]);
  const [summariesLoading, setSummariesLoading] = useState(false);

  // DR preview
  const [drResult, setDrResult] = useState<DeliveryReceiptResponse | null>(
    null,
  );
  const [lastDrNumber, setLastDrNumber] = useState<number | null>(null);

  // Overdue releases
  const [overdueReleases, setOverdueReleases] = useState<
    ContractPeriodSummary[]
  >([]);

  // Product lookup: productCode -> product name
  const productMap = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => map.set(p.code, p.name));
    return map;
  }, [products]);

  // Product options for adding extra rows (all products)
  const allProductOptions = useMemo(() => {
    return products.map((p) => ({
      value: p.code,
      label: p.name ? `${p.name} (${p.code})` : p.code,
    }));
  }, [products]);

  const loadContracts = useCallback(async () => {
    try {
      const [contractsData, items, companyResult, productResult] =
        await Promise.all([
          contractService.getAll(),
          contractItemService.getAll(),
          companyService.getAll(),
          productService.getAll(),
        ]);

      const contractsWithItems: ContractWithItems[] = contractsData.map(
        (contract) => ({
          ...contract,
          companyName:
            companyResult.find((c) => c.companyId === contract.companyId)
              ?.companyName || contract.companyId,
          items: items.filter((item) => item.contractId === contract.id),
        }),
      );
      setContracts(contractsWithItems);
      setProducts(Array.isArray(productResult) ? productResult : []);
    } catch (err) {
      console.error("Error loading contracts:", err);
      toast.error("Failed to load contracts.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOverdue = useCallback(async () => {
    try {
      const overdue = await contractReleaseService.getOverdueReleases();
      setOverdueReleases(overdue);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadContracts();
    loadOverdue();
  }, [loadContracts, loadOverdue]);

  const loadPeriodSummaries = useCallback(async (contractId: string) => {
    setSummariesLoading(true);
    setSelectedContractId(contractId);
    try {
      const summaries = await contractReleaseService.getPeriodSummaries(
        undefined,
        undefined,
        undefined,
        contractId,
      );
      setPeriodSummaries(summaries);
    } catch {
      toast.error("Failed to load period summaries.");
    } finally {
      setSummariesLoading(false);
    }
  }, []);

  // Get logged-in user's full name from localStorage username (set at login),
  // resolving to the user's full name via the users API.
  const getLoggedInUserFullName = useCallback(async (): Promise<string> => {
    try {
      const raw = window.localStorage.getItem("auth:user");
      if (raw) {
        const parsed = JSON.parse(raw);
        const username = parsed.userName || parsed.username || "";
        if (username) {
          return await userService.getFullnameByUserName(username);
        }
        const fullName = parsed.fullName || "";
        if (fullName) return fullName;
      }
    } catch {
      // ignore
    }
    return "";
  }, []);

  // Open release dialog — pre-select all contracted items with entitled qty pre-filled
  const openReleaseDialog = async () => {
    if (!selectedContractId) {
      toast.error("Please select a contract first.");
      return;
    }

    const contract = contracts.find((c) => c.id === selectedContractId);
    if (!contract || contract.items.length === 0) {
      toast.error("No contracted items found for this contract.");
      return;
    }

    const rows: ReleaseRow[] = contract.items.map((item) => {
      const product = products.find((p) => p.code === item.productCode);
      return {
        contractItemId: item.id,
        productCode: item.productCode,
        productName: productMap.get(item.productCode) || item.productCode,
        entitledQty: item.entitledQty,
        quantity: item.entitledQty, // Pre-fill with entitled quantity
        unit: product?.unit?.code || product?.unit?.name || "",
      };
    });

    const fullName = await getLoggedInUserFullName();

    setReleaseContractId(contract.id);
    setReleaseRows(rows);
    setReleasedBy(fullName);
    setReleaseDate(new Date());
    setRemarks("");
    setReleaseOpen(true);
  };

  // Update a release row
  const updateReleaseRow = (
    index: number,
    field: keyof ReleaseRow,
    value: any,
  ) => {
    setReleaseRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Add an extra row (can be a non-contracted product)
  const addReleaseRow = () => {
    setReleaseRows((prev) => [
      ...prev,
      {
        contractItemId: "",
        productCode: "",
        productName: "",
        entitledQty: 0,
        quantity: 0,
        unit: "",
      },
    ]);
  };

  // Update product selection for an extra row
  const updateRowProduct = (index: number, productCode: string) => {
    const product = products.find((p) => p.code === productCode);
    setReleaseRows((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        contractItemId: "",
        productCode,
        productName: product?.name || productCode,
        entitledQty: 0,
        unit: product?.unit?.code || product?.unit?.name || "",
      };
      return updated;
    });
  };

  // Remove a release row
  const removeReleaseRow = (index: number) => {
    setReleaseRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProcessReleases = async () => {
    if (!releasedBy.trim()) {
      toast.error("Released by is required.");
      return;
    }
    if (!releaseDate) {
      toast.error("Release date is required.");
      return;
    }

    // Validate rows
    const validRows = releaseRows.filter((row) => row.quantity > 0);
    if (validRows.length === 0) {
      toast.error("At least one release quantity must be greater than 0.");
      return;
    }

    // Check that all rows with quantity have a product selected
    for (const row of validRows) {
      if (!row.productCode) {
        toast.error("Please select a product for all release rows.");
        return;
      }
    }

    setSaving(true);
    try {
      // ── Step 1: Create the Delivery Receipt FIRST ───────────────
      let drNumber: number | undefined;
      const contract = contracts.find((c) => c.id === releaseContractId);
      const companyId = contract?.companyId || "";

      if (companyId) {
        try {
          const drPayload = {
            companyId,
            date: format(releaseDate, "yyyy-MM-dd"),
            poNo: "",
            trNo: "",
            preparedBy: releasedBy,
            deliveredBy: releasedBy,
            comments: remarks || undefined,
            items: validRows.map((row) => ({
              productCode: row.productCode,
              unit: row.unit,
              description: row.productName,
              quantity: row.quantity,
            })),
          };
          const drRes = await deliveryService.createAndPopulateSheet(drPayload);
          drNumber = drRes.drNumber;
          setDrResult(drRes);
          setLastDrNumber(drRes.drNumber);
        } catch (drErr: any) {
          console.warn("DR generation before contract release failed:", drErr);
          toast.error("Failed to generate Delivery Receipt. Release aborted.");
          return;
        }
      }

      // ── Step 2: Process all releases with linked DR ────────────
      for (const row of validRows) {
        await contractReleaseService.processRelease(
          row.contractItemId,
          row.quantity,
          format(releaseDate, "yyyy-MM-dd"),
          releasedBy,
          remarks || undefined,
          releaseContractId,
          row.productCode,
          drNumber,
        );
      }

      toast.success(`${validRows.length} release(s) processed successfully.`);
      setReleaseOpen(false);

      // Refresh data
      if (selectedContractId) loadPeriodSummaries(selectedContractId);
      loadOverdue();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        "Failed to process releases.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  /* ── Re-view last generated DR ─────────────────────── */
  const viewLastDr = useCallback(async () => {
    if (!lastDrNumber) {
      toast.error("No DR has been generated yet.");
      return;
    }
    try {
      const allDr = await deliveryService.getAll();
      const found = allDr.find((d) => d.drNumber === lastDrNumber);
      if (!found) {
        toast.error(`DR #${lastDrNumber} not found.`);
        return;
      }
      const contract = contracts.find((c) => c.id === selectedContractId);
      setDrResult({
        success: true,
        drNumber: found.drNumber,
        companyName: found.companyName,
        address: "",
        tin: "",
        date: found.date,
        poNo: found.poNo,
        trNo: found.trNo,
        preparedBy: found.preparedBy,
        deliveredBy: found.deliveredBy,
        comments: found.comments,
        items: found.items,
        status: found.status,
        driveFileLink: found.driveFileLink,
      });
    } catch {
      toast.error("Failed to load DR preview.");
    }
  }, [lastDrNumber, contracts, selectedContractId]);

  /* ── Overdue Columns Config ────────────────────────── */
  const overdueColumns = [
    {
      key: "contractId",
      header: "Contract",
      render: (row: ContractPeriodSummary) => (
        <span className="font-mono text-xs">{row.contractId}</span>
      ),
    },
    {
      key: "productCode",
      header: "Product",
      render: (row: ContractPeriodSummary) => (
        <span className="font-mono text-xs">
          {productMap.get(row.productCode) || row.productCode}
        </span>
      ),
    },
    {
      key: "period",
      header: "Period",
      render: (row: ContractPeriodSummary) => (
        <span>{`${row.periodYear}-${String(row.periodMonth).padStart(2, "0")}`}</span>
      ),
    },
    { key: "entitledQty", header: "Expected" },
    { key: "releasedQty", header: "Released" },
    {
      key: "variance",
      header: "Variance",
      render: (row: ContractPeriodSummary) => {
        const variance = row.entitledQty - row.releasedQty;
        return (
          <span className="text-destructive font-semibold">-{variance}</span>
        );
      },
    },
  ];

  /* ── Summary Columns Config ────────────────────────── */
  const summaryColumns = [
    {
      key: "productCode",
      header: "Product",
      render: (row: ContractPeriodSummary) => (
        <span className="font-mono text-xs">
          {productMap.get(row.productCode) || row.productCode}
        </span>
      ),
    },
    {
      key: "period",
      header: "Period",
      render: (row: ContractPeriodSummary) => (
        <span className="text-xs">
          {`${row.periodYear}-${String(row.periodMonth).padStart(2, "0")}`}
        </span>
      ),
    },
    {
      key: "entitledQty",
      header: "Expected",
      render: (row: ContractPeriodSummary) => (
        <span className="font-semibold">{row.entitledQty}</span>
      ),
    },
    {
      key: "releasedQty",
      header: "Released",
      render: (row: ContractPeriodSummary) => (
        <span className="font-semibold">{row.releasedQty}</span>
      ),
    },
    { key: "releaseCount", header: "# Releases" },
    {
      key: "status",
      header: "Status",
      render: (row: ContractPeriodSummary) => (
        <StatusBadge status={row.status} />
      ),
    },
    {
      key: "daysToComplete",
      header: "Days",
      render: (row: ContractPeriodSummary) => (
        <span className="text-xs text-muted-foreground">
          {row.daysToComplete ?? "-"}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="space-y-6">
        {/* ── Header ───────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Contract Releases
            </h1>
            <p className="text-sm text-muted-foreground">
              Track and manage product releases against contract entitlements.
            </p>
          </div>
          <div className="flex gap-2">
            {lastDrNumber && (
              <Button variant="outline" onClick={viewLastDr}>
                <Printer className="mr-2 h-4 w-4" /> View DR #{lastDrNumber}
              </Button>
            )}
            <Button onClick={openReleaseDialog} disabled={!selectedContractId}>
              <Plus className="mr-2 h-4 w-4" /> New Release
            </Button>
          </div>
        </div>

        {/* ── Overdue Alerts ──────────────────────────────── */}
        {overdueReleases.length > 0 && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-destructive text-sm">
                <AlertTriangle className="h-4 w-4" />
                Overdue Releases ({overdueReleases.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleTable columns={overdueColumns} data={overdueReleases} />
            </CardContent>
          </Card>
        )}

        {/* ── Contract Selection ──────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Select Contract to View Period Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={selectedContractId || ""}
              onValueChange={(val) => loadPeriodSummaries(val)}
            >
              <SelectTrigger className="w-full max-w-md">
                <SelectValue placeholder="Choose a contract..." />
              </SelectTrigger>
              <SelectContent>
                {contracts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.companyName || c.companyId}
                    {c.description ? ` - ${c.description}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* ── Period Summary Table ────────────────────────── */}
        {selectedContractId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Period Status for{" "}
                {(() => {
                  const c = contracts.find((x) => x.id === selectedContractId);
                  return c
                    ? `${c.companyName || c.companyId}${c.description ? ` - ${c.description}` : ""}`
                    : selectedContractId;
                })()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleTable
                columns={summaryColumns}
                data={periodSummaries}
                loading={summariesLoading}
              />
            </CardContent>
          </Card>
        )}

        {/* ── Release Dialog ──────────────────────────────── */}
        <Dialog
          open={releaseOpen}
          onOpenChange={(v) => {
            if (!saving) setReleaseOpen(v);
          }}
        >
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Process New Releases</DialogTitle>
              <DialogDescription>
                {(() => {
                  const c = contracts.find((x) => x.id === releaseContractId);
                  return c
                    ? `Releasing items for ${c.companyName || c.companyId}${c.description ? ` - ${c.description}` : ""}`
                    : "Record releases of items against a contract entitlement period.";
                })()}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Release Rows */}
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Release Items</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addReleaseRow}
                  disabled={saving}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Row
                </Button>
              </div>

              <div className="space-y-3">
                {releaseRows.map((row, index) => (
                  <div
                    key={index}
                    className="p-3 border rounded-lg bg-card/50 space-y-3 relative"
                  >
                    <div className="flex items-center justify-between gap-2">
                      {row.contractItemId ? (
                        /* Contracted item — show product name */
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {row.productName}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {row.productName} | Entitled: {row.entitledQty}
                          </span>
                        </div>
                      ) : (
                        /* Extra row — allow product selection */
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs">Product *</Label>
                          <SearchableSelect
                            value={row.productCode}
                            onValueChange={(val) =>
                              updateRowProduct(index, val)
                            }
                            options={allProductOptions}
                            placeholder="Select product"
                            searchPlaceholder="Search products..."
                            disabled={saving}
                          />
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => removeReleaseRow(index)}
                        disabled={saving}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Quantity */}
                      <div className="space-y-1">
                        <Label className="text-xs">Quantity *</Label>
                        <Input
                          type="number"
                          min={0}
                          value={row.quantity || ""}
                          onChange={(e) =>
                            updateReleaseRow(
                              index,
                              "quantity",
                              parseInt(e.target.value, 10) || 0,
                            )
                          }
                          placeholder="0"
                          disabled={saving}
                        />
                      </div>

                      {/* Unit */}
                      <div className="space-y-1">
                        <Label className="text-xs">Unit</Label>
                        <Input
                          type="text"
                          value={row.unit}
                          readOnly
                          placeholder="—"
                          disabled={saving}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Released By, Release Date, Remarks — below release items */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t">
                {/* Released By */}
                <div className="space-y-1.5">
                  <Label>Released By *</Label>
                  <Input
                    value={releasedBy}
                    onChange={(e) => setReleasedBy(e.target.value)}
                    placeholder="Full name"
                    disabled={saving}
                  />
                </div>

                {/* Release Date */}
                <div className="space-y-1.5">
                  <Label>Release Date *</Label>
                  <DatePicker value={releaseDate} onChange={setReleaseDate} />
                </div>

                {/* Remarks */}
                <div className="space-y-1.5">
                  <Label>Remarks</Label>
                  <Input
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="e.g. Partial delivery"
                    disabled={saving}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setReleaseOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleProcessReleases} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Process Releases
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <DeliveryReceiptPreviewModal
        dr={drResult}
        open={!!drResult}
        onOpenChange={(v) => {
          if (!v) setDrResult(null);
        }}
      />
    </>
  );
}
