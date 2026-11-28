"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Applies a URL query parameter (e.g. `?q=AIC-PR-2026-0001` from the inactive
 * product bell) once per distinct value, including when the link is followed
 * while the page is already open. `apply` runs during render, so it may only
 * set state; it returns false while the page cannot apply it yet (data still
 * loading), and is retried on the next render.
 */
export function useUrlParam(name: string, apply: (value: string) => boolean): void {
  const value = useSearchParams().get(name) ?? "";
  const [applied, setApplied] = useState("");
  if (!value && applied) setApplied("");
  else if (value && value !== applied && apply(value)) setApplied(value);
}
