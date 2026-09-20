// Capability checks for Sales Order actions. Server-owned authorization:
// routes must gate every mutation endpoint, including object-level rules
// (e.g. editing a draft you were assigned). Role → capability mapping is a
// recorded Phase 1 business gate; until roles are mapped, only the admin role
// is trusted and every unknown role is denied with an explicit message.

export type SalesCapability =
  | "so.view"
  | "so.create"
  | "so.edit.draft"
  | "so.confirm"
  | "so.confirm.override"
  | "so.hold"
  | "so.cancel"
  | "so.assign"
  | "so.fulfill"
  | "so.view.totals"
  | "so.attach"
  | "so.sync.retry"
  | "so.manage.setup"
  | "so.import";

/**
 * Provisional mapping. ADMIN (userRoleId 1) is fully trusted. Other role IDs
 * are intentionally NOT mapped: assigning sales/sales-manager/operations/
 * finance capabilities requires the recorded business gate (role permissions).
 */
export const ADMIN_ROLE_ID = 1;
const UNMAPPED_ROLE_MESSAGE =
  "Sales Order role permissions are an unresolved business gate; this role is not yet mapped. " +
  "Assign capabilities only after the Phase 1 role-mapping decision.";

export function capabilitiesForRole(roleId: number): ReadonlySet<SalesCapability> {
  if (roleId === ADMIN_ROLE_ID) {
    return new Set<SalesCapability>([
      "so.view",
      "so.create",
      "so.edit.draft",
      "so.confirm",
      "so.confirm.override",
      "so.hold",
      "so.cancel",
      "so.assign",
      "so.fulfill",
      "so.view.totals",
      "so.attach",
      "so.sync.retry",
      "so.manage.setup",
      "so.import",
    ]);
  }
  return new Set<SalesCapability>();
}

export interface CapabilityContext {
  roleId: number;
  /** Actor userId, when object-level ownership applies. */
  actorUserId?: string;
  /** Assignee of the order, when the capability is scoped to the assignee. */
  assignedToUserId?: string;
  orderStatus?: string;
}

/**
 * Resolves whether `actor` may perform `capability`. When the role has no
 * mapping at all, resolution returns denied with the unresolved-gate message
 * so no endpoint silently weakens the plan.
 */
export function can(capability: SalesCapability, context: CapabilityContext): { allowed: boolean; reason?: string } {
  const caps = capabilitiesForRole(context.roleId);
  if (context.roleId !== ADMIN_ROLE_ID && caps.size === 0) {
    return { allowed: false, reason: UNMAPPED_ROLE_MESSAGE };
  }
  if (caps.has(capability)) return { allowed: true };
  // Object-level rule: the assignee of a draft may edit it without the global
  // sales role mapping, matching the plan's "sales creates/edits assigned drafts".
  if (capability === "so.edit.draft" && context.assignedToUserId && context.actorUserId === context.assignedToUserId) {
    if (context.orderStatus === undefined || context.orderStatus === "DRAFT") return { allowed: true };
  }
  return { allowed: false, reason: `Capability ${capability} is not granted to role ${context.roleId}.` };
}

export function requirePermission(
  capability: SalesCapability,
  context: CapabilityContext,
  fallbackMessage = "Forbidden. You do not have permission for this Sales Order action.",
): { allowed: false; reason: string } | { allowed: true; reason?: undefined } {
  const result = can(capability, context);
  if (result.allowed) return { allowed: true };
  return { allowed: false, reason: result.reason ?? fallbackMessage };
}