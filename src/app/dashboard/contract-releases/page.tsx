"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plus,
  AlertTriangle,
  Clock,
  Trash2,
  Printer,
  Truck,
  Eye,
  ExternalLink,
  CheckCircle2,
  FileCheck2,
  ArrowRight,
  PackageCheck,
  Calendar as CalendarIcon,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
      className?: string;
    }
  > = {
    Completed: {
      variant: "default",
      label: "Done",
      className: "bg-emerald-600 hover:bg-emerald-700 text-white",
    },
    Partial: {
      variant: "secondary",
      label: "Partial",
      className:
        "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300",
    },
    Pending: { variant: "outline", label: "Pending" },
    Overdue: { variant: "destructive", label: "Overdue" },
  };
  const c = config[status] || { variant: "outline" as const, label: status };
  return (
    <Badge variant={c.variant} className={c.className}>
      {c.label}
    </Badge>
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

export default function ContractReleasesPage() {
  const router = useRouter();
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

  // DR list for selected contract
  const [linkedDrList, setLinkedDrList] = useState<any[]>([]);
  const [drListLoading, setDrListLoading] = useState(false);

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

  // Product options for adding extra rows
  const allProductOptions = useMemo(() => {
    return products.map((p) => ({
      value: p.code,
      label: p.name ? `${p.name} (${p.code})` : p.code,
    }));
  }, [products]);

  const activeContract = useMemo(
    () => contracts.find((c) => c.id === selectedContractId),
    [contracts, selectedContractId],
  );

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

  const loadPeriodSummaries = useCallback(
    async (contractId: string) => {
      setSummariesLoading(true);
      setDrListLoading(true);
      setSelectedContractId(contractId);
      try {
        const summaries = await contractReleaseService.getPeriodSummaries(
          undefined,
          undefined,
          undefined,
          contractId,
        );
        setPeriodSummaries(summaries);

        try {
          const contract = contracts.find((c) => c.id === contractId);
          if (contract) {
            const allDrs = await deliveryService.getAll();
            const allReleases = await fetch("/api/contract-releases").then(
              (r) => r.json(),
            );
            const allReleaseRows: any[] = Array.isArray(allReleases)
              ? allReleases
              : [];
            const relevant = allReleaseRows.filter(
              (r: any) => r.contractId === contractId && r.drNumber,
            );
            const uniqueDrs = [
              ...new Set(relevant.map((r: any) => r.drNumber as number)),
            ].sort((a: number, b: number) => b - a);
            setLinkedDrList(
              allDrs.filter((d) => uniqueDrs.includes(d.drNumber)),
            );
          }
        } catch {
          setLinkedDrList([]);
        }
      } catch {
        toast.error("Failed to load period summaries.");
      } finally {
        setSummariesLoading(false);
        setDrListLoading(false);
      }
    },
    [contracts],
  );

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

  // Open release dialog
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
        quantity: item.entitledQty,
        unit: product?.unit?.code || product?.unit?.name || "PC",
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

  // Redirect to Delivery Release page
  const handleNewRelease = async () => {
    if (!selectedContractId) {
      toast.error("Please select a contract first.");
      return;
    }

    const contract = contracts.find((c) => c.id === selectedContractId);
    if (!contract || contract.items.length === 0) {
      toast.error("No contracted items found for this contract.");
      return;
    }

    const rows = contract.items.map((item) => {
      const product = products.find((p) => p.code === item.productCode);
      return {
        productCode: item.productCode,
        unit: product?.unit?.code || product?.unit?.name || "PC",
        description: productMap.get(item.productCode) || item.productCode,
        quantity: item.entitledQty,
      };
    });

    const prefill = {
      companyId: contract.companyId,
      companyName: contract.companyName || contract.companyId,
      items: rows,
    };

    sessionStorage.setItem("deliveryReleasePrefill", JSON.stringify(prefill));
    router.push("/dashboard/delivery-releases?fromRelease=true");
  };

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

  const addReleaseRow = () => {
    setReleaseRows((prev) => [
      ...prev,
      {
        contractItemId: "",
        productCode: "",
        productName: "",
        entitledQty: 0,
        quantity: 1,
        unit: "PC",
      },
    ]);
  };

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
        unit: product?.unit?.code || product?.unit?.name || "PC",
      };
      return updated;
    });
  };

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

    const validRows = releaseRows.filter((row) => row.quantity > 0);
    if (validRows.length === 0) {
      toast.error("At least one release quantity must be greater than 0.");
      return;
    }

    for (const row of validRows) {
      if (!row.productCode) {
        toast.error("Please select a product for all release rows.");
        return;
      }
    }

    setSaving(true);
    try {
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
          console.warn("DR generation failed:", drErr);
          toast.error("Failed to generate Delivery Receipt. Release aborted.");
          return;
        }
      }

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
  }, [lastDrNumber]);

  const totalReleaseQty = useMemo(() => {
    return releaseRows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
  }, [releaseRows]);

  return (
    <>
      <div className="space-y-6">
        {/* ── Page Header ───────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Contract Releases
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitor entitlements, process scheduled fulfillments, and track
              linked DRs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lastDrNumber && (
              <Button variant="outline" onClick={viewLastDr} size="sm">
                <Printer className="mr-2 h-4 w-4" /> DR #{lastDrNumber}
              </Button>
            )}
            <Button
              onClick={handleNewRelease}
              disabled={!selectedContractId}
              variant="outline"
              size="sm"
            >
              <ArrowRight className="mr-2 h-4 w-4" /> Open DR Release
            </Button>
            <Button
              onClick={openReleaseDialog}
              disabled={!selectedContractId}
              size="sm"
              className="bg-primary hover:bg-primary/90"
            >
              <Sparkles className="mr-2 h-4 w-4" /> Quick Process
            </Button>
          </div>
        </div>

        {/* ── Dashboard KPI Highlights ────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">
                Active Contracts
              </CardTitle>
              <FileCheck2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{contracts.length}</div>
              <p className="text-xs text-muted-foreground">
                Registered customer contracts
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">
                Overdue Releases
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {overdueReleases.length}
              </div>
              <p className="text-xs text-muted-foreground">
                Periods requiring fulfillment
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">
                Linked Deliveries
              </CardTitle>
              <Truck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {selectedContractId ? linkedDrList.length : "—"}
              </div>
              <p className="text-xs text-muted-foreground">
                DRs created for selected contract
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Overdue Banner Alert ───────────────────────────── */}
        {overdueReleases.length > 0 && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-destructive text-sm font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Attention Required: Overdue Contract Periods (
                {overdueReleases.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border bg-background overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Contract</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Expected</TableHead>
                      <TableHead className="text-right">Released</TableHead>
                      <TableHead className="text-right">Shortfall</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overdueReleases.map((row, idx) => {
                      const shortfall = row.entitledQty - row.releasedQty;
                      return (
                        <TableRow key={row.periodId || idx}>
                          <TableCell className="font-mono text-xs">
                            {row.contractId}
                          </TableCell>
                          <TableCell className="font-medium text-xs">
                            {productMap.get(row.productCode) || row.productCode}
                          </TableCell>
                          <TableCell className="text-xs">
                            {`${row.periodYear}-${String(row.periodMonth).padStart(2, "0")}`}
                          </TableCell>
                          <TableCell className="text-right font-medium text-xs">
                            {row.entitledQty}
                          </TableCell>
                          <TableCell className="text-right font-medium text-xs">
                            {row.releasedQty}
                          </TableCell>
                          <TableCell className="text-right text-destructive font-bold text-xs">
                            -{shortfall}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Contract Selector Workspace ──────────────────────── */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">
              Contract Fulfillment Workspace
            </CardTitle>
            <CardDescription>
              Select an active customer contract to inspect period statuses and
              linked delivery logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <div className="flex-1 max-w-lg">
                <Select
                  value={selectedContractId || ""}
                  onValueChange={(val) => loadPeriodSummaries(val)}
                >
                  <SelectTrigger className="w-full">
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
              </div>

              {activeContract && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 px-3 py-2 rounded-md border">
                  <PackageCheck className="h-4 w-4 text-emerald-600" />
                  <span>
                    <strong>{activeContract.items.length}</strong> entitlement
                    item(s) configured
                  </span>
                </div>
              )}
            </div>

            {selectedContractId ? (
              <Tabs defaultValue="periods" className="w-full">
                <TabsList className="grid w-full grid-cols-2 max-w-md">
                  <TabsTrigger value="periods" className="gap-2">
                    <Clock className="h-4 w-4" /> Period Entitlements
                  </TabsTrigger>
                  <TabsTrigger value="deliveries" className="gap-2">
                    <Truck className="h-4 w-4" /> Linked Receipts (
                    {linkedDrList.length})
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: Period Status */}
                <TabsContent value="periods" className="pt-4 space-y-4">
                  {summariesLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : periodSummaries.length === 0 ? (
                    <div className="text-center py-10 text-sm text-muted-foreground border rounded-lg">
                      No period summary logs generated for this contract.
                    </div>
                  ) : (
                    <div className="rounded-md border overflow-hidden">
                      <Table>
                        <TableHeader className="bg-muted/50">
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead>Period</TableHead>
                            <TableHead className="text-right">
                              Expected
                            </TableHead>
                            <TableHead className="text-right">
                              Released
                            </TableHead>
                            <TableHead className="text-center">
                              Release Count
                            </TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">
                              Days to Complete
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {periodSummaries.map((row, idx) => (
                            <TableRow key={row.periodId || idx}>
                              <TableCell className="font-medium">
                                {productMap.get(row.productCode) ||
                                  row.productCode}
                              </TableCell>
                              <TableCell className="text-xs">
                                {`${row.periodYear}-${String(row.periodMonth).padStart(2, "0")}`}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {row.entitledQty}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {row.releasedQty}
                              </TableCell>
                              <TableCell className="text-center tabular-nums">
                                {row.releaseCount}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={row.status} />
                              </TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">
                                {row.daysToComplete ?? "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                {/* Tab 2: Linked DRs */}
                <TabsContent value="deliveries" className="pt-4 space-y-4">
                  {drListLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : linkedDrList.length === 0 ? (
                    <div className="text-center py-10 text-sm text-muted-foreground border rounded-lg">
                      No delivery receipts linked to this contract yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {linkedDrList.map((dr: any) => (
                        <div
                          key={dr.drNumber}
                          className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex flex-wrap items-center gap-3">
                            <Badge
                              variant="outline"
                              className="font-mono text-xs"
                            >
                              DR #{dr.drNumber}
                            </Badge>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <CalendarIcon className="h-3 w-3" /> {dr.date}
                            </span>
                            <span className="text-sm font-medium">
                              {dr.companyName}
                            </span>
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                              {dr.items?.length ?? 0} item(s)
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              title="View Preview"
                              onClick={async () => {
                                try {
                                  const preview =
                                    await deliveryService.getPreview(
                                      dr.drNumber,
                                    );
                                  setDrResult(preview);
                                } catch {
                                  toast.error("Failed to load DR preview.");
                                }
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {dr.driveFileLink && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-blue-600 hover:text-blue-800"
                                title="Open Drive PDF"
                                onClick={() =>
                                  window.open(dr.driveFileLink, "_blank")
                                }
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <FileCheck2 className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Select a contract above to inspect entitlements and linked
                  deliveries.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Quick Process Release Dialog ────────────────────────── */}
      <Dialog
        open={releaseOpen}
        onOpenChange={(v) => {
          if (!saving) setReleaseOpen(v);
        }}
      >
        <DialogContent
          className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Process Release Entitlements</DialogTitle>
            <DialogDescription>
              {(() => {
                const c = contracts.find((x) => x.id === releaseContractId);
                return c
                  ? `Recording releases for ${c.companyName || c.companyId}${c.description ? ` - ${c.description}` : ""}`
                  : "Record product releases against the selected contract entitlement period.";
              })()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* Form Fields: Header Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/30 p-3 rounded-lg border">
              <div className="space-y-1.5">
                <Label className="text-xs">Released By *</Label>
                <Input
                  value={releasedBy}
                  onChange={(e) => setReleasedBy(e.target.value)}
                  placeholder="Full name"
                  disabled={saving}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Release Date *</Label>
                <DatePicker value={releaseDate} onChange={setReleaseDate} />
              </div>
            </div>

            {/* Release Items Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  Items to Release
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addReleaseRow}
                  disabled={saving}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add Extra Item
                </Button>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground px-1">
                  <div className="col-span-6">Product / Entitlement</div>
                  <div className="col-span-3">Unit</div>
                  <div className="col-span-2">Release Qty</div>
                  <div className="col-span-1 text-center">Del</div>
                </div>

                {releaseRows.map((row, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-12 gap-2 items-center p-2 border rounded-md bg-card/60"
                  >
                    <div className="col-span-6">
                      {row.contractItemId ? (
                        <div className="flex flex-col">
                          <span className="text-sm font-medium truncate">
                            {row.productName}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Entitled: {row.entitledQty}
                          </span>
                        </div>
                      ) : (
                        <SearchableSelect
                          value={row.productCode}
                          onValueChange={(val) => updateRowProduct(index, val)}
                          options={allProductOptions}
                          placeholder="Select product"
                          searchPlaceholder="Search products..."
                          disabled={saving}
                        />
                      )}
                    </div>

                    <div className="col-span-3">
                      <Input
                        type="text"
                        value={row.unit}
                        readOnly
                        className="bg-muted/50 text-xs"
                        placeholder="—"
                      />
                    </div>

                    <div className="col-span-2">
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

                    <div className="col-span-1 text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                        onClick={() => removeReleaseRow(index)}
                        disabled={saving}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Total Summary */}
            <div className="flex justify-between items-center bg-muted/40 p-3 rounded-lg border text-sm">
              <span className="font-medium text-muted-foreground">
                Total Quantity to Release:
              </span>
              <span className="font-bold text-primary tabular-nums">
                {totalReleaseQty} units
              </span>
            </div>

            {/* Remarks */}
            <div className="space-y-1.5">
              <Label>Remarks / Instructions</Label>
              <Input
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Partial delivery for September PMS"
                disabled={saving}
              />
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
              Process &amp; Generate DR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DR Preview Modal ────────────────────────────── */}
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
