import nodemailer from "nodemailer";

/**
 * Sends an HTML email using SMTP credentials from environment variables.
 * Returns success:false (without throwing) when SMTP is not configured.
 */
export async function sendEmail({
  to,
  cc,
  subject,
  html,
}: {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
}): Promise<{ success: boolean }> {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS
  ) {
    console.warn("SMTP not configured — skipping email send.");
    return { success: false };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    ...(cc && cc.length > 0 ? { cc } : {}),
    subject,
    html,
  });

  return { success: true };
}

/**
 * Sends a quotation email to the specified recipient.
 * Uses SMTP credentials from environment variables.
 */
export async function sendQuotationEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean }> {
  return sendEmail({ to, subject, html });
}
