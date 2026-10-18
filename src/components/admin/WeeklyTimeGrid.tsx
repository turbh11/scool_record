'use client';

import {
  Clock,
  User,
  MessageSquare,
  SearchX,
  GraduationCap,
} from 'lucide-react';
import {
  EnrichedSessionItem,
  HEBREW_DAYS,
  ReportStatus,
  STATUS_CONFIG,
} from '@/types/database';
import { WeekDayInfo } from '@/lib/dates';

interface WeeklyTimeGridProps {
  days: WeekDayInfo[];
  sessions: EnrichedSessionItem[];
  todayIso: string;
  onSelectSession: (session: EnrichedSessionItem) => void;
}

const DEFAULT_TIME_SLOTS = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
];

export default function WeeklyTimeGrid({
  days,
  sessions,
  todayIso,
  onSelectSession,
}: WeeklyTimeGridProps) {
  const timeSlots = Array.from(
    new Set([...DEFAULT_TIME_SLOTS, ...sessions.map((s) => s.start_time)])
  ).sort();

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 bg-white/60 px-6 py-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            מערכת שעות פרטניות שבועית ({sessions.length} מפגשים מוצגים)
          </h2>
          <p className="text-xs text-slate-500">
            לחץ על כל משבצת שיעור כדי לפתוח את חלון דריסת הסטטוס והוספת הערת הנהלה
          </p>
        </div>

        {/* Status Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map(
            (statusKey) => {
              const cfg = STATUS_CONFIG[statusKey];
              return (
                <div
                  key={statusKey}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/90 px-2.5 py-1 font-medium text-slate-700"
                >
                  <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                  <span>{cfg.label}</span>
                </div>
              );
            }
          )}
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-14 text-center text-slate-500">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <SearchX className="h-6 w-6" />
          </div>
          <p className="text-sm font-bold text-slate-700">
            לא נמצאו שעות פרטניות התואמות לחיפוש ולסינון הנוכחי
          </p>
          <p className="text-xs text-slate-400">
            נסה לשנות את שם המורה או הכיתה בשדה החיפוש או לבחור &quot;הכל&quot; בסינון תחום הדעת
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-right">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/80">
                <th className="w-24 border-l border-slate-200/70 px-3 py-3.5 text-center text-xs font-bold text-slate-600">
                  שעה
                </th>
                {days.map((day) => (
                  <th
                    key={day.dayOfWeek}
                    className="w-1/6 border-l border-slate-200/70 px-3 py-3 text-right last:border-l-0"
                  >
                    <div className="text-sm font-bold text-slate-900">
                      {HEBREW_DAYS[day.dayOfWeek]}
                    </div>
                    <div className="text-xs font-normal text-slate-500">
                      {day.displayDate}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {timeSlots.map((slot) => {
                const rowSessions = sessions.filter(
                  (s) => s.start_time === slot
                );

                return (
                  <tr
                    key={slot}
                    className="group transition-colors hover:bg-slate-50/40"
                  >
                    {/* Time Column */}
                    <td className="border-l border-slate-200/70 bg-slate-50/50 px-3 py-4 text-center align-top">
                      <div className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200/70">
                        <Clock className="h-3 w-3 text-indigo-500" />
                        <span>{slot}</span>
                      </div>
                    </td>

                    {/* Day Columns (Sunday=1 to Friday=6) */}
                    {days.map((day) => {
                      const cellSessions = rowSessions.filter(
                        (s) => s.day_of_week === day.dayOfWeek
                      );

                      return (
                        <td
                          key={`${slot}-${day.dayOfWeek}`}
                          className="border-l border-slate-200/60 p-2 align-top last:border-l-0"
                        >
                          {cellSessions.length === 0 ? (
                            <div className="min-h-[76px] rounded-xl border border-dashed border-slate-200/50 p-2 opacity-40" />
                          ) : (
                            <div className="space-y-2">
                              {cellSessions.map((session) => {
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
                                const cfg = STATUS_CONFIG[effectiveStatus];
                                return (
                                  <button
                                    key={session.key}
                                    type="button"
                                    onClick={() => onSelectSession(session)}
                                    className={`w-full rounded-xl border p-2.5 text-right shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md ${cfg.bg} ${cfg.border}`}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-900">
                                        <User className="h-3 w-3 text-slate-600" />
                                        {session.teacher_name}
                                      </span>
                                      <span
                                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.badgeBg}`}
                                      >
                                        <span
                                          className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`}
                                        />
                                        {cfg.label}
                                      </span>
                                    </div>

                                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1">
                                      <span
                                        className={`text-xs font-medium ${cfg.text}`}
                                      >
                                        {session.subject}
                                      </span>
                                      {session.class_name && (
                                        <span className="inline-flex items-center gap-1 rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800 ring-1 ring-indigo-200/70">
                                          <GraduationCap className="h-2.5 w-2.5 text-indigo-600" />
                                          <span>כיתה: {session.class_name}</span>
                                        </span>
                                      )}
                                    </div>

                                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                                      <span>
                                        {session.period_number ? `שיעור ${session.period_number} • ` : ''}
                                        {session.duration_minutes} דק׳
                                      </span>
                                      {session.notes && (
                                        <span
                                          className="inline-flex items-center gap-1 truncate max-w-[120px] text-slate-600"
                                          title={session.notes}
                                        >
                                          <MessageSquare className="h-3 w-3 shrink-0" />
                                          <span className="truncate">
                                            {session.notes}
                                          </span>
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
