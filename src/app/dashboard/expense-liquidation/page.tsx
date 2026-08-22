"use client";

import { Suspense, useState } from "react";
import { LiquidationForm } from "@/components/liquidation-form";

interface StoredUser {
  userId?: string;
  departmentId?: number;
}

function getStoredUser(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("auth:user");
    if (!raw) return "";
    const parsed = JSON.parse(raw) as StoredUser;
    return parsed?.userId || "";
  } catch {
    return "";
  }
}

function getStoredDepartmentId(): number {
  if (typeof window === "undefined") return 1;
  try {
    const raw = window.localStorage.getItem("auth:user");
    if (!raw) return 1;
    const parsed = JSON.parse(raw) as StoredUser;
    return typeof parsed.departmentId === "number" ? parsed.departmentId : 1;
  } catch {
    return 1;
  }
}

/**
 * Fetches the current user from localStorage (set by the login flow) and
 * renders the expense liquidation submission form. The actual UserId used
 * when writing to the database is captured server-side from the session.
 *
 * Non-After Sales departments (departmentId !== 1) are restricted to
 * "Other (No FTI)" mode only.
 */
function ExpenseLiquidationPageInner() {
  const [userId] = useState<string | "">(getStoredUser);
  const [departmentId] = useState<number>(getStoredDepartmentId);
  const restrictToOther = departmentId !== 1;

  // Deep-link support: /dashboard/expense-liquidation?controlNo=CTRL-...
  // (e.g. "Add Liquidation" from the FTI preview modal).
  let initialControlNo = "";
  if (typeof window !== "undefined") {
    initialControlNo =
      new URLSearchParams(window.location.search).get("controlNo") || "";
  }

  return (
    <LiquidationForm
      userId={userId}
      initialControlNo={initialControlNo}
      restrictToOther={restrictToOther}
    />
  );
}

export default function ExpenseLiquidationPage() {
  return (
    <Suspense fallback={null}>
      <ExpenseLiquidationPageInner />
    </Suspense>
  );
}
