import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
// import { getUserByUsername } from "@/lib/userSheets";
import * as nodemailer from "nodemailer";

export async function POST(request: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const formData = await request.formData();
    const quotationNo = formData.get("quotationNo") as string;
    const clientName = (formData.get("customer") ||
      formData.get("clientName")) as string;
    const clientEmail = (formData.get("email") ||
      formData.get("clientEmail")) as string;
    const quotationDescription = formData.get("quotationDescription") as string;
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
    const smtpPassword = process.env.SMTP_PASSWORD;

    if (!smtpUser || !smtpPassword) {
      throw new Error("Missing SMTP credentials.");
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: { user: smtpUser, pass: smtpPassword },
    });

    // Convert File to Buffer
    const fileBytes = await pdfFile.arrayBuffer();
    const pdfBuffer = Buffer.from(fileBytes);

    // Send email to client
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; }
          .header { background: #1a365d; color: white; padding: 20px; }
          .content { padding: 20px; }
          .footer { background: #f7fafc; padding: 20px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>AERICH INNOVATION CORP.</h1>
        </div>
        <div class="content">
          <p>Dear ${clientName},</p>
          <p>Please find attached the quotation for ${quotationDescription}.</p>
          <p>Quotation Details:</p>
          <ul>
            <li>Quotation No: ${quotationNo}</li>
            <li>Total Amount: ₱${grandTotal.toFixed(2)}</li>
            <li>Date: ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</li>
          </ul>
          <p>Should you have any questions, please don't hesitate to contact us.</p>
          <br>
          <p>Best regards,</p>
          <p><strong>VON JERIC CARMONA</strong></p>
          <p>After-Sales Manager</p>
          <p>Aerich Innovation Corp</p>
          <p>09171832745</p>
        </div>
        <div class="footer">
          <p>BLK 4, LOT 2 Bamboo Orchard Subdivision, Brgy. Banay Banay, Cabuyao City, Laguna</p>
          <p>Email: aerichinnovationcorp@gmail.com</p>
        </div>
      </body>
      </html>
    `;

    await transporter.sendMail({
      from: smtpUser,
      to: clientEmail,
      cc: smtpUser,
      subject: `Quotation - ${quotationDescription}`,
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
    const message =
      error instanceof Error ? error.message : "Failed to send email.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
