"use client";
import { useEffect, useState, useMemo } from "react";
import {
  DollarSign,
  Loader2,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import type {
  TechnicianEarningsResponse,
  TechnicianEarningDetail,
} from "@/types/technicianEarnings";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const KIND_LABELS: Record<TechnicianEarningDetail["kind"], string> = {
  sr_with_dr: "SR with DR",
  sr_without_dr: "SR without DR",
  fti: "FTI requested",
  liquidation: "Liquidation",
};

const COLORS = {
  srWithDr: "#22c55e",
  srWithoutDr: "#3b82f6",
  fti: "#f59e0b",
  liquidation: "#ef4444",
};

/* ── Summary Card (mirrors Contract Analytics) ───────── */
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
    success:
      "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
    warning:
      "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
    destructive:
      "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
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

export default function TechnicianEarningsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState<number | null>(now.getMonth() + 1);
  const [userId, setUserId] = useState<string>("all");
  const [techOptions, setTechOptions] = useState<
    { userId: string; fullName: string }[]
  >([]);
  const [data, setData] = useState<TechnicianEarningsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const years = useMemo(() => {
    const cy = now.getFullYear();
    const r: number[] = [];
    for (let y = cy - 4; y <= cy; y++) r.push(y);
    return r;
  }, [now]);

  const fmt = (v: number) =>
    v.toLocaleString("en-PH", { style: "currency", currency: "PHP" });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reports/technician-earnings?year=${year}${month ? `&month=${month}` : ""}${userId !== "all" ? `&userId=${userId}` : ""}`,
      );
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error);
      }
      const json = await res.json();
      setData(json);
      // Keep the full technician list for the dropdown; a user-filtered
      // response only contains the selected technician.
      if (userId === "all" || techOptions.length === 0) {
        setTechOptions(
          (json.technicians || []).map((t: TechnicianEarningsResponse["technicians"][number]) => ({
            userId: t.userId,
            fullName: t.fullName,
          })),
        );
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [userId]);

  /* ── Analytics series ─────────────────────────────── */
  const monthlyData = useMemo(
    () =>
      (data?.monthly ?? []).map((m) => ({
        name: MONTHS[m.month - 1],
        "SR with DR": m.srWithDr,
        "SR without DR": m.srWithoutDr,
        Liquidation: m.liquidation,
      })),
    [data],
  );

  const pieData = useMemo(
    () =>
      data
        ? [
            { name: "SR with DR", value: data.totals.srWithDr, color: COLORS.srWithDr },
            { name: "SR without DR", value: data.totals.srWithoutDr, color: COLORS.srWithoutDr },
            { name: "FTI requested", value: data.totals.fti, color: COLORS.fti },
            { name: "Liquidation", value: data.totals.liquidation, color: COLORS.liquidation },
          ]
        : [],
    [data],
  );

  const cumulativeData = useMemo(() => {
    let earnings = 0;
    let expenses = 0;
    return monthlyData.map((m) => {
      earnings +=
        (m["SR with DR"] as number) + (m["SR without DR"] as number);
      expenses += m.Liquidation as number;
      return { name: m.name, Earnings: earnings, Expenses: expenses };
    });
  }, [monthlyData]);

  const periodLabel = data
    ? data.period.month
      ? `${MONTHS[data.period.month - 1]} ${data.period.year}`
      : String(data.period.year)
    : "";
  const activeCount =
    data?.technicians.filter(
      (t) => t.srTotal > 0 || t.liquidationTotal > 0 || t.ftiTotal > 0,
    ).length ?? 0;
  return (
    <div className="p-3 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Technician Earnings
        </h1>
        <p className="text-sm text-muted-foreground">
          Earnings (SR) vs expenses (FTI / liquidation) for{" "}
          {data?.department.name ?? "After Sales"} technicians.
        </p>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Year:</span>
              <Select
                value={String(year)}
                onValueChange={(v) => setYear(parseInt(v, 10))}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Month:</span>
              <Select
                value={month ? String(month) : "all"}
                onValueChange={(v) =>
                  setMonth(v === "all" ? null : parseInt(v, 10))
                }
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Technician:</span>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="All technicians" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All technicians</SelectItem>
                  {techOptions.map((t) => (
                    <SelectItem key={t.userId} value={t.userId}>
                      {t.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={load} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Load
            </Button>
            {data && (
              <span className="text-xs text-muted-foreground">
                Showing {periodLabel} · {userId !== "all" ? (techOptions.find((t) => t.userId === userId)?.fullName ?? "Technician") : "All technicians"} · {data.department.name}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {data && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              title="Earnings (SR)"
              value={fmt(data.totals.srTotal)}
              subtitle={`${data.totals.srWithDrCount + data.totals.srWithoutDrCount} invoice(s)`}
              icon={TrendingUp}
              variant="success"
            />
            <SummaryCard
              title="Expenses (Liquidation)"
              value={fmt(data.totals.liquidation)}
              subtitle={`FTI requested: ${fmt(data.totals.fti)}`}
              icon={TrendingDown}
              variant={data.totals.liquidation > 0 ? "destructive" : "default"}
            />
            <SummaryCard
              title="Net"
              value={fmt(data.totals.net)}
              subtitle="Earnings - expenses"
              icon={DollarSign}
              variant={data.totals.net >= 0 ? "success" : "destructive"}
            />
            <SummaryCard
              title="Technicians"
              value={data.technicians.length}
              subtitle={`${activeCount} active in ${periodLabel}`}
              icon={Users}
            />
          </div>
          {/* Charts Row */}
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  SR Earnings vs Liquidation by Month
                </CardTitle>
                <CardDescription>
                  {data.period.year} monthly split of delivered SRs and
                  expenses.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-muted/30"
                    />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="SR with DR"
                      fill={COLORS.srWithDr}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="SR without DR"
                      fill={COLORS.srWithoutDr}
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="Liquidation"
                      fill={COLORS.liquidation}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{periodLabel} Split</CardTitle>
                <CardDescription>
                  Share of SR earnings (with/without DR), FTI requested, and
                  liquidation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) =>
                        value ? `${name}: ${fmt(Number(value))}` : ""
                      }
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Cumulative Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Cumulative Earnings vs Expenses
              </CardTitle>
              <CardDescription>
                Running total across {data.period.year}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={cumulativeData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted/30"
                  />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="Earnings"
                    stroke={COLORS.srWithDr}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Expenses"
                    stroke={COLORS.liquidation}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          {/* Technician Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Technicians ({data.technicians.length})
              </CardTitle>
              <CardDescription>
                {periodLabel} totals per technician. FTI is shown as reference
                only; Net uses SR earnings minus liquidation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.technicians.length === 0 ? (
                <p>No technicians found in department {data.department.departmentId}.</p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Technician</TableHead>
                        <TableHead className="text-right">SR with DR</TableHead>
                        <TableHead className="text-right">SR w/o DR</TableHead>
                        <TableHead className="text-right">SR Total</TableHead>
                        <TableHead className="text-right">FTI</TableHead>
                        <TableHead className="text-right">Liquidation</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.technicians.map((t) => (
                        <TableRow key={t.userId}>
                          <TableCell className="break-words min-w-40">{t.fullName}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(t.srWithDrTotal)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(t.srWithoutDrTotal)}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">{fmt(t.srTotal)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(t.ftiTotal)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(t.liquidationTotal)}</TableCell>
                          <TableCell className={`text-right tabular-nums font-semibold ${t.net >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(t.net)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Line details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Line details</CardTitle>
              <CardDescription>
                Expand a technician to inspect the underlying SR, FTI, and
                liquidation lines.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.technicians.every((t) => t.details.length === 0) ? (
                <p>No lines for this period.</p>
              ) : (
                data.technicians.map((t) =>
                  t.details.length === 0 ? null : (
                    <details key={t.userId} className="group rounded-lg border bg-muted/40 p-3 mb-2">
                      <summary className="cursor-pointer py-2 text-sm font-semibold">
                        {t.fullName} — SR {fmt(t.srTotal)} · FTI {fmt(t.ftiTotal)} · Liq. {fmt(t.liquidationTotal)}
                      </summary>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Type</TableHead>
                              <TableHead>Reference</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Customer</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {t.details.map((d) => (
                              <TableRow key={`${d.kind}-${d.refNo}`}>
                                <TableCell>{KIND_LABELS[d.kind]}</TableCell>
                                <TableCell className="font-mono break-all">{d.refNo}{d.drNumber ? ` · DR #${d.drNumber}` : ""}</TableCell>
                                <TableCell>{d.date}</TableCell>
                                <TableCell className="break-words">{d.companyName || "—"}</TableCell>
                                <TableCell className="text-right tabular-nums">{fmt(d.amount)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </details>
                  ),
                )
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground break-words">
            Excluded: {data.excluded.noDelivererCount} SR(s) worth {fmt(data.excluded.noDelivererTotal)}
            have no deliveredById and no linked DR; {data.excluded.outsideDeptCount} SR(s) worth
            {fmt(data.excluded.outsideDeptTotal)} were delivered by users outside {data.department.name}.
          </p>
        </>
      )}

      {!data && !loading && (
        <div className="text-center py-12 text-muted-foreground">
          Select a year/month, then click Load.
        </div>
      )}
      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}