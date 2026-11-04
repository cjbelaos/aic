import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getUserByUsername } from "@/lib/userSheets";
import { getDepartmentById } from "@/lib/departmentSheets";
import { getPositionById } from "@/lib/positionSheets";
import * as nodemailer from "nodemailer";
import { sendQuotationVersion } from "@/lib/quotationSending";
import { QuotationError } from "@/lib/quotationTerms";

/** Escapes user-supplied values so they render safely inside the HTML email. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(request: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const formData = await request.formData();
    const quotationNo = (formData.get("quotationNo") as string) || "";
    const sendId = String(formData.get("sendId") || "");
    const snapshotToken = String(formData.get("snapshotToken") || "");
    const clientEmail =
      (formData.get("email") || formData.get("clientEmail") || "") as string;
    let cc: string[];
    try {
      cc = JSON.parse(String(formData.get("cc") || "null"));
      if (!Array.isArray(cc) || cc.some(email => typeof email !== "string")) throw new Error();
    } catch { throw new QuotationError("Review the quotation recipients before sending."); }
    const pdfFile = formData.get("file") as File;

    if (!quotationNo || !sendId || !snapshotToken || !clientEmail || !pdfFile || typeof pdfFile.arrayBuffer !== "function" || pdfFile.size > 20_000_000) {
      return NextResponse.json(
        {
          success: false,
          message:
            "A quotation number, send ID, saved snapshot, recipient and PDF under 20 MB are required.",
        },
        { status: 400 },
      );
    }

    // Get SMTP configuration
    const smtpUser = process.env.SMTP_USER;
    const smtpPassword = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;

    if (!smtpUser || !smtpPassword) {
      throw new Error("Missing SMTP credentials.");
    }

    const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: smtpPort,
      secure: process.env.SMTP_SECURE
        ? process.env.SMTP_SECURE === "true"
        : smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPassword },
    });

    // Convert File to Buffer
    const fileBytes = await pdfFile.arrayBuffer();
    const pdfBuffer = Buffer.from(fileBytes);

    // Sender signature: pull the latest user record so the name,
    // department, position, and contact number are always current.
    const signer = (await getUserByUsername(session.username)) || null;
    const department = signer?.departmentId
      ? await getDepartmentById(signer.departmentId)
      : null;
    const position = signer?.positionId
      ? await getPositionById(signer.positionId)
      : null;

    const signerName = escapeHtml(signer?.fullName || session.fullName || "");
    const signerRole = escapeHtml(
      [department?.departmentName || "", position?.positionTitle || ""]
        .filter(Boolean)
        .join(" "),
    );
    const signerContact = escapeHtml(signer?.contactNumber || "");

    const result = await sendQuotationVersion({ quotationNo, sendId, snapshotToken, recipient: clientEmail.trim(), cc, actor: session.username, pdfBuffer }, async (quotation, label, recipients) => {
    const escapedClientName = escapeHtml(quotation.customer);
    const escapedQuotationNo = escapeHtml(label);
    const escapedQuotationDescription = escapeHtml(quotation.description);
    const isRevision = (quotation.revision || 0) > 0;

    const formattedAmount = quotation.amount.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const formattedDate = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    // Email body
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { margin: 0; padding: 0; background-color: #f5f5f5; font-family: Arial, Helvetica, sans-serif; color: #333333; line-height: 1.6; }
          .container { max-width: 650px; margin: 20px auto; background-color: #ffffff; }
          .header { background-color: #1a365d; color: #ffffff; padding: 24px 30px; }
          .header h1 { margin: 0; font-size: 22px; letter-spacing: 0.5px; }
          .content { padding: 30px; }
          .content p { margin: 0 0 16px; }
          .quotation-details { margin: 24px 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
          .quotation-title { margin: 0; padding: 12px 16px; background-color: #f7fafc; font-size: 16px; color: #1a365d; border-bottom: 1px solid #e2e8f0; }
          .quotation-table { width: 100%; border-collapse: collapse; }
          .quotation-table td { padding: 10px 16px; border-bottom: 1px solid #edf2f7; }
          .quotation-table tr:last-child td { border-bottom: none; }
          .label { width: 40%; font-weight: bold; color: #555555; }
          .amount { font-weight: bold; color: #1a365d; }
          .signature { margin-top: 30px; }
          .signature p { margin: 2px 0; }
          .footer { background-color: #f7fafc; padding: 18px 30px; font-size: 12px; color: #666666; text-align: center; border-top: 1px solid #e2e8f0; }
          .footer p { margin: 3px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>AERICH INNOVATION CORP.</h1>
          </div>
          <div class="content">
            <p>Dear ${escapedClientName},</p>
            ${isRevision ? `
            <p>Please find attached <strong>Revision ${quotation.revision} of Quotation ${escapeHtml(quotation.quotationNo)}</strong> for <strong>${escapedQuotationDescription}</strong>.</p>
            <p>This revised quotation supersedes the version previously sent under the same quotation number. Please refer to the attached PDF for the updated scope, pricing, Terms of Payment, Delivery, and Warranty.</p>
            <p>Kindly review the revised quotation and let us know if you have any questions or require further clarification.</p>
            <p>Thank you.</p>
            ` : `
            <p>Thank you for your interest in our products and services.</p>
            <p>Please find attached our quotation for <strong>${escapedQuotationDescription}</strong> for your review.</p>
            <div class="quotation-details">
              <h3 class="quotation-title">Quotation Details</h3>
              <table class="quotation-table">
                <tr>
                  <td class="label">Quotation No.</td>
                  <td>${escapedQuotationNo}</td>
                </tr>
                <tr>
                  <td class="label">Date</td>
                  <td>${formattedDate}</td>
                </tr>
                <tr>
                  <td class="label">Total Amount</td>
                  <td class="amount">&#8369;${formattedAmount}</td>
                </tr>
              </table>
            </div>
            <p>We hope our quotation meets your requirements. Should you have any questions, require further clarification, or wish to discuss any of the details, please feel free to contact us.</p>
            <p>We look forward to the opportunity to work with you.</p>
            `}
            <div class="signature">
              <p>Best regards,</p>
              <br>
              <p><strong>${signerName}</strong></p>
              ${signerRole ? `<p>${signerRole}</p>` : ""}
              <p>Aerich Innovation Corp.</p>
              ${signerContact ? `<p>${signerContact}</p>` : ""}
            </div>
          </div>
          <div class="footer">
            <p>BLK 4, LOT 2 Bamboo Orchard Subdivision, Brgy. Banay Banay, Cabuyao City, Laguna</p>
            <p>aerichinnovationcorp@gmail.com</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const delivery = await transporter.sendMail({
      from: smtpUser,
      to: recipients.to,
      cc: recipients.cc,
      subject: isRevision ? `Revised Quotation ${label} | Aerich Innovation Corp.` : `Quotation ${label} - ${quotation.description} | Aerich Innovation Corp.`,
      html: emailHtml,
      attachments: [
        {
          filename: `Quotation - ${label.replace(/[^\w -]/g, "_")}.pdf`,
          content: pdfBuffer,
        },
      ],
    });
    return { messageId: delivery.messageId, accepted: delivery.accepted || [] };
    });

    return NextResponse.json(
      {
        success: true,
        message: "Quotation sent successfully.",
        data: result,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Send email error:", error);
    const authenticationFailed =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "EAUTH";
    const message = authenticationFailed
      ? "Email login failed. Check the SMTP username and password configured on the server."
      : error instanceof Error
        ? error.message
        : "Failed to send email.";
    return NextResponse.json({ success: false, message }, { status: error instanceof QuotationError ? error.status : 500 });
  }
}
