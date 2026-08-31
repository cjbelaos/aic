"use client";
import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

type SIRow = { invoiceNo: string; date: string; companyName: string; total: number; drNumber?: number };
type ExpRow = { liquidationId: string; controlNo: string; date: string; totalAmount: number };

type SummaryData = {
  period: { year: number; month: number; startDate: string; endDate: string };
  revenue: { total: number; invoiceCount: number; details: SIRow[] };
  expenses: { total: number; liquidationCount: number; details: ExpRow[] };
  netProfit: number;
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function Page() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);

  const years = useMemo(() => {
    const cy = now.getFullYear();
    const r: number[] = [];
    for (let y = cy - 2; y <= cy; y++) r.push(y);
    return r;
  }, [now]);

  const fmt = (v: number) => v.toLocaleString("en-PH", { style: "currency", currency: "PHP" });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/monthly-summary?year=${year}&month=${month}`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      setData(await res.json());
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Monthly Profit Summary</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Label>Month</Label>
          <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v, 10))}>
            <SelectTrigger style={{ width: 140 }}><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((n, i) => (<SelectItem key={i+1} value={String(i+1)}>{n}</SelectItem>))}</SelectContent>
          </Select>
          <Label>Year</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
            <SelectTrigger style={{ width: 100 }}><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}</SelectContent>
          </Select>
          <Button onClick={load} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Load</Button>
        </div>
      </div>
{data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
            <Card>
              <CardHeader><CardTitle><TrendingUp style={{ color: "green" }} /> Revenue (SI)</CardTitle></CardHeader>
              <CardContent><div style={{ fontSize: 24, fontWeight: 700, color: "green" }}>{fmt(data.revenue.total)}</div><p>{data.revenue.invoiceCount} invoice(s)</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle><TrendingDown style={{ color: "red" }} /> Expenses</CardTitle></CardHeader>
              <CardContent><div style={{ fontSize: 24, fontWeight: 700, color: "red" }}>{fmt(data.expenses.total)}</div><p>{data.expenses.liquidationCount} liquidation(s)</p></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle><DollarSign /> Net Profit</CardTitle></CardHeader>
              <CardContent><div style={{ fontSize: 24, fontWeight: 700, color: data.netProfit >= 0 ? "green" : "red" }}>{fmt(data.netProfit)}</div><p>Revenue - Expenses</p></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Service Invoices ({data.revenue.invoiceCount})</CardTitle></CardHeader>
            <CardContent>
              {data.revenue.details.length === 0 ? <p>No invoices for this period.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Invoice No.</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead>Linked DR</TableHead><TableHead style={{ textAlign: "right" }}>Amount</TableHead></TableRow></TableHeader>
                  <TableBody>{data.revenue.details.map((si) => (<TableRow key={si.invoiceNo}><TableCell style={{ fontFamily: "monospace" }}>{si.invoiceNo}</TableCell><TableCell>{si.date}</TableCell><TableCell>{si.companyName}</TableCell><TableCell>{si.drNumber ? "DR #" + si.drNumber : "-"}</TableCell><TableCell style={{ textAlign: "right" }}>{fmt(si.total)}</TableCell></TableRow>))}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Liquidation Expenses ({data.expenses.liquidationCount})</CardTitle></CardHeader>
            <CardContent>
              {data.expenses.details.length === 0 ? <p>No expenses for this period.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Liquidation ID</TableHead><TableHead>FTI Control No.</TableHead><TableHead>Date</TableHead><TableHead style={{ textAlign: "right" }}>Amount</TableHead></TableRow></TableHeader>
                  <TableBody>{data.expenses.details.map((exp) => (<TableRow key={exp.liquidationId}><TableCell style={{ fontFamily: "monospace", fontSize: 12 }}>{exp.liquidationId.slice(0, 8) + "..."}</TableCell><TableCell style={{ fontFamily: "monospace" }}>{exp.controlNo || "-"}</TableCell><TableCell>{exp.date}</TableCell><TableCell style={{ textAlign: "right" }}>{fmt(exp.totalAmount)}</TableCell></TableRow>))}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!data && !loading && <div style={{ textAlign: "center", padding: 48 }}>Select a month/year and click Load.</div>}
      {loading && <div style={{ display: "flex", justifyContent: "center", padding: 48 }}><Loader2 className="animate-spin" /></div>}
    </div>
  );
}