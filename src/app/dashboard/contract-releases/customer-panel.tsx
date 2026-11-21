"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, Eye, Loader2, Truck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import deliveryService from "@/lib/services/delivery.service";
import type { AgreementLedger, CustomerLedger, LedgerPeriod } from "@/types/contract-release";
import type { DeliveryReceiptResponse } from "@/types/deliveryReceipt";
import { monthLabel, shortMonth } from "./format";

interface Props {
  customer: CustomerLedger | null;
  loading: boolean;
  today: string;
  onRelease: (agreement: AgreementLedger) => void;
  onPreview: (dr: DeliveryReceiptResponse) => void;
}

const STATUS_CLASS: Record<string, string> = {
  Completed: "bg-emerald-600 text-white hover:bg-emerald-700",
  Partial: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300",
  Overdue: "bg-destructive text-white",
  Pending: "",
};

function PeriodChip({ period, today }: { period: LedgerPeriod; today: string }) {
  const current = period.periodStart <= today && today <= period.periodEnd;
  if (current) {
    return (
      <Badge variant="outline" className="font-normal">
        {shortMonth(period.periodStart)} {period.releasedQty}/{period.entitledQty}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-destructive/50 font-normal text-destructive">
      {shortMonth(period.periodStart)} ⚠{period.shortfall}
    </Badge>
  );
}

/** A selected customer's agreements: what is owed per item, release button and history. */
export function CustomerPanel({ customer, loading, today, onRelease, onPreview }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);

  if (loading) {
    return (
      <Card className="min-w-0">
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  if (!customer) {
    return (
      <Card className="min-w-0">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Pick a customer from the backlog or the search above.
        </CardContent>
      </Card>
    );
  }

  const preview = async (drNumber: number) => {
    try {
      onPreview(await deliveryService.getPreview(drNumber));
    } catch {
      toast.error("Failed to load DR preview.");
    }
  };

  return (
    <div className="min-w-0 space-y-4">
      <h2 className="text-lg font-semibold">{customer.companyName}</h2>
      {customer.agreements.length === 0 && (
        <p className="text-sm text-muted-foreground">No active agreements for this customer.</p>
      )}
      {customer.agreements.map((a) => {
        const owed = a.items.some((i) => i.owedNow > 0);
        return (
          <Card key={a.contractId} className="min-w-0">
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div className="min-w-0">
                <CardTitle className="text-base">
                  {a.contractId} · {a.agreementType}
                  {a.agreementType === "PO" && a.poNumber ? ` · PO ${a.poNumber}` : ""}
                </CardTitle>
                {a.description && <CardDescription className="break-words">{a.description}</CardDescription>}
              </div>
              <Button
                size="sm"
                onClick={() => onRelease(a)}
                disabled={!owed}
                title={owed ? undefined : "Nothing owed. Extra releases go through the Delivery Release page."}
              >
                <Truck className="mr-1 h-4 w-4" /> Release…
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {a.items.length === 0 && <p className="text-sm text-muted-foreground">No active items.</p>}
              {a.items.map((item) => {
                const open = item.periods.filter((p) => p.shortfall > 0);
                return (
                  <div key={item.contractItemId} className="space-y-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="text-sm font-medium">{item.productName}</span>
                      <span className={item.owedNow > 0 ? "text-sm font-semibold" : "text-sm text-muted-foreground"}>
                        owed {item.owedNow}
                        {item.unit ? ` ${item.unit}` : ""}
                      </span>
                    </div>
                    {open.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {open.map((p) => (
                          <PeriodChip key={p.periodId} period={p} today={today} />
                        ))}
                      </div>
                    )}
                    {item.openPeriods > 1 && (
                      <p className="text-xs text-muted-foreground">catch-up: {item.openPeriods} visits due</p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1">
            <ChevronDown className={`h-4 w-4 transition-transform ${historyOpen ? "rotate-180" : ""}`} /> History
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-2">
          <div className="space-y-1">
            <p className="text-sm font-medium">Linked DRs</p>
            {customer.linkedDrs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No releases recorded yet.</p>
            ) : (
              customer.linkedDrs.map((dr) => (
                <div key={dr.drNumber} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5">
                  <div className="min-w-0 text-sm">
                    <span className="font-medium">DR #{dr.drNumber}</span>
                    <span className="text-muted-foreground"> · {dr.date} · {dr.contractId} · {dr.itemCount} item(s)</span>
                    {dr.status && <span className="text-muted-foreground"> · {dr.status}</span>}
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="View Preview" onClick={() => preview(dr.drNumber)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {dr.driveFileLink && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-blue-600"
                        title="Open Drive PDF"
                        onClick={() => window.open(dr.driveFileLink, "_blank")}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Released</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.agreements.flatMap((a) =>
                  a.items.flatMap((item) =>
                    [...item.periods].reverse().map((p) => (
                      <TableRow key={p.periodId}>
                        <TableCell className="max-w-48 truncate">{item.productName}</TableCell>
                        <TableCell className="whitespace-nowrap">{monthLabel(p.periodStart)}</TableCell>
                        <TableCell className="text-right">{p.entitledQty}</TableCell>
                        <TableCell className="text-right">{p.releasedQty}</TableCell>
                        <TableCell>
                          <Badge variant={p.status === "Pending" ? "outline" : "default"} className={STATUS_CLASS[p.status]}>
                            {p.status === "Completed" ? "Done" : p.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )),
                  ),
                )}
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
