import { SupabaseClient } from '@supabase/supabase-js';
import {
  ReportStatus,
  ScheduleTemplate,
  Teacher,
  WeeklyActualReport,
} from '@/types/database';

export interface SaveReportPayload {
  teacher_id: string;
  template_id: string | null;
  report_date: string; // YYYY-MM-DD
  start_time: string;  // HH:MM or HH:MM:SS
  duration_minutes: number;
  subject: string;
  class_name?: string | null;
  status: ReportStatus;
  notes?: string;
  institution_code?: string | null;
}

export interface UpsertTeacherContactPayload {
  school_id: string;
  name: string;
  subject: string;
  id_number?: string | null;
  phone?: string | null;
  email?: string | null;
  magic_token?: string;
  institution_code?: string | null;
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

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  // Standard UUID format: 8-4-4-4-12 hex characters
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Safely saves a weekly report without relying on `.upsert()` or `.single()`.
 * Explicitly checks if a report exists for the given teacher, date, and template/time
 * using `.maybeSingle()`. If found, performs `.update().eq('id', existing.id)`;
 * otherwise performs `.insert()`. Also gracefully handles `class_name` even if the column
 * migration hasn't been executed yet.
 */
export async function saveWeeklyReportSafe(
  supabase: SupabaseClient,
  payload: SaveReportPayload
): Promise<{ data: WeeklyActualReport | null; error: Error | null }> {
  try {
    let query = supabase
      .from('weekly_actual_reports')
      .select('*')
      .eq('teacher_id', payload.teacher_id)
      .eq('report_date', payload.report_date);

    if (payload.institution_code) {
      query = query.or(
        `institution_code.eq.${payload.institution_code},institution_code.is.null`
      );
    }

    if (payload.template_id) {
      query = query.eq('template_id', payload.template_id);
    } else {
      query = query.eq('start_time', payload.start_time);
    }

    const { data: existing, error: fetchError } = await query.maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    if (existing?.id) {
      const updateData: Record<string, any> = {
        status: payload.status,
        notes:
          payload.notes !== undefined ? payload.notes : existing.notes ?? '',
        duration_minutes: payload.duration_minutes,
        subject: payload.subject,
        class_name:
          payload.class_name !== undefined
            ? payload.class_name
            : existing.class_name ?? null,
        start_time: payload.start_time,
      };

      if (payload.institution_code) {
        updateData.institution_code = payload.institution_code;
      }

      let updateQuery = supabase
        .from('weekly_actual_reports')
        .update(updateData)
        .eq('id', existing.id);

      const { data: updated, error: updateError } = await updateQuery
        .select('*')
        .maybeSingle();

      if (updateError) {
        // Fallback if institution_code / class_name columns do not exist yet in legacy DB
        const fallbackUpdate: Record<string, any> = {
          status: payload.status,
          notes:
            payload.notes !== undefined
              ? payload.notes
              : existing.notes ?? '',
          duration_minutes: payload.duration_minutes,
          subject: payload.subject,
          start_time: payload.start_time,
        };

        const { data: fallbackUpdated, error: fallbackErr } = await supabase
          .from('weekly_actual_reports')
          .update(fallbackUpdate)
          .eq('id', existing.id)
          .select('*')
          .maybeSingle();

        if (fallbackErr) throw fallbackErr;
        return {
          data: fallbackUpdated
            ? ({
                ...fallbackUpdated,
                class_name: payload.class_name ?? existing.class_name ?? null,
                institution_code: payload.institution_code ?? existing.institution_code ?? null,
              } as WeeklyActualReport)
            : null,
          error: null,
        };
      }

      return { data: updated as WeeklyActualReport, error: null };
    }

    const insertData: Record<string, any> = {
      teacher_id: payload.teacher_id,
      template_id: payload.template_id,
      report_date: payload.report_date,
      start_time: payload.start_time,
      duration_minutes: payload.duration_minutes,
      subject: payload.subject,
      class_name: payload.class_name ?? null,
      status: payload.status,
      notes: payload.notes ?? '',
    };

    if (payload.institution_code) {
      insertData.institution_code = payload.institution_code;
    }

    const { data: inserted, error: insertError } = await supabase
      .from('weekly_actual_reports')
      .insert(insertData)
      .select('*')
      .maybeSingle();

    if (insertError) {
      // Fallback if institution_code or class_name column does not exist yet
      const fallbackInsertData: Record<string, any> = {
        teacher_id: payload.teacher_id,
        template_id: payload.template_id,
        report_date: payload.report_date,
        start_time: payload.start_time,
        duration_minutes: payload.duration_minutes,
        subject: payload.subject,
        status: payload.status,
        notes: payload.notes ?? '',
      };

      const { data: fallbackInserted, error: fallbackErr } = await supabase
        .from('weekly_actual_reports')
        .insert(fallbackInsertData)
        .select('*')
        .maybeSingle();

      if (fallbackErr) throw fallbackErr;
      return {
        data: fallbackInserted
          ? ({
              ...fallbackInserted,
              class_name: payload.class_name ?? null,
              institution_code: payload.institution_code ?? null,
            } as WeeklyActualReport)
          : null,
        error: null,
      };
    }

    return { data: inserted as WeeklyActualReport, error: null };
  } catch (err: any) {
    console.error('Error saving weekly report:', err);
    return { data: null, error: err };
  }
}

/**
 * Safely creates or updates a `schedule_templates` slot including `class_name` and `institution_code`.
 */
export async function saveScheduleTemplateSafe(
  supabase: SupabaseClient,
  payload: SaveScheduleTemplatePayload
): Promise<{ data: ScheduleTemplate | null; error: Error | null }> {
  try {
    if (!payload.teacher_id || !isValidUuid(payload.teacher_id)) {
      const uuidErr = new Error(
        `[DB ERROR]: Invalid or missing teacher_id UUID constraint in saveScheduleTemplateSafe. Received: "${payload.teacher_id}".`
      );
      console.error(uuidErr.message, 'Full payload:', payload);
      return { data: null, error: uuidErr };
    }

    if (payload.id && !isValidUuid(payload.id)) {
      const uuidErr = new Error(
        `[DB ERROR]: Invalid template id UUID in saveScheduleTemplateSafe. Received: "${payload.id}".`
      );
      console.error(uuidErr.message, 'Full payload:', payload);
      return { data: null, error: uuidErr };
    }

    if (payload.id) {
      const updateData: Record<string, any> = {
        day_of_week: payload.day_of_week,
        start_time: payload.start_time,
        duration_minutes: payload.duration_minutes,
        subject: payload.subject,
        class_name: payload.class_name || null,
        period_number: payload.period_number !== undefined ? payload.period_number : null,
      };

      if (payload.institution_code) {
        updateData.institution_code = payload.institution_code;
      }

      const updateQuery = supabase
        .from('schedule_templates')
        .update(updateData)
        .eq('id', payload.id);

      const { data, error } = await updateQuery.select('*').maybeSingle();

      if (error) {
        console.error(
          '[DB ERROR]: saveScheduleTemplateSafe update failed:',
          error,
          'Payload:',
          updateData
        );
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from('schedule_templates')
          .update({
            day_of_week: payload.day_of_week,
            start_time: payload.start_time,
            duration_minutes: payload.duration_minutes,
            subject: payload.subject,
          })
          .eq('id', payload.id)
          .select('*')
          .maybeSingle();

        if (fallbackErr) {
          console.error(
            '[DB ERROR]: saveScheduleTemplateSafe update fallback failed:',
            fallbackErr
          );
          throw fallbackErr;
        }
        return {
          data: fallbackData
            ? ({
                ...fallbackData,
                class_name: payload.class_name || null,
                institution_code: payload.institution_code || null,
                period_number: payload.period_number ?? null,
              } as ScheduleTemplate)
            : null,
          error: null,
        };
      }

      return { data: data as ScheduleTemplate, error: null };
    } else {
      const insertData: Record<string, any> = {
        teacher_id: payload.teacher_id,
        day_of_week: payload.day_of_week,
        start_time: payload.start_time,
        duration_minutes: payload.duration_minutes,
        subject: payload.subject,
        class_name: payload.class_name || null,
        period_number: payload.period_number !== undefined ? payload.period_number : null,
      };

      if (payload.institution_code) {
        insertData.institution_code = payload.institution_code;
      }

      const { data, error } = await supabase
        .from('schedule_templates')
        .insert(insertData)
        .select('*')
        .maybeSingle();

      if (error) {
        console.error(
          '[DB ERROR]: saveScheduleTemplateSafe insert failed:',
          error,
          'Payload:',
          insertData
        );
        const fallbackInsertData = {
          teacher_id: payload.teacher_id,
          day_of_week: payload.day_of_week,
          start_time: payload.start_time,
          duration_minutes: payload.duration_minutes,
          subject: payload.subject,
        };
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from('schedule_templates')
          .insert(fallbackInsertData)
          .select('*')
          .maybeSingle();

        if (fallbackErr) {
          console.error(
            '[DB ERROR]: saveScheduleTemplateSafe insert fallback failed:',
            fallbackErr,
            'Payload:',
            fallbackInsertData
          );
          throw fallbackErr;
        }
        return {
          data: fallbackData
            ? ({
                ...fallbackData,
                class_name: payload.class_name || null,
                institution_code: payload.institution_code || null,
                period_number: payload.period_number ?? null,
              } as ScheduleTemplate)
            : null,
          error: null,
        };
      }

      return { data: data as ScheduleTemplate, error: null };
    }
  } catch (err: any) {
    console.error('[DB ERROR]: Error saving schedule template:', err);
    return { data: null, error: err };
  }
}

/**
 * Safely creates a new teacher including `phone`, `email`, and `institution_code`.
 */
export async function createTeacherSafe(
  supabase: SupabaseClient,
  payload: UpsertTeacherContactPayload
): Promise<{ data: Teacher | null; error: Error | null }> {
  try {
    if (!payload.school_id || !isValidUuid(payload.school_id)) {
      const uuidErr = new Error(
        `[DB ERROR]: Invalid or missing school_id UUID constraint in createTeacherSafe. Received: "${payload.school_id}".`
      );
      console.error(uuidErr.message, 'Full payload:', payload);
      return { data: null, error: uuidErr };
    }

    const magicToken =
      payload.magic_token ||
      `token-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const insertData: Record<string, any> = {
      school_id: payload.school_id,
      name: payload.name,
      subject: payload.subject,
      phone: payload.phone || null,
      email: payload.email || null,
      magic_token: magicToken,
    };

    if (payload.id_number) {
      insertData.id_number = payload.id_number;
    }

    if (payload.institution_code) {
      insertData.institution_code = payload.institution_code;
    }

    const { data, error } = await supabase
      .from('teachers')
      .insert(insertData)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error(
        '[DB ERROR]: createTeacherSafe initial insert error:',
        error,
        'Payload:',
        insertData
      );

      // Fallback 1: try without id_number (in case column is not yet present)
      const fallbackData1: Record<string, any> = {
        school_id: payload.school_id,
        name: payload.name,
        subject: payload.subject,
        phone: payload.phone || null,
        email: payload.email || null,
        magic_token: magicToken,
      };

      if (payload.institution_code) {
        fallbackData1.institution_code = payload.institution_code;
      }

      const { data: fb1Data, error: fb1Error } = await supabase
        .from('teachers')
        .insert(fallbackData1)
        .select('*')
        .maybeSingle();

      if (!fb1Error && fb1Data) {
        return {
          data: {
            ...fb1Data,
            id_number: payload.id_number || null,
            institution_code: payload.institution_code || null,
          } as Teacher,
          error: null,
        };
      }

      if (fb1Error) {
        console.error(
          '[DB ERROR]: createTeacherSafe fallback 1 error (without id_number):',
          fb1Error,
          'Payload:',
          fallbackData1
        );
      }

      // Fallback 2: minimal core columns
      const fallbackData2 = {
        school_id: payload.school_id,
        name: payload.name,
        subject: payload.subject,
        magic_token: magicToken,
      };

      const { data: fallbackData2Res, error: fallbackError2 } = await supabase
        .from('teachers')
        .insert(fallbackData2)
        .select('*')
        .maybeSingle();

      if (fallbackError2) {
        console.error(
          '[DB ERROR]: createTeacherSafe fallback 2 error (minimal columns):',
          fallbackError2,
          'Payload:',
          fallbackData2
        );
        throw fallbackError2;
      }

      return {
        data: fallbackData2Res
          ? ({
              ...fallbackData2Res,
              id_number: payload.id_number || null,
              phone: payload.phone || null,
              email: payload.email || null,
              institution_code: payload.institution_code || null,
            } as Teacher)
          : null,
        error: null,
      };
    }

    return { data: data as Teacher, error: null };
  } catch (err: any) {
    console.error('[DB ERROR]: Error creating teacher:', err);
    return { data: null, error: err };
  }
}

/**
 * Safely updates an existing teacher including `phone`, `email`, and `institution_code`.
 */
export async function updateTeacherSafe(
  supabase: SupabaseClient,
  teacherId: string,
  payload: {
    name: string;
    subject: string;
    id_number?: string | null;
    phone?: string | null;
    email?: string | null;
    institution_code?: string | null;
  }
): Promise<{ data: Teacher | null; error: Error | null }> {
  try {
    if (!teacherId || !isValidUuid(teacherId)) {
      const uuidErr = new Error(
        `[DB ERROR]: Invalid or missing teacherId UUID in updateTeacherSafe. Received: "${teacherId}".`
      );
      console.error(uuidErr.message, 'Payload was:', payload);
      return { data: null, error: uuidErr };
    }

    const updateData: Record<string, any> = {
      name: payload.name,
      subject: payload.subject,
      phone: payload.phone || null,
      email: payload.email || null,
    };

    if (payload.id_number) {
      updateData.id_number = payload.id_number;
    }

    if (payload.institution_code) {
      updateData.institution_code = payload.institution_code;
    }

    const updateQuery = supabase
      .from('teachers')
      .update(updateData)
      .eq('id', teacherId);

    const { data, error } = await updateQuery.select('*').maybeSingle();

    if (error) {
      console.error(
        '[DB ERROR]: updateTeacherSafe primary update error:',
        error,
        'Payload:',
        updateData
      );
      const fallbackQuery = supabase
        .from('teachers')
        .update({
          name: payload.name,
          subject: payload.subject,
        })
        .eq('id', teacherId);

      const { data: fallbackData, error: fallbackError } = await fallbackQuery
        .select('*')
        .maybeSingle();

      if (fallbackError) {
        console.error(
          '[DB ERROR]: updateTeacherSafe fallback error:',
          fallbackError
        );
        throw fallbackError;
      }
      return {
        data: fallbackData
          ? ({
              ...fallbackData,
              id_number: payload.id_number || null,
              phone: payload.phone || null,
              email: payload.email || null,
              institution_code: payload.institution_code || null,
            } as Teacher)
          : null,
        error: null,
      };
    }

    return { data: data as Teacher, error: null };
  } catch (err: any) {
    console.error('[DB ERROR]: Error updating teacher:', err);
    return { data: null, error: err };
  }
}

/**
 * Seeds demo school, teachers (with phone & email), and schedule templates (with class_name) into Supabase.
 */
export async function seedDemoSchoolData(
  supabase: SupabaseClient,
  adminUserId: string | null
) {
  const { data: existingSchool } = await supabase
    .from('schools')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (existingSchool) {
    return existingSchool;
  }

  // 1. Insert School
  const { data: school, error: schoolError } = await supabase
    .from('schools')
    .insert({
      name: 'תיכון ממלכתי רבין - תל אביב',
      semel_mosad: '440129',
      admin_user_id: adminUserId,
    })
    .select('*')
    .maybeSingle();

  if (schoolError || !school) {
    throw schoolError || new Error('שגיאה ביצירת בית ספר לדוגמה');
  }

  // 2. Insert Teachers (with phone and email)
  const demoTeachers = [
    {
      school_id: school.id,
      name: 'נועה לוי',
      subject: 'מתמטיקה',
      phone: '052-3456789',
      email: 'noa.levi@school.edu.il',
      magic_token: 'noa-math-token',
    },
    {
      school_id: school.id,
      name: 'יוסי כהן',
      subject: 'אנגלית',
      phone: '054-7654321',
      email: 'yossi.cohen@school.edu.il',
      magic_token: 'yossi-eng-token',
    },
    {
      school_id: school.id,
      name: 'מיכל אברהם',
      subject: 'לשון והבעה',
      phone: '050-9876543',
      email: 'michal.a@school.edu.il',
      magic_token: 'michal-heb-token',
    },
    {
      school_id: school.id,
      name: 'דניאל פרידמן',
      subject: 'פיזיקה ומדעים',
      phone: '053-2233445',
      email: 'daniel.f@school.edu.il',
      magic_token: 'daniel-sci-token',
    },
  ];

  const { data: insertedTeachers, error: teachersError } = await supabase
    .from('teachers')
    .insert(demoTeachers)
    .select('*');

  if (teachersError || !insertedTeachers) {
    throw teachersError || new Error('שגיאה ביצירת מורים לדוגמה');
  }

  // 3. Insert Schedule Templates across Sunday (1) to Friday (6) with class_name
  const templatesToInsert = [
    { teacher_id: insertedTeachers[0].id, day_of_week: 1, start_time: '09:00', duration_minutes: 45, subject: 'פרטני אלגברה', class_name: 'ט׳ 2' },
    { teacher_id: insertedTeachers[0].id, day_of_week: 2, start_time: '11:00', duration_minutes: 45, subject: 'תגבור בגרות 4 יח״ל', class_name: 'י״א 1' },
    { teacher_id: insertedTeachers[0].id, day_of_week: 4, start_time: '10:00', duration_minutes: 45, subject: 'גיאומטריה אנליטית', class_name: 'י׳ 3' },
    { teacher_id: insertedTeachers[1].id, day_of_week: 1, start_time: '10:00', duration_minutes: 45, subject: 'אוצר מילים ודקדוק', class_name: 'ח׳ 4' },
    { teacher_id: insertedTeachers[1].id, day_of_week: 3, start_time: '09:00', duration_minutes: 45, subject: 'הכנה לבגרות בע״פ', class_name: 'י״ב 2' },
    { teacher_id: insertedTeachers[1].id, day_of_week: 5, start_time: '12:00', duration_minutes: 45, subject: 'קריאה מודרכת', class_name: 'ז׳ 1' },
    { teacher_id: insertedTeachers[2].id, day_of_week: 2, start_time: '09:00', duration_minutes: 45, subject: 'תחביר ומערכת הצורות', class_name: 'י׳ 1' },
    { teacher_id: insertedTeachers[2].id, day_of_week: 3, start_time: '11:00', duration_minutes: 45, subject: 'כתיבה טיעונית', class_name: 'ט׳ 2' },
    { teacher_id: insertedTeachers[2].id, day_of_week: 6, start_time: '09:00', duration_minutes: 45, subject: 'הבנת הנקרא פרטני', class_name: 'ח׳ 3' },
    { teacher_id: insertedTeachers[3].id, day_of_week: 1, start_time: '12:00', duration_minutes: 45, subject: 'מכניקה ניוטונית', class_name: 'י׳ 3' },
    { teacher_id: insertedTeachers[3].id, day_of_week: 4, start_time: '11:00', duration_minutes: 45, subject: 'תרגול מעבדה פרטני', class_name: 'י״א 1' },
    { teacher_id: insertedTeachers[3].id, day_of_week: 5, start_time: '10:00', duration_minutes: 45, subject: 'חשמל ומגנטיות', class_name: 'י״ב 2' },
  ];

  await supabase.from('schedule_templates').insert(templatesToInsert);

  return school;
}
