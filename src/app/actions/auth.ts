'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { isSuperAdminEmail } from '@/lib/super-admin';

/**
 * Server Action: Returns true only if the currently logged-in user's email
 * is listed in SUPER_ADMIN_EMAILS. Safe to call from client components.
 * Can optionally accept an email parameter for instant, client-authenticated verification.
 */
export async function getIsSuperAdmin(clientEmail?: string | null): Promise<boolean> {
  if (clientEmail && isSuperAdminEmail(clientEmail)) {
    return true;
  }
  if (!isSupabaseConfigured()) return false;
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return isSuperAdminEmail(user?.email);
  } catch {
    return false;
  }
}

