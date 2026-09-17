import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getUserByUsername } from "@/lib/userSheets";
import { getDepartmentById } from "@/lib/departmentSheets";
import { getPositionById } from "@/lib/positionSheets";
import * as nodemailer from "nodemailer";

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
    const clientName =
      (formData.get("customer") ||
        formData.get("clientName") ||
        "") as string;
    const clientEmail =
      (formData.get("email") || formData.get("clientEmail") || "") as string;
    const quotationDescription =
      (formData.get("quotationDescription") as string) || "";
    const grandTotal = parseFloat(formData.get("grandTotal") as string) || 0;
    const pdfFile = formData.get("file") as File;

    if (!quotationNo || !clientName || !clientEmail || !pdfFile) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Missing required fields: quotationNo, customer name, email, or PDF file.",
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

    const escapedClientName = escapeHtml(clientName);
    const escapedQuotationNo = escapeHtml(quotationNo);
    const escapedQuotationDescription = escapeHtml(quotationDescription);

    const formattedAmount = grandTotal.toLocaleString("en-PH", {
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

    await transporter.sendMail({
      from: smtpUser,
      to: clientEmail,
      cc: smtpUser,
      subject: `Quotation ${quotationNo} - ${quotationDescription} | Aerich Innovation Corp.`,
      html: emailHtml,
      attachments: [
        {
          filename: `Quotation - ${quotationDescription}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    return NextResponse.json(
      {
        success: true,
        message: `Quotation sent successfully to ${clientName}.`,
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
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
