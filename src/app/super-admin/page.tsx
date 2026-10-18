'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Building2,
  UserCheck,
  CreditCard,
  Hash,
  Mail,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { registerNewSchoolAdmin } from '@/app/actions/admin-onboarding';

interface CreatedAdminSummary {
  adminName: string;
  schoolName: string;
  institutionCode: string;
  email: string;
  password?: string;
  emailSent?: boolean;
}

export default function SuperAdminOnboardingPage() {
  const [adminName, setAdminName] = useState<string>('');
  const [idNumber, setIdNumber] = useState<string>('');
  const [schoolName, setSchoolName] = useState<string>('');
  const [institutionCode, setInstitutionCode] = useState<string>('');
  const [email, setEmail] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdSummary, setCreatedSummary] =
    useState<CreatedAdminSummary | null>(null);
  const [copiedCredentials, setCopiedCredentials] = useState<boolean>(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 5000);
  }, []);

  const handleCreateSchoolEnvironment = async () => {
    setErrorMessage(null);
    setCreatedSummary(null);

    if (
      !adminName.trim() ||
      !idNumber.trim() ||
      !schoolName.trim() ||
      !institutionCode.trim() ||
      !email.trim()
    ) {
      setErrorMessage(
        'נא למלא את כל השדות בטופס (שם מנהל, תעודת זהות, שם בית הספר, סמל מוסד ודוא"ל).'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const originUrl =
        typeof window !== 'undefined'
          ? window.location.origin
          : 'http://localhost:3000';

      const res = await registerNewSchoolAdmin({
        adminName,
        idNumber,
        schoolName,
        institutionCode,
        email,
        originUrl,
      });

      if (!res.success) {
        setErrorMessage(res.message);
        return;
      }

      showToast(res.message);
      setCreatedSummary({
        adminName: adminName.trim(),
        schoolName: schoolName.trim(),
        institutionCode: institutionCode.trim(),
        email: email.trim().toLowerCase(),
        password: res.generatedPassword,
        emailSent: res.emailSent,
      });

      // Reset form inputs on success
      setAdminName('');
      setIdNumber('');
      setSchoolName('');
      setInstitutionCode('');
      setEmail('');
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'שגיאה בלתי צפויה בהקמת סביבת בית הספר.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopySummary = async () => {
    if (!createdSummary) return;
    const loginUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/admin/login`
        : '/admin/login';
    const text = `פרטי גישה למערכת שעות פרטניות - ${createdSummary.schoolName} (סמל מוסד: ${createdSummary.institutionCode})
מנהל/ת: ${createdSummary.adminName}
שם משתמש (דוא"ל): ${createdSummary.email}
סיסמה ראשונית: ${createdSummary.password || ''}
קישור התחברות: ${loginUrl}`;

    await navigator.clipboard.writeText(text);
    setCopiedCredentials(true);
    setTimeout(() => setCopiedCredentials(false), 2500);
  };

  return (
    <div className="mx-auto max-w-2xl py-6 space-y-6">
      {/* Top Header / Navigation Bar with Back Button */}
      <div className="flex items-center justify-between">
        <Link
          href="/admin/login"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white/80 px-4 py-2 text-xs sm:text-sm font-bold text-slate-700 shadow-2xs backdrop-blur-md transition hover:border-indigo-300 hover:bg-white hover:text-indigo-700"
          title="חזרה למסך התחברות הנהלה"
        >
          <ArrowRight className="h-4 w-4" />
          <span>חזרה למסך התחברות</span>
        </Link>
      </div>

      {/* Floating Success Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 left-5 z-50 flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-950/95 px-4 py-3.5 text-sm font-medium text-white shadow-xl backdrop-blur-md">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Glassmorphism Registration Card */}
      <div className="glass-modal overflow-hidden p-6 sm:p-8 text-right">
        {/* Header */}
        <div className="flex items-start gap-4 border-b border-slate-200/80 pb-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-600 text-white shadow-lg shadow-indigo-600/25">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <div>
            <span className="inline-block rounded-full border border-indigo-200 bg-indigo-50 px-3 py-0.5 text-xs font-bold text-indigo-700">
              ממשק על (Super Admin) • Multi-Tenant SaaS
            </span>
            <h1 className="mt-1.5 text-2xl font-bold text-slate-900">
              הקמת סביבת בית ספר ורישום מנהל חדש
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">
              יצירה אוטומטית של חשבון מנהל ב-Supabase Auth, שיוך לטבלת{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
                admin_profiles
              </code>{' '}
              ושליחת מייל ברוכים הבאים עם סיסמה מאובטחת
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-xs sm:text-sm font-medium text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Fields (using div wrapper and type="button" per project rules) */}
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Admin Name (שם מנהל) */}
            <div>
              <label
                htmlFor="super-admin-name"
                className="block text-xs font-bold text-slate-700"
              >
                שם מנהל/ת <span className="text-rose-500">*</span>
              </label>
              <div className="relative mt-1.5">
                <UserCheck className="pointer-events-none absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  id="super-admin-name"
                  type="text"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="לדוגמה: ד״ר רונית שפירא"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-10 pl-3.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            {/* ID Number (תעודת זהות) */}
            <div>
              <label
                htmlFor="super-admin-id-number"
                className="block text-xs font-bold text-slate-700"
              >
                תעודת זהות <span className="text-rose-500">*</span>
              </label>
              <div className="relative mt-1.5">
                <CreditCard className="pointer-events-none absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  id="super-admin-id-number"
                  type="text"
                  dir="ltr"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  placeholder="012345678"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-10 pl-3.5 text-right text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            {/* School Name (שם בית הספר) */}
            <div>
              <label
                htmlFor="super-school-name"
                className="block text-xs font-bold text-slate-700"
              >
                שם בית הספר <span className="text-rose-500">*</span>
              </label>
              <div className="relative mt-1.5">
                <Building2 className="pointer-events-none absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  id="super-school-name"
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="לדוגמה: תיכון ממלכתי בגין"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-10 pl-3.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            {/* Institution Code (סמל מוסד) */}
            <div>
              <label
                htmlFor="super-institution-code"
                className="block text-xs font-bold text-slate-700"
              >
                סמל מוסד <span className="text-rose-500">*</span>
              </label>
              <div className="relative mt-1.5">
                <Hash className="pointer-events-none absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  id="super-institution-code"
                  type="text"
                  dir="ltr"
                  value={institutionCode}
                  onChange={(e) => setInstitutionCode(e.target.value)}
                  placeholder="440129"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-10 pl-3.5 text-right text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>
          </div>

          {/* Email (דוא"ל) */}
          <div>
            <label
              htmlFor="super-admin-email"
              className="block text-xs font-bold text-slate-700"
            >
              דוא&quot;ל המנהל/ת (ישמש כשם המשתמש ולקבלת פרטי ההתחברות){' '}
              <span className="text-rose-500">*</span>
            </label>
            <div className="relative mt-1.5">
              <Mail className="pointer-events-none absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                id="super-admin-email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="principal@school.edu.il"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-10 pl-3.5 text-right text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          {/* Submit Action Button */}
          <div className="pt-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleCreateSchoolEnvironment}
              className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-l from-indigo-600 to-sky-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/25 transition hover:from-indigo-700 hover:to-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
              <span>
                {isSubmitting
                  ? 'מקים סביבת בית ספר ושולח מייל...'
                  : 'הקם סביבת בית ספר ושלח פרטי התחברות'}
              </span>
            </button>
          </div>
        </div>

        {/* Newly Created School Credentials Summary Card */}
        {createdSummary && (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 text-right">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-emerald-900">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <h3 className="text-sm font-bold">
                  סביבת המוסד &quot;{createdSummary.schoolName}&quot; הוקמה בהצלחה!
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCopySummary}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-100"
              >
                {copiedCredentials ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-emerald-600" />
                )}
                <span>
                  {copiedCredentials ? 'הפרטים הועתקו!' : 'העתק פרטי גישה'}
                </span>
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl bg-white/90 p-3.5 text-xs text-slate-700 sm:grid-cols-2">
              <div>
                <span className="text-slate-400">מנהל/ת: </span>
                <span className="font-bold text-slate-900">
                  {createdSummary.adminName}
                </span>
              </div>
              <div>
                <span className="text-slate-400">סמל מוסד: </span>
                <span className="font-bold text-slate-900">
                  {createdSummary.institutionCode}
                </span>
              </div>
              <div>
                <span className="text-slate-400">שם משתמש (דוא&quot;ל): </span>
                <span
                  dir="ltr"
                  className="font-mono font-bold text-slate-900"
                >
                  {createdSummary.email}
                </span>
              </div>
              <div>
                <span className="text-slate-400">סיסמה שנוצרה: </span>
                <span
                  dir="ltr"
                  className="rounded bg-indigo-50 px-2 py-0.5 font-mono font-bold text-indigo-700"
                >
                  {createdSummary.password}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

