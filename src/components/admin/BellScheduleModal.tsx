'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Bell,
  Clock,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { InstitutionTimeSlot } from '@/types/database';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { normalizeTime } from '@/lib/dates';

interface BellScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  institutionCode: string | null;
  onShowToast: (msg: string) => void;
}

const DEFAULT_BELL_PRESETS = [
  { period_number: 1, start_time: '08:00', end_time: '08:45' },
  { period_number: 2, start_time: '08:50', end_time: '09:35' },
  { period_number: 3, start_time: '09:50', end_time: '10:35' },
  { period_number: 4, start_time: '10:40', end_time: '11:25' },
  { period_number: 5, start_time: '11:35', end_time: '12:20' },
  { period_number: 6, start_time: '12:25', end_time: '13:10' },
];

export default function BellScheduleModal({
  isOpen,
  onClose,
  institutionCode,
  onShowToast,
}: BellScheduleModalProps) {
  const [slots, setSlots] = useState<InstitutionTimeSlot[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // New slot form state
  const [newPeriodNumber, setNewPeriodNumber] = useState<number>(1);
  const [newStartTime, setNewStartTime] = useState<string>('08:00');
  const [newEndTime, setNewEndTime] = useState<string>('08:45');

  const fetchSlots = useCallback(async () => {
    if (!institutionCode) return;
    setIsLoading(true);
    try {
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('institution_time_slots')
          .select('*')
          .eq('institution_code', institutionCode)
          .order('period_number', { ascending: true });

        if (error) {
          console.warn('[BellScheduleModal] Could not fetch time slots from Supabase:', error);
          // If table does not exist or error, keep local state
        } else if (data) {
          setSlots(data as InstitutionTimeSlot[]);
          const nextPeriod = data.length > 0
            ? Math.max(...data.map((s) => s.period_number)) + 1
            : 1;
          setNewPeriodNumber(nextPeriod);
        }
      }
    } catch (err) {
      console.error('[BellScheduleModal] Error loading slots:', err);
    } finally {
      setIsLoading(false);
    }
  }, [institutionCode]);

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
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('institution_time_slots')
          .insert({
            institution_code: institutionCode,
            period_number: Number(newPeriodNumber),
            start_time: normalizedStart,
            end_time: normalizedEnd,
          })
          .select('*')
          .maybeSingle();

        if (error) {
          console.error('[BellScheduleModal] Insert error:', error);
          onShowToast(`שגיאה בהוספת שיעור: ${error.message}`);
          setIsSaving(false);
          return;
        }

        if (data) {
          setSlots((prev) =>
            [...prev, data as InstitutionTimeSlot].sort(
              (a, b) => a.period_number - b.period_number
            )
          );
        }
      } else {
        // Demo / offline fallback
        const demoSlot: InstitutionTimeSlot = {
          id: `slot_${Date.now()}`,
          institution_code: institutionCode,
          period_number: Number(newPeriodNumber),
          start_time: normalizedStart,
          end_time: normalizedEnd,
        };
        setSlots((prev) =>
          [...prev, demoSlot].sort((a, b) => a.period_number - b.period_number)
        );
      }

      onShowToast(`שיעור ${newPeriodNumber} נוסף למערכת הצלצולים!`);
      const nextNum = Number(newPeriodNumber) + 1;
      setNewPeriodNumber(nextNum);
    } catch (err: any) {
      console.error('[BellScheduleModal] Add error:', err);
      onShowToast('שגיאה בשמירת שיעור במערכת');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSlot = async (id: string, periodNumber: number) => {
    setDeletingId(id);
    try {
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        const { error } = await supabase
          .from('institution_time_slots')
          .delete()
          .eq('id', id);

        if (error) {
          console.error('[BellScheduleModal] Delete error:', error);
          onShowToast(`שגיאה במחיקת שיעור: ${error.message}`);
          setDeletingId(null);
          return;
        }
      }

      setSlots((prev) => prev.filter((s) => s.id !== id));
      onShowToast(`שיעור ${periodNumber} הוסר ממערכת הצלצולים`);
    } catch (err: any) {
      console.error('[BellScheduleModal] Delete error:', err);
      onShowToast('שגיאה במחיקת השיעור');
    } finally {
      setDeletingId(null);
    }
  };

  const handleLoadPresets = async () => {
    if (!institutionCode) return;
    setIsSaving(true);
    try {
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        const rowsToInsert = DEFAULT_BELL_PRESETS.map((p) => ({
          institution_code: institutionCode,
          period_number: p.period_number,
          start_time: p.start_time,
          end_time: p.end_time,
        }));

        const { data, error } = await supabase
          .from('institution_time_slots')
          .insert(rowsToInsert)
          .select('*');

        if (error) {
          console.error('[BellScheduleModal] Presets insert error:', error);
          onShowToast(`שגיאה בטעינת לוח זמנים: ${error.message}`);
          setIsSaving(false);
          return;
        }

        if (data) {
          setSlots(data as InstitutionTimeSlot[]);
        }
      } else {
        const demoSlots = DEFAULT_BELL_PRESETS.map((p, idx) => ({
          id: `preset_${idx}`,
          institution_code: institutionCode,
          period_number: p.period_number,
          start_time: p.start_time,
          end_time: p.end_time,
        }));
        setSlots(demoSlots);
      }

      onShowToast('לוח זמנים מומלץ נטען בהצלחה!');
      setNewPeriodNumber(7);
    } catch (err: any) {
      console.error('[BellScheduleModal] Load presets error:', err);
      onShowToast('שגיאה בטעינת לוח זמנים');
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
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/20">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                מערכת צלצולים ושעות שיעורים
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
              <span>הוספת שיעור למערכת הצלצולים</span>
            </h3>

            <form
              onSubmit={handleAddSlot}
              className="grid grid-cols-1 gap-3 sm:grid-cols-4 items-end"
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
                  טרם הוגדרו שיעורים במערכת הצלצולים
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

