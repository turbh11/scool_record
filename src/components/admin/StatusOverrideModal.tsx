'use client';

import { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldAlert,
  Calendar,
  User,
  BookOpen,
  Save,
  Lock,
} from 'lucide-react';
import {
  EnrichedSessionItem,
  HEBREW_DAYS,
  ReportStatus,
  STATUS_CONFIG,
} from '@/types/database';

interface StatusOverrideModalProps {
  session: EnrichedSessionItem | null;
  todayIso: string;
  isSaving: boolean;
  onClose: () => void;
  onSaveOverride: (
    session: EnrichedSessionItem,
    newStatus: ReportStatus,
    notes: string
  ) => Promise<void>;
}

const STATUS_OPTIONS: {
  value: ReportStatus;
  label: string;
  description: string;
  icon: typeof CheckCircle2;
}[] = [
  {
    value: 'done',
    label: 'בוצע (Done)',
    description: 'השיעור הפרטני התקיים במלואו',
    icon: CheckCircle2,
  },
  {
    value: 'pending',
    label: 'ממתין לדיווח (Pending)',
    description: 'טרם דווח על ידי המורה',
    icon: Clock,
  },
  {
    value: 'excused',
    label: 'היעדרות מאושרת (Excused)',
    description: 'טיול שנתי, מחלה, השתלמות או פעילות מוסדית',
    icon: ShieldAlert,
  },
  {
    value: 'missed',
    label: 'לא בוצע (Missed)',
    description: 'השיעור לא התקיים ללא אישור מוקדם',
    icon: XCircle,
  },
];

export default function StatusOverrideModal({
  session,
  todayIso,
  isSaving,
  onClose,
  onSaveOverride,
}: StatusOverrideModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<ReportStatus>('pending');
  const [notes, setNotes] = useState<string>('');

  const isFutureSession = Boolean(session && session.report_date > todayIso);

  useEffect(() => {
    if (session) {
      setSelectedStatus(
        session.report_date > todayIso && session.status === 'done'
          ? 'pending'
          : session.status
      );
      setNotes(session.notes || '');
    }
  }, [session, todayIso]);

  if (!session) return null;

  const isExcused = selectedStatus === 'excused';
  const isExcusedMissingNote = isExcused && !notes.trim();

  const handleSaveClick = async () => {
    if (isFutureSession && selectedStatus === 'done') return;
    if (isExcusedMissingNote) return;
    await onSaveOverride(session, selectedStatus, notes.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="glass-modal w-full max-w-lg overflow-hidden p-6 text-right animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200/80 pb-4">
          <div>
            <span className="inline-block rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              דריסת סטטוס מנהל
            </span>
            <h3 className="mt-1 text-xl font-bold text-slate-900">
              עדכון דיווח שעה פרטנית
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="סגור חלון"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Session Info Summary */}
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3.5 text-xs text-slate-700">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-indigo-600 shrink-0" />
            <div>
              <span className="block text-slate-400">מורה:</span>
              <span className="font-bold text-slate-900">
                {session.teacher_name}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-indigo-600 shrink-0" />
            <div>
              <span className="block text-slate-400">נושא פרטני / כיתה:</span>
              <span className="font-bold text-slate-900">
                {session.subject}
                {session.class_name ? ` • כיתה ${session.class_name}` : ''}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 col-span-2">
            <Calendar className="h-4 w-4 text-indigo-600 shrink-0" />
            <div>
              <span className="text-slate-400">מועד: </span>
              <span className="font-semibold text-slate-800">
                {HEBREW_DAYS[session.day_of_week]} ({session.report_date}) בשעה{' '}
                {session.start_time} ({session.duration_minutes} דקות)
              </span>
            </div>
          </div>
        </div>

        {isFutureSession && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/90 px-3.5 py-2 text-xs font-medium text-amber-900">
            <Lock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span>
              מועד עתידי: לא ניתן לסמן מפגש עתידי כ&quot;בוצע&quot;, אך ניתן לסמן
              &quot;היעדרות מאושרת&quot; מראש.
            </span>
          </div>
        )}

        {/* Status Selection Buttons */}
        <div className="mt-4 space-y-2">
          <label className="block text-sm font-semibold text-slate-800">
            בחר סטטוס דיווח:
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {STATUS_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = selectedStatus === option.value;
              const cfg = STATUS_CONFIG[option.value];
              const isDisabledOption =
                isFutureSession && option.value === 'done';

              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={isDisabledOption}
                  onClick={() => setSelectedStatus(option.value)}
                  className={`flex items-start gap-2.5 rounded-xl border p-3 text-right transition ${
                    isDisabledOption
                      ? 'cursor-not-allowed border-slate-200 bg-slate-100/70 opacity-50'
                      : isSelected
                      ? `${cfg.bg} ${cfg.border} ring-2 ring-indigo-500/40`
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      isSelected && !isDisabledOption
                        ? cfg.text
                        : 'text-slate-400'
                    }`}
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      {option.label}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {isDisabledOption
                        ? 'חסום לתאריך עתידי'
                        : option.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Notes Input */}
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <label
              htmlFor="admin-override-notes"
              className="block text-sm font-semibold text-slate-800"
            >
              הערות לדיווח / סיבת שינוי:
              {isExcused && (
                <span className="mr-1 font-bold text-rose-600">*</span>
              )}
            </label>
            {isExcused && (
              <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-600 border border-rose-200">
                * חובה להזין סיבה
              </span>
            )}
          </div>
          <textarea
            id="admin-override-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              isExcused
                ? 'חובה להזין סיבה להיעדרות מאושרת (לדוגמה: טיול שנתי, מחלה, השתלמות)...'
                : 'הזן הערה פדגוגית או פירוט סיבת היעדרות...'
            }
            className={`mt-1.5 w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition focus:ring-2 ${
              isExcusedMissingNote
                ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20'
                : 'border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20'
            }`}
          />
          {isExcusedMissingNote && (
            <p className="mt-1 text-xs font-medium text-rose-600">
              * חובה להזין סיבה להיעדרות מאושרת לפני שמירת הדיווח
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200/80 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            ביטול
          </button>
          <button
            type="button"
            disabled={
              isSaving ||
              (isFutureSession && selectedStatus === 'done') ||
              isExcusedMissingNote
            }
            onClick={handleSaveClick}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? 'שומר שינויים...' : 'שמור עדכון סטטוס'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
