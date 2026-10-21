'use server';

import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isSuperAdminEmail } from '@/lib/super-admin';
import {
  generateAdminLoginLink,
  sendMagicLinkEmail,
} from './super-admin-actions';

export interface OnboardAdminInput {
  adminName: string;
  idNumber: string;
  schoolName: string;
  institutionCode: string;
  email: string;
  originUrl: string;
}

export interface OnboardAdminResult {
  success: boolean;
  message: string;
  generatedPassword?: string;
  emailSent?: boolean;
  userId?: string;
}

/**
 * Generates a cryptographically secure 12-character password guaranteed to contain
 * uppercase letters, lowercase letters, digits, and symbols (meeting all Supabase requirements).
 */
function generateSecurePassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*+?';
  const allChars = upper + lower + digits + symbols;

  // Guarantee at least one character from each required category
  const required = [
    upper[crypto.randomInt(0, upper.length)],
    upper[crypto.randomInt(0, upper.length)],
    lower[crypto.randomInt(0, lower.length)],
    lower[crypto.randomInt(0, lower.length)],
    digits[crypto.randomInt(0, digits.length)],
    digits[crypto.randomInt(0, digits.length)],
    symbols[crypto.randomInt(0, symbols.length)],
    symbols[crypto.randomInt(0, symbols.length)],
  ];

  while (required.length < length) {
    required.push(allChars[crypto.randomInt(0, allChars.length)]);
  }

  // Fisher-Yates shuffle with crypto.randomInt
  for (let i = required.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const temp = required[i];
    required[i] = required[j];
    required[j] = temp;
  }

  return required.join('');
}

/**
 * Creates a Nodemailer transporter for Gmail SMTP using GMAIL_USER and GMAIL_APP_PASSWORD.
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
 * Builds the RTL Hebrew Welcome HTML Email for a newly onboarded School Admin.
 */
function buildAdminWelcomeEmailHtml(params: {
  adminName: string;
  schoolName: string;
  institutionCode: string;
  email: string;
  password: string;
  loginUrl: string;
}): string {
  const {
    adminName,
    schoolName,
    institutionCode,
    email,
    password,
    loginUrl,
  } = params;

  return `
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ברוכים הבאים למערכת ניהול דיווחי שעות פרטניות</title>
</head>
<body dir="rtl" style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Rubik', 'Segoe UI', Tahoma, Arial, sans-serif; color: #1e293b; text-align: right;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" dir="rtl" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" dir="rtl" style="max-width: 600px; background-color: #ffffff; border-radius: 22px; border: 1px solid #e2e8f0; box-shadow: 0 10px 35px rgba(15, 23, 42, 0.06); overflow: hidden; text-align: right;">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #4f46e5 0%, #0284c7 100%); padding: 30px 32px; color: #ffffff;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; line-height: 1.3;">
                ברוכים הבאים למערכת ניהול שעות פרטניות
              </h1>
              <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.92;">
                סביבת הניהול של ${schoolName} (סמל מוסד: ${institutionCode}) הוקמה בהצלחה!
              </p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 14px 0; font-size: 17px; font-weight: 700; color: #0f172a;">
                שלום ${adminName},
              </p>
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.65; color: #334155;">
                אנו שמחים לברך אותך על הצטרפות בית הספר <strong>${schoolName}</strong> למערכת החכמה לניהול ומעקב אחר דיווחי שעות פרטניות. סביבת העבודה של מוסדך מוכנה כעת לשימוש.
              </p>

              <!-- Credentials Box -->
              <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 16px; padding: 22px 24px; margin: 0 0 24px 0; text-align: right;">
                <p style="margin: 0 0 14px 0; font-size: 14px; font-weight: 700; color: #1e293b;">
                  פרטי ההתחברות האישיים שלך לממשק ההנהלה:
                </p>
                <div style="margin-bottom: 10px; padding: 10px 14px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-weight: 600; color: #64748b; font-size: 13px;">שם משתמש (דוא"ל):</span>
                  <span dir="ltr" style="font-family: monospace, sans-serif; font-weight: 700; color: #0f172a; font-size: 14px; margin-right: 12px;">${email}</span>
                </div>
                <div style="margin-bottom: 12px; padding: 10px 14px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-weight: 600; color: #64748b; font-size: 13px;">סיסמה ראשונית:</span>
                  <span dir="ltr" style="font-family: monospace, sans-serif; font-weight: 700; color: #4f46e5; font-size: 14px; background-color: #eef2ff; padding: 4px 10px; border-radius: 8px; margin-right: 12px;">${password}</span>
                </div>
                <div style="margin-top: 14px; text-align: center;">
                  <a href="${loginUrl}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-weight: 700; text-decoration: none; padding: 10px 22px; border-radius: 10px; font-size: 13px; box-shadow: 0 2px 6px rgba(79, 70, 229, 0.25);">
                    כניסה ישירה לממשק ההנהלה &larr;
                  </a>
                </div>
              </div>

              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 24px 0;">
                <tr>
                  <td align="center" style="border-radius: 12px; background-color: #4f46e5;">
                    <a href="${loginUrl}" target="_blank" style="display: inline-block; padding: 14px 30px; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 12px;">
                      כניסה לממשק הניהול של בית הספר &larr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Password Change Instruction -->
              <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 14px 18px; font-size: 13px; line-height: 1.6; color: #92400e;">
                <strong>הערת אבטחה ושינוי סיסמה:</strong><br />
                מומלץ לשמור את פרטי הגישה במקום בטוח. באפשרותך לשנות את הסיסמה בכל עת דרך מסך ההתחברות באמצעות לחיצה על כפתור <strong>&quot;שכחתי סיסמה&quot;</strong> או להתחבר באמצעות קישור מהיר (Magic Link).
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 32px; font-size: 12px; color: #64748b;">
              הודעה זו נשלחה באופן אוטומטי ממערכת ניהול דיווחי שעות פרטניות לבתי ספר.
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
 * Server Action: Registers a new School Admin in Supabase Auth, inserts their institution details
 * into `admin_profiles` and `schools`, and emails them their login credentials in Hebrew.
 */
export async function registerNewSchoolAdmin(
  input: OnboardAdminInput
): Promise<OnboardAdminResult> {
  try {
    const adminName = input.adminName.trim();
    const idNumber = input.idNumber.trim();
    const schoolName = input.schoolName.trim();
    const institutionCode = input.institutionCode.trim();
    const email = input.email.trim().toLowerCase();
    const cleanOrigin = (input.originUrl || 'http://localhost:3000').replace(
      /\/$/,
      ''
    );

    if (!adminName || !idNumber || !schoolName || !institutionCode || !email) {
      return {
        success: false,
        message: 'נא למלא את כל השדות בטופס (שם מנהל, ת"ז, שם בית ספר, סמל מוסד ודוא"ל).',
      };
    }

    if (!isSupabaseConfigured()) {
      return {
        success: false,
        message:
          'משתני הסביבה של Supabase אינם מוגדרים בקובץ .env.local. לא ניתן לרשום משתמש חדש.',
      };
    }

    // Security: server actions can be invoked directly, so re-verify Super Admin here (not only in middleware)
    const sessionClient = await createServerSupabaseClient();
    const {
      data: { user: callerUser },
    } = await sessionClient.auth.getUser();
    if (!callerUser || !isSuperAdminEmail(callerUser.email)) {
      return {
        success: false,
        message: 'אין לך הרשאת מנהל-על (Super Admin) לביצוע פעולה זו.',
      };
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    // Generate a 12-character strong password
    const generatedPassword = generateSecurePassword(12);

    // Create a stateless Supabase client (uses service_role key if available, otherwise anon key)
    const supabaseClient = createSupabaseJsClient(
      supabaseUrl,
      serviceRoleKey || anonKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    let createdUserId: string | null = null;

    if (serviceRoleKey) {
      // Use Admin API (auto-confirms email immediately)
      const { data: adminAuthData, error: adminAuthError } =
        await supabaseClient.auth.admin.createUser({
          email,
          password: generatedPassword,
          email_confirm: true,
          user_metadata: {
            admin_name: adminName,
            id_number: idNumber,
            school_name: schoolName,
            institution_code: institutionCode,
          },
        });

      if (adminAuthError) {
        return {
          success: false,
          message: `שגיאה ביצירת משתמש מנהל ב-Supabase Auth: ${adminAuthError.message}`,
        };
      }
      createdUserId = adminAuthData.user?.id || null;
    } else {
      // Fallback to standard signUp when SUPABASE_SERVICE_ROLE_KEY is not configured
      const { data: signUpData, error: signUpError } =
        await supabaseClient.auth.signUp({
          email,
          password: generatedPassword,
          options: {
            data: {
              admin_name: adminName,
              id_number: idNumber,
              school_name: schoolName,
              institution_code: institutionCode,
            },
          },
        });

      if (signUpError) {
        return {
          success: false,
          message: `שגיאה ברישום המנהל ב-Supabase Auth: ${signUpError.message}`,
        };
      }
      createdUserId = signUpData.user?.id || null;
    }

    if (!createdUserId) {
      return {
        success: false,
        message: 'לא התקבל מזהה משתמש (UUID) מ-Supabase Auth.',
      };
    }

    // 1. Insert into `public.admin_profiles`
    const normalizedEmail = email.trim().toLowerCase();
    const profilePayload: Record<string, any> = {
      id: createdUserId,
      admin_name: adminName.trim(),
      id_number: idNumber.trim(),
      school_name: schoolName.trim(),
      institution_code: institutionCode.trim(),
      is_active: true,
      email: normalizedEmail,
    };

    let { error: profileError } = await supabaseClient
      .from('admin_profiles')
      .insert(profilePayload);

    // If initial insert fails because email column might be missing in a legacy table schema,
    // fallback to payload without email, but log clear notice
    if (profileError && profileError.message?.includes('email')) {
      const fallbackPayload = {
        id: createdUserId,
        admin_name: adminName.trim(),
        id_number: idNumber.trim(),
        school_name: schoolName.trim(),
        institution_code: institutionCode.trim(),
        is_active: true,
      };
      const { error: fbErr } = await supabaseClient
        .from('admin_profiles')
        .insert(fallbackPayload);
      profileError = fbErr;
    }

    if (profileError) {
      console.warn(
        'Warning inserting into admin_profiles (ensure SQL table exists):',
        profileError.message
      );
    }

    // 2. Also create or link the corresponding row in `public.schools` strictly by `semel_mosad`
    // Multiple co-admins (e.g., Principal & Vice Principal) with the same institutionCode share ONE school row!
    const cleanSemel = institutionCode.trim();
    const { data: existingSchools } = await supabaseClient
      .from('schools')
      .select('id, name, semel_mosad')
      .eq('semel_mosad', cleanSemel)
      .limit(1);

    const existingSchool = existingSchools && existingSchools.length > 0 ? existingSchools[0] : null;

    if (!existingSchool) {
      const { error: schoolError } = await supabaseClient
        .from('schools')
        .insert({
          name: schoolName.trim(),
          semel_mosad: cleanSemel,
          admin_user_id: createdUserId,
        });

      if (schoolError) {
        console.warn('Warning creating school row:', schoolError.message);
      }
    }

    // 3. Automatically generate Magic Link and send onboarding email with initial password in the background
    let emailSent = false;
    try {
      const linkRes = await generateAdminLoginLink(normalizedEmail, cleanOrigin);
      if (linkRes.success && linkRes.link) {
        const mailRes = await sendMagicLinkEmail(
          normalizedEmail,
          linkRes.link,
          schoolName.trim(),
          generatedPassword
        );
        emailSent = Boolean(mailRes.success);
      }
    } catch (mailErr) {
      console.warn('Background magic link onboarding email failed:', mailErr);
    }

    return {
      success: true,
      emailSent,
      userId: createdUserId,
      generatedPassword,
      message: emailSent
        ? `סביבת בית הספר "${schoolName}" הוקמה בהצלחה וקישור התחברות ישיר נשלח בדוא"ל אל ${email}!`
        : `סביבת בית הספר "${schoolName}" הוקמה בהצלחה! (פרטי הגישה והסיסמה שנוצרה מוצגים למטה).`,
    };
  } catch (err: any) {
    console.error('Error in registerNewSchoolAdmin:', err);
    return {
      success: false,
      message: `שגיאה בהקמת סביבת בית הספר: ${err?.message || 'שגיאה לא צפויה'}`,
    };
  }
}

