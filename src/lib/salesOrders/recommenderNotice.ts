// Emails the recommending technician (CC After Sales managers and the company
// inbox) when a Sales Order is confirmed, so they raise the Purchase Request.
// Never throws: a mail problem must not block or roll back the order.

import type { SalesOrder, SalesOrderItem } from "@/types/salesOrder";
import { noticeRecipients, purchaseRequestNoticeEmail } from "@/lib/recommendedBy";
import { getUsers } from "@/lib/userSheets";
import { getPositions } from "@/lib/positionSheets";
import { sendEmail } from "@/lib/emailService";

export type RecommenderNotice = { status: "SENT" | "SKIPPED" | "FAILED"; warning?: string };

type NoticeOrder = Pick<SalesOrder, "salesOrderId" | "salesOrderNo" | "customerNameSnapshot" | "quotationNo" | "recommendedByUserId" | "recommendedByName">;
type NoticeItem = Pick<SalesOrderItem, "description" | "quantity" | "unitSnapshot" | "lineStatus">;

export async function notifyRecommender(order: NoticeOrder, items: readonly NoticeItem[], baseUrl: string): Promise<RecommenderNotice> {
  const technicianId = String(order.recommendedByUserId ?? "").trim();
  if (!technicianId) return { status: "SKIPPED" };
  try {
    const [users, positions] = await Promise.all([getUsers(), getPositions()]);
    const technician = users.find((user) => user.userId === technicianId);
    const technicianName = technician?.fullName || order.recommendedByName || "The technician";
    const recipients = noticeRecipients(technicianId, users, positions);
    if ("problem" in recipients) {
      const reason = recipients.problem === "NOT_A_USER" ? "is no longer a user"
        : recipients.problem === "NOT_AFTER_SALES" ? "is no longer in After Sales"
        : "has no email address";
      return { status: "FAILED", warning: `Technician was not notified: ${technicianName} ${reason}.` };
    }
    const { subject, html } = purchaseRequestNoticeEmail({
      salesOrderNo: order.salesOrderNo,
      customer: order.customerNameSnapshot,
      quotationNo: order.quotationNo ?? "",
      technicianName,
      items: items
        .filter((item) => item.lineStatus === "ACTIVE")
        .map((item) => ({ description: item.description, quantity: item.quantity, unit: item.unitSnapshot })),
      orderUrl: `${baseUrl}/dashboard/sales-orders/${order.salesOrderId}`,
      purchaseRequestUrl: `${baseUrl}/dashboard/purchase-requests`,
    });
    const result = await sendEmail({ to: recipients.to, cc: recipients.cc, subject, html });
    if (!result.success) return { status: "FAILED", warning: "Technician was not notified: email is not configured." };
    return { status: "SENT" };
  } catch (error) {
    console.error(`Recommender notice for Sales Order ${order.salesOrderNo || order.salesOrderId} failed:`, error);
    return { status: "FAILED", warning: "Technician was not notified: the email could not be sent." };
  }
}
