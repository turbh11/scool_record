'use server';

import nodemailer from 'nodemailer';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { FALLBACK_TEACHERS } from '@/lib/demo-data';

export interface EmailActionResult {
  success: boolean;
  message: string;
  sentCount?: number;
}

/**
 * Creates a reusable Nodemailer transporter configured for Gmail SMTP.
 */
function createGmailTransporter() {
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
 * Generates an RTL Hebrew HTML email template for a teacher's personal Magic Link.
 */
function buildTeacherMagicLinkHtml(
  teacherName: string,
  subjectName: string,
  magicLinkUrl: string
): string {
  return `
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>קישור אישי למערכת דיווח שעות פרטניות</title>
</head>
<body dir="rtl" style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Rubik', 'Segoe UI', Tahoma, Arial, sans-serif; color: #1e293b; text-align: right;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" dir="rtl" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" dir="rtl" style="max-width: 560px; background-color: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 8px 30px rgba(15, 23, 42, 0.05); overflow: hidden; text-align: right;">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #4f46e5 0%, #0284c7 100%); padding: 28px 32px; color: #ffffff;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; line-height: 1.3;">
                מערכת ניהול ודיווח שעות פרטניות
              </h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">
                קישור כניסה אישי ומהיר לדיווח שבועי
              </p>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #0f172a;">
                שלום ${teacherName},
              </p>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                מצורף הקישור האישי שלך למערכת דיווח שעות פרטניות${
                  subjectName ? ` (תחום דעת: <strong>${subjectName}</strong>)` : ''
                }.
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                באמצעות קישור זה תוכל/י לצפות במערכת השעות הפרטניות שלך, לסמן מפגשים כ&quot;בוצע&quot; או &quot;היעדרות מאושרת&quot; בקליק אחד, ולהוסיף הערות פדגוגיות ללא צורך בסיסמה.
              </p>

              <!-- Call to Action Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 24px 0;">
                <tr>
                  <td align="center" style="border-radius: 12px; background-color: #4f46e5;">
                    <a href="${magicLinkUrl}" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 12px;">
                      כניסה לאזור הדיווח האישי שלי &larr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 8px 0; font-size: 12px; color: #64748b;">
                אנא שמור/י הודעה זו או את הקישור הבא לשימוש שבועי קבוע:
              </p>
              <div dir="ltr" style="background-color: #f1f5f9; border-radius: 10px; padding: 10px 14px; font-size: 12px; color: #334155; word-break: break-all; text-align: left;">
                <a href="${magicLinkUrl}" style="color: #4f46e5; text-decoration: underline;">${magicLinkUrl}</a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 32px; font-size: 12px; color: #64748b;">
              הודעה זו נשלחה באופן אוטומטי ממערכת ניהול דיווחי שעות פרטניות של בית הספר.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Server Action: Sends a personal Magic Link email to a single teacher via Nodemailer (Gmail SMTP).
 */
export async function sendTeacherMagicLink(
  teacherId: string,
  originUrl: string
): Promise<EmailActionResult> {
  try {
    const transporter = createGmailTransporter();
    const gmailUser = process.env.GMAIL_USER?.trim();

    if (!transporter || !gmailUser) {
      return {
        success: false,
        message:
          'חסרים פרטי GMAIL_USER או GMAIL_APP_PASSWORD בקובץ .env.local. אנא הגדר אותם כדי לשלוח מיילים.',
      };
    }

    let teacher: {
      id: string;
      name: string;
      subject?: string;
      email?: string | null;
      magic_token: string;
    } | null = null;

    if (isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from('teachers')
        .select('id, name, subject, email, magic_token')
        .eq('id', teacherId)
        .maybeSingle();

      if (error) {
        console.error('Supabase fetch teacher error:', error);
      }
      teacher = data;
    }

    if (!teacher) {
      const demo = FALLBACK_TEACHERS.find((t) => t.id === teacherId);
      if (demo) {
        teacher = demo;
      }
    }

    if (!teacher) {
      return {
        success: false,
        message: 'המורה המבוקש לא נמצא במערכת.',
      };
    }

    const recipientEmail = teacher.email?.trim();
    if (!recipientEmail) {
      return {
        success: false,
        message: `למורה ${teacher.name} לא מוגדרת כתובת דוא"ל. אנא הוסף כתובת דוא"ל תחילה.`,
      };
    }

    const cleanOrigin = originUrl.replace(/\/$/, '');
    const magicLinkUrl = `${cleanOrigin}/teacher?token=${encodeURIComponent(
      teacher.magic_token
    )}`;

    await transporter.sendMail({
      from: `"מערכת שעות פרטניות" <${gmailUser}>`,
      to: recipientEmail,
      subject: `קישור אישי למערכת דיווח שעות פרטניות - ${teacher.name}`,
      html: buildTeacherMagicLinkHtml(
        teacher.name,
        teacher.subject || '',
        magicLinkUrl
      ),
    });

    return {
      success: true,
      message: `הקישור האישי נשלח בהצלחה אל ${teacher.name} (${recipientEmail})!`,
      sentCount: 1,
    };
  } catch (err: any) {
    console.error('Error in sendTeacherMagicLink (Nodemailer):', err);
    return {
      success: false,
      message: `שגיאה בשליחת הדוא"ל: ${err?.message || 'בדוק את הגדרות ה-Gmail App Password'}`,
    };
  }
}

/**
 * Server Action: Loops through all teachers with a valid email address and sends each their personal Magic Link via Gmail SMTP.
 */
export async function sendBulkMagicLinks(
  originUrl: string
): Promise<EmailActionResult> {
  try {
    const transporter = createGmailTransporter();
    const gmailUser = process.env.GMAIL_USER?.trim();

    if (!transporter || !gmailUser) {
      return {
        success: false,
        message:
          'חסרים פרטי GMAIL_USER או GMAIL_APP_PASSWORD בקובץ .env.local. אנא הגדר אותם כדי לשלוח מיילים.',
      };
    }

    let teachersList: {
      id: string;
      name: string;
      subject?: string;
      email?: string | null;
      magic_token: string;
    }[] = [];

    if (isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      const { data, error } = await supabase
        .from('teachers')
        .select('id, name, subject, email, magic_token')
        .not('email', 'is', null);

      if (error) {
        console.error('Error fetching teachers for bulk email:', error);
      } else if (data) {
        teachersList = data;
      }
    }

    if (teachersList.length === 0 && !isSupabaseConfigured()) {
      teachersList = FALLBACK_TEACHERS;
    }

    const validTeachers = teachersList.filter(
      (t) => t.email && t.email.trim().includes('@')
    );

    if (validTeachers.length === 0) {
      return {
        success: false,
        message: 'לא נמצאו מורים עם כתובת דוא"ל תקינה במערכת.',
        sentCount: 0,
      };
    }

    const cleanOrigin = originUrl.replace(/\/$/, '');
    let sentCount = 0;

    for (const teacher of validTeachers) {
      const magicLinkUrl = `${cleanOrigin}/teacher?token=${encodeURIComponent(
        teacher.magic_token
      )}`;

      await transporter.sendMail({
        from: `"מערכת שעות פרטניות" <${gmailUser}>`,
        to: teacher.email!.trim(),
        subject: `קישור אישי למערכת דיווח שעות פרטניות - ${teacher.name}`,
        html: buildTeacherMagicLinkHtml(
          teacher.name,
          teacher.subject || '',
          magicLinkUrl
        ),
      });

      sentCount++;
    }

    return {
      success: true,
      message: `נשלחו בהצלחה ${sentCount} קישורים אישיים בדוא"ל לכל המורים!`,
      sentCount,
    };
  } catch (err: any) {
    console.error('Error in sendBulkMagicLinks (Nodemailer):', err);
    return {
      success: false,
      message: `שגיאה בשליחת המיילים המרוכזת: ${err?.message || 'בדוק את הגדרות ה-Gmail App Password'}`,
    };
  }
}
