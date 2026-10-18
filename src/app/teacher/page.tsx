'use client';

import { Suspense, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  UserCheck,
  KeyRound,
  Calendar,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import {
  Teacher,
  ScheduleTemplate,
  WeeklyActualReport,
  EnrichedSessionItem,
  ReportStatus,
} from '@/types/database';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { saveWeeklyReportSafe } from '@/lib/supabase/reports-service';
import {
  formatDateIsoLocal,
  getIsraeliSchoolWeek,
  normalizeTime,
  WeekDayInfo,
} from '@/lib/dates';
import {
  FALLBACK_TEACHERS,
  FALLBACK_TEMPLATES,
  buildInitialFallbackReports,
} from '@/lib/demo-data';
import TeacherScheduleList from '@/components/teacher/TeacherScheduleList';

function TeacherDashboardContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get('token');

  // Hydration-safe date initialized inside useEffect (Critical Lesson #5)
  const [referenceDate, setReferenceDate] = useState<Date | null>(null);
  const [todayIso, setTodayIso] = useState<string>('');
  const [weekOffset, setWeekOffset] = useState<number>(0);

  const [activeTeacher, setActiveTeacher] = useState<Teacher | null>(null);
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [reports, setReports] = useState<WeeklyActualReport[]>([]);
  const [magicTokenInput, setMagicTokenInput] = useState<string>('');

  const [initialLoaded, setInitialLoaded] = useState<boolean>(false);
  const [isUsingFallback, setIsUsingFallback] = useState<boolean>(false);
  const [savingSessionKey, setSavingSessionKey] = useState<string | null>(null);
  const [isBulkSaving, setIsBulkSaving] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const lastRecordedTeacherIdRef = useRef<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  useEffect(() => {
    const now = new Date();
    setReferenceDate(now);
    setTodayIso(formatDateIsoLocal(now));
  }, []);

  const weekInfo = useMemo(() => {
    if (!referenceDate) return null;
    return getIsraeliSchoolWeek(referenceDate, weekOffset);
  }, [referenceDate, weekOffset]);

  // Strictly isolated data loader for the single authenticated/token-matched teacher
  const loadIsolatedTeacherData = useCallback(
    async (
      weekStart: string,
      weekEnd: string,
      secondDayIso: string,
      currentTodayIso: string
    ) => {
      // Clear previous week's reports before loading the viewed week
      setReports([]);

      if (!isSupabaseConfigured()) {
        const matched = tokenFromUrl
          ? FALLBACK_TEACHERS.find((t) => t.magic_token === tokenFromUrl) ||
            null
          : FALLBACK_TEACHERS[0];

        setActiveTeacher(matched);
        if (matched) {
          setTemplates(
            FALLBACK_TEMPLATES.filter((tpl) => tpl.teacher_id === matched.id)
          );
          const allFallback = buildInitialFallbackReports(
            weekStart,
            secondDayIso,
            currentTodayIso
          );
          // Strictly filter by teacher_id AND weekStart <= report_date <= weekEnd
          setReports(
            allFallback.filter(
              (r) =>
                r.teacher_id === matched.id &&
                r.report_date >= weekStart &&
                r.report_date <= weekEnd
            )
          );
        } else {
          setTemplates([]);
          setReports([]);
        }
        setIsUsingFallback(true);
        setInitialLoaded(true);
        return;
      }

      const supabase = createClient();

      try {
        let resolvedTeacher: Teacher | null = null;

        // 1. Resolve strictly by ?token=XYZ if provided in URL
        if (tokenFromUrl) {
          const { data: byToken } = await supabase
            .from('teachers')
            .select('*')
            .eq('magic_token', tokenFromUrl)
            .maybeSingle();
          resolvedTeacher = byToken as Teacher | null;
        }

        // 2. Otherwise resolve by logged-in Supabase Auth user
        if (!resolvedTeacher && !tokenFromUrl) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user?.id) {
            const { data: byAuth } = await supabase
              .from('teachers')
              .select('*')
              .eq('auth_user_id', user.id)
              .maybeSingle();
            resolvedTeacher = byAuth as Teacher | null;
          }
        }

        if (!resolvedTeacher) {
          setActiveTeacher(null);
          setTemplates([]);
          setReports([]);
          setIsUsingFallback(false);
          setInitialLoaded(true);
          return;
        }

        const loginIso = new Date().toISOString();
        setActiveTeacher({ ...resolvedTeacher, last_login: loginIso });
        setIsUsingFallback(false);

        // TASK 2: Fire-and-forget background UPDATE of last_login (non-blocking)
        if (lastRecordedTeacherIdRef.current !== resolvedTeacher.id) {
          lastRecordedTeacherIdRef.current = resolvedTeacher.id;
          void supabase
            .from('teachers')
            .update({ last_login: loginIso })
            .eq('id', resolvedTeacher.id)
            .then(({ error }) => {
              if (error) {
                console.warn('Could not update last_login:', error.message);
              }
            });
        }

        // Strictly fetch only this teacher's schedule_templates and reports between weekStart and weekEnd
        const [tplRes, repRes] = await Promise.all([
          supabase
            .from('schedule_templates')
            .select('*')
            .eq('teacher_id', resolvedTeacher.id),
          supabase
            .from('weekly_actual_reports')
            .select('*')
            .eq('teacher_id', resolvedTeacher.id)
            .gte('report_date', weekStart)
            .lte('report_date', weekEnd),
        ]);

        const fetchedReports = ((repRes.data || []) as WeeklyActualReport[]).filter(
          (r) => r.report_date >= weekStart && r.report_date <= weekEnd
        );

        setTemplates((tplRes.data || []) as ScheduleTemplate[]);
        setReports(fetchedReports);
      } catch (err) {
        console.error('Error loading isolated teacher dashboard:', err);
        setActiveTeacher(null);
        setTemplates([]);
        setReports([]);
      } finally {
        setInitialLoaded(true);
      }
    },
    [tokenFromUrl]
  );

  useEffect(() => {
    if (!weekInfo || !todayIso) return;
    loadIsolatedTeacherData(
      weekInfo.sundayIso,
      weekInfo.fridayIso,
      weekInfo.days[1]?.dateIso || weekInfo.sundayIso,
      todayIso
    );
  }, [weekInfo, todayIso, loadIsolatedTeacherData]);

  // Build sorted list of current teacher's sessions strictly for the viewed week
  const teacherSessions: EnrichedSessionItem[] = useMemo(() => {
    if (!weekInfo || !activeTeacher) return [];

    const dayMap = new Map<number, WeekDayInfo>();
    weekInfo.days.forEach((d) => dayMap.set(d.dayOfWeek, d));

    const weekStart = weekInfo.sundayIso;
    const weekEnd = weekInfo.fridayIso;

    return templates
      .filter((tpl) => tpl.teacher_id === activeTeacher.id)
      .sort((a, b) => {
        if (a.day_of_week !== b.day_of_week) {
          return a.day_of_week - b.day_of_week;
        }
        return a.start_time.localeCompare(b.start_time);
      })
      .map((tpl): EnrichedSessionItem | null => {
        const dayInfo = dayMap.get(tpl.day_of_week);
        if (!dayInfo) return null;

        const normTime = normalizeTime(tpl.start_time);

        // Strictly match report only if its report_date is within [weekStart, weekEnd] and matches dayInfo.dateIso
        const matchingReport = reports.find(
          (r) =>
            r.report_date >= weekStart &&
            r.report_date <= weekEnd &&
            r.report_date === dayInfo.dateIso &&
            r.teacher_id === activeTeacher.id &&
            (r.template_id === tpl.id ||
              normalizeTime(r.start_time) === normTime)
        );

        const rawStatus: ReportStatus = matchingReport?.status ?? 'pending';
        // Guard: Never allow a future date to appear as 'done'
        const safeStatus: ReportStatus =
          todayIso && dayInfo.dateIso > todayIso && rawStatus === 'done'
            ? 'pending'
            : rawStatus;

        return {
          key: `${tpl.id}_${dayInfo.dateIso}`,
          template_id: tpl.id,
          report_id: matchingReport?.id || null,
          teacher_id: activeTeacher.id,
          teacher_name: activeTeacher.name,
          day_of_week: tpl.day_of_week,
          report_date: dayInfo.dateIso,
          start_time: normTime,
          duration_minutes:
            matchingReport?.duration_minutes ?? tpl.duration_minutes,
          subject: matchingReport?.subject ?? tpl.subject,
          class_name: matchingReport?.class_name ?? tpl.class_name ?? null,
          status: safeStatus,
          notes: matchingReport?.notes ?? '',
        };
      })
      .filter((item): item is EnrichedSessionItem => item !== null);
  }, [weekInfo, activeTeacher, templates, reports, todayIso]);

  // Single Session Update with Future-Date Protection & Optimistic State
  const handleUpdateSession = async (
    session: EnrichedSessionItem,
    newStatus: ReportStatus,
    notes: string
  ) => {
    // Business Logic Guard: Prevent marking future sessions as "Done"
    if (todayIso && session.report_date > todayIso && newStatus === 'done') {
      showToast('לא ניתן לדווח "בוצע" על מפגש בתאריך עתידי');
      return;
    }

    setSavingSessionKey(session.key);

    const optimisticRow: WeeklyActualReport = {
      id: session.report_id || `temp-${session.key}`,
      teacher_id: session.teacher_id,
      template_id: session.template_id,
      report_date: session.report_date,
      start_time: session.start_time,
      duration_minutes: session.duration_minutes,
      subject: session.subject,
      class_name: session.class_name ?? null,
      status: newStatus,
      notes,
    };

    setReports((prev) => {
      const idx = prev.findIndex(
        (r) =>
          r.report_date === session.report_date &&
          r.teacher_id === session.teacher_id &&
          (r.template_id === session.template_id ||
            normalizeTime(r.start_time) === session.start_time)
      );
      if (idx > -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], status: newStatus, notes };
        return next;
      }
      return [...prev, optimisticRow];
    });

    if (isSupabaseConfigured() && !isUsingFallback) {
      const supabase = createClient();
      const { data: savedRow, error } = await saveWeeklyReportSafe(supabase, {
        teacher_id: session.teacher_id,
        template_id: session.template_id,
        report_date: session.report_date,
        start_time: session.start_time,
        duration_minutes: session.duration_minutes,
        subject: session.subject,
        class_name: session.class_name ?? null,
        status: newStatus,
        notes,
      });

      if (error) {
        showToast('שגיאה בשמירת הדיווח בשרת');
      } else if (savedRow) {
        setReports((prev) =>
          prev.map((r) =>
            r.report_date === savedRow.report_date &&
            r.teacher_id === savedRow.teacher_id &&
            r.template_id === savedRow.template_id
              ? savedRow
              : r
          )
        );
        showToast('הדיווח נשמר בהצלחה!');
      }
    } else {
      showToast('הדיווח נשמר בהצלחה!');
    }

    setSavingSessionKey(null);
  };

  // "Mark All Done" ONLY for pending sessions up to `todayIso` (never marks future sessions)
  const handleMarkAllDone = async () => {
    const eligibleList = teacherSessions.filter(
      (s) => s.status === 'pending' && s.report_date <= todayIso
    );
    if (eligibleList.length === 0) {
      showToast('אין מפגשים זמינים לדיווח "בוצע" עד לתאריך היום');
      return;
    }

    setIsBulkSaving(true);

    setReports((prev) => {
      const updated = [...prev];
      eligibleList.forEach((session) => {
        const idx = updated.findIndex(
          (r) =>
            r.report_date === session.report_date &&
            r.teacher_id === session.teacher_id &&
            (r.template_id === session.template_id ||
              normalizeTime(r.start_time) === session.start_time)
        );
        if (idx > -1) {
          updated[idx] = { ...updated[idx], status: 'done' };
        } else {
          updated.push({
            id: `temp-${session.key}`,
            teacher_id: session.teacher_id,
            template_id: session.template_id,
            report_date: session.report_date,
            start_time: session.start_time,
            duration_minutes: session.duration_minutes,
            subject: session.subject,
            class_name: session.class_name ?? null,
            status: 'done',
            notes: session.notes || '',
          });
        }
      });
      return updated;
    });

    if (isSupabaseConfigured() && !isUsingFallback) {
      const supabase = createClient();
      await Promise.all(
        eligibleList.map((session) =>
          saveWeeklyReportSafe(supabase, {
            teacher_id: session.teacher_id,
            template_id: session.template_id,
            report_date: session.report_date,
            start_time: session.start_time,
            duration_minutes: session.duration_minutes,
            subject: session.subject,
            class_name: session.class_name ?? null,
            status: 'done',
            notes: session.notes,
          })
        )
      );
    }

    showToast(`${eligibleList.length} מפגשים סומנו כבוצעו!`);
    setIsBulkSaving(false);
  };

  // Enter Magic Token if teacher opened `/teacher` without `?token=XYZ`
  const handleLoginWithToken = () => {
    const trimmed = magicTokenInput.trim();
    if (!trimmed) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('token', trimmed);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (!referenceDate || !weekInfo || !initialLoaded) {
    return (
      <div className="space-y-6 py-4">
        <div className="glass-card h-28 animate-pulse bg-white/60" />
        <div className="glass-card h-64 animate-pulse bg-white/60" />
      </div>
    );
  }

  // If no valid teacher is resolved (e.g. missing or invalid ?token=), show an isolated Magic Token login card
  if (!activeTeacher) {
    return (
      <div className="mx-auto max-w-md py-12">
        <div className="glass-card space-y-5 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-600/10 text-sky-600">
            <Lock className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              כניסה לאזור דיווח אישי למורה
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              אנא היכנס/י באמצעות הקישור האישי (Magic Link) שנשלח אליך מבית הספר,
              או הזן/י את קוד הזיהוי האישי שלך:
            </p>
          </div>

          <div className="space-y-3 text-right">
            <div className="relative">
              <input
                type="text"
                value={magicTokenInput}
                onChange={(e) => setMagicTokenInput(e.target.value)}
                placeholder="הזן קוד אישי (Magic Token)..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-500"
              />
              <KeyRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            </div>
            <button
              type="button"
              onClick={handleLoginWithToken}
              className="w-full rounded-xl bg-sky-600 py-2.5 text-sm font-bold text-white shadow-md shadow-sky-600/20 transition hover:bg-sky-700"
            >
              כניסה למערכת הדיווח
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 left-5 z-50 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-950/90 px-4 py-3 text-sm font-medium text-white shadow-xl backdrop-blur-md">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Isolated Teacher Header & Week Selector (No Quick Switcher, No Admin Links) */}
      <div className="glass-card flex flex-col justify-between gap-4 p-6 lg:flex-row lg:items-center">
        <div className="flex items-start gap-4">
          <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-600 p-3.5 text-white shadow-md shadow-sky-600/20">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">
                שלום, {activeTeacher.name}
              </h1>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-0.5 text-xs font-semibold text-sky-800">
                תחום דעת: {activeTeacher.subject}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              דיווח שבועי אישי על ביצוע שעות פרטניות והערות פדגוגיות
            </p>
          </div>
        </div>

        {/* Week Selector */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200/90 bg-white/90 p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev - 1)}
              className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100"
              title="השבוע הקודם"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1.5 px-3 text-xs sm:text-sm font-semibold text-slate-800">
              <Calendar className="h-4 w-4 text-sky-600" />
              <span>{weekInfo.weekLabel}</span>
            </div>
            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev + 1)}
              className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100"
              title="השבוע הבא"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {weekOffset !== 0 && (
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className="mr-1 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
              >
                השבוע הנוכחי
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Weekly Sessions & Quick Actions */}
      <TeacherScheduleList
        sessions={teacherSessions}
        todayIso={todayIso}
        isBulkSaving={isBulkSaving}
        savingSessionKey={savingSessionKey}
        onUpdateSession={handleUpdateSession}
        onMarkAllDone={handleMarkAllDone}
      />
    </div>
  );
}

export default function TeacherDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 py-4">
          <div className="glass-card h-28 animate-pulse bg-white/60" />
          <div className="glass-card h-64 animate-pulse bg-white/60" />
        </div>
      }
    >
      <TeacherDashboardContent />
    </Suspense>
  );
}
