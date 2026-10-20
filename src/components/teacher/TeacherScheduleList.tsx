'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  ShieldAlert,
  Clock,
  CheckCheck,
  Calendar,
  Save,
  GraduationCap,
  XCircle,
  RotateCcw,
} from 'lucide-react';
import {
  EnrichedSessionItem,
  HEBREW_DAYS,
  ReportStatus,
  STATUS_CONFIG,
} from '@/types/database';

interface TeacherScheduleListProps {
  sessions: EnrichedSessionItem[];
  todayIso: string;
  isBulkSaving: boolean;
  savingSessionKey: string | null;
  onUpdateSession: (
    session: EnrichedSessionItem,
    newStatus: ReportStatus,
    notes: string
  ) => Promise<void>;
  onMarkAllDone: () => Promise<void>;
}

export default function TeacherScheduleList({
  sessions,
  todayIso,
  isBulkSaving,
  savingSessionKey,
  onUpdateSession,
  onMarkAllDone,
}: TeacherScheduleListProps) {
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});

  const pendingCount = sessions.filter((s) => s.status === 'pending').length;
  const missedCount = sessions.filter((s) => s.status === 'missed').length;
  const eligiblePendingForDoneCount = sessions.filter(
    (s) =>
      (s.status === 'pending' || s.status === 'missed') &&
      (!todayIso || s.report_date <= todayIso)
  ).length;
  const doneSessionsCount = sessions.filter((s) => s.status === 'done').length;
  const excusedSessionsCount = sessions.filter(
    (s) => s.status === 'excused'
  ).length;

  const getNoteValue = (session: EnrichedSessionItem) => {
    if (draftNotes[session.key] !== undefined) {
      return draftNotes[session.key];
    }
    return session.notes || '';
  };

  const handleNoteChange = (key: string, value: string) => {
    setDraftNotes((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-5">
      {/* Summary & "Mark All Done" Action Bar */}
      <div className="glass-card flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            המערכת הפרטנית שלי השבוע ({sessions.length} שעות)
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">
            בוצעו:{' '}
            <span className="font-bold text-emerald-700">
              {doneSessionsCount}
            </span>{' '}
            • היעדרות מאושרת:{' '}
            <span className="font-bold text-sky-700">
              {excusedSessionsCount}
            </span>{' '}
            • לא בוצע:{' '}
            <span className="font-bold text-rose-600">{missedCount}</span> •
            ממתינים לדיווח:{' '}
            <span className="font-bold text-slate-700">{pendingCount}</span>
          </p>
        </div>

        {/* Mark All Done Button */}
        <button
          type="button"
          disabled={eligiblePendingForDoneCount === 0 || isBulkSaving}
          onClick={onMarkAllDone}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
        >
          <CheckCheck className="h-4 w-4" />
          <span>
            {isBulkSaving
              ? 'מעדכן מפגשים...'
              : eligiblePendingForDoneCount > 0
              ? `סמן הכל כבוצע (${eligiblePendingForDoneCount} זמינים לדיווח)`
              : pendingCount > 0
              ? 'המפגשים הנותרים הם בתאריך עתידי'
              : 'כל השעות לשבוע זה דווחו!'}
          </span>
        </button>
      </div>

      {/* Sessions List */}
      {sessions.length === 0 ? (
        <div className="glass-card p-10 text-center text-slate-500">
          לא נמצאו שעות פרטניות מוגדרות במערכת השעות עבורך.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sessions.map((session) => {
            const effectiveStatus: ReportStatus = session.status;
            const cfg = STATUS_CONFIG[effectiveStatus];
            const isMissed = effectiveStatus === 'missed';
            const isSavingThis = savingSessionKey === session.key;
            const currentNote = getNoteValue(session);
            const isNoteEmpty = !currentNote.trim();
            const isExcusedWithoutNote =
              effectiveStatus === 'excused' && isNoteEmpty;

            return (
              <div
                key={session.key}
                data-testid="teacher-session-card"
                className={`glass-card flex flex-col justify-between border-r-4 p-5 transition ${
                  isMissed ? 'border-rose-400 bg-rose-50/40' : cfg.border
                }`}
              >
                <div>
                  {/* Top Row: Day, Date, Time & Status Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-800">
                        <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                        {HEBREW_DAYS[session.day_of_week]} ({session.report_date})
                      </span>
                      {session.period_number && (
                        <span className="inline-flex items-center gap-1 rounded-xl bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-900 border border-indigo-200">
                          שיעור {session.period_number}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        <Clock className="h-3.5 w-3.5 text-slate-500" />
                        {session.start_time}
                      </span>
                    </div>

                    <span
                      data-testid="session-status-badge"
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${cfg.badgeBg}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                  </div>

                  {/* Subject & Class Badge */}
                  <div className="mt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3
                        className={`text-base font-bold ${
                          isMissed ? 'text-rose-900' : 'text-slate-900'
                        }`}
                      >
                        {session.subject}
                      </h3>
                      {session.class_name && (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-800">
                          <GraduationCap className="h-3.5 w-3.5 text-sky-600" />
                          <span>כיתה: {session.class_name}</span>
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      משך המפגש: {session.duration_minutes} דקות
                    </p>
                  </div>

                  {/* Notes Section (Mandatory for Excused Absences) */}
                  <div className="mt-3">
                    <div
                      className={`space-y-2 rounded-xl border p-3 ${
                        isExcusedWithoutNote
                          ? 'border-rose-300 bg-rose-50/50'
                          : 'border-slate-200/70 bg-slate-50/90'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label className="block text-xs font-semibold text-slate-700">
                          הערות למפגש / סיבת היעדרות:
                          <span className="mr-1 font-bold text-rose-600">*</span>
                        </label>
                        <span className="text-[11px] font-semibold text-rose-600">
                          * חובה להזין סיבה להיעדרות מאושרת
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={currentNote}
                          onChange={(e) =>
                            handleNoteChange(session.key, e.target.value)
                          }
                          placeholder="חובה להזין סיבה עבור היעדרות מאושרת (או הערה פדגוגית)..."
                          className={`w-full rounded-lg border bg-white px-3 py-1.5 text-xs text-slate-800 outline-none transition ${
                            isExcusedWithoutNote
                              ? 'border-rose-300 focus:border-rose-500'
                              : 'border-slate-200 focus:border-indigo-500'
                          }`}
                        />
                        <button
                          type="button"
                          disabled={isSavingThis || isExcusedWithoutNote}
                          onClick={() => {
                            if (isExcusedWithoutNote) return;
                            onUpdateSession(
                              session,
                              effectiveStatus,
                              currentNote.trim()
                            );
                          }}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Save className="h-3 w-3" />
                          <span>שמור הערה</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Status Action Buttons */}
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-3.5">
                  <div className="grid grid-cols-3 gap-2">
                    {/* 1. Done Button (Toggleable) */}
                    <button
                      type="button"
                      data-testid="status-btn-done"
                      disabled={isSavingThis}
                      onClick={() => {
                        if (effectiveStatus === 'done') {
                          onUpdateSession(session, 'pending', '');
                        } else {
                          onUpdateSession(session, 'done', currentNote.trim());
                        }
                      }}
                      title={
                        effectiveStatus === 'done'
                          ? 'לחץ שוב כדי לבטל דיווח ולהחזיר לממתין'
                          : 'סמן שיעור כבוצע'
                      }
                      className={`flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2.5 text-xs font-bold transition ${
                        effectiveStatus === 'done'
                          ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/30'
                          : 'border border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100'
                      }`}
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>בוצע</span>
                    </button>

                    {/* 2. Not Done / Missed Button (Toggleable) */}
                    <button
                      type="button"
                      data-testid="status-btn-missed"
                      disabled={isSavingThis}
                      onClick={() => {
                        if (effectiveStatus === 'missed') {
                          onUpdateSession(session, 'pending', '');
                        } else {
                          onUpdateSession(session, 'missed', currentNote.trim());
                        }
                      }}
                      title={
                        effectiveStatus === 'missed'
                          ? 'לחץ שוב כדי לבטל דיווח ולהחזיר לממתין'
                          : 'סמן שיעור כלא בוצע'
                      }
                      className={`flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2.5 text-xs font-bold transition ${
                        effectiveStatus === 'missed'
                          ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-500/30'
                          : 'border border-rose-200 bg-rose-50/70 text-rose-800 hover:bg-rose-100'
                      }`}
                    >
                      <XCircle className="h-4 w-4 shrink-0" />
                      <span>לא בוצע</span>
                    </button>

                    {/* 3. Excused Absence Button (Toggleable) */}
                    <button
                      type="button"
                      data-testid="status-btn-excused"
                      disabled={
                        isSavingThis ||
                        (effectiveStatus !== 'excused' && isNoteEmpty)
                      }
                      onClick={() => {
                        if (effectiveStatus === 'excused') {
                          onUpdateSession(session, 'pending', '');
                        } else {
                          if (isNoteEmpty) return;
                          onUpdateSession(
                            session,
                            'excused',
                            currentNote.trim()
                          );
                        }
                      }}
                      title={
                        effectiveStatus === 'excused'
                          ? 'לחץ שוב כדי לבטל דיווח ולהחזיר לממתין'
                          : isNoteEmpty
                          ? 'חובה להזין סיבה בשדה ההערות לפני סימון היעדרות מאושרת'
                          : 'סמן כהיעדרות מאושרת'
                      }
                      className={`flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2.5 text-xs font-bold transition ${
                        effectiveStatus === 'excused'
                          ? 'bg-sky-600 text-white shadow-sm ring-2 ring-sky-500/30'
                          : isNoteEmpty
                          ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                          : 'border border-sky-200 bg-sky-50/70 text-sky-800 hover:bg-sky-100'
                      }`}
                    >
                      <ShieldAlert className="h-4 w-4 shrink-0" />
                      <span>היעדרות מאושרת</span>
                    </button>
                  </div>

                  {/* Explicit Undo / Reset Button when Session is Reported */}
                  {effectiveStatus !== 'pending' && (
                    <button
                      type="button"
                      data-testid="reset-session-status"
                      disabled={isSavingThis}
                      onClick={() => onUpdateSession(session, 'pending', '')}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>↺ בטל דיווח (החזר לממתין)</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
