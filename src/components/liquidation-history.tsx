"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  ReceiptText,
  FileText,
  ChevronDown,
  ChevronUp,
  History,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { liquidationService } from "@/lib/services/liquidation.service";
import type { LiquidationFull } from "@/types/liquidation";

export function LiquidationHistory() {
  const [liquidations, setLiquidations] = useState<LiquidationFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await liquidationService.getMyLiquidations();
        if (!cancelled) setLiquidations(data);
      } catch (err) {
        console.error("Failed to load liquidation history:", err);
        if (!cancelled) setError("Failed to load your liquidation history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
    }).format(value);

  const isDriveUrl = (url: string) => url.includes("drive.google.com");

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading liquidation history...
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-destructive">{error}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (liquidations.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <History className="h-12 w-12 text-muted-foreground" />
          <CardTitle className="text-xl">No Liquidations Yet</CardTitle>
          <p className="max-w-md text-sm text-muted-foreground">
            You have not submitted any expense liquidations yet. Head over to
            the Expense Liquidation form to submit your first batch.
          </p>
          <Button asChild className="mt-2">
            <Link href="/dashboard/expense-liquidation">
              <ReceiptText className="mr-2 h-4 w-4" />
              Submit Expense Liquidation
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {liquidations.map((liquidation) => {
        const isExpanded = expandedId === liquidation.liquidationId;
        return (
          <Card key={liquidation.liquidationId}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-base">
                    Liquidation #{liquidation.liquidationId.slice(0, 8)}
                  </CardTitle>
                  <CardDescription className="font-mono text-xs">
                    {liquidation.liquidationId}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <CardDescription>Total Amount</CardDescription>
                    <p className="text-lg font-bold tracking-tight">
                      {formatCurrency(liquidation.totalAmount)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : liquidation.liquidationId)
                    }
                  >
                    {isExpanded ? (
                      <ChevronUp className="mr-1 h-4 w-4" />
                    ) : (
                      <ChevronDown className="mr-1 h-4 w-4" />
                    )}
                    {isExpanded ? "Hide Items" : "View Items"}
                  </Button>
                </div>
              </div>
              <CardDescription>
                {liquidation.items.length} receipt item(s)
              </CardDescription>
            </CardHeader>

            {isExpanded && (
              <CardContent>
                {liquidation.items.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No receipt items on record.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {liquidation.items.map((item) => {
                      const itemIsDrive = isDriveUrl(item.receiptImageUrl);
                      return (
                        <div
                          key={item.receiptItemId}
                          className="rounded-xl border bg-card p-3 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="whitespace-nowrap text-sm font-medium">
                                  {item.date}
                                </span>
                                <Badge variant="secondary" className="text-xs">
                                  {item.category}
                                </Badge>
                              </div>
                              <p className="mt-1 truncate text-sm text-muted-foreground">
                                {item.description}
                              </p>
                              <p className="mt-1 text-lg font-bold">
                                {formatCurrency(item.amount)}
                              </p>
                            </div>
                            {item.receiptImageUrl ? (
                              <a
                                href={item.receiptImageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Open receipt"
                                className="shrink-0"
                              >
                                {itemIsDrive ? (
                                  <img
                                    src={`/api/images/drive/${getFileId(
                                      item.receiptImageUrl,
                                    )}`}
                                    alt="Receipt"
                                    className="h-14 w-14 rounded-lg border object-cover"
                                    onError={(e) => {
                                      // If the file is a PDF (or the proxy
                                      // fails), hide the image entirely and
                                      // show the file-type badge instead.
                                      (e.target as HTMLElement).style.display =
                                        "none";
                                    }}
                                  />
                                ) : (
                                  <div className="flex h-14 w-14 items-center justify-center rounded-lg border bg-muted">
                                    <FileText className="h-6 w-6 text-muted-foreground" />
                                  </div>
                                )}
                              </a>
                            ) : (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                No receipt
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/**
 * Extracts the Drive file ID from a public webViewLink URL
 * (e.g. https://drive.google.com/file/d/{fileId}/view → {fileId}).
 */
function getFileId(url: string): string {
  const match = url.match(/\/file\/d\/([^/]+)/);
  return match ? match[1] : "";
}