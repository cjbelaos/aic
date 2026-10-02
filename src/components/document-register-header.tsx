"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DocumentRegisterHeader({ eyebrow, title, description, actions, cards, loading = false }: {
  eyebrow: string;
  title: string;
  description: string;
  actions: ReactNode;
  cards: { label: string; count: number; selected: boolean; onClick: () => void }[];
  loading?: boolean;
}) {
  return <section aria-label={`${title} overview`} className="rounded-lg border bg-card p-4 sm:p-5">
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{eyebrow}</p>
    <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="text-sm text-muted-foreground">{description}</p></div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3" aria-label="Filter by document status" aria-busy={loading}>
      {cards.map(card => <button key={card.label} type="button" disabled={loading} aria-pressed={card.selected} onClick={card.onClick} className={cn("min-w-0 rounded-md border px-3 py-2 text-left transition-colors sm:min-w-28 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", card.selected ? "border-ring bg-muted" : "border-transparent bg-muted/60 hover:bg-muted")}><span className="block text-xs text-muted-foreground">{card.label}</span><strong className="text-xl tabular-nums">{loading ? "—" : card.count}</strong></button>)}
    </div>
  </section>;
}
