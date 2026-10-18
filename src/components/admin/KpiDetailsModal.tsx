'use client';

import { useMemo } from 'react';
import {
  X,
  Calendar,
  Clock,
  User,
  BookOpen,
  GraduationCap,
  MessageSquareText,
  CheckCircle2,
  ShieldAlert,
  AlertCircle,
} from 'lucide-react';
import {
  EnrichedSessionItem,
  HEBREW_DAYS,
  ReportStatus,
  STATUS_CONFIG,
} from '@/types/database';

export type KpiCategoryType = 'done' | 'excused' | 'missing';

interface KpiDetailsModalProps {
  isOpen: boolean;
  category: KpiCategoryType | null;
  sessions: EnrichedSessionItem[];
  todayIso: string;
  onClose: () => void;
  onSelectSession?: (session: EnrichedSessionItem) => void;
}

const CATEGORY_META: Record<
  KpiCategoryType,
  {
    title: string;
    subtitle: string;
    badgeText: string;
    badgeClass: string;
    headerIconBg: string;
    Icon: typeof CheckCircle2;
  }
> = {
  done: {
    title: 'שעות פרטניות שבוצעו',
    subtitle: 'פירוט כלל השעות הפרטניות שדווחו כבוצעו בשבוע הנבחר',
    badgeText: 'בוצעו',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    headerIconBg: 'bg-emerald-50 text-emerald-600',
    Icon: CheckCircle2,
  },
  excused: {
    title: 'היעדרות מאושרת',
    subtitle: 'פירוט מפגשים שלא התקיימו בשל טיול, השתלמות, מחלה או סיבה מאושרת',
    badgeText: 'היעדרות מאושרת',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    headerIconBg: 'bg-sky-50 text-sky-600',
    Icon: ShieldAlert,
  },
  missing: {
    title: 'דיווחים חסרים',
    subtitle:
      'פירוט מפגשים שמועדם עבר (לא בוצעו) ומפגשים להיום שטרם דווחו',
    badgeText: 'דיווח חסר',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    headerIconBg: 'bg-rose-50 text-rose-600',
    Icon: AlertCircle,
  },
};

export default function KpiDetailsModal({
  isOpen,
  category,
  sessions,
  todayIso,
  onClose,
  onSelectSession,
}: KpiDetailsModalProps) {
  // Group sessions chronologically by Day of the Week (1 = יום ראשון ... 6 = יום שישי)
  // and sort within each day by start_time, then teacher_name
  const groupedByDay = useMemo(() => {
    const map = new Map<number, EnrichedSessionItem[]>();

    const sorted = [...sessions].sort((a, b) => {
      if (a.day_of_week !== b.day_of_week) {
        return a.day_of_week - b.day_of_week;
      }
      if (a.start_time !== b.start_time) {
        return a.start_time.localeCompare(b.start_time);
      }
      return a.teacher_name.localeCompare(b.teacher_name, 'he');
    });

    sorted.forEach((session) => {
      const list = map.get(session.day_of_week) || [];
      list.push(session);
      map.set(session.day_of_week, list);
    });

    return Array.from(map.entries()).sort(([dayA], [dayB]) => dayA - dayB);
  }, [sessions]);

  if (!isOpen || !category) return null;

  const meta = CATEGORY_META[category];
  const HeaderIcon = meta.Icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white/90 backdrop-blur-md shadow-2xl rounded-2xl flex flex-col max-h-[85vh] overflow-hidden text-right"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Static Modal Header */}
        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-slate-200/80 bg-white/85 px-6 py-4 backdrop-blur-md">
          <div className="flex items-start gap-3.5">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${meta.headerIconBg}`}
            >
              <HeaderIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-bold text-slate-900">
                  {meta.title}
                </h3>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${meta.badgeClass}`}
                >
                  {sessions.length} מפגשים
                </span>
              </div>
              <p className="mt-0.5 text-xs sm:text-sm text-slate-500">
                {meta.subtitle}
              </p>
            </div>
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

        {/* Scrollable Content Body */}
        <div
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6"
          style={{ minHeight: 0 }}
        >
          {groupedByDay.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 py-12 text-center">
              <HeaderIcon className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-base font-bold text-slate-700">
                אין מפגשים להצגה בקטגוריה זו
              </p>
              <p className="mt-1 text-xs text-slate-500">
                לא נמצאו שעות פרטניות התואמות לסינון הנוכחי בשבוע זה.
              </p>
            </div>
          ) : (
            groupedByDay.map(([dayOfWeek, daySessions]) => {
              const dayName = HEBREW_DAYS[dayOfWeek] || `יום ${dayOfWeek}`;
              const sampleDate = daySessions[0]?.report_date || '';

              return (
                <div key={dayOfWeek} className="space-y-3">
                  {/* Chronological Day Header */}
                  <div className="sticky top-0 z-10 flex items-center justify-between rounded-xl border border-indigo-100 bg-indigo-50/95 px-4 py-2 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-indigo-600" />
                      <span className="text-sm font-bold text-indigo-950">
                        {dayName}
                      </span>
                      {sampleDate && (
                        <span className="text-xs font-medium text-indigo-700/80">
                          ({sampleDate})
                        </span>
                      )}
                    </div>
                    <span className="rounded-lg bg-white/90 px-2.5 py-0.5 text-xs font-bold text-indigo-700 shadow-sm">
                      {daySessions.length}{' '}
                      {daySessions.length === 1 ? 'מפגש' : 'מפגשים'}
                    </span>
                  </div>

                  {/* Day's Sessions List */}
                  <div className="space-y-2.5">
                    {daySessions.map((session) => {
                      const isPast = Boolean(
                        todayIso && session.report_date < todayIso
                      );
                      const isFuture = Boolean(
                        todayIso && session.report_date > todayIso
                      );
                      const effectiveStatus: ReportStatus =
                        isPast && session.status === 'pending'
                          ? 'missed'
                          : isFuture && session.status === 'done'
                          ? 'pending'
                          : session.status;
                      const statusCfg = STATUS_CONFIG[effectiveStatus];
                      const isMissed = effectiveStatus === 'missed';

                      return (
                        <div
                          key={session.key}
                          onClick={() => {
                            if (onSelectSession) {
                              onClose();
                              onSelectSession(session);
                            }
                          }}
                          className={`group rounded-2xl border p-4 shadow-sm transition ${
                            isMissed
                              ? 'border-rose-200 bg-rose-50/40'
                              : 'border-slate-200/90 bg-white/90'
                          } ${
                            onSelectSession
                              ? 'cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 hover:shadow-md'
                              : ''
                          }`}
                        >
                          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                            {/* Right Side: Teacher, Subject, Class */}
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                              {/* Teacher Name */}
                              <div className="flex items-center gap-1.5">
                                <User className="h-4 w-4 text-indigo-600 shrink-0" />
                                <span className="text-sm font-bold text-slate-900">
                                  {session.teacher_name}
                                </span>
                              </div>

                              {/* Subject */}
                              <div
                                className={`flex items-center gap-1.5 text-xs sm:text-sm font-medium ${
                                  isMissed ? 'text-rose-900' : 'text-slate-700'
                                }`}
                              >
                                <BookOpen className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span>{session.subject}</span>
                              </div>

                              {/* Class */}
                              <span className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-800">
                                <GraduationCap className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                                <span>
                                  כיתה: {session.class_name || 'לא הוגדרה'}
                                </span>
                              </span>
                            </div>

                            {/* Left Side: Time & Status */}
                            <div className="flex items-center gap-2 self-end sm:self-auto">
                              <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                                <Clock className="h-3.5 w-3.5 text-slate-500" />
                                <span>{session.start_time}</span>
                                <span className="font-normal text-slate-500">
                                  ({session.duration_minutes} דק׳)
                                </span>
                              </span>

                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusCfg.badgeBg}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`}
                                />
                                {statusCfg.label}
                              </span>
                            </div>
                          </div>

                          {/* Notes Row (if any) */}
                          {session.notes && session.notes.trim() !== '' && (
                            <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-slate-200/70 bg-slate-50/90 px-3 py-2 text-xs text-slate-700">
                              <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
                              <div>
                                <span className="font-bold text-slate-800">
                                  הערה / סיבה:{' '}
                                </span>
                                <span>{session.notes}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Static Modal Footer */}
        <div className="shrink-0 flex items-center justify-between border-t border-slate-200/80 bg-white/85 px-6 py-3.5 backdrop-blur-md">
          <span className="text-xs text-slate-500">
            {onSelectSession
              ? 'טיפ: לחץ על שורת מפגש כדי לערוך או לדרוס את הסטטוס שלו'
              : `סה"כ ${sessions.length} מפגשים מוצגים`}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-5 py-2 text-xs sm:text-sm font-bold text-white transition hover:bg-slate-800"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

