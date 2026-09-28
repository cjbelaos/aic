"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, TrendingUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ReportAccessResponse {
  canAccess?: boolean;
}

/**
 * Confidential profit reports (Technician Earnings and the Monthly Summary)
 * are restricted to the CEO, CFO, COO and the Super Admin allow-list. The
 * server owns that rule, so the client mirrors the access endpoints instead of
 * duplicating it.
 */
function useReportAccess(endpoint: string): boolean {
  const [canAccess, setCanAccess] = useState(false);

  useEffect(() => {
    let mounted = true;
    void fetch(endpoint)
      .then(async (response) => {
        if (!response.ok) return false;
        const body = (await response.json()) as ReportAccessResponse;
        return body.canAccess === true;
      })
      .then((allowed) => {
        if (mounted) setCanAccess(allowed);
      })
      .catch(() => {
        if (mounted) setCanAccess(false);
      });
    return () => {
      mounted = false;
    };
  }, [endpoint]);

  return canAccess;
}

export default function DashboardPage() {
  const canSeeTechnicianEarnings = useReportAccess(
    "/api/reports/technician-earnings/access",
  );
  const canSeeMonthlySummary = useReportAccess(
    "/api/reports/monthly-summary/access",
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Welcome to your app</CardTitle>
          <CardDescription>
            This is the main authenticated page with the sidebar navigation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Use the menu on the left to navigate through the experience.
          </p>
        </CardContent>
      </Card>

      {/* ── Quick access to the summary reports ─────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {canSeeTechnicianEarnings && (
          <Link href="/dashboard/technician-earnings" className="group">
            <Card className="h-full transition-colors group-hover:border-blue-400/60 group-hover:bg-accent/40">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    Technician Earnings
                  </CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardDescription>
                  Monthly earnings vs. expenses for every technician.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400">
                  Open report
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </CardContent>
            </Card>
          </Link>
        )}

        {canSeeMonthlySummary && (
          <Link href="/dashboard/monthly-summary" className="group">
            <Card className="h-full transition-colors group-hover:border-emerald-400/60 group-hover:bg-accent/40">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Monthly Summary</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardDescription>
                  Monthly revenue, expenses and net profit for the company.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  Open summary
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>
    </div>
  );
}
