"use client";

import { useState } from "react";
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
export default function ExpenseLiquidationPage() {
  const [user] = useState<StoredUser | null>(getStoredUser);

  return <LiquidationForm user={user} />;
}
