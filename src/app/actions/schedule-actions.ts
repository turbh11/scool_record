'use server';

import { createClient } from '@supabase/supabase-js';
import { InstitutionTimeSlot } from '@/types/database';
import { normalizeTime } from '@/lib/dates';
import { DEFAULT_BELL_PRESETS } from '@/lib/constants/bell-schedule';

/**
 * Returns a Supabase client initialized with the Master Service Role Key
 * to bypass RLS policies completely.
 */
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Server Action: Fetches all institution time slots (Lesson Times Schedule) for a given institution.
 */
export async function getInstitutionTimeSlots(
  institutionCode: string
): Promise<{ success: boolean; data?: InstitutionTimeSlot[]; error?: string }> {
  try {
    const cleanCode = institutionCode?.trim();
    if (!cleanCode) {
      return { success: true, data: [] };
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      // Fallback if service role key not available
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
      if (!anonKey) {
        return { success: true, data: [] };
      }
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, anonKey);
      const { data, error } = await client
        .from('institution_time_slots')
        .select('*')
        .eq('institution_code', cleanCode)
        .order('period_number', { ascending: true });

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true, data: (data || []) as InstitutionTimeSlot[] };
    }

    let { data, error } = await supabaseAdmin
      .from('institution_time_slots')
      .select('*')
      .eq('institution_code', cleanCode)
      .order('period_number', { ascending: true });

    if (error && (error.code === '42501' || error.message?.includes('permission denied'))) {
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
      if (anonKey) {
        const fallbackClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          anonKey
        );
        const fbRes = await fallbackClient
          .from('institution_time_slots')
          .select('*')
          .eq('institution_code', cleanCode)
          .order('period_number', { ascending: true });
        data = fbRes.data;
        error = fbRes.error;
      }
    }

    if (error) {
      console.error('[getInstitutionTimeSlots] Error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: (data || []) as InstitutionTimeSlot[] };
  } catch (err: any) {
    console.error('[getInstitutionTimeSlots] Unexpected error:', err);
    return {
      success: false,
      error: err?.message || 'שגיאה בשליפת לוח זמני השיעורים',
    };
  }
}

export interface AddTimeSlotPayload {
  id?: string;
  institution_code: string;
  period_number: number;
  start_time: string;
  end_time: string;
  day_of_week?: string;
}

/**
 * Server Action: Adds or updates a period time slot in the institution's schedule.
 * Uses the Service Role Key to bypass RLS policies.
 */
export async function addTimeSlot(
  payload: AddTimeSlotPayload
): Promise<{ success: boolean; data?: InstitutionTimeSlot; error?: string }> {
  try {
    const cleanCode = payload.institution_code?.trim();
    if (!cleanCode) {
      return { success: false, error: 'קוד מוסד חסר' };
    }
    if (!payload.start_time || !payload.end_time) {
      return { success: false, error: 'נא להזין שעת התחלה ושעת סיום' };
    }

    const normalizedStart = normalizeTime(payload.start_time);
    const normalizedEnd = normalizeTime(payload.end_time);
    const dayOfWeek = payload.day_of_week?.trim() || 'all';

    const supabaseAdmin = getSupabaseAdmin();

    // If updating an existing slot by ID
    if (payload.id) {
      if (supabaseAdmin) {
        const { data: updated, error: updateErr } = await supabaseAdmin
          .from('institution_time_slots')
          .update({
            period_number: Number(payload.period_number),
            start_time: normalizedStart,
            end_time: normalizedEnd,
            day_of_week: dayOfWeek,
          })
          .eq('id', payload.id)
          .select('*')
          .single();

        if (updateErr) {
          return { success: false, error: updateErr.message };
        }
        return { success: true, data: updated as InstitutionTimeSlot };
      } else {
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
        const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, anonKey!);
        const { data: updated, error: updateErr } = await client
          .from('institution_time_slots')
          .update({
            period_number: Number(payload.period_number),
            start_time: normalizedStart,
            end_time: normalizedEnd,
            day_of_week: dayOfWeek,
          })
          .eq('id', payload.id)
          .select('*')
          .single();

        if (updateErr) {
          return { success: false, error: updateErr.message };
        }
        return { success: true, data: updated as InstitutionTimeSlot };
      }
    }

    const insertPayload = {
      institution_code: cleanCode,
      period_number: Number(payload.period_number),
      start_time: normalizedStart,
      end_time: normalizedEnd,
      day_of_week: dayOfWeek,
    };

    if (!supabaseAdmin) {
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, anonKey!);
      const { data, error } = await client
        .from('institution_time_slots')
        .insert(insertPayload)
        .select('*')
        .single();

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true, data: data as InstitutionTimeSlot };
    }

    let { data, error } = await supabaseAdmin
      .from('institution_time_slots')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error && error.code === '23505') {
      // Slot already exists for this institution and period_number: update its times and day_of_week
      const updateRes = await supabaseAdmin
        .from('institution_time_slots')
        .update({
          start_time: normalizedStart,
          end_time: normalizedEnd,
          day_of_week: dayOfWeek,
        })
        .eq('institution_code', cleanCode)
        .eq('period_number', Number(payload.period_number))
        .select('*')
        .single();

      if (!updateRes.error && updateRes.data) {
        return { success: true, data: updateRes.data as InstitutionTimeSlot };
      }
      error = updateRes.error || error;
    }

    if (error && (error.code === '42501' || error.message?.includes('permission denied'))) {
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
      if (anonKey) {
        const fallbackClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          anonKey
        );
        const fbRes = await fallbackClient
          .from('institution_time_slots')
          .insert(insertPayload)
          .select('*')
          .single();
        data = fbRes.data;
        error = fbRes.error;

        if (error && error.code === '23505') {
          const fbUpdate = await fallbackClient
            .from('institution_time_slots')
            .update({
              start_time: normalizedStart,
              end_time: normalizedEnd,
              day_of_week: dayOfWeek,
            })
            .eq('institution_code', cleanCode)
            .eq('period_number', Number(payload.period_number))
            .select('*')
            .single();
          data = fbUpdate.data;
          error = fbUpdate.error;
        }
      }
    }

    if (error) {
      console.error('[addTimeSlot] Insert error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as InstitutionTimeSlot };
  } catch (err: any) {
    console.error('[addTimeSlot] Unexpected error:', err);
    return {
      success: false,
      error: err?.message || 'שגיאה בהוספת שיעור ללוח הזמנים',
    };
  }
}

/**
 * Server Action: Deletes a time slot by ID using the Service Role Key.
 */
export async function deleteTimeSlot(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanId = id?.trim();
    if (!cleanId) {
      return { success: false, error: 'מזהה שיעור חסר' };
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, anonKey!);
      const { error } = await client
        .from('institution_time_slots')
        .delete()
        .eq('id', cleanId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    }

    let { error } = await supabaseAdmin
      .from('institution_time_slots')
      .delete()
      .eq('id', cleanId);

    if (error && (error.code === '42501' || error.message?.includes('permission denied'))) {
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
      if (anonKey) {
        const fallbackClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          anonKey
        );
        const fbRes = await fallbackClient
          .from('institution_time_slots')
          .delete()
          .eq('id', cleanId);
        error = fbRes.error;
      }
    }

    if (error) {
      console.error('[deleteTimeSlot] Delete error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[deleteTimeSlot] Unexpected error:', err);
    return {
      success: false,
      error: err?.message || 'שגיאה במחיקת שיעור מלוח הזמנים',
    };
  }
}

/**
 * Server Action: Loads default recommended bell/lesson time slots (periods 1-6).
 */
export async function loadDefaultTimeSlots(
  institutionCode: string
): Promise<{ success: boolean; data?: InstitutionTimeSlot[]; error?: string }> {
  try {
    const cleanCode = institutionCode?.trim();
    if (!cleanCode) {
      return { success: false, error: 'קוד מוסד חסר' };
    }

    const rowsToInsert = DEFAULT_BELL_PRESETS.map((p) => ({
      institution_code: cleanCode,
      period_number: p.period_number,
      start_time: p.start_time,
      end_time: p.end_time,
      day_of_week: p.day_of_week || 'all',
    }));

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, anonKey!);
      const { data, error } = await client
        .from('institution_time_slots')
        .insert(rowsToInsert)
        .select('*');

      if (error) return { success: false, error: error.message };
      return { success: true, data: (data || []) as InstitutionTimeSlot[] };
    }

    // Safely delete any existing 1-6 periods for this institution to avoid any constraint issues
    await supabaseAdmin
      .from('institution_time_slots')
      .delete()
      .eq('institution_code', cleanCode)
      .in('period_number', [1, 2, 3, 4, 5, 6]);

    const { data, error } = await supabaseAdmin
      .from('institution_time_slots')
      .insert(rowsToInsert)
      .select('*');

    if (error) {
      console.error('[loadDefaultTimeSlots] Insert error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: (data || []) as InstitutionTimeSlot[] };
  } catch (err: any) {
    console.error('[loadDefaultTimeSlots] Unexpected error:', err);
    return {
      success: false,
      error: err?.message || 'שגיאה בטעינת לוח זמנים מומלץ',
    };
  }
}

