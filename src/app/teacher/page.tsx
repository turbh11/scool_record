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
  Clock,
  Plus,
  Trash2,
  BookOpen,
  GraduationCap,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import {
  Teacher,
  ScheduleTemplate,
  WeeklyActualReport,
  EnrichedSessionItem,
  ReportStatus,
  HEBREW_DAYS,
} from '@/types/database';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import {
  saveWeeklyReportSafe,
  saveScheduleTemplateSafe,
} from '@/lib/supabase/reports-service';
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

  // Self-Service Fixed Schedule Template Editing State
  const [isEditingScheduleOpen, setIsEditingScheduleOpen] = useState<boolean>(false);
  const [slotDay, setSlotDay] = useState<number>(1);
  const [slotTime, setSlotTime] = useState<string>('09:00');
  const [slotDuration, setSlotDuration] = useState<number>(45);
  const [slotSubject, setSlotSubject] = useState<string>('');
  const [slotClassName, setSlotClassName] = useState<string>('');
  const [isSavingSlot, setIsSavingSlot] = useState<boolean>(false);
  const [deletingSlotId, setDeletingSlotId] = useState<string | null>(null);

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

  // Auto-prefill subject with teacher's main discipline
  useEffect(() => {
    if (activeTeacher?.subject && !slotSubject) {
      setSlotSubject(activeTeacher.subject);
    }
  }, [activeTeacher, slotSubject]);

  // Current teacher's fixed schedule slots sorted chronologically
  const teacherFixedSlots = useMemo(() => {
    if (!activeTeacher) return [];
    return templates
      .filter((tpl) => tpl.teacher_id === activeTeacher.id)
      .sort((a, b) => {
        if (a.day_of_week !== b.day_of_week) {
          return a.day_of_week - b.day_of_week;
        }
        return a.start_time.localeCompare(b.start_time);
      });
  }, [templates, activeTeacher]);

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
      currentTodayIso: string,
      isSilent: boolean = false
    ) => {
      // Clear previous week's reports before loading the viewed week (only during non-silent loads)
      if (!isSilent) {
        setReports([]);
      }

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
        if (!isSilent) {
          setActiveTeacher(null);
          setTemplates([]);
          setReports([]);
        }
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

  // TASK: Auto-refresh templates and reports on window focus silently in the background
  useEffect(() => {
    const handleFocus = () => {
      if (!weekInfo || !todayIso) return;
      loadIsolatedTeacherData(
        weekInfo.sundayIso,
        weekInfo.fridayIso,
        weekInfo.days[1]?.dateIso || weekInfo.sundayIso,
        todayIso,
        true // isSilent: refresh in background without clearing UI
      );
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
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

  // Self-Service Fixed Schedule Template Management Handlers
  const handleAddTemplateSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeacher) return;
    if (!slotSubject.trim()) {
      showToast('נא להזין תחום דעת / נושא למשבצת');
      return;
    }
    if (!slotTime) {
      showToast('נא להזין שעת התחלה');
      return;
    }

    const normalizedStartTime = normalizeTime(slotTime);
    setIsSavingSlot(true);

    const effectiveCode = activeTeacher.institution_code || null;

    if (isSupabaseConfigured() && !isUsingFallback) {
      const supabase = createClient();
      const { data: inserted, error } = await saveScheduleTemplateSafe(supabase, {
        teacher_id: activeTeacher.id,
        day_of_week: Number(slotDay),
        start_time: normalizedStartTime,
        duration_minutes: Number(slotDuration) || 45,
        subject: slotSubject.trim(),
        class_name: slotClassName.trim() || null,
        institution_code: effectiveCode,
      });

      if (error || !inserted) {
        console.error('Error adding schedule slot:', error);
        showToast('שגיאה בהוספת משבצת שעה למסד הנתונים');
        setIsSavingSlot(false);
        return;
      }

      setTemplates((prev) => [...prev, inserted]);
      showToast('משבצת השעה נוספה למערכת הקבועה!');
    } else {
      const localSlot: ScheduleTemplate = {
        id: `local-tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        teacher_id: activeTeacher.id,
        day_of_week: Number(slotDay),
        start_time: normalizedStartTime,
        duration_minutes: Number(slotDuration) || 45,
        subject: slotSubject.trim(),
        class_name: slotClassName.trim() || null,
        institution_code: effectiveCode,
      };
      setTemplates((prev) => [...prev, localSlot]);
      showToast('משבצת השעה נוספה למערכת הקבועה!');
    }

    setSlotClassName('');
    setIsSavingSlot(false);
  };

  const handleDeleteTemplateSlot = async (slotId: string) => {
    if (!activeTeacher) return;
    const confirmed = window.confirm(
      'האם אתה בטוח שברצונך למחוק משבצת שעה זו מהמערכת הקבועה? פעולה זו אינה ניתנת לביטול.'
    );
    if (!confirmed) return;

    setDeletingSlotId(slotId);

    if (isSupabaseConfigured() && !isUsingFallback) {
      const supabase = createClient();
      let delQuery = supabase
        .from('schedule_templates')
        .delete()
        .eq('id', slotId)
        .eq('teacher_id', activeTeacher.id);

      if (activeTeacher.institution_code) {
        delQuery = delQuery.or(
          `institution_code.eq.${activeTeacher.institution_code},institution_code.is.null`
        );
      }

      const { error } = await delQuery;
      if (error) {
        console.error('Error deleting schedule template:', error);
        showToast('שגיאה במחיקת משבצת השעה');
        setDeletingSlotId(null);
        return;
      }
    }

    setTemplates((prev) => prev.filter((t) => t.id !== slotId));
    showToast('משבצת השעה הוסרה מהמערכת הקבועה');
    setDeletingSlotId(null);
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

      {/* Self-Service Fixed Schedule Template Management */}
      <div className="glass-card overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm transition">
        {/* Toggleable Header */}
        <div
          onClick={() => setIsEditingScheduleOpen((prev) => !prev)}
          className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  עריכת מערכת שעות קבועה
                </h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                  {teacherFixedSlots.length} משבצות קבועות
                </span>
              </div>
              <p className="text-xs text-slate-500">
                הוספה והסרה עצמאית של שעות פרטניות קבועות במערכת השבועית
              </p>
            </div>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50"
          >
            <span>{isEditingScheduleOpen ? 'סגור עריכה' : 'פתח עריכה'}</span>
            {isEditingScheduleOpen ? (
              <ChevronUp className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            )}
          </button>
        </div>

        {/* Collapsible Content */}
        {isEditingScheduleOpen && (
          <div className="mt-5 border-t border-slate-100 pt-5 space-y-6">
            {/* Create Slot Form */}
            <form
              onSubmit={handleAddTemplateSlot}
              className="rounded-2xl border border-sky-100 bg-sky-50/50 p-4"
            >
              <h3 className="mb-3 flex items-center gap-2 text-xs font-bold text-sky-950">
                <Plus className="h-4 w-4 text-sky-600" />
                <span>הוספת משבצת שעה קבועה חדשה</span>
              </h3>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5">
                {/* Day of Week */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    יום בשבוע *
                  </label>
                  <select
                    value={slotDay}
                    onChange={(e) => setSlotDay(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-500"
                  >
                    {[1, 2, 3, 4, 5, 6].map((dayNum) => (
                      <option key={dayNum} value={dayNum}>
                        {HEBREW_DAYS[dayNum]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Start Time */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    שעת התחלה *
                  </label>
                  <input
                    type="time"
                    value={slotTime}
                    onChange={(e) => setSlotTime(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-500"
                  />
                </div>

                {/* Duration */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    משך (דקות) *
                  </label>
                  <input
                    type="number"
                    min="15"
                    max="180"
                    step="5"
                    value={slotDuration}
                    onChange={(e) => setSlotDuration(Number(e.target.value))}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-500"
                  />
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    תחום דעת / נושא *
                  </label>
                  <input
                    type="text"
                    value={slotSubject}
                    onChange={(e) => setSlotSubject(e.target.value)}
                    placeholder="לדוגמה: מתמטיקה"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-500"
                  />
                </div>

                {/* Class */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    כיתה (אופציונלי)
                  </label>
                  <input
                    type="text"
                    value={slotClassName}
                    onChange={(e) => setSlotClassName(e.target.value)}
                    placeholder="לדוגמה: ט׳ 2"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="mt-3.5 flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingSlot}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"
                >
                  {isSavingSlot ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  <span>{isSavingSlot ? 'שומר משבצת...' : 'הוסף משבצת למערכת'}</span>
                </button>
              </div>
            </form>

            {/* List of Existing Slots */}
            <div>
              <h3 className="mb-2.5 text-xs font-bold text-slate-700">
                משבצות השעה הקבועות שלך במערכת ({teacherFixedSlots.length})
              </h3>

              {teacherFixedSlots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-400">
                  טרם הוגדרו משבצות שעה קבועות עבורך. מלא/י את הטופס למעלה להוספת שעה פרטנית.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {teacherFixedSlots.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-2xs transition hover:border-sky-200"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-lg bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800">
                            {HEBREW_DAYS[tpl.day_of_week]}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
                            <Clock className="h-3 w-3 text-slate-400" />
                            <span>
                              {normalizeTime(tpl.start_time)} ({tpl.duration_minutes} דק׳)
                            </span>
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-bold text-slate-900">
                            {tpl.subject}
                          </span>
                          {tpl.class_name && (
                            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                              <GraduationCap className="h-3 w-3 text-slate-500" />
                              <span>{tpl.class_name}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={deletingSlotId === tpl.id}
                        onClick={() => handleDeleteTemplateSlot(tpl.id)}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                        title="מחק משבצת שעה זו"
                        aria-label="מחק משבצת"
                      >
                        {deletingSlotId === tpl.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-rose-500" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
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
