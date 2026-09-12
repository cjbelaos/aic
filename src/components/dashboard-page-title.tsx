"use client";

import { usePathname } from "next/navigation";

export function DashboardPageTitle() {
  const path = usePathname();
  const segment = path.split("/").filter(Boolean).at(-1) ?? "dashboard";
  const title = segment === "delivery-releases" ? "Delivery receipts" : segment.replaceAll("-", " ");
  return <p className="text-sm font-semibold capitalize break-words">{title}</p>;
}
