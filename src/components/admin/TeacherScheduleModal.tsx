'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  X,
  UserPlus,
  Users,
  Trash2,
  Edit3,
  Check,
  CalendarPlus,
  Clock,
  BookOpen,
  Copy,
  MessageCircle,
  Mail,
  Phone,
  AtSign,
  Loader2,
  Send,
  Search,
  GraduationCap,
  AlertCircle,
} from 'lucide-react';
import {
  Teacher,
  ScheduleTemplate,
  HEBREW_DAYS,
  InstitutionTimeSlot,
} from '@/types/database';
import { normalizeTime } from '@/lib/dates';
import {
  sendTeacherMagicLink,
  sendBulkMagicLinks,
} from '@/app/actions/email';

function formatLastLoginHebrew(lastLoginIso?: string | null): string | null {
  if (!lastLoginIso) return null;
  const d = new Date(lastLoginIso);
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export interface TeacherFormPayload {
  name: string;
  subject: string;
  id_number?: string;
  phone?: string;
  email?: string;
}

interface TeacherScheduleModalProps {
  isOpen: boolean;
  teachers: Teacher[];
  templates: ScheduleTemplate[];
  initialSelectedTeacherId?: string | null;
  onClose: () => void;
  onAddTeacher: (payload: TeacherFormPayload) => Promise<Teacher | null>;
  onUpdateTeacher: (
    teacherId: string,
    payload: TeacherFormPayload
  ) => Promise<any>;
  onDeleteTeacher: (teacherId: string) => Promise<void>;
  onBulkDeleteTeachers: (teacherIds: string[]) => Promise<void>;
  onSaveTemplate: (
    teacherId: string,
    templateData: {
      id?: string;
      day_of_week: number;
      start_time: string;
      duration_minutes: number;
      subject: string;
      class_name?: string | null;
      period_number?: number | null;
    }
  ) => Promise<any>;
  onDeleteTemplate: (templateId: string) => Promise<void>;
  onShowToast: (msg: string) => void;
  timeSlots?: InstitutionTimeSlot[];
}

/**
 * Formats an Israeli phone number for WhatsApp `wa.me/972...` links.
 */
function formatPhoneForWhatsApp(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return `972${digits}`;
}

export default function TeacherScheduleModal({
  isOpen,
  teachers,
  templates,
  initialSelectedTeacherId,
  onClose,
  onAddTeacher,
  onUpdateTeacher,
  onDeleteTeacher,
  onBulkDeleteTeachers,
  onSaveTemplate,
  onDeleteTemplate,
  onShowToast,
  timeSlots = [],
}: TeacherScheduleModalProps) {
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState<boolean>(false);

  // Search input state for filtering the teachers list in the right pane
  const [teacherSearchQuery, setTeacherSearchQuery] = useState<string>('');

  // Add Teacher State
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherSubject, setNewTeacherSubject] = useState('');
  const [newTeacherPhone, setNewTeacherPhone] = useState('');
  const [newTeacherEmail, setNewTeacherEmail] = useState('');
  const [isAddingTeacher, setIsAddingTeacher] = useState(false);

  // Edit Teacher State
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [editTeacherName, setEditTeacherName] = useState('');
  const [editTeacherSubject, setEditTeacherSubject] = useState('');
  const [editTeacherPhone, setEditTeacherPhone] = useState('');
  const [editTeacherEmail, setEditTeacherEmail] = useState('');
  const [isUpdatingTeacher, setIsUpdatingTeacher] = useState(false);

  // Automated Email Sending States
  const [sendingEmailTeacherId, setSendingEmailTeacherId] = useState<
    string | null
  >(null);
  const [isSendingBulkEmails, setIsSendingBulkEmails] =
    useState<boolean>(false);

  // Add / Edit Schedule Template Slot State (Including `slotClassName`)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null
  );
  const [slotDay, setSlotDay] = useState<number>(1);
  const [slotTime, setSlotTime] = useState<string>('09:00');
  const [slotDuration, setSlotDuration] = useState<number>(45);
  const [slotSubject, setSlotSubject] = useState<string>('');
  const [slotClassName, setSlotClassName] = useState<string>('');
  const [isSavingSlot, setIsSavingSlot] = useState<boolean>(false);

  // Period / Bell Schedule support
  const [selectedPeriodOption, setSelectedPeriodOption] = useState<string>('custom');
  const [slotPeriodNumber, setSlotPeriodNumber] = useState<number | null>(null);

  // Filter timeSlots based on selected slotDay with fallback to 'all'
  const activeDaySlots = useMemo(() => {
    if (!timeSlots || timeSlots.length === 0) return [];
    const dayStr = String(slotDay);
    const specific = timeSlots.filter((s) => s.day_of_week === dayStr);
    if (specific.length > 0) {
      return specific.sort((a, b) => a.period_number - b.period_number);
    }
    return timeSlots
      .filter((s) => s.day_of_week === 'all' || !s.day_of_week)
      .sort((a, b) => a.period_number - b.period_number);
  }, [timeSlots, slotDay]);

  const handlePeriodSelectChange = (val: string) => {
    setSelectedPeriodOption(val);
    if (val === 'custom') {
      setSlotPeriodNumber(null);
    } else {
      const matched =
        activeDaySlots.find(
          (s) => s.id === val || String(s.period_number) === val
        ) ||
        timeSlots.find(
          (s) => s.id === val || String(s.period_number) === val
        );
      if (matched) {
        setSlotPeriodNumber(matched.period_number);
        const normStart = normalizeTime(matched.start_time);
        const normEnd = normalizeTime(matched.end_time);
        setSlotTime(normStart);

        const [sh, sm] = normStart.split(':').map(Number);
        const [eh, em] = normEnd.split(':').map(Number);
        const diff = eh * 60 + em - (sh * 60 + sm);
        setSlotDuration(diff > 0 ? diff : 45);
      }
    }
  };

  const handleSlotDayChange = (newDay: number) => {
    setSlotDay(newDay);
    if (timeSlots && timeSlots.length > 0 && selectedPeriodOption !== 'custom') {
      const dayStr = String(newDay);
      const specific = timeSlots.filter((s) => s.day_of_week === dayStr);
      const dayList =
        specific.length > 0
          ? specific.sort((a, b) => a.period_number - b.period_number)
          : timeSlots
              .filter((s) => s.day_of_week === 'all' || !s.day_of_week)
              .sort((a, b) => a.period_number - b.period_number);

      if (dayList.length > 0) {
        const matched =
          dayList.find((s) => s.period_number === slotPeriodNumber) || dayList[0];
        setSelectedPeriodOption(matched.id);
        setSlotPeriodNumber(matched.period_number);
        const normStart = normalizeTime(matched.start_time);
        const normEnd = normalizeTime(matched.end_time);
        setSlotTime(normStart);
        const [sh, sm] = normStart.split(':').map(Number);
        const [eh, em] = normEnd.split(':').map(Number);
        const diff = eh * 60 + em - (sh * 60 + sm);
        setSlotDuration(diff > 0 ? diff : 45);
      }
    }
  };

  // If timeSlots load or modal opens and not editing, set initial period if custom hasn't been chosen
  useEffect(() => {
    if (
      isOpen &&
      activeDaySlots.length > 0 &&
      !editingTemplateId &&
      selectedPeriodOption === 'custom' &&
      slotPeriodNumber === null
    ) {
      const first = activeDaySlots[0];
      setSelectedPeriodOption(first.id);
      setSlotPeriodNumber(first.period_number);
      const normStart = normalizeTime(first.start_time);
      const normEnd = normalizeTime(first.end_time);
      setSlotTime(normStart);
      const [sh, sm] = normStart.split(':').map(Number);
      const [eh, em] = normEnd.split(':').map(Number);
      const diff = eh * 60 + em - (sh * 60 + sm);
      setSlotDuration(diff > 0 ? diff : 45);
    }
  }, [
    isOpen,
    activeDaySlots,
    editingTemplateId,
    selectedPeriodOption,
    slotPeriodNumber,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    if (
      initialSelectedTeacherId &&
      initialSelectedTeacherId !== 'all' &&
      teachers.some((t) => t.id === initialSelectedTeacherId)
    ) {
      setSelectedTeacherId(initialSelectedTeacherId);
    } else if (teachers.length > 0 && !selectedTeacherId) {
      setSelectedTeacherId(teachers[0].id);
    }
  }, [isOpen, initialSelectedTeacherId, teachers, selectedTeacherId]);

  const activeTeacher =
    teachers.find((t) => t.id === selectedTeacherId) || teachers[0] || null;

  useEffect(() => {
    if (activeTeacher && !editingTemplateId) {
      setSlotSubject((prev) => prev || activeTeacher.subject || '');
    }
  }, [activeTeacher, editingTemplateId]);

  // Instant case-insensitive filtering of teachers in the right pane
  const filteredTeachersList = useMemo(() => {
    const q = teacherSearchQuery.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        (t.email && t.email.toLowerCase().includes(q)) ||
        (t.phone && t.phone.includes(q))
    );
  }, [teachers, teacherSearchQuery]);

  if (!isOpen) return null;

  const teacherTemplates = activeTeacher
    ? templates
        .filter((tpl) => tpl.teacher_id === activeTeacher.id)
        .sort((a, b) => {
          if (a.day_of_week !== b.day_of_week) {
            return a.day_of_week - b.day_of_week;
          }
          return a.start_time.localeCompare(b.start_time);
        })
    : [];

  // Build Magic Link URL & Hebrew Message for a Teacher
  const getMagicLinkAndMessage = (teacher: Teacher) => {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';
    const magicLinkUrl = `${origin}/teacher?token=${encodeURIComponent(
      teacher.magic_token
    )}`;
    const message = `שלום ${teacher.name}, מצורף הקישור האישי שלך למערכת דיווח שעות פרטניות. אנא שמור/י אותו לשימוש שבועי: ${magicLinkUrl}`;
    return { magicLinkUrl, message };
  };

  const handleCopyMagicLink = (teacher: Teacher) => {
    const { magicLinkUrl } = getMagicLinkAndMessage(teacher);
    navigator.clipboard.writeText(magicLinkUrl);
    onShowToast(`קישור אישי עבור ${teacher.name} הועתק ללוח!`);
  };

  const handleSendWhatsApp = (teacher: Teacher) => {
    const { message } = getMagicLinkAndMessage(teacher);
    const formattedPhone = formatPhoneForWhatsApp(teacher.phone);
    const encodedMsg = encodeURIComponent(message);

    const waUrl = formattedPhone
      ? `https://wa.me/${formattedPhone}?text=${encodedMsg}`
      : `https://wa.me/?text=${encodedMsg}`;

    if (!formattedPhone) {
      onShowToast(
        `למורה ${teacher.name} לא הוגדר טלפון נייד — נפתח וואטסאפ לבחירת איש קשר`
      );
    }
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleSendAutomatedEmail = async (teacher: Teacher) => {
    if (!teacher.email || !teacher.email.trim()) {
      onShowToast(
        `למורה ${teacher.name} לא מוגדרת כתובת דוא"ל. לחץ על עריכה כדי להוסיף מייל.`
      );
      return;
    }

    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';
    setSendingEmailTeacherId(teacher.id);

    try {
      const result = await sendTeacherMagicLink(teacher.id, origin);
      onShowToast(result.message);
    } catch {
      onShowToast('שגיאה בשליחת הדוא"ל למורה');
    } finally {
      setSendingEmailTeacherId(null);
    }
  };

  const handleBulkSendFromModal = async () => {
    const teachersWithEmail = teachers.filter(
      (t) => t.email && t.email.trim().includes('@')
    );
    if (teachersWithEmail.length === 0) {
      onShowToast('לא נמצאו מורים עם כתובת דוא"ל מוגדרת במערכת.');
      return;
    }

    const confirmed = window.confirm(
      `האם אתה בטוח שברצונך לשלוח כעת דוא"ל אוטומטי עם קישור אישי לכל ${teachersWithEmail.length} המורים בעלי כתובת דוא"ל?`
    );
    if (!confirmed) return;

    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';
    setIsSendingBulkEmails(true);

    try {
      const result = await sendBulkMagicLinks(origin);
      onShowToast(result.message);
    } catch {
      onShowToast('שגיאה בשליחת המיילים המרוכזת');
    } finally {
      setIsSendingBulkEmails(false);
    }
  };

  // Teacher CRUD Handlers
  const handleCreateTeacher = async () => {
    if (!newTeacherName.trim()) {
      onShowToast('נא להזין את שם המורה');
      return;
    }
    setIsAddingTeacher(true);
    try {
      const created = await onAddTeacher({
        name: newTeacherName.trim(),
        subject: newTeacherSubject.trim() || 'כללי',
        phone: newTeacherPhone.trim() || undefined,
        email: newTeacherEmail.trim() || undefined,
      });
      if (created) {
        setSelectedTeacherId(created.id);
        setNewTeacherName('');
        setNewTeacherSubject('');
        setNewTeacherPhone('');
        setNewTeacherEmail('');
        setSlotSubject(created.subject);
      }
    } catch (err: any) {
      console.error('[handleCreateTeacher] Error:', err);
      onShowToast('שגיאה בהוספת המורה');
    } finally {
      setIsAddingTeacher(false);
    }
  };

  const handleStartEditTeacher = (teacher: Teacher) => {
    setEditingTeacherId(teacher.id);
    setEditTeacherName(teacher.name);
    setEditTeacherSubject(teacher.subject);
    setEditTeacherPhone(teacher.phone || '');
    setEditTeacherEmail(teacher.email || '');
  };

  const handleConfirmEditTeacher = async () => {
    if (!editingTeacherId || !editTeacherName.trim()) return;
    setIsUpdatingTeacher(true);
    try {
      await onUpdateTeacher(editingTeacherId, {
        name: editTeacherName.trim(),
        subject: editTeacherSubject.trim() || 'כללי',
        phone: editTeacherPhone.trim() || undefined,
        email: editTeacherEmail.trim() || undefined,
      });
      setEditingTeacherId(null);
    } catch (err: any) {
      console.error('[handleConfirmEditTeacher] Error:', err);
      onShowToast('שגיאה בעדכון המורה');
    } finally {
      setIsUpdatingTeacher(false);
    }
  };

  const handleRemoveTeacher = async (teacher: Teacher) => {
    const confirmed = window.confirm(
      `האם אתה בטוח שברצונך למחוק? פעולה זו תסיר גם את כל משבצות השעה של מורה זה ואינה ניתנת לביטול.`
    );
    if (!confirmed) return;

    await onDeleteTeacher(teacher.id);
    setSelectedTeacherIds((prev) => prev.filter((id) => id !== teacher.id));
    if (selectedTeacherId === teacher.id) {
      const remaining = teachers.filter((t) => t.id !== teacher.id);
      setSelectedTeacherId(remaining[0]?.id || '');
    }
  };

  const handleRemoveSlot = async (tpl: ScheduleTemplate) => {
    const confirmed = window.confirm(
      'האם אתה בטוח שברצונך למחוק משבצת שעה זו? פעולה זו אינה ניתנת לביטול.'
    );
    if (!confirmed) return;

    await onDeleteTemplate(tpl.id);
  };

  const handleToggleSelectTeacher = (teacherId: string) => {
    setSelectedTeacherIds((prev) =>
      prev.includes(teacherId)
        ? prev.filter((id) => id !== teacherId)
        : [...prev, teacherId]
    );
  };

  const handleToggleSelectAll = () => {
    const visibleIds = filteredTeachersList.map((t) => t.id);
    const allVisibleSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) => selectedTeacherIds.includes(id));

    if (allVisibleSelected) {
      setSelectedTeacherIds((prev) =>
        prev.filter((id) => !visibleIds.includes(id))
      );
    } else {
      setSelectedTeacherIds((prev) =>
        Array.from(new Set([...prev, ...visibleIds]))
      );
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedTeacherIds.length === 0) return;
    const count = selectedTeacherIds.length;
    const confirmed = window.confirm(
      `האם אתה בטוח שברצונך למחוק ${count} מורים נבחרים? פעולה זו תסיר גם את כל משבצות השעה שלהם ואינה ניתנת לביטול.`
    );
    if (!confirmed) return;

    setIsBulkDeleting(true);
    try {
      await onBulkDeleteTeachers(selectedTeacherIds);
      if (selectedTeacherIds.includes(selectedTeacherId)) {
        const remaining = teachers.filter(
          (t) => !selectedTeacherIds.includes(t.id)
        );
        setSelectedTeacherId(remaining[0]?.id || '');
      }
      setSelectedTeacherIds([]);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleStartEditSlot = (tpl: ScheduleTemplate) => {
    setEditingTemplateId(tpl.id);
    setSlotDay(tpl.day_of_week);
    const normTplTime = normalizeTime(tpl.start_time);
    setSlotTime(normTplTime);
    setSlotDuration(tpl.duration_minutes || 45);
    setSlotSubject(tpl.subject);
    setSlotClassName(tpl.class_name || '');

    let matchedSlot: InstitutionTimeSlot | undefined = undefined;
    if (tpl.period_number) {
      matchedSlot = timeSlots.find((s) => s.period_number === tpl.period_number);
    }
    if (!matchedSlot) {
      matchedSlot = timeSlots.find(
        (s) => normalizeTime(s.start_time) === normTplTime
      );
    }

    if (matchedSlot && tpl.period_number) {
      setSelectedPeriodOption(matchedSlot.id);
      setSlotPeriodNumber(matchedSlot.period_number);
    } else {
      setSelectedPeriodOption('custom');
      setSlotPeriodNumber(tpl.period_number ?? null);
    }
  };

  const handleResetSlotForm = () => {
    setEditingTemplateId(null);
    setSlotDay(1);
    if (activeDaySlots.length > 0) {
      const first = activeDaySlots[0];
      setSelectedPeriodOption(first.id);
      setSlotPeriodNumber(first.period_number);
      const normStart = normalizeTime(first.start_time);
      const normEnd = normalizeTime(first.end_time);
      setSlotTime(normStart);
      const [sh, sm] = normStart.split(':').map(Number);
      const [eh, em] = normEnd.split(':').map(Number);
      const diff = eh * 60 + em - (sh * 60 + sm);
      setSlotDuration(diff > 0 ? diff : 45);
    } else {
      setSelectedPeriodOption('custom');
      setSlotPeriodNumber(null);
      setSlotTime('09:00');
      setSlotDuration(45);
    }
    setSlotSubject(activeTeacher?.subject || '');
    setSlotClassName('');
  };

  const handleSaveSlot = async () => {
    if (!activeTeacher) {
      onShowToast('נא לבחור מורה תחילה');
      return;
    }
    if (!slotSubject.trim()) {
      onShowToast('נא להזין נושא לשעה הפרטנית');
      return;
    }
    setIsSavingSlot(true);
    try {
      const saved = await onSaveTemplate(activeTeacher.id, {
        id: editingTemplateId || undefined,
        day_of_week: slotDay,
        start_time: slotTime,
        duration_minutes: Number(slotDuration) || 45,
        subject: slotSubject.trim(),
        class_name: slotClassName.trim() || null,
        period_number: slotPeriodNumber,
      });
      if (saved) {
        handleResetSlotForm();
      }
    } catch (err: any) {
      console.error('[handleSaveSlot] Error:', err);
      onShowToast('שגיאה בשמירת משבצת השעה');
    } finally {
      setIsSavingSlot(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-3 sm:p-6 backdrop-blur-sm">
      <div className="glass-modal flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden text-right animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                ניהול מורים, פרטי קשר ומערכת שעות פרטניות
              </h2>
              <p className="text-xs text-slate-500">
                הוספת מורים, שליחת קישור אישי (Magic Link) אוטומטית בדוא&quot;ל או בוואטסאפ והגדרת שעות וכיתות
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={isSendingBulkEmails}
              onClick={handleBulkSendFromModal}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-800 shadow-sm transition hover:bg-indigo-100 disabled:opacity-50"
            >
              {isSendingBulkEmails ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
              ) : (
                <Send className="h-3.5 w-3.5 text-indigo-600" />
              )}
              <span>
                {isSendingBulkEmails
                  ? 'שולח לכל המורים...'
                  : 'שליחת קישורים לכל המורים'}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="סגור חלון"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Two-Column RTL Split */}
        <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12">
          {/* Right Pane (5 cols): Teachers List & Add Teacher */}
          <div className="border-b border-slate-200/80 bg-slate-50/60 p-5 lg:col-span-5 lg:border-b-0 lg:border-l">
            {/* Add New Teacher Card */}
            <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <UserPlus className="h-4 w-4 text-indigo-600" />
                <span>הוספת מורה חדש/ה</span>
              </h3>

              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-600">
                    שם מלא *
                  </label>
                  <input
                    type="text"
                    value={newTeacherName}
                    onChange={(e) => setNewTeacherName(e.target.value)}
                    placeholder="לדוגמה: שירה כהן"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600">
                    תחום דעת ראשי
                  </label>
                  <input
                    type="text"
                    value={newTeacherSubject}
                    onChange={(e) => setNewTeacherSubject(e.target.value)}
                    placeholder="לדוגמה: מתמטיקה"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600">
                    טלפון נייד (לוואטסאפ)
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={newTeacherPhone}
                    onChange={(e) => setNewTeacherPhone(e.target.value)}
                    placeholder="052-1234567"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-right text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600">
                    כתובת דוא&quot;ל
                  </label>
                  <input
                    type="email"
                    dir="ltr"
                    value={newTeacherEmail}
                    onChange={(e) => setNewTeacherEmail(e.target.value)}
                    placeholder="teacher@school.edu.il"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-right text-xs text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={isAddingTeacher}
                onClick={handleCreateTeacher}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>
                  {isAddingTeacher ? 'מוסיף מורה...' : 'הוסף מורה למערכת'}
                </span>
              </button>
            </div>

            {/* Existing Teachers List with Instant Search Input */}
            <div className="mt-5">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">
                  צוות המורים ({filteredTeachersList.length} מתוך {teachers.length})
                </span>
                <span className="text-[11px] text-slate-400">
                  שלח קישור אישי או לחץ לעריכת מערכת
                </span>
              </div>

              {/* Teacher Search Input inside Modal */}
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={teacherSearchQuery}
                  onChange={(e) => setTeacherSearchQuery(e.target.value)}
                  placeholder="חיפוש מורה..."
                  className="w-full rounded-xl border border-slate-200/90 bg-white/90 py-2 pr-9 pl-8 text-xs text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
                {teacherSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setTeacherSearchQuery('')}
                    className="absolute left-2.5 top-2 rounded-lg p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    aria-label="נקה חיפוש"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Sticky Bulk Action Toolbar */}
              <div className="sticky top-0 z-10 mb-2.5 flex items-center justify-between rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 shadow-xs backdrop-blur-xs">
                <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={
                      filteredTeachersList.length > 0 &&
                      filteredTeachersList.every((t) =>
                        selectedTeacherIds.includes(t.id)
                      )
                    }
                    onChange={handleToggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>בחר הכל ({filteredTeachersList.length})</span>
                </label>

                {selectedTeacherIds.length > 0 && (
                  <button
                    type="button"
                    disabled={isBulkDeleting}
                    onClick={handleConfirmBulkDelete}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-rose-700 disabled:opacity-50"
                  >
                    {isBulkDeleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    <span>מחק {selectedTeacherIds.length} נבחרים</span>
                  </button>
                )}
              </div>

              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pl-1">
                {filteredTeachersList.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-xs text-slate-400">
                    לא נמצאו מורים התואמים לחיפוש &quot;{teacherSearchQuery}&quot;
                  </div>
                ) : (
                  filteredTeachersList.map((teacher) => {
                    const isSelected = activeTeacher?.id === teacher.id;
                    const isEditingThis = editingTeacherId === teacher.id;
                    const isSendingThisEmail =
                      sendingEmailTeacherId === teacher.id;
                    const slotCount = templates.filter(
                      (tpl) => tpl.teacher_id === teacher.id
                    ).length;

                    return (
                      <div
                        key={teacher.id}
                        onClick={() => {
                          if (!isEditingThis) {
                            setSelectedTeacherId(teacher.id);
                            setEditingTemplateId(null);
                            setSlotSubject(teacher.subject);
                            setSlotClassName('');
                          }
                        }}
                        className={`cursor-pointer rounded-2xl border p-3.5 transition ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-50/70 shadow-sm ring-1 ring-indigo-500/30'
                            : 'border-slate-200/80 bg-white hover:border-indigo-200 hover:bg-slate-50'
                        }`}
                      >
                        {isEditingThis ? (
                          <div
                            className="space-y-2.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500">
                                  שם המורה
                                </label>
                                <input
                                  type="text"
                                  value={editTeacherName}
                                  onChange={(e) =>
                                    setEditTeacherName(e.target.value)
                                  }
                                  className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-500"
                                  placeholder="שם המורה"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500">
                                  תחום דעת
                                </label>
                                <input
                                  type="text"
                                  value={editTeacherSubject}
                                  onChange={(e) =>
                                    setEditTeacherSubject(e.target.value)
                                  }
                                  className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-500"
                                  placeholder="תחום דעת"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500">
                                  טלפון נייד
                                </label>
                                <input
                                  type="tel"
                                  dir="ltr"
                                  value={editTeacherPhone}
                                  onChange={(e) =>
                                    setEditTeacherPhone(e.target.value)
                                  }
                                  className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-right text-xs text-slate-800 outline-none focus:border-indigo-500"
                                  placeholder="052-0000000"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500">
                                  כתובת דוא&quot;ל
                                </label>
                                <input
                                  type="email"
                                  dir="ltr"
                                  value={editTeacherEmail}
                                  onChange={(e) =>
                                    setEditTeacherEmail(e.target.value)
                                  }
                                  className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-right text-xs text-slate-800 outline-none focus:border-indigo-500"
                                  placeholder="teacher@school.edu.il"
                                />
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setEditingTeacherId(null)}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
                              >
                                ביטול
                              </button>
                              <button
                                type="button"
                                disabled={isUpdatingTeacher}
                                onClick={handleConfirmEditTeacher}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                              >
                                <Check className="h-3.5 w-3.5" />
                                <span>שמור שינויים</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={selectedTeacherIds.includes(teacher.id)}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    handleToggleSelectTeacher(teacher.id);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                                  aria-label={`בחר את ${teacher.name}`}
                                />
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-bold text-slate-900">
                                      {teacher.name}
                                    </span>
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                      {teacher.subject}
                                    </span>
                                    <span className="text-[11px] font-medium text-indigo-700">
                                      ({slotCount} שעות)
                                    </span>
                                  </div>

                                {/* Contact badges */}
                                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                                  {teacher.phone ? (
                                    <span className="inline-flex items-center gap-1 text-slate-600">
                                      <Phone className="h-3 w-3 text-emerald-600" />
                                      <span dir="ltr">{teacher.phone}</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">
                                      ללא טלפון
                                    </span>
                                  )}
                                  {teacher.email ? (
                                    <span className="inline-flex items-center gap-1 text-slate-600">
                                      <AtSign className="h-3 w-3 text-sky-600" />
                                      <span
                                        dir="ltr"
                                        className="truncate max-w-[150px]"
                                      >
                                        {teacher.email}
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">
                                      ללא דוא&quot;ל
                                    </span>
                                  )}
                                </div>

                                {/* TASK 3: Last Login Indicator */}
                                <div className="mt-2">
                                  {formatLastLoginHebrew(teacher.last_login) ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-emerald-50/70 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                                      <Clock className="h-3 w-3 text-emerald-600 shrink-0" />
                                      <span>
                                        כניסה אחרונה:{' '}
                                        <span dir="ltr" className="font-semibold">
                                          {formatLastLoginHebrew(
                                            teacher.last_login
                                          )}
                                        </span>
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                                      <AlertCircle className="h-3 w-3 text-amber-600 shrink-0" />
                                      <span>טרם נכנס למערכת</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                              {/* Edit & Delete Buttons */}
                              <div
                                className="flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleStartEditTeacher(teacher)}
                                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                                  title="ערוך פרטי מורה ודרכי התקשרות"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTeacher(teacher)}
                                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                  title="מחק מורה"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Magic Link Sharing Bar: Copy, WhatsApp, Automated Email */}
                            <div
                              className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => handleCopyMagicLink(teacher)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                                title="העתק קישור אישי (Magic Link)"
                              >
                                <Copy className="h-3 w-3 text-slate-500" />
                                <span>העתק קישור</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSendWhatsApp(teacher)}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50/80 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 transition hover:bg-emerald-100"
                                title={
                                  teacher.phone
                                    ? `שלח קישור אישי בוואטסאפ אל ${teacher.phone}`
                                    : 'שלח קישור אישי בוואטסאפ'
                                }
                              >
                                <MessageCircle className="h-3 w-3 text-emerald-600" />
                                <span>וואטסאפ</span>
                              </button>

                              <button
                                type="button"
                                disabled={isSendingThisEmail}
                                onClick={() =>
                                  handleSendAutomatedEmail(teacher)
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50/80 px-2.5 py-1 text-[11px] font-semibold text-sky-800 transition hover:bg-sky-100 disabled:opacity-60"
                                title={
                                  teacher.email
                                    ? `שלח דוא"ל אוטומטי אל ${teacher.email}`
                                    : 'לא הוגדרה כתובת דוא"ל למורה זה'
                                }
                              >
                                {isSendingThisEmail ? (
                                  <Loader2 className="h-3 w-3 animate-spin text-sky-600" />
                                ) : (
                                  <Mail className="h-3 w-3 text-sky-600" />
                                )}
                                <span>
                                  {isSendingThisEmail ? 'שולח...' : 'שלח בדוא"ל'}
                                </span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Left Pane (7 cols): Schedule Templates for Selected Teacher */}
          <div className="p-6 lg:col-span-7">
            {!activeTeacher ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                בחר או הוסף מורה מהרשימה מימין כדי להגדיר מערכת שעות פרטניות
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      מערכת שעות פרטניות קבועה: {activeTeacher.name}
                    </h3>
                    <p className="text-xs text-slate-500">
                      הגדר את הימים, השעות והכיתות שבהם מתקיימות שעות פרטניות מדי שבוע
                    </p>
                  </div>
                  <span className="rounded-xl bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                    סה״כ {teacherTemplates.length} שעות שבועיות
                  </span>
                </div>

                {/* Add / Update Schedule Slot Box (Now with 5 columns including "כיתה") */}
                <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <CalendarPlus className="h-4 w-4 text-indigo-600" />
                      <span>
                        {editingTemplateId
                          ? 'עריכת משבצת שעה פרטנית'
                          : 'הוספת משבצת שעה פרטנית חדשה'}
                      </span>
                    </span>
                    {editingTemplateId && (
                      <button
                        type="button"
                        onClick={handleResetSlotForm}
                        className="text-xs font-medium text-slate-500 underline hover:text-slate-800"
                      >
                        בטל עריכה
                      </button>
                    )}
                  </div>

                  <div
                    className={`grid grid-cols-1 gap-3 ${
                      activeDaySlots.length > 0 && selectedPeriodOption !== 'custom'
                        ? 'sm:grid-cols-2 lg:grid-cols-4'
                        : activeDaySlots.length > 0
                        ? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'
                        : 'sm:grid-cols-2 lg:grid-cols-5'
                    }`}
                  >
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">
                        יום בשבוע
                      </label>
                      <select
                        value={slotDay}
                        onChange={(e) => handleSlotDayChange(Number(e.target.value))}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-indigo-500"
                      >
                        {[1, 2, 3, 4, 5, 6].map((d) => (
                          <option key={d} value={d}>
                            {HEBREW_DAYS[d]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {activeDaySlots.length > 0 && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-600">
                          שיעור (לוח זמנים)
                        </label>
                        <select
                          value={selectedPeriodOption}
                          onChange={(e) => handlePeriodSelectChange(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-indigo-500"
                        >
                          {activeDaySlots.map((ts) => (
                            <option key={ts.id} value={ts.id}>
                              שיעור {ts.period_number} ({normalizeTime(ts.start_time)} - {normalizeTime(ts.end_time)})
                            </option>
                          ))}
                          <option value="custom">שעה מותאמת אישית</option>
                        </select>
                      </div>
                    )}

                    {(activeDaySlots.length === 0 || selectedPeriodOption === 'custom') && (
                      <>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600">
                            שעת התחלה
                          </label>
                          <input
                            type="time"
                            value={slotTime}
                            onChange={(e) => setSlotTime(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-indigo-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600">
                            משך (בדקות)
                          </label>
                          <input
                            type="number"
                            min={15}
                            max={180}
                            step={5}
                            value={slotDuration}
                            onChange={(e) =>
                              setSlotDuration(Number(e.target.value))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-indigo-500"
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-600">
                        נושא פרטני
                      </label>
                      <input
                        type="text"
                        value={slotSubject}
                        onChange={(e) => setSlotSubject(e.target.value)}
                        placeholder="לדוגמה: תגבור אלגברה"
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600">
                        כיתה
                      </label>
                      <input
                        type="text"
                        value={slotClassName}
                        onChange={(e) => setSlotClassName(e.target.value)}
                        placeholder="לדוגמה: ט׳ 2"
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      disabled={isSavingSlot}
                      onClick={handleSaveSlot}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <CalendarPlus className="h-3.5 w-3.5" />
                      <span>
                        {isSavingSlot
                          ? 'שומר...'
                          : editingTemplateId
                          ? 'עדכן משבצת שעה'
                          : 'הוסף למערכת השעות'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Current Teacher's Schedule Slots List */}
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pl-1">
                  {teacherTemplates.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
                      טרם הוגדרו שעות פרטניות עבור {activeTeacher.name}. הוסף שעה
                      פרטנית באמצעות הטופס למעלה.
                    </div>
                  ) : (
                    teacherTemplates.map((tpl) => (
                      <div
                        key={tpl.id}
                        className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm transition hover:border-indigo-200"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-xl bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-800">
                            {HEBREW_DAYS[tpl.day_of_week]}
                          </span>
                          {tpl.period_number && (
                            <span className="rounded-xl bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-800">
                              שיעור {tpl.period_number}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            {normalizeTime(tpl.start_time)} ({tpl.duration_minutes}{' '}
                            דק׳)
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-900">
                            <BookOpen className="h-3.5 w-3.5 text-indigo-500" />
                            {tpl.subject}
                          </span>
                          {tpl.class_name && (
                            <span className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-800">
                              <GraduationCap className="h-3.5 w-3.5 text-sky-600" />
                              <span>כיתה: {tpl.class_name}</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEditSlot(tpl)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                            title="ערוך משבצת"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveSlot(tpl)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                            title="מחק משבצת"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-200/80 bg-white/80 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
          >
            סיום וסגירה
          </button>
        </div>
      </div>
    </div>
  );
}
