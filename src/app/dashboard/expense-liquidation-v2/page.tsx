"use client";

import { LiquidationListV2 } from "@/components/liquidation-list-v2";

/**
 * ISOLATED SANDBOX PAGE — Expense Liquidation V2.
 * Reads/writes the dedicated `ReceiptItems_V2` / `Liquidations_V2` tabs.
 * The production `/dashboard/expense-liquidation` page is untouched.
 */
export default function ExpenseLiquidationV2Page() {
  return <LiquidationListV2 />;
}