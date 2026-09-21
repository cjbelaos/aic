import type { SessionUser } from "@/types/user";

/**
 * Super Admin accounts bypass every role, position and department gate in the
 * application (e.g. the Technician Earnings report and the FTI fuel-price
 * settings, which are otherwise restricted to the After Sales Manager or the
 * executive positions).
 *
 * The allow-list is keyed on `userId` — it stays valid across role, position
 * and department changes — and follows the same pattern already used for
 * `AFTER_SALES_DOCUMENT_RECEIVER_ID` in `documentHandoverWorkflow.ts`.
 *
 * Override at deploy time with a comma-separated `SUPER_ADMIN_USER_IDS`
 * environment variable. When the variable is unset (or blank) the defaults
 * below apply, so local development works with no extra configuration.
 *
 * NOTE: this module is server-owned. Client components must NOT import it —
 * they read the `isSuperAdmin` flag that `/api/auth/me` returns instead.
 */
export const DEFAULT_SUPER_ADMIN_USER_IDS: readonly string[] = [
  "bb71f1fb-daba-47d6-b70e-5b5bff3339ba",
];

function parseUserIds(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function getSuperAdminUserIds(): readonly string[] {
  const configured = process.env.SUPER_ADMIN_USER_IDS;
  if (configured && configured.trim()) return parseUserIds(configured);
  return DEFAULT_SUPER_ADMIN_USER_IDS;
}

export function isSuperAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return getSuperAdminUserIds().includes(userId);
}

export function isSuperAdmin(user: SessionUser | null | undefined): boolean {
  return isSuperAdminUserId(user?.userId);
}
