export type ReportStatus = 'pending' | 'done' | 'missed' | 'excused';

export interface AdminProfile {
  id: string;
  admin_name: string;
  id_number: string;
  school_name: string;
  institution_code: string;
  created_at: string;
  email?: string;
  is_active?: boolean;
}

export interface School {
  id: string;
  created_at: string;
  name: string;
  semel_mosad: string;
  admin_user_id: string | null;
}

export interface Teacher {
  id: string;
  created_at: string;
  school_id: string;
  name: string;
  subject: string;
  id_number?: string | null;
  phone?: string | null;
  email?: string | null;
  magic_token: string;
  auth_user_id: string | null;
  last_login?: string | null;
  institution_code?: string | null;
}

export interface ScheduleTemplate {
  id: string;
  teacher_id: string;
  day_of_week: number; // 1 (ראשון) to 6 (שישי)
  start_time: string;  // "HH:MM:SS" or "HH:MM"
  duration_minutes: number;
  subject: string;
  class_name?: string | null;
  institution_code?: string | null;
}

export interface WeeklyActualReport {
  id: string;
  teacher_id: string;
  template_id: string | null;
  report_date: string; // "YYYY-MM-DD"
  start_time: string;
  duration_minutes: number;
  subject: string;
  class_name?: string | null;
  status: ReportStatus;
  notes: string;
  institution_code?: string | null;
}

export interface EnrichedSessionItem {
  key: string; // "${template_id || start_time}_${report_date}"
  template_id: string | null;
  report_id: string | null;
  teacher_id: string;
  teacher_name: string;
  day_of_week: number;
  report_date: string;
  start_time: string; // normalized "HH:MM"
  duration_minutes: number;
  subject: string;
  class_name?: string | null;
  status: ReportStatus;
  notes: string;
}

export const HEBREW_DAYS: Record<number, string> = {
  1: 'יום ראשון',
  2: 'יום שני',
  3: 'יום שלישי',
  4: 'יום רביעי',
  5: 'יום חמישי',
  6: 'יום שישי',
};

export const HEBREW_SHORT_DAYS: Record<number, string> = {
  1: 'א׳',
  2: 'ב׳',
  3: 'ג׳',
  4: 'ד׳',
  5: 'ה׳',
  6: 'ו׳',
};

export const STATUS_CONFIG: Record<
  ReportStatus,
  {
    label: string;
    bg: string;
    text: string;
    border: string;
    badgeBg: string;
    dot: string;
  }
> = {
  pending: {
    label: 'ממתין לדיווח',
    bg: 'bg-slate-50/90 hover:bg-slate-100/80',
    text: 'text-slate-700',
    border: 'border-slate-200/90',
    badgeBg: 'bg-slate-100 text-slate-700 border-slate-300',
    dot: 'bg-slate-400',
  },
  done: {
    label: 'בוצע',
    bg: 'bg-emerald-50/85 hover:bg-emerald-100/80',
    text: 'text-emerald-900',
    border: 'border-emerald-200/90',
    badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    dot: 'bg-emerald-500',
  },
  missed: {
    label: 'לא בוצע',
    bg: 'bg-rose-50/90 hover:bg-rose-100/85',
    text: 'text-rose-900',
    border: 'border-rose-300',
    badgeBg: 'bg-rose-100 text-rose-800 border-rose-300',
    dot: 'bg-rose-500',
  },
  excused: {
    label: 'היעדרות מאושרת',
    bg: 'bg-sky-50/85 hover:bg-sky-100/80',
    text: 'text-sky-900',
    border: 'border-sky-200/90',
    badgeBg: 'bg-sky-100 text-sky-800 border-sky-300',
    dot: 'bg-sky-500',
  },
};
