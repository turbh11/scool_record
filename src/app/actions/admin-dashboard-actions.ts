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
import { DEFAULT_BELL_PRESETS } from '@/lib/constants/bell-schedule';

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
    if (allSchools && allSchools.length > 0) {
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

    if (!schoolData && resolvedCode && resolvedCode !== '---') {
      const { data: bySemel } = await supabase
        .from('schools')
        .select('*')
        .eq('semel_mosad', resolvedCode)
        .maybeSingle();
      schoolData = bySemel;
    }

    if (!schoolData && availableSchools.length > 0) {
      // Pick first school if Super Admin or no specific school linked
      const first = availableSchools[0];
      const { data: firstFull } = await supabase
        .from('schools')
        .select('*')
        .eq('id', first.id)
        .maybeSingle();
      schoolData = firstFull;
      if (!resolvedCode || resolvedCode === '---') {
        resolvedCode = firstFull?.semel_mosad || null;
      }
    }

    // TASK 1: If database has NO schools at all, seed a real working default school
    if (!schoolData) {
      const defaultSemel = (resolvedCode && resolvedCode !== '---') ? resolvedCode : '440129';
      const defaultName = resolvedSchoolName || 'תיכון ממלכתי רבין - תל אביב';

      const { data: existingSchool } = await supabase
        .from('schools')
        .select('*')
        .eq('semel_mosad', defaultSemel)
        .maybeSingle();

      if (existingSchool) {
        schoolData = existingSchool;
      } else {
        const { data: newSchool, error: schoolCreateErr } = await supabase
          .from('schools')
          .insert({
            name: defaultName,
            semel_mosad: defaultSemel,
            admin_user_id: userId || null,
          })
          .select('*')
          .maybeSingle();

        if (schoolCreateErr) {
          console.error('[getAdminDashboardData] Error auto-seeding school:', schoolCreateErr);
        }

        if (newSchool) {
          schoolData = newSchool;
        } else {
          const { data: anySchool } = await supabase
            .from('schools')
            .select('*')
            .limit(1)
            .maybeSingle();
          schoolData = anySchool;
        }
      }

      if (schoolData) {
        resolvedCode = schoolData.semel_mosad;
        if (!availableSchools.some(s => s.id === schoolData!.id)) {
          availableSchools.push({ id: schoolData.id, name: schoolData.name, semel_mosad: schoolData.semel_mosad });
        }
      }
    }

    // Guarantee that resolvedCode is ALWAYS a valid non-empty string, never '---'
    if (!resolvedCode || resolvedCode === '---') {
      resolvedCode = schoolData?.semel_mosad || '440129';
    }

    if (!schoolData) {
      schoolData = {
        id: '440129-default-school',
        name: 'תיכון ממלכתי רבין - תל אביב',
        semel_mosad: '440129',
        admin_user_id: userId || null,
        created_at: new Date().toISOString(),
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

    // TASK 1: If no bell schedule exists for this institution, automatically seed default periods 1-6
    if (timeSlots.length === 0 && resolvedCode) {
      const presetsToInsert = DEFAULT_BELL_PRESETS.map((p) => ({
        institution_code: resolvedCode!,
        period_number: p.period_number,
        start_time: p.start_time,
        end_time: p.end_time,
        day_of_week: p.day_of_week || 'all',
      }));

      await supabase
        .from('institution_time_slots')
        .delete()
        .eq('institution_code', resolvedCode)
        .in('period_number', [1, 2, 3, 4, 5, 6]);

      await supabase
        .from('institution_time_slots')
        .insert(presetsToInsert);

      const { data: seededSlots } = await supabase
        .from('institution_time_slots')
        .select('*')
        .eq('institution_code', resolvedCode)
        .order('period_number', { ascending: true });

      if (seededSlots && seededSlots.length > 0) {
        timeSlots = seededSlots as InstitutionTimeSlot[];
      }
    }

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
  school_id?: string;
  name: string;
  subject: string;
  id_number?: string | null;
  phone?: string | null;
  email?: string | null;
  magic_token?: string;
  institution_code?: string | null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    // Resolve a guaranteed valid school_id (must be a valid UUID in schools table)
    let validSchoolId = payload.school_id;
    let validInstitutionCode = payload.institution_code?.trim() || null;
    if (validInstitutionCode === '---') validInstitutionCode = null;

    if (!validSchoolId || !UUID_REGEX.test(validSchoolId)) {
      // 1. Try finding school by institution_code
      if (validInstitutionCode) {
        const { data: sch } = await supabase
          .from('schools')
          .select('id, semel_mosad')
          .eq('semel_mosad', validInstitutionCode)
          .maybeSingle();
        if (sch) {
          validSchoolId = sch.id;
          validInstitutionCode = sch.semel_mosad;
        }
      }

      // 2. Try default school 440129
      if (!validSchoolId || !UUID_REGEX.test(validSchoolId)) {
        const { data: defaultSch } = await supabase
          .from('schools')
          .select('id, semel_mosad')
          .eq('semel_mosad', '440129')
          .maybeSingle();
        if (defaultSch) {
          validSchoolId = defaultSch.id;
          if (!validInstitutionCode) validInstitutionCode = defaultSch.semel_mosad;
        }
      }

      // 3. Fallback to any school in database
      if (!validSchoolId || !UUID_REGEX.test(validSchoolId)) {
        const { data: anySch } = await supabase
          .from('schools')
          .select('id, semel_mosad')
          .limit(1)
          .maybeSingle();
        if (anySch) {
          validSchoolId = anySch.id;
          if (!validInstitutionCode) validInstitutionCode = anySch.semel_mosad;
        }
      }

      // 4. If schools table is completely empty, create default school
      if (!validSchoolId || !UUID_REGEX.test(validSchoolId)) {
        const { data: createdSch } = await supabase
          .from('schools')
          .insert({
            name: 'תיכון ממלכתי רבין - תל אביב',
            semel_mosad: '440129',
          })
          .select('id, semel_mosad')
          .single();
        if (createdSch) {
          validSchoolId = createdSch.id;
          validInstitutionCode = createdSch.semel_mosad;
        }
      }
    }

    if (!validSchoolId || !UUID_REGEX.test(validSchoolId)) {
      return { success: false, error: 'לא נמצא מזהה בית ספר תקין' };
    }

    if (!validInstitutionCode) {
      const { data: schData } = await supabase
        .from('schools')
        .select('semel_mosad')
        .eq('id', validSchoolId)
        .maybeSingle();
      if (schData?.semel_mosad) {
        validInstitutionCode = schData.semel_mosad;
      }
    }

    const isExistingUpdate = payload.id && UUID_REGEX.test(payload.id);

    if (isExistingUpdate) {
      // Update
      const updateData: Record<string, any> = {
        name: cleanName,
        subject: payload.subject.trim() || 'כללי',
        id_number: payload.id_number?.trim() || null,
        phone: payload.phone?.trim() || null,
        email: payload.email?.trim() || null,
      };
      if (validInstitutionCode) {
        updateData.institution_code = validInstitutionCode;
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
        school_id: validSchoolId,
        name: cleanName,
        subject: payload.subject.trim() || 'כללי',
        id_number: payload.id_number?.trim() || null,
        phone: payload.phone?.trim() || null,
        email: payload.email?.trim() || null,
        magic_token: generatedToken,
        institution_code: validInstitutionCode,
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

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!payload.teacher_id || !UUID_REGEX.test(payload.teacher_id)) {
      return { success: false, error: 'מזהה מורה לא תקין, נא לשמור את המורה קודם' };
    }

    const normStartTime = normalizeTime(payload.start_time);
    const cleanSubject = payload.subject.trim();

    let institutionCode = payload.institution_code?.trim() || null;
    if (institutionCode === '---') institutionCode = null;

    if (!institutionCode) {
      const { data: teacherRow } = await supabase
        .from('teachers')
        .select('institution_code')
        .eq('id', payload.teacher_id)
        .maybeSingle();
      if (teacherRow?.institution_code) {
        institutionCode = teacherRow.institution_code;
      }
    }

    const isExistingUpdate = payload.id && UUID_REGEX.test(payload.id);

    if (isExistingUpdate) {
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
      if (institutionCode) {
        updateData.institution_code = institutionCode;
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
        institution_code: institutionCode,
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
 * Server Action: Upserts, updates, or resets a weekly actual report using SUPABASE_SERVICE_ROLE_KEY.
 */
export async function saveWeeklyReportOverrideAction(
  payload: SaveReportOverridePayload
): Promise<{ success: boolean; data?: WeeklyActualReport | null; error?: string }> {
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

    // If resetting back to 'pending' (unreported), delete existing report row
    if (payload.status === 'pending') {
      if (existing?.id) {
        const { error: delErr } = await supabase
          .from('weekly_actual_reports')
          .delete()
          .eq('id', existing.id);
        if (delErr) return { success: false, error: delErr.message };
      }
      return { success: true, data: null };
    }

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

export interface ResetWeeklyReportPayload {
  report_id?: string | null;
  teacher_id: string;
  template_id?: string | null;
  report_date: string;
  start_time: string;
}

/**
 * Server Action: Deletes/resets a weekly report row back to unreported ('pending') using SUPABASE_SERVICE_ROLE_KEY.
 */
export async function resetWeeklyReportAction(
  payload: ResetWeeklyReportPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getAdminClient();
    if (!supabase) return { success: false, error: 'Database client unavailable' };

    const normStartTime = normalizeTime(payload.start_time);

    if (payload.report_id && !payload.report_id.startsWith('temp-')) {
      const { error } = await supabase
        .from('weekly_actual_reports')
        .delete()
        .eq('id', payload.report_id);
      if (!error) return { success: true };
    }

    let delQuery = supabase
      .from('weekly_actual_reports')
      .delete()
      .eq('teacher_id', payload.teacher_id)
      .eq('report_date', payload.report_date);

    if (payload.template_id) {
      delQuery = delQuery.eq('template_id', payload.template_id);
    } else {
      delQuery = delQuery.eq('start_time', normStartTime);
    }

    const { error } = await delQuery;
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    console.error('[resetWeeklyReportAction] Error:', err);
    return { success: false, error: err?.message || 'שגיאה בביטול הדיווח' };
  }
}
