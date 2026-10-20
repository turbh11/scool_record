'use server';

import { createClient } from '@supabase/supabase-js';
import {
  School,
  Teacher,
  ScheduleTemplate,
  WeeklyActualReport,
  InstitutionTimeSlot,
  ReportStatus,
} from '@/types/database';
import { isSuperAdminEmail } from '@/lib/super-admin';
import { normalizeTime } from '@/lib/dates';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url) return null;

  return createClient(url, serviceKey || anonKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export interface AdminDashboardDataResult {
  success: boolean;
  isSuperAdmin: boolean;
  isFrozen: boolean;
  school: School | null;
  adminInstitutionCode: string | null;
  adminEmail: string | null;
  teachers: Teacher[];
  templates: ScheduleTemplate[];
  reports: WeeklyActualReport[];
  timeSlots: InstitutionTimeSlot[];
  availableSchools?: { id: string; name: string; semel_mosad: string }[];
  error?: string;
}

/**
 * Server Action: Fetches all administrative dashboard data bypassing client RLS policies
 * using SUPABASE_SERVICE_ROLE_KEY.
 */
export async function getAdminDashboardData(params: {
  userId?: string | null;
  email?: string | null;
  selectedInstitutionCode?: string | null;
  weekStart: string;
  weekEnd: string;
}): Promise<AdminDashboardDataResult> {
  try {
    const supabase = getAdminClient();
    if (!supabase) {
      return {
        success: false,
        isSuperAdmin: false,
        isFrozen: false,
        school: null,
        adminInstitutionCode: null,
        adminEmail: null,
        teachers: [],
        templates: [],
        reports: [],
        timeSlots: [],
        error: 'Supabase configuration missing',
      };
    }

    const { userId, email, selectedInstitutionCode, weekStart, weekEnd } = params;
    const cleanEmail = email?.trim().toLowerCase() || null;
    const isSuper = isSuperAdminEmail(cleanEmail);

    let resolvedCode: string | null = selectedInstitutionCode?.trim() || null;
    let resolvedSchoolName: string | null = null;
    let schoolData: School | null = null;

    // 1. Fetch admin_profiles if userId or cleanEmail exists
    let adminProfile: any = null;
    if (userId) {
      const { data: pById } = await supabase
        .from('admin_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      adminProfile = pById;
    }

    if (!adminProfile && cleanEmail) {
      const { data: pByEmail } = await supabase
        .from('admin_profiles')
        .select('*')
        .ilike('email', cleanEmail)
        .maybeSingle();
      adminProfile = pByEmail;
    }

    // Check account freeze (only if not Super Admin)
    if (!isSuper && adminProfile && adminProfile.is_active === false) {
      return {
        success: false,
        isSuperAdmin: false,
        isFrozen: true,
        school: null,
        adminInstitutionCode: adminProfile.institution_code || null,
        adminEmail: cleanEmail,
        teachers: [],
        templates: [],
        reports: [],
        timeSlots: [],
        error: 'account_frozen',
      };
    }

    if (!resolvedCode && adminProfile?.institution_code) {
      resolvedCode = adminProfile.institution_code;
    }
    if (adminProfile?.school_name) {
      resolvedSchoolName = adminProfile.school_name;
    }

    // 2. Fetch available schools for quick switching (useful for Super Admin)
    let availableSchools: { id: string; name: string; semel_mosad: string }[] = [];
    const { data: allSchools } = await supabase
      .from('schools')
      .select('id, name, semel_mosad')
      .order('name', { ascending: true });
    if (allSchools) {
      availableSchools = allSchools;
    }

    // 3. Resolve School Data
    if (userId) {
      const { data: byAdminId } = await supabase
        .from('schools')
        .select('*')
        .eq('admin_user_id', userId)
        .maybeSingle();
      schoolData = byAdminId;
    }

    if (!schoolData && resolvedCode) {
      const { data: bySemel } = await supabase
        .from('schools')
        .select('*')
        .eq('semel_mosad', resolvedCode)
        .maybeSingle();
      schoolData = bySemel;
    }

    if (!schoolData && allSchools && allSchools.length > 0) {
      // Pick first school if Super Admin or no specific school linked
      const first = allSchools[0];
      const { data: firstFull } = await supabase
        .from('schools')
        .select('*')
        .eq('id', first.id)
        .maybeSingle();
      schoolData = firstFull;
      if (!resolvedCode && firstFull?.semel_mosad) {
        resolvedCode = firstFull.semel_mosad;
      }
    }

    if (!resolvedCode && schoolData?.semel_mosad) {
      resolvedCode = schoolData.semel_mosad;
    }

    // If still no school, create an initial default school
    if (!schoolData) {
      const { data: newSchool } = await supabase
        .from('schools')
        .insert({
          name: resolvedSchoolName || 'מוסד חינוכי',
          semel_mosad: resolvedCode || '100001',
          admin_user_id: userId || null,
        })
        .select('*')
        .maybeSingle();

      schoolData = newSchool;
      if (newSchool?.semel_mosad) {
        resolvedCode = newSchool.semel_mosad;
      }
    }

    if (!schoolData) {
      return {
        success: true,
        isSuperAdmin: isSuper,
        isFrozen: false,
        school: null,
        adminInstitutionCode: resolvedCode,
        adminEmail: cleanEmail,
        teachers: [],
        templates: [],
        reports: [],
        timeSlots: [],
      };
    }

    // 4. Fetch Teachers
    let teachersQuery = supabase
      .from('teachers')
      .select('*')
      .eq('school_id', schoolData.id);

    if (resolvedCode) {
      teachersQuery = teachersQuery.or(
        `institution_code.eq.${resolvedCode},institution_code.is.null`
      );
    }

    const { data: teachersList } = await teachersQuery.order('name', {
      ascending: true,
    });
    const teachers = (teachersList || []) as Teacher[];
    const teacherIds = teachers.map((t) => t.id);

    // 5. Fetch Templates, Reports, and TimeSlots in parallel
    let templates: ScheduleTemplate[] = [];
    let reports: WeeklyActualReport[] = [];
    let timeSlots: InstitutionTimeSlot[] = [];

    const [tplRes, repRes, slotsRes] = await Promise.all([
      teacherIds.length > 0
        ? (() => {
            let tplQuery = supabase
              .from('schedule_templates')
              .select('*')
              .in('teacher_id', teacherIds);
            if (resolvedCode) {
              tplQuery = tplQuery.or(
                `institution_code.eq.${resolvedCode},institution_code.is.null`
              );
            }
            return tplQuery;
          })()
        : Promise.resolve({ data: [] }),
      teacherIds.length > 0
        ? (() => {
            let repQuery = supabase
              .from('weekly_actual_reports')
              .select('*')
              .in('teacher_id', teacherIds)
              .gte('report_date', weekStart)
              .lte('report_date', weekEnd);
            if (resolvedCode) {
              repQuery = repQuery.or(
                `institution_code.eq.${resolvedCode},institution_code.is.null`
              );
            }
            return repQuery;
          })()
        : Promise.resolve({ data: [] }),
      resolvedCode
        ? supabase
            .from('institution_time_slots')
            .select('*')
            .eq('institution_code', resolvedCode)
            .order('period_number', { ascending: true })
        : Promise.resolve({ data: [] }),
    ]);

    templates = (tplRes.data || []) as ScheduleTemplate[];
    reports = ((repRes.data || []) as WeeklyActualReport[]).filter(
      (r) => r.report_date >= weekStart && r.report_date <= weekEnd
    );
    timeSlots = (slotsRes.data || []) as InstitutionTimeSlot[];

    return {
      success: true,
      isSuperAdmin: isSuper,
      isFrozen: false,
      school: schoolData,
      adminInstitutionCode: resolvedCode,
      adminEmail: cleanEmail,
      teachers,
      templates,
      reports,
      timeSlots,
      availableSchools,
    };
  } catch (err: any) {
    console.error('[getAdminDashboardData] Error:', err);
    return {
      success: false,
      isSuperAdmin: false,
      isFrozen: false,
      school: null,
      adminInstitutionCode: null,
      adminEmail: null,
      teachers: [],
      templates: [],
      reports: [],
      timeSlots: [],
      error: err?.message || 'שגיאה בטעינת נתוני לוח הניהול',
    };
  }
}

export interface SaveTeacherPayload {
  id?: string;
  school_id: string;
  name: string;
  subject: string;
  id_number?: string | null;
  phone?: string | null;
  email?: string | null;
  magic_token?: string;
  institution_code?: string | null;
}

/**
 * Server Action: Inserts or updates a teacher in public.teachers using SUPABASE_SERVICE_ROLE_KEY.
 */
export async function saveTeacherAction(
  payload: SaveTeacherPayload
): Promise<{ success: boolean; data?: Teacher; error?: string }> {
  try {
    const supabase = getAdminClient();
    if (!supabase) return { success: false, error: 'Database client unavailable' };

    const cleanName = payload.name.trim();
    if (!cleanName) return { success: false, error: 'נא להזין שם מורה' };

    if (payload.id) {
      // Update
      const updateData: Record<string, any> = {
        name: cleanName,
        subject: payload.subject.trim() || 'כללי',
        id_number: payload.id_number?.trim() || null,
        phone: payload.phone?.trim() || null,
        email: payload.email?.trim() || null,
      };
      if (payload.institution_code) {
        updateData.institution_code = payload.institution_code.trim();
      }

      const { data, error } = await supabase
        .from('teachers')
        .update(updateData)
        .eq('id', payload.id)
        .select('*')
        .single();

      if (error) {
        console.error('[saveTeacherAction] Update error:', error);
        return { success: false, error: error.message };
      }
      return { success: true, data: data as Teacher };
    } else {
      // Insert
      const generatedToken =
        payload.magic_token ||
        `token-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const insertData: Record<string, any> = {
        school_id: payload.school_id,
        name: cleanName,
        subject: payload.subject.trim() || 'כללי',
        id_number: payload.id_number?.trim() || null,
        phone: payload.phone?.trim() || null,
        email: payload.email?.trim() || null,
        magic_token: generatedToken,
        institution_code: payload.institution_code?.trim() || null,
      };

      const { data, error } = await supabase
        .from('teachers')
        .insert(insertData)
        .select('*')
        .single();

      if (error) {
        console.error('[saveTeacherAction] Insert error:', error);
        return { success: false, error: error.message };
      }
      return { success: true, data: data as Teacher };
    }
  } catch (err: any) {
    console.error('[saveTeacherAction] Error:', err);
    return { success: false, error: err?.message || 'שגיאה בשמירת המורה' };
  }
}

/**
 * Server Action: Deletes a teacher and cascades their schedule_templates using SUPABASE_SERVICE_ROLE_KEY.
 */
export async function deleteTeacherAction(
  teacherId: string,
  institutionCode?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getAdminClient();
    if (!supabase) return { success: false, error: 'Database client unavailable' };

    let query = supabase.from('teachers').delete().eq('id', teacherId);
    if (institutionCode) {
      query = query.or(
        `institution_code.eq.${institutionCode},institution_code.is.null`
      );
    }

    const { error } = await query;
    if (error) {
      console.error('[deleteTeacherAction] Error:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('[deleteTeacherAction] Error:', err);
    return { success: false, error: err?.message || 'שגיאה במחיקת המורה' };
  }
}

/**
 * Server Action: Deletes multiple teachers using SUPABASE_SERVICE_ROLE_KEY.
 */
export async function bulkDeleteTeachersAction(
  teacherIds: string[],
  institutionCode?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getAdminClient();
    if (!supabase) return { success: false, error: 'Database client unavailable' };

    let query = supabase.from('teachers').delete().in('id', teacherIds);
    if (institutionCode) {
      query = query.or(
        `institution_code.eq.${institutionCode},institution_code.is.null`
      );
    }

    const { error } = await query;
    if (error) {
      console.error('[bulkDeleteTeachersAction] Error:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('[bulkDeleteTeachersAction] Error:', err);
    return { success: false, error: err?.message || 'שגיאה במחיקת מורים' };
  }
}

export interface SaveScheduleTemplatePayload {
  id?: string;
  teacher_id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  subject: string;
  class_name?: string | null;
  institution_code?: string | null;
  period_number?: number | null;
}

/**
 * Server Action: Saves or updates a schedule template using SUPABASE_SERVICE_ROLE_KEY.
 */
export async function saveScheduleTemplateAction(
  payload: SaveScheduleTemplatePayload
): Promise<{ success: boolean; data?: ScheduleTemplate; error?: string }> {
  try {
    const supabase = getAdminClient();
    if (!supabase) return { success: false, error: 'Database client unavailable' };

    const normStartTime = normalizeTime(payload.start_time);
    const cleanSubject = payload.subject.trim();

    if (payload.id) {
      // Update
      const updateData: Record<string, any> = {
        teacher_id: payload.teacher_id,
        day_of_week: payload.day_of_week,
        start_time: normStartTime,
        duration_minutes: Number(payload.duration_minutes) || 45,
        subject: cleanSubject,
        class_name: payload.class_name?.trim() || null,
        period_number: payload.period_number ?? null,
      };
      if (payload.institution_code) {
        updateData.institution_code = payload.institution_code.trim();
      }

      const { data, error } = await supabase
        .from('schedule_templates')
        .update(updateData)
        .eq('id', payload.id)
        .select('*')
        .single();

      if (error) {
        console.error('[saveScheduleTemplateAction] Update error:', error);
        return { success: false, error: error.message };
      }
      return { success: true, data: data as ScheduleTemplate };
    } else {
      // Insert
      const insertData: Record<string, any> = {
        teacher_id: payload.teacher_id,
        day_of_week: payload.day_of_week,
        start_time: normStartTime,
        duration_minutes: Number(payload.duration_minutes) || 45,
        subject: cleanSubject,
        class_name: payload.class_name?.trim() || null,
        period_number: payload.period_number ?? null,
        institution_code: payload.institution_code?.trim() || null,
      };

      const { data, error } = await supabase
        .from('schedule_templates')
        .insert(insertData)
        .select('*')
        .single();

      if (error) {
        console.error('[saveScheduleTemplateAction] Insert error:', error);
        return { success: false, error: error.message };
      }
      return { success: true, data: data as ScheduleTemplate };
    }
  } catch (err: any) {
    console.error('[saveScheduleTemplateAction] Error:', err);
    return { success: false, error: err?.message || 'שגיאה בשמירת משבצת השעה' };
  }
}

/**
 * Server Action: Deletes a schedule template by ID using SUPABASE_SERVICE_ROLE_KEY.
 */
export async function deleteScheduleTemplateAction(
  templateId: string,
  institutionCode?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getAdminClient();
    if (!supabase) return { success: false, error: 'Database client unavailable' };

    let query = supabase
      .from('schedule_templates')
      .delete()
      .eq('id', templateId);

    if (institutionCode) {
      query = query.or(
        `institution_code.eq.${institutionCode},institution_code.is.null`
      );
    }

    const { error } = await query;
    if (error) {
      console.error('[deleteScheduleTemplateAction] Error:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('[deleteScheduleTemplateAction] Error:', err);
    return { success: false, error: err?.message || 'שגיאה במחיקת משבצת השעה' };
  }
}

export interface SaveReportOverridePayload {
  teacher_id: string;
  template_id?: string | null;
  report_date: string;
  start_time: string;
  duration_minutes: number;
  subject: string;
  class_name?: string | null;
  status: ReportStatus;
  notes?: string;
  institution_code?: string | null;
}

/**
 * Server Action: Upserts or updates a weekly actual report using SUPABASE_SERVICE_ROLE_KEY.
 */
export async function saveWeeklyReportOverrideAction(
  payload: SaveReportOverridePayload
): Promise<{ success: boolean; data?: WeeklyActualReport; error?: string }> {
  try {
    const supabase = getAdminClient();
    if (!supabase) return { success: false, error: 'Database client unavailable' };

    const normStartTime = normalizeTime(payload.start_time);

    // Check existing
    let checkQuery = supabase
      .from('weekly_actual_reports')
      .select('*')
      .eq('teacher_id', payload.teacher_id)
      .eq('report_date', payload.report_date);

    if (payload.template_id) {
      checkQuery = checkQuery.eq('template_id', payload.template_id);
    } else {
      checkQuery = checkQuery.eq('start_time', normStartTime);
    }

    const { data: existing } = await checkQuery.maybeSingle();

    if (existing?.id) {
      // Update
      const { data, error } = await supabase
        .from('weekly_actual_reports')
        .update({
          status: payload.status,
          notes: payload.notes ?? existing.notes ?? '',
          duration_minutes: payload.duration_minutes,
          subject: payload.subject,
          class_name: payload.class_name ?? existing.class_name ?? null,
          institution_code: payload.institution_code || existing.institution_code || null,
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: data as WeeklyActualReport };
    } else {
      // Insert
      const { data, error } = await supabase
        .from('weekly_actual_reports')
        .insert({
          teacher_id: payload.teacher_id,
          template_id: payload.template_id || null,
          report_date: payload.report_date,
          start_time: normStartTime,
          duration_minutes: payload.duration_minutes,
          subject: payload.subject,
          class_name: payload.class_name || null,
          status: payload.status,
          notes: payload.notes || '',
          institution_code: payload.institution_code || null,
        })
        .select('*')
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data: data as WeeklyActualReport };
    }
  } catch (err: any) {
    console.error('[saveWeeklyReportOverrideAction] Error:', err);
    return { success: false, error: err?.message || 'שגיאה בשמירת דיווח' };
  }
}
