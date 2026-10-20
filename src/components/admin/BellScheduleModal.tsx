'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Calendar,
  Clock,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
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

export default function BellScheduleModal({
  isOpen,
  onClose,
  institutionCode,
  onShowToast,
  onSlotsUpdated,
}: BellScheduleModalProps) {
  const [slots, setSlots] = useState<InstitutionTimeSlot[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // New slot form state
  const [newPeriodNumber, setNewPeriodNumber] = useState<number>(1);
  const [newStartTime, setNewStartTime] = useState<string>('08:00');
  const [newEndTime, setNewEndTime] = useState<string>('08:45');
  const [newDayOfWeek, setNewDayOfWeek] = useState<string>('all');

  const fetchSlots = useCallback(async () => {
    if (!institutionCode) return;
    setIsLoading(true);
    try {
      const res = await getInstitutionTimeSlots(institutionCode);
      if (res.success && res.data) {
        setSlots(res.data);
        onSlotsUpdated?.(res.data);
        const nextPeriod =
          res.data.length > 0
            ? Math.max(...res.data.map((s) => s.period_number)) + 1
            : 1;
        setNewPeriodNumber(nextPeriod);
      } else if (res.error) {
        console.warn('[BellScheduleModal] Error fetching slots:', res.error);
      }
    } catch (err) {
      console.error('[BellScheduleModal] Error loading slots:', err);
    } finally {
      setIsLoading(false);
    }
  }, [institutionCode, onSlotsUpdated]);

  useEffect(() => {
    if (isOpen && institutionCode) {
      fetchSlots();
    }
  }, [isOpen, institutionCode, fetchSlots]);

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

    setIsSaving(true);
    const normalizedStart = normalizeTime(newStartTime);
    const normalizedEnd = normalizeTime(newEndTime);

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
        setIsSaving(false);
        return;
      }

      const updatedSlots = [...slots, res.data!].sort(
        (a, b) => a.period_number - b.period_number
      );
      setSlots(updatedSlots);
      onSlotsUpdated?.(updatedSlots);

      const dayDesc =
        newDayOfWeek === 'all' ? '' : ` (${getDayLabel(newDayOfWeek)})`;
      onShowToast(`שיעור ${newPeriodNumber}${dayDesc} נוסף ללוח זמני השיעורים!`);

      const nextNum = Number(newPeriodNumber) + 1;
      setNewPeriodNumber(nextNum);
    } catch (err: any) {
      console.error('[BellScheduleModal] Add error:', err);
      onShowToast(`שגיאה בשמירת שיעור בלוח הזמנים: ${err?.message || 'שגיאת תקשורת'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSlot = async (id: string, periodNumber: number) => {
    setDeletingId(id);
    try {
      const res = await deleteTimeSlot(id);
      if (!res.success) {
        onShowToast(`שגיאה במחיקת שיעור: ${res.error || 'נא לנסות שוב'}`);
        setDeletingId(null);
        return;
      }

      const updatedSlots = slots.filter((s) => s.id !== id);
      setSlots(updatedSlots);
      onSlotsUpdated?.(updatedSlots);
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
    setIsSaving(true);
    try {
      const res = await loadDefaultTimeSlots(institutionCode);
      if (!res.success || !res.data) {
        onShowToast(`שגיאה בטעינת לוח זמנים: ${res.error || 'נא לנסות שוב'}`);
        setIsSaving(false);
        return;
      }

      setSlots(res.data);
      onSlotsUpdated?.(res.data);
      onShowToast('לוח זמני שיעורים מומלץ נטען בהצלחה!');
      setNewPeriodNumber(7);
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 text-right">
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
            <h3 className="mb-3 text-xs font-bold text-indigo-900 flex items-center gap-1.5">
              <Plus className="h-4 w-4 text-indigo-600" />
              <span>הוספת שיעור ללוח הזמנים</span>
            </h3>

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
                  max="15"
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
                  onChange={(e) => setNewStartTime(e.target.value)}
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

              {slots.length === 0 && (
                <button
                  type="button"
                  onClick={handleLoadPresets}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>טען לוח זמנים מומלץ (שיעורים 1-6)</span>
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              </div>
            ) : slots.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-xs text-slate-500">
                <p className="font-semibold text-slate-700 mb-1">
                  טרם הוגדרו שיעורים בלוח הזמנים
                </p>
                <p className="text-slate-400 mb-3">
                  הוסף שיעורים באמצעות הטופס למעלה או טען לוח זמנים מומלץ
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
        <div className="flex items-center justify-end border-t border-slate-100 bg-slate-50/50 px-6 py-3">
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
