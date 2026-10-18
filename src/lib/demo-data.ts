import {
  School,
  Teacher,
  ScheduleTemplate,
  WeeklyActualReport,
} from '@/types/database';

export const FALLBACK_SCHOOL: School = {
  id: 'demo-school-1',
  created_at: '2026-09-01T08:00:00Z',
  name: 'תיכון ממלכתי רבין - תל אביב',
  semel_mosad: '440129',
  admin_user_id: null,
};

export const FALLBACK_TEACHERS: Teacher[] = [
  {
    id: 'demo-teacher-1',
    created_at: '2026-09-01T08:00:00Z',
    school_id: 'demo-school-1',
    name: 'נועה לוי',
    subject: 'מתמטיקה',
    phone: '052-3456789',
    email: 'noa.levi@school.edu.il',
    magic_token: 'noa-math-token',
    auth_user_id: null,
    last_login: '2026-10-16T08:15:00Z',
  },
  {
    id: 'demo-teacher-2',
    created_at: '2026-09-01T08:00:00Z',
    school_id: 'demo-school-1',
    name: 'יוסי כהן',
    subject: 'אנגלית',
    phone: '054-7654321',
    email: 'yossi.cohen@school.edu.il',
    magic_token: 'yossi-eng-token',
    auth_user_id: null,
    last_login: '2026-10-15T14:30:00Z',
  },
  {
    id: 'demo-teacher-3',
    created_at: '2026-09-01T08:00:00Z',
    school_id: 'demo-school-1',
    name: 'מיכל אברהם',
    subject: 'לשון והבעה',
    phone: '050-9876543',
    email: 'michal.a@school.edu.il',
    magic_token: 'michal-heb-token',
    auth_user_id: null,
    last_login: null,
  },
  {
    id: 'demo-teacher-4',
    created_at: '2026-09-01T08:00:00Z',
    school_id: 'demo-school-1',
    name: 'דניאל פרידמן',
    subject: 'פיזיקה ומדעים',
    phone: '053-2233445',
    email: 'daniel.f@school.edu.il',
    magic_token: 'daniel-sci-token',
    auth_user_id: null,
    last_login: '2026-10-14T11:45:00Z',
  },
];

export const FALLBACK_TEMPLATES: ScheduleTemplate[] = [
  { id: 'tpl-1', teacher_id: 'demo-teacher-1', day_of_week: 1, start_time: '09:00', duration_minutes: 45, subject: 'פרטני אלגברה', class_name: 'ט׳ 2' },
  { id: 'tpl-2', teacher_id: 'demo-teacher-1', day_of_week: 2, start_time: '11:00', duration_minutes: 45, subject: 'תגבור בגרות 4 יח״ל', class_name: 'י״א 1' },
  { id: 'tpl-3', teacher_id: 'demo-teacher-1', day_of_week: 4, start_time: '10:00', duration_minutes: 45, subject: 'גיאומטריה אנליטית', class_name: 'י׳ 3' },
  { id: 'tpl-4', teacher_id: 'demo-teacher-2', day_of_week: 1, start_time: '10:00', duration_minutes: 45, subject: 'אוצר מילים ודקדוק', class_name: 'ח׳ 4' },
  { id: 'tpl-5', teacher_id: 'demo-teacher-2', day_of_week: 3, start_time: '09:00', duration_minutes: 45, subject: 'הכנה לבגרות בע״פ', class_name: 'י״ב 2' },
  { id: 'tpl-6', teacher_id: 'demo-teacher-2', day_of_week: 5, start_time: '12:00', duration_minutes: 45, subject: 'קריאה מודרכת', class_name: 'ז׳ 1' },
  { id: 'tpl-7', teacher_id: 'demo-teacher-3', day_of_week: 2, start_time: '09:00', duration_minutes: 45, subject: 'תחביר ומערכת הצורות', class_name: 'י׳ 1' },
  { id: 'tpl-8', teacher_id: 'demo-teacher-3', day_of_week: 3, start_time: '11:00', duration_minutes: 45, subject: 'כתיבה טיעונית', class_name: 'ט׳ 2' },
  { id: 'tpl-9', teacher_id: 'demo-teacher-3', day_of_week: 6, start_time: '09:00', duration_minutes: 45, subject: 'הבנת הנקרא פרטני', class_name: 'ח׳ 3' },
  { id: 'tpl-10', teacher_id: 'demo-teacher-4', day_of_week: 1, start_time: '12:00', duration_minutes: 45, subject: 'מכניקה ניוטונית', class_name: 'י׳ 3' },
  { id: 'tpl-11', teacher_id: 'demo-teacher-4', day_of_week: 4, start_time: '11:00', duration_minutes: 45, subject: 'תרגול מעבדה פרטני', class_name: 'י״א 1' },
  { id: 'tpl-12', teacher_id: 'demo-teacher-4', day_of_week: 5, start_time: '10:00', duration_minutes: 45, subject: 'חשמל ומגנטיות', class_name: 'י״ב 2' },
];

export function buildInitialFallbackReports(
  sundayIso: string,
  secondDayIso: string,
  todayIso?: string
): WeeklyActualReport[] {
  const canMarkSundayDone = !todayIso || sundayIso <= todayIso;
  const reports: WeeklyActualReport[] = [];

  if (canMarkSundayDone) {
    reports.push(
      {
        id: 'rep-1',
        teacher_id: 'demo-teacher-1',
        template_id: 'tpl-1',
        report_date: sundayIso,
        start_time: '09:00',
        duration_minutes: 45,
        subject: 'פרטני אלגברה',
        class_name: 'ט׳ 2',
        status: 'done',
        notes: 'תרגול משוואות ריבועיות עם קבוצת מצוינות',
      },
      {
        id: 'rep-2',
        teacher_id: 'demo-teacher-2',
        template_id: 'tpl-4',
        report_date: sundayIso,
        start_time: '10:00',
        duration_minutes: 45,
        subject: 'אוצר מילים ודקדוק',
        class_name: 'ח׳ 4',
        status: 'done',
        notes: 'עבודה על זמני Present Perfect',
      }
    );
  }

  reports.push({
    id: 'rep-3',
    teacher_id: 'demo-teacher-3',
    template_id: 'tpl-7',
    report_date: secondDayIso,
    start_time: '09:00',
    duration_minutes: 45,
    subject: 'תחביר ומערכת הצורות',
    class_name: 'י׳ 1',
    status: 'excused',
    notes: 'ליווי שכבה לסיור לימודי מוסדי',
  });

  return reports;
}
