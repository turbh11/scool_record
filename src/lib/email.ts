import nodemailer from 'nodemailer';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Creates a reusable Nodemailer transporter configured for Gmail SMTP.
 */
export function createEmailTransporter() {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.trim();

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user,
      pass,
    },
  });
}

/**
 * Reusable utility to send an email via Nodemailer using GMAIL_USER and GMAIL_APP_PASSWORD.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  from,
}: SendEmailOptions): Promise<SendEmailResult> {
  try {
    const transporter = createEmailTransporter();
    const defaultUser = process.env.GMAIL_USER?.trim();

    if (!transporter || !defaultUser) {
      const errMsg =
        'פרטי חשבון הדוא״ל (GMAIL_USER / GMAIL_APP_PASSWORD) אינם מוגדרים בסביבה';
      console.warn(`[sendEmail] ${errMsg}`);
      return {
        success: false,
        error: errMsg,
      };
    }

    const cleanTo = to?.trim();
    if (!cleanTo) {
      return {
        success: false,
        error: 'כתובת הנמען חסרה',
      };
    }

    const info = await transporter.sendMail({
      from: from || `"מערכת שעות פרטניות" <${defaultUser}>`,
      to: cleanTo,
      subject,
      html,
      text: text || html.replace(/<[^>]*>?/gm, ''),
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (err: any) {
    console.error('[sendEmail] Error sending email via Nodemailer:', err);
    return {
      success: false,
      error: err?.message || 'שגיאה בשליחת הדוא״ל',
    };
  }
}

