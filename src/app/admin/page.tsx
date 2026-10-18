'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Settings,
  ChevronRight,
  ChevronLeft,
  Calendar,
  Building2,
  Database,
  CheckCircle2,
  Filter,
  Search,
  X,
  FileSpreadsheet,
  Upload,
  UserCog,
  Download,
  Send,
  Loader2,
  Users,
} from 'lucide-react';
import {
  School,
  Teacher,
  ScheduleTemplate,
  WeeklyActualReport,
  EnrichedSessionItem,
  ReportStatus,
} from '@/types/database';
import {
  createClient,
  isSupabaseConfigured,
} from '@/lib/supabase/client';
import {
  createTeacherSafe,
  saveScheduleTemplateSafe,
  saveWeeklyReportSafe,
  seedDemoSchoolData,
  updateTeacherSafe,
} from '@/lib/supabase/reports-service';
import {
  formatDateIsoLocal,
  getIsraeliSchoolWeek,
  normalizeTime,
  WeekDayInfo,
} from '@/lib/dates';
import {
  FALLBACK_SCHOOL,
  FALLBACK_TEACHERS,
  FALLBACK_TEMPLATES,
  buildInitialFallbackReports,
} from '@/lib/demo-data';
import {
  exportReportsToExcel,
  parseTeachersExcelFile,
  downloadTeacherImportTemplate,
  normalizeTimeToHHMM,
} from '@/lib/excel';
import { sendBulkMagicLinks } from '@/app/actions/email';
import { getIsSuperAdmin } from '@/app/actions/auth';
import AdminHeader from '@/components/admin/AdminHeader';
import KpiCards from '@/components/admin/KpiCards';
import WeeklyTimeGrid from '@/components/admin/WeeklyTimeGrid';
import StatusOverrideModal from '@/components/admin/StatusOverrideModal';
import SchoolSettingsModal from '@/components/admin/SchoolSettingsModal';
import TeacherScheduleModal, {
  TeacherFormPayload,
} from '@/components/admin/TeacherScheduleModal';

export default function AdminDashboardPage() {
  const router = useRouter();

  // Hydration-safe date reference initialized inside useEffect (Critical Lesson #5)
  const [referenceDate, setReferenceDate] = useState<Date | null>(null);
  const [todayIso, setTodayIso] = useState<string>('');
  const [weekOffset, setWeekOffset] = useState<number>(0);

  // Core Entities State
  const [school, setSchool] = useState<School | null>(null);
  const [adminInstitutionCode, setAdminInstitutionCode] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [isSwitchingToTeacher, setIsSwitchingToTeacher] = useState<boolean>(false);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [reports, setReports] = useState<WeeklyActualReport[]>([]);

  // TASK 1: Scalable Search & Subject Filter State (replaces horizontal pill list for 70+ teachers)
  const [teacherSearchQuery, setTeacherSearchQuery] = useState<string>('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] =
    useState<string>('all');

  // UI Feedback State
  const [initialLoaded, setInitialLoaded] = useState<boolean>(false);
  const [isUsingFallback, setIsUsingFallback] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals & Excel State
  const [activeSessionModal, setActiveSessionModal] =
    useState<EnrichedSessionItem | null>(null);
  const [isSavingOverride, setIsSavingOverride] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);
  const [isManageTeachersOpen, setIsManageTeachersOpen] =
    useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [isImportingExcel, setIsImportingExcel] = useState<boolean>(false);
  const [isSendingBulkEmails, setIsSendingBulkEmails] =
    useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  // Initialize client-side date inside useEffect to prevent SSR/Client hydration mismatch
  useEffect(() => {
    const now = new Date();
    setReferenceDate(now);
    setTodayIso(formatDateIsoLocal(now));
  }, []);

  const weekInfo = useMemo(() => {
    if (!referenceDate) return null;
    return getIsraeliSchoolWeek(referenceDate, weekOffset);
  }, [referenceDate, weekOffset]);

  // Fetch School, Teachers, Templates, and Weekly Reports strictly filtered by [weekStart, weekEnd]
  const fetchDashboardData = useCallback(
    async (
      weekStart: string,
      weekEnd: string,
      secondDayIso: string,
      currentTodayIso: string
    ) => {
      setReports([]);

      if (!isSupabaseConfigured()) {
        setSchool(FALLBACK_SCHOOL);
        setTeachers((prev) => (prev.length > 0 ? prev : FALLBACK_TEACHERS));
        setTemplates((prev) => (prev.length > 0 ? prev : FALLBACK_TEMPLATES));
        const fallbackReps = buildInitialFallbackReports(
          weekStart,
          secondDayIso,
          currentTodayIso
        ).filter((r) => r.report_date >= weekStart && r.report_date <= weekEnd);
        setReports(fallbackReps);
        setIsUsingFallback(true);
        setInitialLoaded(true);
        return;
      }

      const supabase = createClient();
      let schoolData: School | null = null;

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        let resolvedCode: string | null = null;
        let resolvedSchoolName: string | null = null;

        if (user?.id) {
          if (user.email) {
            setAdminEmail(user.email);
          }
          // Evaluate Super Admin status on server securely
          try {
            const isSuper = await getIsSuperAdmin();
            setIsSuperAdmin(isSuper);
          } catch {
            setIsSuperAdmin(false);
          }

          // Extract school_name and institution_code from admin_profiles
          const { data: adminProfile } = await supabase
            .from('admin_profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

          if (adminProfile && adminProfile.is_active === false) {
            await supabase.auth.signOut();
            router.push('/admin/login?error=account_frozen');
            return;
          }

          if (adminProfile?.institution_code) {
            resolvedCode = adminProfile.institution_code;
          }
          if (adminProfile?.school_name) {
            resolvedSchoolName = adminProfile.school_name;
          }

          // Fall back to user metadata if profile record is still synchronizing
          if (!resolvedCode && user.user_metadata?.institution_code) {
            resolvedCode = user.user_metadata.institution_code;
          }
          if (!resolvedSchoolName && user.user_metadata?.school_name) {
            resolvedSchoolName = user.user_metadata.school_name;
          }

          // Check schools table by admin_user_id
          const { data: byAdmin } = await supabase
            .from('schools')
            .select('*')
            .eq('admin_user_id', user.id)
            .maybeSingle();
          schoolData = byAdmin;

          // If not found by admin_user_id, try matching by semel_mosad
          if (!schoolData && resolvedCode) {
            const { data: bySemel } = await supabase
              .from('schools')
              .select('*')
              .eq('semel_mosad', resolvedCode)
              .maybeSingle();

            if (bySemel) {
              schoolData = bySemel;
              if (!bySemel.admin_user_id) {
                await supabase
                  .from('schools')
                  .update({ admin_user_id: user.id })
                  .eq('id', bySemel.id);
              }
            }
          }

          // Auto-provision school record if not present
          if (!schoolData && (resolvedSchoolName || resolvedCode)) {
            const { data: createdSchool } = await supabase
              .from('schools')
              .insert({
                name: resolvedSchoolName || 'בית ספר',
                semel_mosad: resolvedCode || '',
                admin_user_id: user.id,
              })
              .select('*')
              .maybeSingle();

            if (createdSchool) {
              schoolData = createdSchool as School;
            }
          }

          // Keep school name and institution_code in sync with admin_profile
          if (
            schoolData &&
            resolvedSchoolName &&
            schoolData.name !== resolvedSchoolName
          ) {
            schoolData = {
              ...schoolData,
              name: resolvedSchoolName,
              semel_mosad: resolvedCode || schoolData.semel_mosad,
            };
            await supabase
              .from('schools')
              .update({ name: resolvedSchoolName })
              .eq('id', schoolData.id);
          }

          // If still no school record in DB, guarantee a valid UUID format
          if (!schoolData) {
            const { data: existingAny } = await supabase
              .from('schools')
              .select('*')
              .limit(1)
              .maybeSingle();

            if (existingAny) {
              schoolData = {
                ...existingAny,
                name: resolvedSchoolName || existingAny.name,
                semel_mosad: resolvedCode || existingAny.semel_mosad,
              };
            } else {
              schoolData = {
                id: user.id,
                created_at: new Date().toISOString(),
                name: resolvedSchoolName || 'בית ספר',
                semel_mosad: resolvedCode || '',
                admin_user_id: user.id,
              };
            }
          }
        }

        if (!resolvedCode && schoolData?.semel_mosad) {
          resolvedCode = schoolData.semel_mosad;
        }

        setAdminInstitutionCode(resolvedCode);

        if (!schoolData) {
          setSchool(null);
          setTeachers([]);
          setTemplates([]);
          setReports([]);
          setIsUsingFallback(false);
          setInitialLoaded(true);
          return;
        }

        setSchool(schoolData);
        setIsUsingFallback(false);

        let teachersQuery = supabase
          .from('teachers')
          .select('*')
          .eq('school_id', schoolData.id);

        if (resolvedCode) {
          teachersQuery = teachersQuery.or(
            `institution_code.eq.${resolvedCode},institution_code.is.null`
          );
        }

        const { data: teachersList } = await teachersQuery.order('name', {
          ascending: true,
        });

        const activeTeachers = (teachersList || []) as Teacher[];
        setTeachers(activeTeachers);

        const teacherIds = activeTeachers.map((t) => t.id);
        if (teacherIds.length === 0) {
          setTemplates([]);
          setReports([]);
          setInitialLoaded(true);
          return;
        }

        let templatesQuery = supabase
          .from('schedule_templates')
          .select('*')
          .in('teacher_id', teacherIds);

        if (resolvedCode) {
          templatesQuery = templatesQuery.or(
            `institution_code.eq.${resolvedCode},institution_code.is.null`
          );
        }

        let reportsQuery = supabase
          .from('weekly_actual_reports')
          .select('*')
          .in('teacher_id', teacherIds)
          .gte('report_date', weekStart)
          .lte('report_date', weekEnd);

        if (resolvedCode) {
          reportsQuery = reportsQuery.or(
            `institution_code.eq.${resolvedCode},institution_code.is.null`
          );
        }

        const [templatesRes, reportsRes] = await Promise.all([
          templatesQuery,
          reportsQuery,
        ]);

        const strictlyFilteredReports = (
          (reportsRes.data || []) as WeeklyActualReport[]
        ).filter((r) => r.report_date >= weekStart && r.report_date <= weekEnd);

        setTemplates((templatesRes.data || []) as ScheduleTemplate[]);
        setReports(strictlyFilteredReports);
      } catch (err) {
        console.error('Error loading admin dashboard:', err);
        if (schoolData) {
          setSchool(schoolData);
        }
        setTeachers([]);
        setTemplates([]);
        setReports([]);
        setIsUsingFallback(false);
      } finally {
        setInitialLoaded(true);
      }
    },
    []
  );

  useEffect(() => {
    if (!weekInfo || !todayIso) return;
    fetchDashboardData(
      weekInfo.sundayIso,
      weekInfo.fridayIso,
      weekInfo.days[1]?.dateIso || weekInfo.sundayIso,
      todayIso
    );
  }, [weekInfo, todayIso, fetchDashboardData]);

  // Supabase Realtime Subscription: Listen to INSERT and UPDATE on `weekly_actual_reports`
  useEffect(() => {
    if (!isSupabaseConfigured() || isUsingFallback || !weekInfo) return;

    const supabase = createClient();
    const weekStart = weekInfo.sundayIso;
    const weekEnd = weekInfo.fridayIso;
    const schoolTeacherIds = new Set(teachers.map((t) => t.id));
    const effectiveCode = adminInstitutionCode || school?.semel_mosad;

    const channel = supabase
      .channel(`admin-weekly-reports-${weekStart}-${weekEnd}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'weekly_actual_reports',
        },
        (payload) => {
          const incoming = payload.new as WeeklyActualReport;
          if (!incoming || !incoming.report_date) return;

          if (
            incoming.report_date < weekStart ||
            incoming.report_date > weekEnd
          ) {
            return;
          }
          if (
            schoolTeacherIds.size > 0 &&
            !schoolTeacherIds.has(incoming.teacher_id)
          ) {
            return;
          }
          if (
            effectiveCode &&
            incoming.institution_code &&
            incoming.institution_code !== effectiveCode
          ) {
            return;
          }

          setReports((prev) => {
            const existingIdx = prev.findIndex(
              (r) =>
                r.id === incoming.id ||
                (r.report_date === incoming.report_date &&
                  r.teacher_id === incoming.teacher_id &&
                  ((r.template_id && r.template_id === incoming.template_id) ||
                    normalizeTime(r.start_time) ===
                      normalizeTime(incoming.start_time)))
            );

            if (existingIdx > -1) {
              const updated = [...prev];
              updated[existingIdx] = incoming;
              return updated;
            }
            return [...prev, incoming];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'weekly_actual_reports',
        },
        (payload) => {
          const incoming = payload.new as WeeklyActualReport;
          if (!incoming || !incoming.report_date) return;

          if (
            incoming.report_date < weekStart ||
            incoming.report_date > weekEnd
          ) {
            return;
          }
          if (
            schoolTeacherIds.size > 0 &&
            !schoolTeacherIds.has(incoming.teacher_id)
          ) {
            return;
          }
          if (
            effectiveCode &&
            incoming.institution_code &&
            incoming.institution_code !== effectiveCode
          ) {
            return;
          }

          setReports((prev) => {
            const existingIdx = prev.findIndex(
              (r) =>
                r.id === incoming.id ||
                (r.report_date === incoming.report_date &&
                  r.teacher_id === incoming.teacher_id &&
                  ((r.template_id && r.template_id === incoming.template_id) ||
                    normalizeTime(r.start_time) ===
                      normalizeTime(incoming.start_time)))
            );

            if (existingIdx > -1) {
              const updated = [...prev];
              updated[existingIdx] = incoming;
              return updated;
            }
            return [...prev, incoming];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'teachers',
        },
        (payload) => {
          const incomingTeacher = payload.new as Teacher;
          if (!incomingTeacher?.id) return;
          if (
            school?.id &&
            incomingTeacher.school_id &&
            incomingTeacher.school_id !== school.id
          ) {
            return;
          }
          if (
            effectiveCode &&
            incomingTeacher.institution_code &&
            incomingTeacher.institution_code !== effectiveCode
          ) {
            return;
          }
          setTeachers((prev) =>
            prev.map((t) =>
              t.id === incomingTeacher.id ? { ...t, ...incomingTeacher } : t
            )
          );
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [weekInfo, isUsingFallback, teachers, adminInstitutionCode, school]);

  // Combine Schedule Templates + Actual Reports into EnrichedSessionItems strictly for the selected week
  const enrichedSessions: EnrichedSessionItem[] = useMemo(() => {
    if (!weekInfo) return [];

    const dayMap = new Map<number, WeekDayInfo>();
    weekInfo.days.forEach((d) => dayMap.set(d.dayOfWeek, d));

    const teacherMap = new Map<string, Teacher>();
    teachers.forEach((t) => teacherMap.set(t.id, t));

    const weekStart = weekInfo.sundayIso;
    const weekEnd = weekInfo.fridayIso;

    return templates
      .map((tpl): EnrichedSessionItem | null => {
        const dayInfo = dayMap.get(tpl.day_of_week);
        const teacher = teacherMap.get(tpl.teacher_id);
        if (!dayInfo || !teacher) return null;

        const normTime = normalizeTime(tpl.start_time);

        const matchingReport = reports.find(
          (r) =>
            r.report_date >= weekStart &&
            r.report_date <= weekEnd &&
            r.report_date === dayInfo.dateIso &&
            r.teacher_id === tpl.teacher_id &&
            (r.template_id === tpl.id ||
              normalizeTime(r.start_time) === normTime)
        );

        const rawStatus: ReportStatus = matchingReport?.status ?? 'pending';
        const safeStatus: ReportStatus =
          todayIso && dayInfo.dateIso > todayIso && rawStatus === 'done'
            ? 'pending'
            : rawStatus;

        return {
          key: `${tpl.id}_${dayInfo.dateIso}`,
          template_id: tpl.id,
          report_id: matchingReport?.id || null,
          teacher_id: tpl.teacher_id,
          teacher_name: teacher.name,
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
  }, [weekInfo, templates, teachers, reports, todayIso]);

  // Unique subjects and classes from `teachers` and `schedule_templates`
  const availableSubjects = useMemo(() => {
    const set = new Set<string>();
    teachers.forEach((t) => {
      if (t.subject?.trim()) set.add(t.subject.trim());
    });
    templates.forEach((tpl) => {
      if (tpl.subject?.trim()) set.add(tpl.subject.trim());
      if (tpl.class_name?.trim()) set.add(tpl.class_name.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'he'));
  }, [teachers, templates]);

  // Helper to normalize Hebrew geresh/quotes (׳ / ' / ״ / ") so typing "ט 2" matches "ט׳ 2" or "ט' 2"
  const normalizeSearchStr = useCallback((str?: string | null) => {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/['"׳״]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }, []);

  // Filtered sessions matching BOTH search text (teacher_name OR class_name OR subject) AND selected subject/class dropdown
  const filteredSessions = useMemo(() => {
    const normQuery = normalizeSearchStr(teacherSearchQuery);

    const teacherMainSubjectMap = new Map<string, string>();
    teachers.forEach((t) => teacherMainSubjectMap.set(t.id, t.subject || ''));

    return enrichedSessions.filter((session) => {
      // 1. Check teacher name OR class_name (so typing "ט 2" shows all sessions for class ט' 2)
      const matchesSearch =
        !normQuery ||
        normalizeSearchStr(session.teacher_name).includes(normQuery) ||
        normalizeSearchStr(session.class_name).includes(normQuery);

      // 2. Check subject/class dropdown match
      const teacherMainSubject =
        teacherMainSubjectMap.get(session.teacher_id) || '';
      const matchesSubject =
        selectedSubjectFilter === 'all' ||
        teacherMainSubject === selectedSubjectFilter ||
        session.subject === selectedSubjectFilter ||
        session.class_name === selectedSubjectFilter;

      return matchesSearch && matchesSubject;
    });
  }, [
    enrichedSessions,
    teachers,
    teacherSearchQuery,
    selectedSubjectFilter,
    normalizeSearchStr,
  ]);

  // Count how many unique teachers match the current filter
  const matchingTeachersCount = useMemo(() => {
    const normQuery = normalizeSearchStr(teacherSearchQuery);
    return teachers.filter((teacher) => {
      const teacherTemplates = templates.filter(
        (tpl) => tpl.teacher_id === teacher.id
      );
      const matchesNameOrClass =
        !normQuery ||
        normalizeSearchStr(teacher.name).includes(normQuery) ||
        teacherTemplates.some((tpl) =>
          normalizeSearchStr(tpl.class_name).includes(normQuery)
        );

      const hasTemplateWithSubjectOrClass = teacherTemplates.some(
        (tpl) =>
          tpl.subject === selectedSubjectFilter ||
          tpl.class_name === selectedSubjectFilter
      );
      const matchesSubject =
        selectedSubjectFilter === 'all' ||
        teacher.subject === selectedSubjectFilter ||
        hasTemplateWithSubjectOrClass;

      return matchesNameOrClass && matchesSubject;
    }).length;
  }, [
    teachers,
    templates,
    teacherSearchQuery,
    selectedSubjectFilter,
    normalizeSearchStr,
  ]);

  // Optimistic Status Override Handler with Future Date Guard
  const handleSaveOverride = async (
    session: EnrichedSessionItem,
    newStatus: ReportStatus,
    notes: string
  ) => {
    if (todayIso && session.report_date > todayIso && newStatus === 'done') {
      showToast('לא ניתן לסמן מפגש בתאריך עתידי כ"בוצע"');
      return;
    }

    setIsSavingOverride(true);

    const effectiveCode = adminInstitutionCode || school?.semel_mosad || null;

    const optimisticReport: WeeklyActualReport = {
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
      institution_code: effectiveCode,
    };

    setReports((prev) => {
      const existingIdx = prev.findIndex(
        (r) =>
          r.report_date === session.report_date &&
          r.teacher_id === session.teacher_id &&
          (r.template_id === session.template_id ||
            normalizeTime(r.start_time) === session.start_time)
      );
      if (existingIdx > -1) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          status: newStatus,
          notes,
          institution_code:
            updated[existingIdx].institution_code || effectiveCode,
        };
        return updated;
      }
      return [...prev, optimisticReport];
    });

    setActiveSessionModal(null);

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
        institution_code: effectiveCode,
      });

      if (error) {
        showToast('שגיאה בשמירה במסד הנתונים, השינוי נשמר מקומית');
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
        showToast('סטטוס הדיווח עודכן בהצלחה');
      }
    } else {
      showToast('סטטוס הדיווח עודכן בהצלחה');
    }

    setIsSavingOverride(false);
  };

  // School Settings Update Handler
  const handleSaveSchoolSettings = async (name: string, semelMosad: string) => {
    if (!school) return;
    setIsSavingSettings(true);

    setSchool((prev) =>
      prev ? { ...prev, name, semel_mosad: semelMosad } : prev
    );
    setIsSettingsOpen(false);

    if (isSupabaseConfigured() && !isUsingFallback) {
      const supabase = createClient();
      const { error } = await supabase
        .from('schools')
        .update({ name, semel_mosad: semelMosad })
        .eq('id', school.id)
        .select('*')
        .maybeSingle();

      if (error) {
        showToast('שגיאה בעדכון פרטי המוסד במסד הנתונים');
      } else {
        showToast('פרטי המוסד החינוכי עודכנו בהצלחה');
      }
    } else {
      showToast('פרטי המוסד עודכנו בהצלחה');
    }

    setIsSavingSettings(false);
  };

  // Teacher & Schedule Management Handlers
  const handleAddTeacher = async (
    payload: TeacherFormPayload,
    options?: { silent?: boolean }
  ): Promise<Teacher | null> => {
    const generatedToken = `${(payload.name || 'teacher')
      .replace(/\s+/g, '-')
      .slice(0, 10)}-${Math.random().toString(36).substring(2, 8)}-${Date.now().toString(36)}`;

    const effectiveCode = adminInstitutionCode || school?.semel_mosad || null;

    if (isSupabaseConfigured() && !isUsingFallback) {
      const supabase = createClient();

      // Ensure valid school_id UUID that actually exists in public.schools
      let verifiedSchoolId: string | null = null;
      const targetSchoolId = school?.id;
      const isUuid =
        targetSchoolId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          targetSchoolId
        );

      if (isUuid) {
        const { data: sCheck } = await supabase
          .from('schools')
          .select('id')
          .eq('id', targetSchoolId)
          .maybeSingle();
        if (sCheck?.id) {
          verifiedSchoolId = sCheck.id;
        }
      }

      if (!verifiedSchoolId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        let dbSchool: School | null = null;
        if (user?.id) {
          const { data: s1 } = await supabase
            .from('schools')
            .select('*')
            .eq('admin_user_id', user.id)
            .maybeSingle();
          dbSchool = s1;
        }
        if (!dbSchool && effectiveCode) {
          const { data: s2 } = await supabase
            .from('schools')
            .select('*')
            .eq('semel_mosad', effectiveCode)
            .maybeSingle();
          dbSchool = s2;
        }
        if (!dbSchool) {
          const { data: s3 } = await supabase
            .from('schools')
            .select('*')
            .limit(1)
            .maybeSingle();
          dbSchool = s3;
        }
        if (!dbSchool) {
          const { data: newSchool, error: schoolErr } = await supabase
            .from('schools')
            .insert({
              name: school?.name || 'בית ספר',
              semel_mosad: effectiveCode || '',
              admin_user_id: user?.id || null,
            })
            .select('*')
            .maybeSingle();
          if (schoolErr) {
            console.error('[DB ERROR]: Failed to create fallback school row in DB:', schoolErr);
          } else if (newSchool) {
            dbSchool = newSchool;
          }
        }
        if (dbSchool) {
          verifiedSchoolId = dbSchool.id;
          setSchool(dbSchool);
        }
      }

      if (!verifiedSchoolId) {
        console.error('[DB ERROR]: No valid school record found or could be created in Supabase.');
        showToast('שגיאה: לא נמצא מזהה בית ספר תקין במסד הנתונים');
        return null;
      }

      const { data: inserted, error } = await createTeacherSafe(supabase, {
        school_id: verifiedSchoolId,
        name: payload.name,
        subject: payload.subject,
        id_number: payload.id_number || null,
        phone: payload.phone || null,
        email: payload.email || null,
        magic_token: generatedToken,
        institution_code: effectiveCode,
      });

      if (error || !inserted) {
        console.error('[DB ERROR]: Error inserting teacher in handleAddTeacher:', error);
        showToast(`שגיאה בהוספת המורה: ${error?.message || 'שגיאה במסד הנתונים'}`);
        return null;
      }

      setTeachers((prev) => [...prev, inserted]);
      if (!options?.silent) {
        showToast(`המורה ${payload.name} נוסף/ה בהצלחה!`);
      }
      return inserted;
    } else {
      const localTeacher: Teacher = {
        id: `local-teacher-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        created_at: new Date().toISOString(),
        school_id: school?.id || 'demo-school-1',
        name: payload.name,
        subject: payload.subject,
        id_number: payload.id_number || null,
        phone: payload.phone || null,
        email: payload.email || null,
        magic_token: generatedToken,
        auth_user_id: null,
        institution_code: effectiveCode,
      };
      setTeachers((prev) => [...prev, localTeacher]);
      if (!options?.silent) {
        showToast(`המורה ${payload.name} נוסף/ה בהצלחה!`);
      }
      return localTeacher;
    }
  };

  const handleUpdateTeacher = async (
    teacherId: string,
    payload: TeacherFormPayload
  ) => {
    const effectiveCode = adminInstitutionCode || school?.semel_mosad || null;

    setTeachers((prev) =>
      prev.map((t) =>
        t.id === teacherId
          ? {
              ...t,
              name: payload.name,
              subject: payload.subject,
              id_number:
                payload.id_number !== undefined
                  ? payload.id_number
                  : t.id_number,
              phone: payload.phone || null,
              email: payload.email || null,
              institution_code: t.institution_code || effectiveCode,
            }
          : t
      )
    );

    if (isSupabaseConfigured() && !isUsingFallback) {
      const supabase = createClient();
      const { error } = await updateTeacherSafe(supabase, teacherId, {
        name: payload.name,
        subject: payload.subject,
        id_number: payload.id_number || null,
        phone: payload.phone || null,
        email: payload.email || null,
        institution_code: effectiveCode,
      });

      if (error) {
        showToast('שגיאה בעדכון פרטי המורה בשרת');
        return;
      }
    }
    showToast('פרטי המורה ודרכי ההתקשרות עודכנו בהצלחה');
  };

  const handleDeleteTeacher = async (teacherId: string) => {
    setTeachers((prev) => prev.filter((t) => t.id !== teacherId));
    setTemplates((prev) => prev.filter((tpl) => tpl.teacher_id !== teacherId));
    setReports((prev) => prev.filter((r) => r.teacher_id !== teacherId));

    if (isSupabaseConfigured() && !isUsingFallback) {
      const supabase = createClient();
      const effectiveCode = adminInstitutionCode || school?.semel_mosad;
      let delQuery = supabase.from('teachers').delete().eq('id', teacherId);
      if (effectiveCode) {
        delQuery = delQuery.or(
          `institution_code.eq.${effectiveCode},institution_code.is.null`
        );
      }
      const { error } = await delQuery;
      if (error) {
        console.error('[DB ERROR]: Failed to delete teacher:', error);
        showToast('שגיאה במחיקה ממסד הנתונים');
        return;
      }
    }
    showToast('המורה ומערכת השעות שלו הוסרו');
  };

  const handleBulkDeleteTeachers = async (teacherIds: string[]) => {
    if (!teacherIds || teacherIds.length === 0) return;

    setTeachers((prev) => prev.filter((t) => !teacherIds.includes(t.id)));
    setTemplates((prev) =>
      prev.filter((tpl) => !teacherIds.includes(tpl.teacher_id))
    );
    setReports((prev) =>
      prev.filter((r) => !teacherIds.includes(r.teacher_id))
    );

    if (isSupabaseConfigured() && !isUsingFallback) {
      const supabase = createClient();
      const effectiveCode = adminInstitutionCode || school?.semel_mosad;
      let delQuery = supabase.from('teachers').delete().in('id', teacherIds);
      if (effectiveCode) {
        delQuery = delQuery.or(
          `institution_code.eq.${effectiveCode},institution_code.is.null`
        );
      }
      const { error } = await delQuery;
      if (error) {
        console.error('[DB ERROR]: Failed to bulk delete teachers:', error);
        showToast('שגיאה במחיקה ממסד הנתונים');
        return;
      }
    }

    showToast(`נמחקו בהצלחה ${teacherIds.length} מורים וכל משבצות השעה שלהם`);
  };

  const handleSaveTemplate = async (
    teacherId: string,
    templateData: {
      id?: string;
      day_of_week: number;
      start_time: string;
      duration_minutes: number;
      subject: string;
      class_name?: string | null;
    },
    options?: { silent?: boolean }
  ): Promise<ScheduleTemplate | null> => {
    const effectiveCode = adminInstitutionCode || school?.semel_mosad || null;

    if (templateData.id) {
      if (isSupabaseConfigured() && !isUsingFallback) {
        const supabase = createClient();
        const { data: updated, error } = await saveScheduleTemplateSafe(supabase, {
          id: templateData.id,
          teacher_id: teacherId,
          day_of_week: templateData.day_of_week,
          start_time: templateData.start_time,
          duration_minutes: templateData.duration_minutes,
          subject: templateData.subject,
          class_name: templateData.class_name ?? null,
          institution_code: effectiveCode,
        });

        if (error || !updated) {
          console.error('[DB ERROR]: Error updating schedule template in handleSaveTemplate:', error);
          showToast(`שגיאה בעדכון משבצת שעה: ${error?.message || 'שגיאה במסד הנתונים'}`);
          return null;
        }

        setTemplates((prev) =>
          prev.map((tpl) => (tpl.id === templateData.id ? updated : tpl))
        );
        if (!options?.silent) {
          showToast('משבצת השעה הפרטנית עודכנה');
        }
        return updated;
      }

      let updatedLocal: ScheduleTemplate | null = null;
      setTemplates((prev) =>
        prev.map((tpl) => {
          if (tpl.id === templateData.id) {
            updatedLocal = {
              ...tpl,
              day_of_week: templateData.day_of_week,
              start_time: templateData.start_time,
              duration_minutes: templateData.duration_minutes,
              subject: templateData.subject,
              class_name: templateData.class_name ?? null,
              institution_code: tpl.institution_code || effectiveCode,
            };
            return updatedLocal;
          }
          return tpl;
        })
      );
      if (!options?.silent) {
        showToast('משבצת השעה הפרטנית עודכנה');
      }
      return updatedLocal;
    } else {
      if (isSupabaseConfigured() && !isUsingFallback) {
        const supabase = createClient();
        const { data: inserted, error } = await saveScheduleTemplateSafe(
          supabase,
          {
            teacher_id: teacherId,
            day_of_week: templateData.day_of_week,
            start_time: templateData.start_time,
            duration_minutes: templateData.duration_minutes,
            subject: templateData.subject,
            class_name: templateData.class_name ?? null,
            institution_code: effectiveCode,
          }
        );

        if (error || !inserted) {
          console.error('[DB ERROR]: Error inserting schedule template in handleSaveTemplate:', error);
          showToast(`שגיאה בהוספת משבצת שעה: ${error?.message || 'שגיאה במסד הנתונים'}`);
          return null;
        }

        setTemplates((prev) => [...prev, inserted]);
        if (!options?.silent) {
          showToast('משבצת שעה פרטנית נוספה למערכת!');
        }
        return inserted;
      }

      const localTpl: ScheduleTemplate = {
        id: `local-tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        teacher_id: teacherId,
        day_of_week: templateData.day_of_week,
        start_time: templateData.start_time,
        duration_minutes: templateData.duration_minutes,
        subject: templateData.subject,
        class_name: templateData.class_name ?? null,
        institution_code: effectiveCode,
      };
      setTemplates((prev) => [...prev, localTpl]);
      if (!options?.silent) {
        showToast('משבצת שעה פרטנית נוספה למערכת!');
      }
      return localTpl;
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    setTemplates((prev) => prev.filter((tpl) => tpl.id !== templateId));
    if (isSupabaseConfigured() && !isUsingFallback) {
      const supabase = createClient();
      const effectiveCode = adminInstitutionCode || school?.semel_mosad;
      let delQuery = supabase
        .from('schedule_templates')
        .delete()
        .eq('id', templateId);
      if (effectiveCode) {
        delQuery = delQuery.or(
          `institution_code.eq.${effectiveCode},institution_code.is.null`
        );
      }
      const { error } = await delQuery;
      if (error) {
        console.error('[DB ERROR]: Failed to delete template:', error);
        showToast('שגיאה במחיקה ממסד הנתונים');
        return;
      }
    }
    showToast('משבצת השעה הוסרה מהמערכת');
  };

  // Excel Export & Bulk Import Handlers
  const handleExportExcel = () => {
    if (!weekInfo) return;
    exportReportsToExcel(
      filteredSessions,
      school?.name || 'בית_ספר',
      weekInfo.weekLabel
    );
    showToast('קובץ האקסל הופק והורד בהצלחה!');
  };

  const handleExcelFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingExcel(true);
    try {
      const parsedRows = await parseTeachersExcelFile(file);
      if (parsedRows.length === 0) {
        showToast(
          'לא נמצאו שורות מורים תקינות בקובץ. ודא שקיימת עמודת "שם המורה" ו-"תחום דעת".'
        );
        return;
      }

      const effectiveCode = adminInstitutionCode || school?.semel_mosad || null;
      // Working local copies to track newly created entities during the loop
      const currentTeachers = [...teachers];
      const currentTemplates = [...templates];

      let importedCount = 0;
      let importedSlotCount = 0;
      let skippedSlotCount = 0;
      let dbErrorsCount = 0;

      for (const row of parsedRows) {
        const rowName = row.name.trim();
        const rowEmail = row.email ? row.email.trim().toLowerCase() : '';
        const rowIdNumber = row.id_number ? row.id_number.trim() : '';

        // Prevent Teacher Duplicates:
        // Check if teacher with same id_number, email, or name exists for this institution
        let targetTeacher = currentTeachers.find((t) => {
          const tInst = t.institution_code || effectiveCode;
          if (effectiveCode && tInst && tInst !== effectiveCode) {
            return false;
          }
          if (
            rowIdNumber &&
            t.id_number &&
            t.id_number.trim() === rowIdNumber
          ) {
            return true;
          }
          if (
            rowEmail &&
            t.email &&
            t.email.trim().toLowerCase() === rowEmail
          ) {
            return true;
          }
          if (t.name.trim().toLowerCase() === rowName.toLowerCase()) {
            return true;
          }
          return false;
        });

        if (!targetTeacher) {
          const created = await handleAddTeacher(
            {
              name: row.name,
              subject: row.subject,
              id_number: row.id_number,
              phone: row.phone,
              email: row.email,
            },
            { silent: true }
          );
          if (created) {
            targetTeacher = created;
            currentTeachers.push(created);
            importedCount++;
          } else {
            dbErrorsCount++;
          }
        }

        // Prevent Schedule Duplicates & Normalize Start Time
        if (targetTeacher && row.day_of_week && row.start_time) {
          const normalizedStartTime =
            normalizeTimeToHHMM(row.start_time) || row.start_time.slice(0, 5);

          // Check if slot with same teacher_id, day_of_week, and start_time already exists
          const isDuplicateSlot = currentTemplates.some(
            (tpl) =>
              tpl.teacher_id === targetTeacher!.id &&
              tpl.day_of_week === row.day_of_week &&
              (normalizeTimeToHHMM(tpl.start_time) === normalizedStartTime ||
                tpl.start_time.slice(0, 5) === normalizedStartTime)
          );

          if (isDuplicateSlot) {
            skippedSlotCount++;
            continue;
          }

          const savedSlot = await handleSaveTemplate(
            targetTeacher.id,
            {
              day_of_week: row.day_of_week,
              start_time: normalizedStartTime,
              duration_minutes: row.duration_minutes || 45,
              subject: row.template_subject || row.subject,
              class_name: row.class_name || null,
            },
            { silent: true }
          );

          if (savedSlot) {
            currentTemplates.push(savedSlot);
            importedSlotCount++;
          } else {
            dbErrorsCount++;
          }
        }
      }

      if (dbErrorsCount > 0) {
        showToast(
          `אזהרה: התרחשו ${dbErrorsCount} שגיאות בשמירה למסד הנתונים. נתונים שלא נשמרו לא נוספו למערכת. פרטים נרשמו ב-Console.`
        );
      } else {
        let toastMsg = `יובאו בהצלחה ${importedCount} מורים חדשים מקובץ האקסל!`;
        if (importedSlotCount > 0) {
          toastMsg += ` (${importedSlotCount} משבצות שעה שובצו)`;
        }
        if (skippedSlotCount > 0) {
          toastMsg += ` (${skippedSlotCount} משבצות שעה כפולות דולגו למניעת כפילויות)`;
        }
        showToast(toastMsg);
      }
    } catch (err) {
      console.error('Excel import error:', err);
      showToast('שגיאה בקריאת קובץ האקסל');
    } finally {
      setIsImportingExcel(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Bulk Send Magic Links via Nodemailer Server Action
  const handleBulkSendEmails = async () => {
    const teachersWithEmail = teachers.filter(
      (t) => t.email && t.email.trim().includes('@')
    );

    if (teachersWithEmail.length === 0) {
      showToast(
        'לא נמצאו מורים עם כתובת דוא"ל. הוסף כתובות דוא"ל בחלון ניהול המורים.'
      );
      return;
    }

    const confirmed = window.confirm(
      `האם אתה בטוח שברצונך לשלוח כעת דוא"ל עם קישור אישי (Magic Link) לכל ${teachersWithEmail.length} המורים בעלי כתובת דוא"ל?`
    );
    if (!confirmed) return;

    setIsSendingBulkEmails(true);
    try {
      const origin =
        typeof window !== 'undefined' ? window.location.origin : '';
      const result = await sendBulkMagicLinks(origin);
      showToast(result.message);
    } catch (err) {
      console.error('Bulk email error:', err);
      showToast('שגיאה בשליחת המיילים לכל המורים');
    } finally {
      setIsSendingBulkEmails(false);
    }
  };

  // TASK 3: Admin to Teacher Quick-Switch
  const handleSwitchToTeacher = async () => {
    setIsSwitchingToTeacher(true);
    try {
      const effectiveCode = adminInstitutionCode || school?.semel_mosad || null;
      let emailToMatch = adminEmail;

      if (isSupabaseConfigured() && !isUsingFallback) {
        const supabase = createClient();
        if (!emailToMatch) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          emailToMatch = user?.email || null;
        }

        if (!emailToMatch) {
          showToast('לא נמצא מורה המשויך לכתובת הדוא"ל של המנהל');
          return;
        }

        let query = supabase
          .from('teachers')
          .select('*')
          .ilike('email', emailToMatch.trim());

        if (effectiveCode) {
          query = query.or(
            `institution_code.eq.${effectiveCode},institution_code.is.null`
          );
        }

        const { data: matchedList, error: queryErr } = await query;
        if (queryErr) {
          console.error(
            '[DB ERROR]: Error searching for teacher by admin email:',
            queryErr
          );
        }

        const matchedTeacher =
          matchedList && matchedList.length > 0
            ? (matchedList[0] as Teacher)
            : null;

        if (!matchedTeacher) {
          showToast('לא נמצא מורה המשויך לכתובת הדוא"ל של המנהל');
          return;
        }

        let token = matchedTeacher.magic_token;
        if (!token) {
          token = `token-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          await supabase
            .from('teachers')
            .update({ magic_token: token })
            .eq('id', matchedTeacher.id);
        }

        router.push(`/teacher?token=${encodeURIComponent(token)}`);
      } else {
        // Fallback / Demo Mode
        const matchedFallback = teachers.find(
          (t) =>
            t.email &&
            emailToMatch &&
            t.email.trim().toLowerCase() === emailToMatch.trim().toLowerCase()
        );

        if (!matchedFallback) {
          showToast('לא נמצא מורה המשויך לכתובת הדוא"ל של המנהל');
          return;
        }

        const token =
          matchedFallback.magic_token ||
          `token-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        router.push(`/teacher?token=${encodeURIComponent(token)}`);
      }
    } catch (err) {
      console.error('Error switching to teacher view:', err);
      showToast('שגיאה במעבר לדיווח אישי');
    } finally {
      setIsSwitchingToTeacher(false);
    }
  };

  // Seed Demo Data into Supabase
  const handleSeedDatabase = async () => {
    if (!isSupabaseConfigured() || !weekInfo || !todayIso) return;
    setIsSeeding(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      //await seedDemoSchoolData(supabase, user?.id || null);
      await fetchDashboardData(
        weekInfo.sundayIso,
        weekInfo.fridayIso,
        weekInfo.days[1]?.dateIso || weekInfo.sundayIso,
        todayIso
      );
      showToast('נתוני הדגמה הוזנו בהצלחה למסד הנתונים Supabase!');
    } catch (err) {
      console.error(err);
      showToast('שגיאה ביצירת נתוני הדגמה ב-Supabase');
    } finally {
      setIsSeeding(false);
    }
  };

  const hasActiveFilters =
    teacherSearchQuery.trim() !== '' || selectedSubjectFilter !== 'all';

  if (!referenceDate || !weekInfo || !initialLoaded) {
    return (
      <div className="space-y-6 py-4">
        <div className="glass-card h-24 animate-pulse bg-white/60 p-6" />
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="glass-card h-32 animate-pulse bg-white/60" />
          <div className="glass-card h-32 animate-pulse bg-white/60" />
          <div className="glass-card h-32 animate-pulse bg-white/60" />
          <div className="glass-card h-32 animate-pulse bg-white/60" />
        </div>
        <div className="glass-card h-96 animate-pulse bg-white/60" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hidden File Input for Excel Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleExcelFileSelected}
        className="hidden"
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 left-5 z-50 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-950/90 px-4 py-3 text-sm font-medium text-white shadow-xl backdrop-blur-md">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Database Status Banner if using fallback */}
      {isUsingFallback && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200/80 bg-indigo-50/90 px-5 py-3 text-xs sm:text-sm text-indigo-950">
          <div className="flex items-center gap-2.5">
            <Database className="h-4 w-4 text-indigo-600 shrink-0" />
            <span>
              {isSupabaseConfigured()
                ? 'מסד הנתונים מחובר אך טרם הוזנו בו נתוני בית ספר. מוצגים כעת נתוני הדגמה.'
                : 'מוצגים נתוני הדגמה פעילים. לחיבור למסד נתונים קבוע הגדר את משתני הסביבה בקובץ .env.local.'}
            </span>
          </div>
          {isSupabaseConfigured() && (
            <button
              type="button"
              disabled={isSeeding}
              onClick={handleSeedDatabase}
              className="rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSeeding ? 'מזין נתונים...' : 'אתחל נתוני הדגמה ב-Supabase'}
            </button>
          )}
        </div>
      )}

      {/* Top School Header & Controls */}
      <div className="glass-card flex flex-col justify-between gap-4 p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex items-start gap-4">
            <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-600 p-3.5 text-white shadow-md shadow-indigo-600/20">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900">
                  {school?.name || 'בית ספר'}
                </h1>
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-0.5 text-xs font-semibold text-indigo-700">
                  סמל מוסד: {adminInstitutionCode || school?.semel_mosad || '---'}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                לוח בקרה ניהולי למעקב ודיווח שעות פרטניות שבועיות
              </p>
            </div>
          </div>

          {/* Week Navigation */}
          <div className="flex flex-wrap items-center gap-2.5">
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
                <Calendar className="h-4 w-4 text-indigo-600" />
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
                  className="mr-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                >
                  השבוע
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/50 hover:text-indigo-700"
            >
              <Settings className="h-4 w-4 text-indigo-600" />
              <span>הגדרות מוסד</span>
            </button> 

            <AdminHeader
              schoolName={school?.name}
              institutionCode={adminInstitutionCode || school?.semel_mosad}
              isSuperAdmin={isSuperAdmin}
              onSwitchToTeacher={handleSwitchToTeacher}
              isSwitchingToTeacher={isSwitchingToTeacher}
            />
          </div>
        </div>

        {/* Admin Management & Ministry of Education Excel Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsManageTeachersOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-700"
            >
              <UserCog className="h-4 w-4" />
              <span>ניהול מורים ומערכת שעות</span>
            </button>

            <button
              type="button"
              disabled={isSendingBulkEmails}
              onClick={handleBulkSendEmails}
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/90 px-4 py-2.5 text-xs sm:text-sm font-bold text-indigo-800 shadow-sm transition hover:bg-indigo-100 disabled:opacity-60"
            >
              {isSendingBulkEmails ? (
                <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
              ) : (
                <Send className="h-4 w-4 text-indigo-600" />
              )}
              <span>
                {isSendingBulkEmails
                  ? 'שולח קישורים...'
                  : 'שליחת קישורים לכל המורים'}
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3.5 py-2 text-xs sm:text-sm font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-100"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <span>הפקת דוח אקסל</span>
            </button>

            <button
              type="button"
              disabled={isImportingExcel}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50/90 px-3.5 py-2 text-xs sm:text-sm font-bold text-sky-800 shadow-sm transition hover:bg-sky-100 disabled:opacity-50"
            >
              <Upload className="h-4 w-4 text-sky-600" />
              <span>
                {isImportingExcel ? 'מייבא מאקסל...' : 'ייבוא מורים מאקסל'}
              </span>
            </button>

            <button
              type="button"
              onClick={downloadTeacherImportTemplate}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
              title="הורד קובץ תבנית אקסל לדוגמה לייבוא מורים (כולל טלפון ומייל)"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              <span>תבנית אקסל</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Summary Cards (Reflects currently filtered view) */}
      <KpiCards
        sessions={filteredSessions}
        todayIso={todayIso}
        onSelectSession={(session) => setActiveSessionModal(session)}
      />

      {/* TASK 1: Scalable Glassmorphism Search & Filter Bar for 70+ Teachers */}
      <div className="glass-card p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-end">
          {/* Teacher Name & Class Search Input (6 cols) */}
          <div className="md:col-span-6">
            <label
              htmlFor="admin-teacher-search"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-700"
            >
              <Search className="h-3.5 w-3.5 text-indigo-600" />
              <span>חיפוש מורה לפי שם או כיתה</span>
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                id="admin-teacher-search"
                type="text"
                value={teacherSearchQuery}
                onChange={(e) => setTeacherSearchQuery(e.target.value)}
                placeholder="חיפוש מורה לפי שם או כיתה (לדוגמה: ט 2)..."
                className="w-full rounded-xl border border-slate-200/90 bg-white/90 py-2.5 pr-10 pl-9 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
              />
              {teacherSearchQuery && (
                <button
                  type="button"
                  onClick={() => setTeacherSearchQuery('')}
                  className="absolute left-3 top-2.5 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  aria-label="נקה חיפוש"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Subject / Class Select Dropdown (4 cols) */}
          <div className="md:col-span-4">
            <label
              htmlFor="admin-subject-filter"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-700"
            >
              <Filter className="h-3.5 w-3.5 text-indigo-600" />
              <span>סינון לפי כיתה / תחום דעת</span>
            </label>
            <div className="relative">
              <select
                id="admin-subject-filter"
                value={selectedSubjectFilter}
                onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2.5 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="all">הכל ({availableSubjects.length} תחומי דעת)</option>
                {availableSubjects.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Filter Results Counter & Reset Button (2 cols) */}
          <div className="flex items-center justify-between gap-2 md:col-span-2 md:justify-end">
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200/70 bg-slate-50/90 px-3 py-2.5 text-xs font-semibold text-slate-600">
              <Users className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
              <span>
                {matchingTeachersCount} מתוך {teachers.length} מורים
              </span>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setTeacherSearchQuery('');
                  setSelectedSubjectFilter('all');
                }}
                className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100"
                title="נקה את כל הסינונים"
              >
                <X className="h-3.5 w-3.5" />
                <span>איפוס</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Visual Weekly Time-Grid (Displays sessions matching BOTH search text & subject dropdown) */}
      <WeeklyTimeGrid
        days={weekInfo.days}
        sessions={filteredSessions}
        todayIso={todayIso}
        onSelectSession={(session) => setActiveSessionModal(session)}
      />

      {/* Admin Status Override Modal */}
      <StatusOverrideModal
        session={activeSessionModal}
        todayIso={todayIso}
        isSaving={isSavingOverride}
        onClose={() => setActiveSessionModal(null)}
        onSaveOverride={handleSaveOverride}
      />

      {/* School Settings Modal */}
      <SchoolSettingsModal
        isOpen={isSettingsOpen}
        school={school}
        isSaving={isSavingSettings}
        onClose={() => setIsSettingsOpen(false)}
        onSaveSettings={handleSaveSchoolSettings}
      />

      {/* Teacher & Schedule Management Modal */}
      <TeacherScheduleModal
        isOpen={isManageTeachersOpen}
        teachers={teachers}
        templates={templates}
        onClose={() => setIsManageTeachersOpen(false)}
        onAddTeacher={handleAddTeacher}
        onUpdateTeacher={handleUpdateTeacher}
        onDeleteTeacher={handleDeleteTeacher}
        onBulkDeleteTeachers={handleBulkDeleteTeachers}
        onSaveTemplate={handleSaveTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        onShowToast={showToast}
      />
    </div>
  );
}
