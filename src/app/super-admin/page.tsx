'use client';

import { useState, useCallback, useEffect } from 'react';
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
  Play,
  Ban,
  RotateCcw,
  Link2,
} from 'lucide-react';
import { registerNewSchoolAdmin } from '@/app/actions/admin-onboarding';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { AdminProfile } from '@/types/database';
import AdminLinkModal, {
  AdminDetails,
} from '@/components/super-admin/AdminLinkModal';

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

  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState<boolean>(true);
  const [togglingProfileId, setTogglingProfileId] = useState<string | null>(null);
  const [selectedAdminForLink, setSelectedAdminForLink] =
    useState<AdminDetails | null>(null);

  const fetchAdminProfiles = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setProfiles([
        {
          id: 'demo-admin-1',
          admin_name: 'ד״ר רונית שפירא',
          id_number: '012345678',
          school_name: 'תיכון ממלכתי רבין - תל אביב',
          institution_code: '440129',
          email: 'ronit@rabin-school.edu.il',
          is_active: true,
          created_at: new Date().toISOString(),
        },
        {
          id: 'demo-admin-2',
          admin_name: 'יובל כרמי',
          id_number: '023456789',
          school_name: 'עירוני א׳ חיפה',
          institution_code: '550130',
          email: 'yuval@haifa-school.edu.il',
          is_active: false,
          created_at: new Date().toISOString(),
        },
      ]);
      setIsLoadingProfiles(false);
      return;
    }

    try {
      setIsLoadingProfiles(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('admin_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching admin profiles:', error);
        showToast('שגיאה בטעינת רשימת המוסדות');
        return;
      }

      setProfiles((data || []) as AdminProfile[]);
    } catch (err) {
      console.error('Error in fetchAdminProfiles:', err);
    } finally {
      setIsLoadingProfiles(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchAdminProfiles();
  }, [fetchAdminProfiles]);

  const handleToggleActive = async (profile: AdminProfile) => {
    const currentActive = profile.is_active !== false;
    const newStatus = !currentActive;
    const actionText = newStatus ? 'הפעלת' : 'הקפאת';

    const confirmed = window.confirm(
      `האם אתה בטוח שברצונך לבצע ${actionText} המוסד "${profile.school_name || profile.institution_code}"?`
    );
    if (!confirmed) return;

    setTogglingProfileId(profile.id);

    if (isSupabaseConfigured()) {
      const supabase = createClient();
      const { error } = await supabase
        .from('admin_profiles')
        .update({ is_active: newStatus })
        .eq('id', profile.id);

      if (error) {
        console.error('Error updating admin profile is_active:', error);
        showToast(`שגיאה ב${actionText} המוסד`);
        setTogglingProfileId(null);
        return;
      }
    }

    // Refresh local React state
    setProfiles((prev) =>
      prev.map((p) => (p.id === profile.id ? { ...p, is_active: newStatus } : p))
    );

    showToast(
      newStatus
        ? `מוסד "${profile.school_name || profile.institution_code}" הופעל מחדש בהצלחה!`
        : `מוסד "${profile.school_name || profile.institution_code}" הוקפא בהצלחה!`
    );
    setTogglingProfileId(null);
  };

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

      // Refresh institutions table
      void fetchAdminProfiles();
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
    <div className="mx-auto max-w-4xl py-6 space-y-6">
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
              הקמת סביבה מאובטחת למוסד חינוכי חדש. המערכת תיצור חשבון מנהל, תגדיר הרשאות מתאימות, ותשלח אוטומטית דוא״ל ברוכים הבאים עם פרטי ההתחברות.
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
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedAdminForLink({
                      name: createdSummary.adminName,
                      school: createdSummary.schoolName,
                      email: createdSummary.email,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-50"
                  title="שלח קישור התחברות ישיר למנהל/ת"
                >
                  <Link2 className="h-3.5 w-3.5 text-indigo-600" />
                  <span>שלח קישור התחברות</span>
                </button>

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

      {/* Active Institutions Management (ניהול מוסדות פעילים) */}
      <div className="glass-modal overflow-hidden p-6 sm:p-8 text-right space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 shadow-sm">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">
                  ניהול מוסדות פעילים
                </h2>
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                  {profiles.length} מוסדות
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                צפייה במוסדות הרשומים, ניהול סטטוס פעילות והקפאת גישה (Soft Delete)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fetchAdminProfiles()}
            disabled={isLoadingProfiles}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-50"
            title="רענן רשימה"
          >
            <RotateCcw
              className={`h-3.5 w-3.5 text-slate-500 ${
                isLoadingProfiles ? 'animate-spin' : ''
              }`}
            />
            <span>רענן</span>
          </button>
        </div>

        {/* Table of Institutions */}
        {isLoadingProfiles ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            <span className="mr-2 text-xs font-semibold">טוען רשימת מוסדות...</span>
          </div>
        ) : profiles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-xs text-slate-400">
            טרם הוקמו מוסדות במערכת. השתמש בטופס שלמעלה להקמת סביבת בית ספר ראשונה.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/70 shadow-2xs">
            <table className="w-full text-right text-xs">
              <thead className="border-b border-slate-200/80 bg-slate-50/90 text-[11px] font-bold text-slate-600">
                <tr>
                  <th className="px-4 py-3">שם המוסד</th>
                  <th className="px-4 py-3">סמל מוסד</th>
                  <th className="px-4 py-3">מנהל/ת</th>
                  <th className="px-4 py-3">דוא&quot;ל</th>
                  <th className="px-4 py-3 text-center">סטטוס</th>
                  <th className="px-4 py-3 text-center">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {profiles.map((profile) => {
                  const isActive = profile.is_active !== false;
                  return (
                    <tr
                      key={profile.id}
                      className={`transition ${
                        isActive
                          ? 'hover:bg-slate-50/80 text-slate-900'
                          : 'bg-slate-100/70 text-slate-400 opacity-60'
                      }`}
                    >
                      <td className="px-4 py-3.5 font-bold">
                        <div className="flex items-center gap-2">
                          <Building2
                            className={`h-4 w-4 shrink-0 ${
                              isActive ? 'text-indigo-600' : 'text-slate-400'
                            }`}
                          />
                          <span
                            className={
                              isActive
                                ? 'text-slate-900'
                                : 'line-through text-slate-400'
                            }
                          >
                            {profile.school_name || 'מוסד חינוכי'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                          {profile.institution_code}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`font-semibold ${
                            isActive ? 'text-slate-800' : 'text-slate-400'
                          }`}
                        >
                          {profile.admin_name}
                        </span>
                        {profile.id_number && (
                          <span className="block text-[10px] text-slate-400">
                            ת&quot;ז: {profile.id_number}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-600">
                        <span dir="ltr">{profile.email || '—'}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            פעיל
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            מוקפא
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedAdminForLink({
                                name: profile.admin_name,
                                school: profile.school_name,
                                email: profile.email || '',
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/80 px-2.5 py-1.5 text-xs font-bold text-indigo-700 shadow-2xs transition hover:bg-indigo-100 hover:border-indigo-300"
                            title="שלח קישור התחברות ישיר למנהל/ת"
                          >
                            <Link2 className="h-3.5 w-3.5 text-indigo-600" />
                            <span>שלח קישור התחברות</span>
                          </button>

                          {isActive ? (
                            <button
                              type="button"
                              disabled={togglingProfileId === profile.id}
                              onClick={() => handleToggleActive(profile)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/80 px-2.5 py-1.5 text-xs font-bold text-rose-700 shadow-2xs transition hover:bg-rose-100 hover:border-rose-300 disabled:opacity-50"
                              title="הקפא מוסד"
                            >
                              {togglingProfileId === profile.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-600" />
                              ) : (
                                <Ban className="h-3.5 w-3.5 text-rose-600" />
                              )}
                              <span>הקפא מוסד</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={togglingProfileId === profile.id}
                              onClick={() => handleToggleActive(profile)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50/90 px-2.5 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs transition hover:bg-emerald-100 hover:border-emerald-400 disabled:opacity-50"
                              title="הפעל מחדש מוסד"
                            >
                              {togglingProfileId === profile.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                              ) : (
                                <Play className="h-3.5 w-3.5 text-emerald-600 fill-emerald-600" />
                              )}
                              <span>הפעל מחדש</span>
                            </button>
                          )}
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

      {/* Admin Login Link Modal */}
      <AdminLinkModal
        isOpen={selectedAdminForLink !== null}
        onClose={() => setSelectedAdminForLink(null)}
        admin={selectedAdminForLink}
        onShowToast={showToast}
      />
    </div>
  );
}

