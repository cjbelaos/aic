"use client";

import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BacklogCustomer } from "@/types/contract-release";
import { monthLabel } from "./format";

interface Props {
  backlog: BacklogCustomer[];
  loading: boolean;
  selectedId: string;
  onSelect: (companyId: string) => void;
}

/** Customers owed releases, most overdue first. */
export function BacklogList({ backlog, loading, selectedId, onSelect }: Props) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">Backlog (owed now)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : backlog.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nothing owed. All active agreements are up to date.</p>
        ) : (
          backlog.map((b) => (
            <button
              key={b.companyId}
              type="button"
              onClick={() => onSelect(b.companyId)}
              className={`w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/60 ${
                b.companyId === selectedId ? "border-primary bg-muted" : "border-transparent"
              }`}
            >
              <p className="truncate text-sm font-medium">{b.companyName}</p>
              <p className="text-xs text-muted-foreground">
                owed {b.owedQty}
                {b.overduePeriods > 0 && (
                  <span className="text-destructive"> · {b.overduePeriods} overdue · since {monthLabel(b.oldestOverdue)}</span>
                )}
                {b.agreementCount > 1 ? ` · ${b.agreementCount} agreements` : ""}
              </p>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
