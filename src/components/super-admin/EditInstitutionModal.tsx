'use client';

import { useState, useEffect } from 'react';
import {
  X,
  Building2,
  UserCheck,
  Hash,
  Mail,
  Save,
  Loader2,
  AlertCircle,
  Info,
} from 'lucide-react';
import { updateInstitutionProfile } from '@/app/actions/super-admin-actions';
import { AdminProfile } from '@/types/database';

interface EditInstitutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  institution: AdminProfile | null;
  onSuccess: () => void;
  onShowToast?: (msg: string) => void;
}

export default function EditInstitutionModal({
  isOpen,
  onClose,
  institution,
  onSuccess,
  onShowToast,
}: EditInstitutionModalProps) {
  const [schoolName, setSchoolName] = useState<string>('');
  const [adminName, setAdminName] = useState<string>('');
  const [institutionCode, setInstitutionCode] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (institution && isOpen) {
      setSchoolName(institution.school_name || '');
      setAdminName(institution.admin_name || '');
      setInstitutionCode(institution.institution_code || '');
      setErrorMessage(null);
      setIsSaving(false);
    }
  }, [institution, isOpen]);

  if (!isOpen || !institution) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedSchool = schoolName.trim();
    const trimmedAdmin = adminName.trim();
    const trimmedCode = institutionCode.trim();

    if (!trimmedSchool || !trimmedAdmin || !trimmedCode) {
      setErrorMessage('נא למלא את כל השדות (שם בית ספר, שם מנהל וסמל מוסד).');
      return;
    }

    setIsSaving(true);
    try {
      const res = await updateInstitutionProfile(institution.id, {
        school_name: trimmedSchool,
        admin_name: trimmedAdmin,
        institution_code: trimmedCode,
      });

      if (!res.success) {
        setErrorMessage(res.error || 'שגיאה בעדכון פרטי המוסד');
        return;
      }

      onShowToast?.(`פרטי המוסד "${trimmedSchool}" עודכנו בהצלחה!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[EditInstitutionModal] Error updating institution:', err);
      setErrorMessage(err?.message || 'שגיאה בלתי צפויה בשמירת השינויים.');
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
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 text-right">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/20">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                עריכת פרטי מוסד חינוכי
              </h2>
              <p className="text-xs text-slate-500">
                סמל מוסד: {institution.institution_code} • {institution.school_name}
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 flex items-start gap-2.5 text-rose-800 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <span className="font-semibold leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {/* School Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              שם בית הספר <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="לדוגמה: תיכון עירוני א' תל אביב"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          {/* Admin Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              שם מנהל/ת <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="לדוגמה: ד״ר רונית שפירא"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          {/* Institution Code */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              סמל מוסד <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                dir="ltr"
                value={institutionCode}
                onChange={(e) => setInstitutionCode(e.target.value)}
                placeholder="לדוגמה: 440129"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs font-mono text-slate-800 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 text-right"
              />
            </div>
          </div>

          {/* Email (Read-Only) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700">
                דוא״ל מנהל (חשבון כניסה)
              </label>
              <span className="text-[10px] text-slate-400 font-medium">
                (קריאה בלבד)
              </span>
            </div>
            <div className="relative">
              <input
                type="email"
                readOnly
                dir="ltr"
                value={institution.email || 'לא מוגדר'}
                className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-xs font-mono text-slate-500 cursor-not-allowed outline-none select-all"
              />
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-0.5">
              <Info className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>
                כתובת הדוא״ל משמשת לאימות כניסה (Auth) ואינה ניתנת לעריכה ישירה.
              </span>
            </div>
          </div>

          {/* Modal Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>שומר שינויים...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>שמור שינויים</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

