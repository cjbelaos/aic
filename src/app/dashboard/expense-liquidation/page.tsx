"use client";

import { Suspense, useState } from "react";
import { LiquidationForm } from "@/components/liquidation-form";

function getStoredUser(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("auth:user");
    if (!raw) return "";
    // auth:user is a JSON object (e.g. { userId, fullName, userName }).
    // Extract ONLY the userId string — passing the parsed object down
    // broke userService.getUserById and left the technician name blank.
    const parsed = JSON.parse(raw) as { userId?: string; userName?: string };
    return parsed?.userId || parsed?.userName || "";
  } catch {
    // ignore parse errors
    return "";
  }
}

/**
 * Fetches the current user from localStorage (set by the login flow) and
 * renders the expense liquidation submission form. The actual UserId used
 * when writing to the database is captured server-side from the session.
 */
function ExpenseLiquidationPageInner() {
  const [userId] = useState<string | "">(getStoredUser);

  // Deep-link support: /dashboard/expense-liquidation?controlNo=CTRL-...
  // (e.g. "Add Liquidation" from the FTI preview modal).
  let initialControlNo = "";
  if (typeof window !== "undefined") {
    initialControlNo =
      new URLSearchParams(window.location.search).get("controlNo") || "";
  }

  return (
    <LiquidationForm userId={userId} initialControlNo={initialControlNo} />
  );
}

export default function ExpenseLiquidationPage() {
  return (
    <Suspense fallback={null}>
      <ExpenseLiquidationPageInner />
    </Suspense>
  );
}
