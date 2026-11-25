// Rules for the technician who recommended a quotation's work, and the email
// asking them to raise the Purchase Request once the Sales Order is confirmed.
// Pure module: no Sheets, no mail transport, so the focused tests share it.

import type { Position } from "../types/position.ts";
import type { OrderStatus } from "../types/salesOrder.ts";
import type { PublicUser } from "../types/user.ts";

/** After Sales — the department the sidebar's Technician group is built for. */
export const AFTER_SALES_DEPARTMENT_ID = 1;
/** Company inbox copied on every Purchase Request notice. */
export const COMPANY_INBOX = "aerichinnovationcorp@gmail.com";

type UserLite = Pick<PublicUser, "userId" | "fullName" | "username" | "email" | "departmentId" | "positionId">;

export interface RecommenderOption { userId: string; fullName: string }

const displayName = (user: Pick<UserLite, "fullName" | "username">): string =>
  user.fullName?.trim() || user.username?.trim() || "";

const isAfterSales = (user: Pick<UserLite, "departmentId">): boolean =>
  Number(user.departmentId) === AFTER_SALES_DEPARTMENT_ID;

export function recommenderOptions(users: readonly UserLite[]): RecommenderOption[] {
  return users
    .filter(isAfterSales)
    .map((user) => ({ userId: user.userId, fullName: displayName(user) }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export type ResolvedRecommender = { recommendedByUserId: string; recommendedByName: string };

/**
 * `stored` is the record's current recommender: an unchanged id is kept as is,
 * so a technician who later left After Sales never blocks unrelated edits.
 */
export function resolveRecommendedBy(
  userId: string | undefined,
  users: readonly UserLite[],
  stored?: ResolvedRecommender,
): ResolvedRecommender | { error: string } {
  const id = String(userId ?? "").trim();
  if (!id) return { recommendedByUserId: "", recommendedByName: "" };
  if (stored && stored.recommendedByUserId === id) return stored;
  const user = users.find((candidate) => candidate.userId === id);
  if (!user || !isAfterSales(user)) return { error: "The recommending technician must be an After Sales user." };
  return { recommendedByUserId: user.userId, recommendedByName: displayName(user) };
}

const normalEmail = (value: string | undefined): string => String(value ?? "").trim().toLowerCase();

/** Why a recommender cannot be emailed. */
export type NoticeProblem = "NOT_A_USER" | "NOT_AFTER_SALES" | "NO_EMAIL";

export function noticeRecipients(
  technicianUserId: string,
  users: readonly UserLite[],
  positions: readonly Position[],
): { to: string; cc: string[] } | { problem: NoticeProblem } {
  const technician = users.find((user) => user.userId === technicianUserId);
  if (!technician) return { problem: "NOT_A_USER" };
  if (!isAfterSales(technician)) return { problem: "NOT_AFTER_SALES" };
  const to = normalEmail(technician.email);
  if (!to) return { problem: "NO_EMAIL" };
  const managerPositions = new Set(
    positions.filter((p) => /manager/i.test(p.positionTitle ?? "")).map((p) => Number(p.positionId)),
  );
  const cc: string[] = [];
  const add = (email: string) => {
    if (email && email !== to && !cc.includes(email)) cc.push(email);
  };
  for (const user of users) {
    if (isAfterSales(user) && managerPositions.has(Number(user.positionId))) add(normalEmail(user.email));
  }
  add(COMPANY_INBOX);
  return { to, cc };
}

export function shouldSendRecommenderNotice(previous: OrderStatus | null, next: OrderStatus): boolean {
  return next === "CONFIRMED" && (previous === null || previous === "DRAFT");
}

export interface NoticeEmailInput {
  salesOrderNo: string;
  customer: string;
  quotationNo: string;
  technicianName: string;
  items: ReadonlyArray<{ description: string; quantity: number | null; unit: string }>;
  orderUrl: string;
  purchaseRequestUrl: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function purchaseRequestNoticeEmail(input: NoticeEmailInput): { subject: string; html: string } {
  const subject = `Purchase Request needed: ${input.salesOrderNo} (${input.customer})`;
  const fromQuotation = input.quotationNo.trim() ? ` from quotation ${escapeHtml(input.quotationNo)}` : "";
  const rows = input.items
    .map((item) => `<tr><td style="padding:4px 8px;border:1px solid #ddd">${escapeHtml(item.description)}</td>`
      + `<td style="padding:4px 8px;border:1px solid #ddd;text-align:right">${escapeHtml(item.quantity ?? "")}</td>`
      + `<td style="padding:4px 8px;border:1px solid #ddd">${escapeHtml(item.unit)}</td></tr>`)
    .join("");
  const table = rows
    ? `<table style="border-collapse:collapse;margin:12px 0"><thead><tr>`
      + `<th style="padding:4px 8px;border:1px solid #ddd;text-align:left">Item</th>`
      + `<th style="padding:4px 8px;border:1px solid #ddd">Qty</th>`
      + `<th style="padding:4px 8px;border:1px solid #ddd;text-align:left">Unit</th></tr></thead><tbody>${rows}</tbody></table>`
    : "";
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">`
    + `<p>Hi ${escapeHtml(input.technicianName)},</p>`
    + `<p>The client has confirmed Sales Order <strong>${escapeHtml(input.salesOrderNo)}</strong> for `
    + `<strong>${escapeHtml(input.customer)}</strong>${fromQuotation} that you recommended. Please create the Purchase Request.</p>`
    + table
    + `<p><a href="${escapeHtml(input.orderUrl)}">Open Sales Order</a> &nbsp;|&nbsp; `
    + `<a href="${escapeHtml(input.purchaseRequestUrl)}">Create Purchase Request</a></p>`
    + `</div>`;
  return { subject, html };
}
