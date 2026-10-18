'use client';

import { useState, useEffect } from 'react';
import { X, Building2, Hash, Save } from 'lucide-react';
import { School } from '@/types/database';

interface SchoolSettingsModalProps {
  isOpen: boolean;
  school: School | null;
  isSaving: boolean;
  onClose: () => void;
  onSaveSettings: (name: string, semelMosad: string) => Promise<void>;
}

export default function SchoolSettingsModal({
  isOpen,
  school,
  isSaving,
  onClose,
  onSaveSettings,
}: SchoolSettingsModalProps) {
  const [name, setName] = useState('');
  const [semelMosad, setSemelMosad] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (school && isOpen) {
      setName(school.name || '');
      setSemelMosad(school.semel_mosad || '');
      setValidationError('');
    }
  }, [school, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      setValidationError('נא להזין את שם בית הספר');
      return;
    }
    if (!semelMosad.trim()) {
      setValidationError('נא להזין סמל מוסד');
      return;
    }
    setValidationError('');
    await onSaveSettings(name.trim(), semelMosad.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      {/* CRITICAL LESSON #2: No <form onSubmit>, only <div> and type="button" */}
      <div className="glass-modal w-full max-w-md overflow-hidden p-6 text-right animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between border-b border-slate-200/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                הגדרות מוסד חינוכי
              </h3>
              <p className="text-xs text-slate-500">
                עדכון פרטי בית הספר וסמל המוסד במשרד החינוך
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="סגור"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="school-name-input"
              className="block text-sm font-semibold text-slate-800"
            >
              שם בית הספר
            </label>
            <div className="relative mt-1.5">
              <input
                id="school-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="לדוגמה: תיכון ממלכתי רבין"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="semel-mosad-input"
              className="block text-sm font-semibold text-slate-800"
            >
              סמל מוסד
            </label>
            <div className="relative mt-1.5">
              <input
                id="semel-mosad-input"
                type="text"
                value={semelMosad}
                onChange={(e) => setSemelMosad(e.target.value)}
                placeholder="לדוגמה: 440129"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
              <Hash className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            </div>
          </div>

          {validationError && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {validationError}
            </p>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200/80 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            ביטול
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            <span>{isSaving ? 'שומר...' : 'שמור הגדרות'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

