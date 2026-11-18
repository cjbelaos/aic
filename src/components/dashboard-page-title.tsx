"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

const TITLE_EVENT = "dashboard:page-title";
const ID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function titleFor(segment: string): string {
  return segment === "delivery-releases" ? "Delivery receipts" : segment.replaceAll("-", " ");
}

/** Lets a detail page replace the top-bar title (e.g. with a document number) for its own path. */
export function useDashboardPageTitle(title: string | undefined): void {
  const path = usePathname();
  React.useEffect(() => {
    if (!title) return;
    window.dispatchEvent(new CustomEvent(TITLE_EVENT, { detail: { path, title } }));
  }, [path, title]);
}

export function DashboardPageTitle() {
  const path = usePathname();
  const [override, setOverride] = React.useState<{ path: string; title: string } | null>(null);
  React.useEffect(() => {
    const listener = (event: Event) => setOverride((event as CustomEvent<{ path: string; title: string }>).detail);
    window.addEventListener(TITLE_EVENT, listener);
    return () => window.removeEventListener(TITLE_EVENT, listener);
  }, []);
  const segments = path.split("/").filter(Boolean);
  // A record ID is never a useful title: fall back to its section.
  const segment = [...segments].reverse().find((part) => !ID_SEGMENT.test(part)) ?? "dashboard";
  const title = override?.path === path ? override.title : titleFor(segment);
  return <p className={`text-sm font-semibold break-words ${override?.path === path ? "" : "capitalize"}`}>{title}</p>;
}
