"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `₱${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(date: string | undefined): string {
  if (!date) return "—";
  return date.slice(0, 10);
}

export function orderStatusBadge(status: string): React.ReactNode {
  const variant = status === "CONFIRMED" ? "default" : status === "DRAFT" ? "secondary" : status === "ON_HOLD" ? "outline" : status === "CANCELLED" ? "destructive" : status === "CLOSED" ? "ghost" : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

export function fulfillmentBadge(status: string): React.ReactNode {
  const variant = status === "FULFILLED" ? "default" : status === "PARTIAL" ? "secondary" : status === "UNFULFILLED" ? "outline" : "ghost";
  return <Badge variant={variant}>{status}</Badge>;
}

export function SummaryCards({ cards }: { cards: Array<{ label: string; value: string; hint?: string }> }): React.ReactNode {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="gap-2">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">{card.label}</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{card.value}</CardContent>
          {card.hint ? <p className="text-xs text-muted-foreground">{card.hint}</p> : null}
        </Card>
      ))}
    </div>
  );
}
