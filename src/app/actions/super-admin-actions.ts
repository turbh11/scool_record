'use server';

import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';

export interface GenerateAdminLoginLinkResult {
  success: boolean;
  link?: string;
  error?: string;
}

/**
 * Server Action for Super Admin to generate an action link (Magic Link)
 * for a school admin using Supabase Admin API.
 * Uses SUPABASE_SERVICE_ROLE_KEY to bypass email rate limits and deliver
 * the raw action link directly to the Super Admin UI.
 */
export async function generateAdminLoginLink(
  email: string,
  originUrl?: string
): Promise<GenerateAdminLoginLinkResult> {
  try {
    const cleanEmail = email?.trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, error: 'כתובת דוא״ל לא סופקה' };
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!supabaseUrl || !serviceRoleKey) {
      console.warn(
        '[generateAdminLoginLink] SUPABASE_SERVICE_ROLE_KEY not configured. Falling back to demo link.'
      );
      const fallbackOrigin =
        originUrl || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      return {
        success: true,
        link: `${fallbackOrigin}/admin/login?email=${encodeURIComponent(cleanEmail)}&demo=true`,
      };
    }

    const supabaseAdmin = createSupabaseJsClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const fallbackOrigin =
      originUrl || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const redirectTo = `${fallbackOrigin}/auth/callback?next=/admin`;

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: cleanEmail,
      options: {
        redirectTo,
      },
    });

    if (error) {
      console.error('[generateAdminLoginLink] Supabase generateLink error:', error);
      return { success: false, error: error.message };
    }

    const rawActionLink = data?.properties?.action_link;
    if (!rawActionLink) {
      return {
        success: false,
        error: 'לא התקבל קישור התחברות מסופאבייס',
      };
    }

    return {
      success: true,
      link: rawActionLink,
    };
  } catch (err: any) {
    console.error('[generateAdminLoginLink] Unexpected error:', err);
    return {
      success: false,
      error: err?.message || 'שגיאה פנימית ביצירת קישור התחברות',
    };
  }
}

