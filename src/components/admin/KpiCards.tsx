'use client';

import { useState } from 'react';
import {
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { EnrichedSessionItem } from '@/types/database';
import KpiDetailsModal, { KpiCategoryType } from './KpiDetailsModal';

interface KpiCardsProps {
  sessions: EnrichedSessionItem[];
  todayIso: string;
  onSelectSession?: (session: EnrichedSessionItem) => void;
}

export default function KpiCards({
  sessions,
  todayIso,
  onSelectSession,
}: KpiCardsProps) {
  const [activeCategory, setActiveCategory] = useState<KpiCategoryType | null>(
    null
  );

  const totalScheduled = sessions.length;
  const doneSessions = sessions.filter((s) => s.status === 'done');
  const excusedSessions = sessions.filter((s) => s.status === 'excused');

  // TASK 3: Explicitly include BOTH past unreported/missed sessions (which render as "לא בוצע")
  // AND today's pending sessions: all sessions where report_date <= todayIso and status is neither 'done' nor 'excused'.
  const missingSessions = sessions.filter(
    (s) =>
      (!todayIso || s.report_date <= todayIso) &&
      s.status !== 'done' &&
      s.status !== 'excused'
  );

  // Effective scheduled sessions (excluding justified excused absences) for accurate completion tracking
  const effectiveTarget = Math.max(0, totalScheduled - excusedSessions.length);
  const completionRate =
    effectiveTarget > 0
      ? Math.round((doneSessions.length / effectiveTarget) * 100)
      : totalScheduled > 0 && excusedSessions.length === totalScheduled
      ? 100
      : 0;

  // Total hours done
  const totalMinutesDone = doneSessions.reduce(
    (acc, cur) => acc + (cur.duration_minutes || 45),
    0
  );
  const formattedDoneClockHours = (totalMinutesDone / 60)
    .toFixed(1)
    .replace(/\.0$/, '');

  // Total hours excused
  const totalMinutesExcused = excusedSessions.reduce(
    (acc, cur) => acc + (cur.duration_minutes || 45),
    0
  );
  const formattedExcusedClockHours = (totalMinutesExcused / 60)
    .toFixed(1)
    .replace(/\.0$/, '');

  const modalSessions =
    activeCategory === 'done'
      ? doneSessions
      : activeCategory === 'excused'
      ? excusedSessions
      : activeCategory === 'missing'
      ? missingSessions
      : [];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Weekly Completion Rate */}
        <div className="glass-card relative overflow-hidden p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">
                אחוז השלמה שבועי
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900">
                  {completionRate}%
                </span>
                <span className="text-xs font-medium text-emerald-700">
                  ({doneSessions.length} מתוך {effectiveTarget} בפועל)
                </span>
              </div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>

          {/* Multi-segment Progress Bar (Done + Excused) */}
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-l from-indigo-600 to-emerald-500 transition-all duration-300"
              style={{ width: `${Math.min(100, completionRate)}%` }}
            />
          </div>
        </div>

        {/* KPI 2: Total Hours Done (Clickable Drill-Down) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveCategory('done')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveCategory('done');
            }
          }}
          className="glass-card group relative cursor-pointer overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.015] hover:border-emerald-300 hover:bg-white/95 hover:shadow-lg"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500 transition-colors group-hover:text-emerald-800">
                שעות פרטניות שבוצעו
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-emerald-700">
                  {doneSessions.length}
                </span>
                <span className="text-xs text-slate-500">
                  שעות ({formattedDoneClockHours} שעות שעון)
                </span>
              </div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 transition-transform group-hover:scale-110">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-4 flex items-center justify-between gap-1.5 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>דווחו כבוצעו בשבוע הנבחר</span>
            </span>
            <span className="font-semibold text-emerald-700 opacity-0 transition-opacity group-hover:opacity-100">
              לפירוט ←
            </span>
          </p>
        </div>

        {/* KPI 3: Excused / Justified Cancellations (Clickable Drill-Down) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveCategory('excused')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveCategory('excused');
            }
          }}
          className="glass-card group relative cursor-pointer overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.015] hover:border-sky-300 hover:bg-white/95 hover:shadow-lg"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500 transition-colors group-hover:text-sky-800">
                היעדרות מאושרת
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-sky-700">
                  {excusedSessions.length}
                </span>
                <span className="text-xs text-slate-500">
                  מפגשים ({formattedExcusedClockHours} שעות שעון)
                </span>
              </div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 transition-transform group-hover:scale-110">
              <ShieldAlert className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-4 flex items-center justify-between gap-1.5 text-xs text-sky-800/80">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              <span>טיולים, השתלמויות או היעדרות מוצדקת</span>
            </span>
            <span className="font-semibold text-sky-700 opacity-0 transition-opacity group-hover:opacity-100">
              לפירוט ←
            </span>
          </p>
        </div>

        {/* KPI 4: Missing Reports (Clickable Drill-Down) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveCategory('missing')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveCategory('missing');
            }
          }}
          className="glass-card group relative cursor-pointer overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.015] hover:border-rose-300 hover:bg-white/95 hover:shadow-lg"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500 transition-colors group-hover:text-rose-800">
                דיווחים חסרים
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span
                  className={`text-3xl font-bold ${
                    missingSessions.length > 0
                      ? 'text-rose-600'
                      : 'text-emerald-600'
                  }`}
                >
                  {missingSessions.length}
                </span>
                <span className="text-xs text-slate-500">מפגשים טרם דווחו</span>
              </div>
            </div>
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-transform group-hover:scale-110 ${
                missingSessions.length > 0
                  ? 'bg-rose-50 text-rose-600'
                  : 'bg-emerald-50 text-emerald-600'
              }`}
            >
              <AlertCircle className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-4 flex items-center justify-between gap-1.5 text-xs text-slate-500">
            <span>
              {missingSessions.length === 0
                ? 'כלל הדיווחים עד כה טופלו!'
                : 'כולל לא בוצע (עבר) וממתינים להיום'}
            </span>
            <span className="font-semibold text-rose-700 opacity-0 transition-opacity group-hover:opacity-100">
              לפירוט ←
            </span>
          </p>
        </div>
      </div>

      {/* KPI Drill-Down Modal */}
      <KpiDetailsModal
        isOpen={activeCategory !== null}
        category={activeCategory}
        sessions={modalSessions}
        todayIso={todayIso}
        onClose={() => setActiveCategory(null)}
        onSelectSession={onSelectSession}
      />
    </>
  );
}

