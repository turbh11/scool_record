'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { isSuperAdminEmail } from '@/lib/super-admin';

/**
 * Server Action: Returns true only if the currently logged-in user's email
 * is listed in SUPER_ADMIN_EMAILS. Safe to call from client components.
 */
export async function getIsSuperAdmin(): Promise<boolean> {
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

