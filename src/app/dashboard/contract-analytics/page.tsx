"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Loader2,
  PackageCheck,
  AlertTriangle,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";

import contractReleaseService from "@/lib/services/contractRelease.service";
import contractService from "@/lib/services/contract.service";
import companyService from "@/lib/services/company.service";
import { ContractPeriodSummary } from "@/types/contract-release";

/* ── Color Palette ──────────────────────────────────── */
const COLORS = {
  Completed: "#22c55e",
  Partial: "#f59e0b",
  Pending: "#6b7280",
  Overdue: "#ef4444",
};

/* ── Month Name Helper ──────────────────────────────── */
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/* ── Status Badge ────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    Completed: { variant: "default", label: "Done" },
    Partial: { variant: "secondary", label: "Partial" },
    Pending: { variant: "outline", label: "Pending" },
    Overdue: { variant: "destructive", label: "Overdue" },
  };
  const c = config[status] || { variant: "outline" as const, label: status };
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

/* ── Summary Card Component ──────────────────────────── */
function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "default",
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  variant?: "default" | "success" | "warning" | "destructive";
}) {
  const bgMap: Record<string, string> = {
    default: "bg-card",
    success: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
    warning: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
    destructive: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
  };
  return (
    <Card className={bgMap[variant]}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Page ────────────────────────────────────────────── */
export default function ContractAnalyticsPage() {
  const [summaries, setSummaries] = useState<ContractPeriodSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);

  // Filters
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState<number | null>(null);

  /* ── Load all data ─────────────────────────────────── */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryData, contractData, companyData] = await Promise.all([
        contractReleaseService.getPeriodSummaries(
          undefined,
          filterYear,
          filterMonth ?? undefined,
        ),
        contractService.getAll(),
        companyService.getAll(),
      ]);
      setSummaries(summaryData);
      setContracts(contractData);
      setCompanies(companyData);
    } catch (err) {
      console.error("Failed to load analytics data:", err);
      toast.error("Failed to load analytics data.");
    } finally {
      setLoading(false);
    }
  }, [filterYear, filterMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ── Lookup maps ───────────────────────────────────── */
  const companyMap = useMemo(() => {
    const map = new Map<string, string>();
    companies.forEach((c) => map.set(c.companyId, c.companyName));
    return map;
  }, [companies]);

  const contractMap = useMemo(() => {
    const map = new Map<string, any>();
    contracts.forEach((c) => map.set(c.id, c));
    return map;
  }, [contracts]);

  /* ── Derived Metrics ────────────────────────────────── */
  const metrics = useMemo(() => {
    const totalEntitled = summaries.reduce((s, r) => s + r.entitledQty, 0);
    const totalReleased = summaries.reduce((s, r) => s + r.releasedQty, 0);
    const completed = summaries.filter((r) => r.status === "Completed").length;
    const overdue = summaries.filter((r) => r.status === "Overdue").length;
    const partial = summaries.filter((r) => r.status === "Partial").length;
    const pending = summaries.filter((r) => r.status === "Pending").length;
    const total = summaries.length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { totalEntitled, totalReleased, completed, overdue, partial, pending, total, completionRate };
  }, [summaries]);

  /* ── Status Pie Chart Data ─────────────────────────── */
  const statusPieData = useMemo(() => [
    { name: "Completed", value: metrics.completed, color: COLORS.Completed },
    { name: "Partial", value: metrics.partial, color: COLORS.Partial },
    { name: "Pending", value: metrics.pending, color: COLORS.Pending },
    { name: "Overdue", value: metrics.overdue, color: COLORS.Overdue },
  ], [metrics]);

  /* ── Monthly Bar Chart Data ────────────────────────── */
  const monthlyChartData = useMemo(() => {
    const months = filterMonth
      ? [{ year: filterYear, month: filterMonth }]
      : Array.from({ length: 12 }, (_, i) => ({ year: filterYear, month: i + 1 }));

    return months.map(({ month }) => {
      const monthSummaries = summaries.filter(
        (s) => s.periodMonth === month && s.periodYear === filterYear,
      );
      return {
        name: MONTHS[month - 1],
        Released: monthSummaries.reduce((s, r) => s + r.releasedQty, 0),
        Entitled: monthSummaries.reduce((s, r) => s + r.entitledQty, 0),
      };
    });
  }, [summaries, filterYear, filterMonth]);

  /* ── Cumulative Line Chart Data ────────────────────── */
  const cumulativeData = useMemo(() => {
    let running = 0;
    return monthlyChartData.map((m) => {
      running += m.Released;
      return { ...m, Cumulative: running };
    });
  }, [monthlyChartData]);

  /* ── Overdue Items ─────────────────────────────────── */
  const overdueItems = useMemo(
    () => summaries.filter((r) => r.status === "Overdue"),
    [summaries],
  );

  /* ── Detail table sorted by latest ─────────────────── */
  const sortedSummaries = useMemo(
    () =>
      [...summaries].sort((a, b) => {
        if (a.periodYear !== b.periodYear) return b.periodYear - a.periodYear;
        return b.periodMonth - a.periodMonth;
      }),
    [summaries],
  );

  /* ── Year options ──────────────────────────────────── */
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  /* ── Loading State ─────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contract Analytics</h1>
        <p className="text-sm text-muted-foreground">
          BOD summary of contract releases, status, and trends.
        </p>
      </div>

      {/* ── Filter Bar ─────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Year:</span>
              <Select value={String(filterYear)} onValueChange={(v) => setFilterYear(Number(v))}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Month:</span>
              <Select
                value={filterMonth ? String(filterMonth) : "all"}
                onValueChange={(v) => setFilterMonth(v === "all" ? null : Number(v))}
              >
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Summary Cards ──────────────────────────────── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Total Entitled" value={metrics.totalEntitled} icon={PackageCheck} />
        <SummaryCard
          title="Total Released" value={metrics.totalReleased}
          subtitle={`${metrics.total} period items`} icon={TrendingUp}
        />
        <SummaryCard
          title="Completion Rate" value={`${metrics.completionRate}%`}
          subtitle={`${metrics.completed} of ${metrics.total} completed`}
          icon={CheckCircle2}
          variant={metrics.completionRate >= 80 ? "success" : "warning"}
        />
        <SummaryCard
          title="Overdue" value={metrics.overdue}
          subtitle="Requires attention" icon={AlertTriangle}
          variant={metrics.overdue > 0 ? "destructive" : "default"}
        />
      </div>
{/* ── Charts Row ─────────────────────────────────── */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Monthly Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Releases vs Entitled by Month</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Entitled" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Released" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Status Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={statusPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => (value > 0 ? `${name}: ${value}` : "")}
                >
                  {statusPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Cumulative Trend ───────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cumulative Released Trend</CardTitle>
          <CardDescription>Running total of items released over the year.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={cumulativeData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="Cumulative"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={{ r: 4 }}
                name="Cumulative Released"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
{/* ── Overdue Alerts ─────────────────────────────── */}
      {overdueItems.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4" />
              Overdue Items ({overdueItems.length})
            </CardTitle>
            <CardDescription className="text-destructive/80">
              These contract periods have not been fully released and are past their due date.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-destructive/20">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contract</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Entitled</TableHead>
                    <TableHead>Released</TableHead>
                    <TableHead>Missing</TableHead>
                    <TableHead>Frequency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdueItems.map((row) => {
                    const contract = contractMap.get(row.contractId);
                    const companyName = contract
                      ? companyMap.get(contract.companyId) || contract.companyId
                      : row.contractId;
                    return (
                      <TableRow key={row.periodId}>
                        <TableCell className="text-xs">
                          <div className="font-medium">{companyName}</div>
                          <div className="text-muted-foreground font-mono">{row.contractId}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.productCode}</TableCell>
                        <TableCell className="text-xs">
                          {`${row.periodYear}-${String(row.periodMonth).padStart(2, "0")}`}
                        </TableCell>
                        <TableCell>{row.entitledQty}</TableCell>
                        <TableCell>{row.releasedQty}</TableCell>
                        <TableCell className="text-destructive font-semibold">
                          -{row.entitledQty - row.releasedQty}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{row.frequency}</Badge>
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

      {/* ── Detail Table ───────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">All Period Items ({summaries.length})</CardTitle>
          <CardDescription>Detailed breakdown of every contract period item.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Entitled</TableHead>
                  <TableHead>Released</TableHead>
                  <TableHead># Releases</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Release</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedSummaries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      No data for the selected period.
                    </TableCell>
                  </TableRow>
                )}
                {sortedSummaries.map((row) => {
                  const contract = contractMap.get(row.contractId);
                  const companyName = contract
                    ? companyMap.get(contract.companyId) || contract.companyId
                    : row.contractId;
                  return (
                    <TableRow key={row.periodId}>
                      <TableCell className="font-mono text-xs">{row.contractId}</TableCell>
                      <TableCell className="text-xs font-medium">{companyName}</TableCell>
                      <TableCell className="font-mono text-xs">{row.productCode}</TableCell>
                      <TableCell className="text-xs">
                        {`${row.periodYear}-${String(row.periodMonth).padStart(2, "0")}`}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{row.frequency}</Badge>
                      </TableCell>
                      <TableCell>{row.entitledQty}</TableCell>
                      <TableCell>{row.releasedQty}</TableCell>
                      <TableCell>{row.releaseCount}</TableCell>
                      <TableCell><StatusBadge status={row.status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.lastReleaseDate || "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}