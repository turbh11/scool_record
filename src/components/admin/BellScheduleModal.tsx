'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X,
  Calendar,
  Clock,
  Plus,
  Trash2,
  Edit2,
  Check,
  RotateCcw,
  Loader2,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { InstitutionTimeSlot } from '@/types/database';
import { normalizeTime } from '@/lib/dates';
import {
  getInstitutionTimeSlots,
  addTimeSlot,
  deleteTimeSlot,
  loadDefaultTimeSlots,
} from '@/app/actions/schedule-actions';

interface BellScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  institutionCode: string | null;
  onShowToast: (msg: string) => void;
  initialSlots?: InstitutionTimeSlot[];
  onSlotsUpdated?: (slots: InstitutionTimeSlot[]) => void;
}

export const DAY_OPTIONS = [
  { value: 'all', label: 'כל הימים (רגיל)' },
  { value: '1', label: 'יום ראשון' },
  { value: '2', label: 'יום שני' },
  { value: '3', label: 'יום שלישי' },
  { value: '4', label: 'יום רביעי' },
  { value: '5', label: 'יום חמישי' },
  { value: '6', label: 'יום שישי' },
];

export function getDayLabel(dayValue?: string | null): string {
  if (!dayValue || dayValue === 'all') return 'כל הימים';
  const found = DAY_OPTIONS.find((o) => o.value === dayValue);
  return found ? found.label : dayValue;
}

function addMinutesToTime(timeStr: string, minutes: number): string {
  const [h, m] = normalizeTime(timeStr).split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return '09:30';
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

function isEndTimeAfterStartTime(start: string, end: string): boolean {
  const [sh, sm] = normalizeTime(start).split(':').map(Number);
  const [eh, em] = normalizeTime(end).split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return false;
  return eh * 60 + em > sh * 60 + sm;
}

export default function BellScheduleModal({
  isOpen,
  onClose,
  institutionCode,
  onShowToast,
  initialSlots = [],
  onSlotsUpdated,
}: BellScheduleModalProps) {
  const [slots, setSlots] = useState<InstitutionTimeSlot[]>(initialSlots);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // New slot form state
  const [newPeriodNumber, setNewPeriodNumber] = useState<number>(1);
  const [newStartTime, setNewStartTime] = useState<string>('08:00');
  const [newEndTime, setNewEndTime] = useState<string>('08:45');
  const [newDayOfWeek, setNewDayOfWeek] = useState<string>('all');

  // Inline editing state
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editPeriodNumber, setEditPeriodNumber] = useState<number>(1);
  const [editDayOfWeek, setEditDayOfWeek] = useState<string>('all');
  const [editStartTime, setEditStartTime] = useState<string>('08:00');
  const [editEndTime, setEditEndTime] = useState<string>('08:45');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  // Use a ref for onSlotsUpdated to completely prevent infinite re-render loops
  const onSlotsUpdatedRef = useRef(onSlotsUpdated);
  useEffect(() => {
    onSlotsUpdatedRef.current = onSlotsUpdated;
  }, [onSlotsUpdated]);

  const updateDefaultsFromSlots = (currentSlots: InstitutionTimeSlot[]) => {
    if (!currentSlots || currentSlots.length === 0) {
      setNewPeriodNumber(1);
      setNewStartTime('08:00');
      setNewEndTime('08:45');
      return;
    }
    const maxPeriod = Math.max(...currentSlots.map((s) => s.period_number));
    setNewPeriodNumber(maxPeriod + 1);

    const sorted = [...currentSlots].sort((a, b) => a.period_number - b.period_number);
    const last = sorted[sorted.length - 1];
    if (last?.end_time) {
      const normalizedLastEnd = normalizeTime(last.end_time);
      setNewStartTime(normalizedLastEnd);
      setNewEndTime(addMinutesToTime(normalizedLastEnd, 45));
    }
  };

  // Fetch slots strictly when modal opens or institutionCode changes
  useEffect(() => {
    if (!isOpen || !institutionCode) return;

    let isMounted = true;

    async function loadData() {
      // If we don't already have slots, show loading spinner
      if (slots.length === 0) {
        setIsLoading(true);
      }
      try {
        const res = await getInstitutionTimeSlots(institutionCode!);
        if (isMounted && res.success && res.data) {
          setSlots(res.data);
          updateDefaultsFromSlots(res.data);
          onSlotsUpdatedRef.current?.(res.data);
        }
      } catch (err) {
        console.error('[BellScheduleModal] Error loading slots:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, institutionCode]); // Strictly only on isOpen & institutionCode!

  if (!isOpen) return null;

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!institutionCode) {
      onShowToast('שגיאה: קוד מוסד חסר');
      return;
    }
    if (!newStartTime || !newEndTime) {
      onShowToast('נא למלא שעת התחלה ושעת סיום');
      return;
    }

    const normalizedStart = normalizeTime(newStartTime);
    const normalizedEnd = normalizeTime(newEndTime);

    // Chronological validation: End time must be strictly after start time
    if (!isEndTimeAfterStartTime(normalizedStart, normalizedEnd)) {
      onShowToast('שעת הסיום חייבת להיות מאוחרת יותר משעת ההתחלה');
      return;
    }

    setIsSaving(true);

    try {
      const res = await addTimeSlot({
        institution_code: institutionCode,
        period_number: Number(newPeriodNumber),
        start_time: normalizedStart,
        end_time: normalizedEnd,
        day_of_week: newDayOfWeek,
      });

      if (!res.success || !res.data) {
        onShowToast(`שגיאה בהוספת שיעור: ${res.error || 'נא לנסות שוב'}`);
        return;
      }

      const updatedSlots = [...slots.filter((s) => s.id !== res.data!.id), res.data!].sort(
        (a, b) => a.period_number - b.period_number
      );
      setSlots(updatedSlots);
      updateDefaultsFromSlots(updatedSlots);
      onSlotsUpdatedRef.current?.(updatedSlots);

      const dayDesc =
        newDayOfWeek === 'all' ? '' : ` (${getDayLabel(newDayOfWeek)})`;
      onShowToast(`שיעור ${newPeriodNumber}${dayDesc} נוסף ללוח זמני השיעורים!`);
    } catch (err: any) {
      console.error('[BellScheduleModal] Add error:', err);
      onShowToast(`שגיאה בשמירת שיעור: ${err?.message || 'שגיאת תקשורת'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartEdit = (slot: InstitutionTimeSlot) => {
    setEditingSlotId(slot.id);
    setEditPeriodNumber(slot.period_number);
    setEditDayOfWeek(slot.day_of_week || 'all');
    setEditStartTime(normalizeTime(slot.start_time));
    setEditEndTime(normalizeTime(slot.end_time));
  };

  const handleCancelEdit = () => {
    setEditingSlotId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingSlotId || !institutionCode) return;
    if (!editStartTime || !editEndTime) {
      onShowToast('נא למלא שעת התחלה ושעת סיום');
      return;
    }

    const normalizedStart = normalizeTime(editStartTime);
    const normalizedEnd = normalizeTime(editEndTime);

    // Chronological validation
    if (!isEndTimeAfterStartTime(normalizedStart, normalizedEnd)) {
      onShowToast('שעת הסיום חייבת להיות מאוחרת יותר משעת ההתחלה');
      return;
    }

    setIsUpdating(true);
    try {
      const res = await addTimeSlot({
        id: editingSlotId,
        institution_code: institutionCode,
        period_number: Number(editPeriodNumber),
        start_time: normalizedStart,
        end_time: normalizedEnd,
        day_of_week: editDayOfWeek,
      });

      if (!res.success || !res.data) {
        onShowToast(`שגיאה בעדכון שיעור: ${res.error || 'שגיאת שרת'}`);
        return;
      }

      const updatedSlots = slots
        .map((s) => (s.id === editingSlotId ? res.data! : s))
        .sort((a, b) => a.period_number - b.period_number);

      setSlots(updatedSlots);
      onSlotsUpdatedRef.current?.(updatedSlots);
      setEditingSlotId(null);
      onShowToast(`שיעור ${editPeriodNumber} עודכן בהצלחה!`);
    } catch (err: any) {
      console.error('[BellScheduleModal] Update error:', err);
      onShowToast('שגיאה בעדכון השיעור');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteSlot = async (id: string, periodNumber: number) => {
    setDeletingId(id);
    try {
      const res = await deleteTimeSlot(id);
      if (!res.success) {
        onShowToast(`שגיאה במחיקת שיעור: ${res.error || 'נא לנסות שוב'}`);
        return;
      }

      const updatedSlots = slots.filter((s) => s.id !== id);
      setSlots(updatedSlots);
      updateDefaultsFromSlots(updatedSlots);
      onSlotsUpdatedRef.current?.(updatedSlots);
      onShowToast(`שיעור ${periodNumber} הוסר מלוח זמני השיעורים`);
    } catch (err: any) {
      console.error('[BellScheduleModal] Delete error:', err);
      onShowToast(`שגיאה במחיקת השיעור: ${err?.message || 'שגיאת תקשורת'}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleLoadPresets = async () => {
    if (!institutionCode) return;

    if (slots.length > 0) {
      const confirmed = window.confirm(
        'האם לטעון את לוח הזמנים המומלץ (שיעורים 1-6)? פעולה זו תעדכן את שעות ברירת המחדל עבור מוסד זה.'
      );
      if (!confirmed) return;
    }

    setIsSaving(true);
    try {
      const res = await loadDefaultTimeSlots(institutionCode);
      if (!res.success || !res.data) {
        onShowToast(`שגיאה בטעינת לוח זמנים: ${res.error || 'נא לנסות שוב'}`);
        return;
      }

      setSlots(res.data);
      updateDefaultsFromSlots(res.data);
      onSlotsUpdatedRef.current?.(res.data);
      onShowToast('לוח זמני שיעורים מומלץ נטען בהצלחה!');
    } catch (err: any) {
      console.error('[BellScheduleModal] Load presets error:', err);
      onShowToast(`שגיאה בטעינת לוח זמנים: ${err?.message || 'שגיאת תקשורת'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 text-right">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/20">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                לוח זמני שיעורים (שעות קבועות)
              </h2>
              <p className="text-xs text-slate-500">
                הגדרת זמני השיעורים הקבועים עבור מוסד {institutionCode || ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[75vh] overflow-y-auto p-6 space-y-6">
          {/* Add Period Form */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                <Plus className="h-4 w-4 text-indigo-600" />
                <span>הוספת שיעור חדש למוסד</span>
              </h3>
              <button
                type="button"
                onClick={handleLoadPresets}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition disabled:opacity-50"
                title="טען או שחזר שיעורים 1-6 מומלצים"
              >
                <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                <span>טען לוח זמנים מומלץ (שיעורים 1-6)</span>
              </button>
            </div>

            <form
              onSubmit={handleAddSlot}
              className="grid grid-cols-1 gap-3 sm:grid-cols-5 items-end"
            >
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  מספר שיעור *
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={newPeriodNumber}
                  onChange={(e) => setNewPeriodNumber(Number(e.target.value))}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  יום בשבוע
                </label>
                <select
                  value={newDayOfWeek}
                  onChange={(e) => setNewDayOfWeek(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500"
                >
                  {DAY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  שעת התחלה *
                </label>
                <input
                  type="time"
                  value={newStartTime}
                  onChange={(e) => {
                    setNewStartTime(e.target.value);
                    setNewEndTime(addMinutesToTime(e.target.value, 45));
                  }}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  שעת סיום *
                </label>
                <input
                  type="time"
                  value={newEndTime}
                  onChange={(e) => setNewEndTime(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  <span>הוסף שיעור</span>
                </button>
              </div>
            </form>
          </div>

          {/* Slots List */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-slate-500" />
                <span>שיעורים מוגדרים ({slots.length})</span>
              </h3>
            </div>

            {isLoading && slots.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              </div>
            ) : slots.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-xs text-slate-500">
                <p className="font-semibold text-slate-700 mb-1">
                  טרם הוגדרו שיעורים בלוח הזמנים למוסד זה
                </p>
                <p className="text-slate-400 mb-3">
                  הוסף שיעורים מותאמים אישית באמצעות הטופס למעלה או טען לוח זמנים מומלץ
                </p>
                <button
                  type="button"
                  onClick={handleLoadPresets}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition"
                >
                  <Sparkles className="h-4 w-4 text-indigo-600" />
                  <span>טען לוח זמנים מומלץ כעת</span>
                </button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">שיעור</th>
                      <th className="px-4 py-2.5">יום</th>
                      <th className="px-4 py-2.5">שעת התחלה</th>
                      <th className="px-4 py-2.5">שעת סיום</th>
                      <th className="px-4 py-2.5">משך</th>
                      <th className="px-4 py-2.5 text-left">פעולות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {slots.map((slot) => {
                      const isEditing = editingSlotId === slot.id;

                      if (isEditing) {
                        return (
                          <tr key={slot.id} className="bg-indigo-50/60 transition">
                            <td className="px-3 py-2 font-bold text-slate-900">
                              <input
                                type="number"
                                min="1"
                                max="20"
                                value={editPeriodNumber}
                                onChange={(e) => setEditPeriodNumber(Number(e.target.value))}
                                className="w-16 rounded-lg border border-indigo-300 bg-white px-2 py-1 text-xs font-bold text-slate-900 outline-none"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={editDayOfWeek}
                                onChange={(e) => setEditDayOfWeek(e.target.value)}
                                className="rounded-lg border border-indigo-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none"
                              >
                                {DAY_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="time"
                                value={editStartTime}
                                onChange={(e) => setEditStartTime(e.target.value)}
                                className="rounded-lg border border-indigo-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="time"
                                value={editEndTime}
                                onChange={(e) => setEditEndTime(e.target.value)}
                                className="rounded-lg border border-indigo-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none"
                              />
                            </td>
                            <td className="px-3 py-2 text-slate-500">
                              {(() => {
                                const [sh, sm] = editStartTime.split(':').map(Number);
                                const [eh, em] = editEndTime.split(':').map(Number);
                                const diff = eh * 60 + em - (sh * 60 + sm);
                                return diff > 0 ? `${diff} דק׳` : '-';
                              })()}
                            </td>
                            <td className="px-3 py-2 text-left">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={handleSaveEdit}
                                  className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700 transition"
                                  title="שמור שינויים"
                                >
                                  {isUpdating ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEdit}
                                  className="rounded-lg bg-slate-200 p-1.5 text-slate-600 hover:bg-slate-300 transition"
                                  title="בטל עריכה"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      const start = normalizeTime(slot.start_time);
                      const end = normalizeTime(slot.end_time);
                      const [sh, sm] = start.split(':').map(Number);
                      const [eh, em] = end.split(':').map(Number);
                      const diffMinutes =
                        !isNaN(sh) && !isNaN(eh)
                          ? eh * 60 + em - (sh * 60 + sm)
                          : 45;

                      const isSpecialDay =
                        slot.day_of_week && slot.day_of_week !== 'all';

                      return (
                        <tr
                          key={slot.id}
                          className="hover:bg-slate-50/70 transition"
                        >
                          <td className="px-4 py-3 font-bold text-slate-900">
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 ring-1 ring-indigo-200/50">
                              שיעור {slot.period_number}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {isSpecialDay ? (
                              <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                                {getDayLabel(slot.day_of_week)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                כל הימים
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-700 font-medium">
                            {start}
                          </td>
                          <td className="px-4 py-3 text-slate-700 font-medium">
                            {end}
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {diffMinutes > 0 ? `${diffMinutes} דקות` : '-'}
                          </td>
                          <td className="px-4 py-3 text-left">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(slot)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition"
                                title="ערוך שיעור זה"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                disabled={deletingId === slot.id}
                                onClick={() =>
                                  handleDeleteSlot(slot.id, slot.period_number)
                                }
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition disabled:opacity-50"
                                title="מחק שיעור זה"
                              >
                                {deletingId === slot.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-rose-500" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-6 py-3">
          <p className="text-[11px] text-slate-400">
            כל שיעור מוגדר ייחודית עבור מוסד {institutionCode} ומסונכרן מיידית לשיבוצי המורים.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-200 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-300"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
