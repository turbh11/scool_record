'use client';

import { useState } from 'react';
import {
  X,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (msg: string) => void;
}

export default function ChangePasswordModal({
  isOpen,
  onClose,
  onShowToast,
}: ChangePasswordModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    setNewPassword('');
    setConfirmPassword('');
    setValidationError(null);
    onClose();
  };

  const handleSubmit = async () => {
    setValidationError(null);

    const trimmedNew = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedNew || !trimmedConfirm) {
      setValidationError('נא למלא את שני שדות הסיסמה.');
      return;
    }

    if (trimmedNew.length < 6) {
      setValidationError('הסיסמה חייבת להכיל לפחות 6 תווים.');
      return;
    }

    if (trimmedNew !== trimmedConfirm) {
      setValidationError('הסיסמאות אינן תואמות. נא להזין סיסמה זהה בשני השדות.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        const { error } = await supabase.auth.updateUser({
          password: trimmedNew,
        });

        if (error) {
          const errMsg = error.message || 'שגיאה בעדכון הסיסמה במסד הנתונים.';
          setValidationError(errMsg);
          onShowToast(`שגיאה בעדכון הסיסמה: ${errMsg}`);
          return;
        }
      }

      onShowToast('הסיסמה עודכנה בהצלחה');
      handleClose();
    } catch (err: any) {
      const errMsg = err?.message || 'אירעה שגיאה בלתי צפויה בעדכון הסיסמה.';
      setValidationError(errMsg);
      onShowToast(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      {/* CRITICAL LESSON #2: No <form onSubmit>, only <div> and type="button" */}
      <div className="glass-modal w-full max-w-md overflow-hidden p-6 text-right animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-slate-200/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 shadow-sm">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">החלפת סיסמה</h3>
              <p className="text-xs text-slate-500">
                עדכון מאובטח של סיסמת הכניסה לחשבון הניהול
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="סגור"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Validation / API Error Alert */}
        {validationError && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 p-3.5 text-xs font-medium text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Form Fields */}
        <div className="mt-5 space-y-4">
          {/* New Password */}
          <div>
            <label
              htmlFor="change-password-new"
              className="block text-xs font-bold text-slate-700"
            >
              סיסמה חדשה <span className="text-rose-500">*</span>
            </label>
            <div className="relative mt-1.5">
              <input
                id="change-password-new"
                type={showNewPassword ? 'text' : 'password'}
                dir="ltr"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="לפחות 6 תווים..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-3.5 pl-10 text-right text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600"
                aria-label={showNewPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
              >
                {showNewPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div>
            <label
              htmlFor="change-password-confirm"
              className="block text-xs font-bold text-slate-700"
            >
              אימות סיסמה חדשה <span className="text-rose-500">*</span>
            </label>
            <div className="relative mt-1.5">
              <input
                id="change-password-confirm"
                type={showConfirmPassword ? 'text' : 'password'}
                dir="ltr"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="הזן שוב את הסיסמה החדשה..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-3.5 pl-10 text-right text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600"
                aria-label={showConfirmPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-slate-200/80 pt-4">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-2xs transition hover:bg-slate-50 disabled:opacity-50"
          >
            ביטול
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Lock className="h-4 w-4" />
            )}
            <span>{isSubmitting ? 'מעדכן סיסמה...' : 'עדכן סיסמה'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

