"use client";

import { Suspense, useState } from "react";
import { LiquidationForm } from "@/components/liquidation-form";

interface StoredUser {
  userId?: string;
  fullName?: string;
  userName?: string;
}

function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("auth:user");
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    // ignore parse errors
    return null;
  }
}

/**
 * Fetches the current user from localStorage (set by the login flow) and
 * renders the expense liquidation submission form. The actual UserId used
 * when writing to the database is captured server-side from the session.
 */
function ExpenseLiquidationPageInner() {
  const [user] = useState<StoredUser | null>(getStoredUser);

  // Deep-link support: /dashboard/expense-liquidation?controlNo=CTRL-...
  // (e.g. "Add Liquidation" from the FTI preview modal).
  let initialControlNo = "";
  if (typeof window !== "undefined") {
    initialControlNo =
      new URLSearchParams(window.location.search).get("controlNo") || "";
  }

  return <LiquidationForm user={user} initialControlNo={initialControlNo} />;
}

export default function ExpenseLiquidationPage() {
  return (
    <Suspense fallback={null}>
      <ExpenseLiquidationPageInner />
    </Suspense>
  );
}
