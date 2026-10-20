'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ShieldCheck,
  Mail,
  Lock,
  LogIn,
  Wand2,
  KeyRound,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

function AdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isResetModeFromQuery = searchParams.get('reset') === '1';

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState<boolean>(
    isResetModeFromQuery
  );

  const [loadingAction, setLoadingAction] = useState<
    'password' | 'magic' | 'forgot' | 'update_password' | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isAuthenticatingFromLink, setIsAuthenticatingFromLink] =
    useState<boolean>(() => {
      if (typeof window !== 'undefined') {
        const hash = window.location.hash || '';
        return hash.includes('access_token') || hash.includes('type=magiclink');
      }
      return false;
    });

  useEffect(() => {
    if (isResetModeFromQuery) {
      setIsRecoveryMode(true);
    }
    if (searchParams.get('error') === 'account_frozen') {
      setErrorMessage('הגישה למערכת הוקפאה. אנא פנה להנהלה.');
    }
  }, [isResetModeFromQuery, searchParams]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();

    // Check for existing session on mount or from URL hash token
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const hash = typeof window !== 'undefined' ? window.location.hash || '' : '';
      const isRecovery = isResetModeFromQuery || hash.includes('type=recovery');

      if (session && !isRecovery) {
        setIsAuthenticatingFromLink(true);
        if (session.user?.id) {
          const { data: profile } = await supabase
            .from('admin_profiles')
            .select('is_active')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profile && profile.is_active === false) {
            await supabase.auth.signOut();
            setErrorMessage('הגישה למערכת הוקפאה. אנא פנה להנהלה.');
            setIsAuthenticatingFromLink(false);
            return;
          }
        }
        router.push('/admin');
        router.refresh();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const hash = typeof window !== 'undefined' ? window.location.hash || '' : '';
      const isRecovery = isResetModeFromQuery || hash.includes('type=recovery');

      if (event === 'PASSWORD_RECOVERY' || isRecovery) {
        setIsRecoveryMode(true);
        setIsAuthenticatingFromLink(false);
      } else if (
        event === 'SIGNED_IN' ||
        (session && (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED'))
      ) {
        if (isRecovery) {
          setIsRecoveryMode(true);
          setIsAuthenticatingFromLink(false);
          return;
        }

        setIsAuthenticatingFromLink(true);
        if (session?.user?.id) {
          const { data: profile } = await supabase
            .from('admin_profiles')
            .select('is_active')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profile && profile.is_active === false) {
            await supabase.auth.signOut();
            setErrorMessage('הגישה למערכת הוקפאה. אנא פנה להנהלה.');
            setIsAuthenticatingFromLink(false);
            return;
          }
        }

        router.push('/admin');
        router.refresh();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, isResetModeFromQuery]);

  // 1. Login with Email + Password
  const handleLoginWithPassword = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setErrorMessage('נא להזין כתובת דוא"ל וסיסמה להתחברות.');
      return;
    }

    if (!isSupabaseConfigured()) {
      router.push('/admin');
      return;
    }

    setLoadingAction('password');
    try {
      const supabase = createClient();
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        setErrorMessage(
          error.message.includes('Invalid login credentials')
            ? 'פרטי ההתחברות שגויים. בדוק את כתובת הדוא"ל והסיסמה.'
            : `שגיאת התחברות: ${error.message}`
        );
        return;
      }

      // TASK 2: Block login if account is frozen (is_active is false)
      if (authData?.user?.id) {
        const { data: profile } = await supabase
          .from('admin_profiles')
          .select('is_active')
          .eq('id', authData.user.id)
          .maybeSingle();

        if (profile && profile.is_active === false) {
          await supabase.auth.signOut();
          setErrorMessage('הגישה למערכת הוקפאה. אנא פנה להנהלה.');
          return;
        }
      }

      setSuccessMessage('התחברת בהצלחה! מעביר ללוח הבקרה...');
      router.push('/admin');
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err?.message || 'אירעה שגיאה בתהליך ההתחברות.');
    } finally {
      setLoadingAction(null);
    }
  };

  // 2. Send Magic Link (OTP) to Admin Email
  const handleSendMagicLink = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('נא להזין את כתובת הדוא"ל שלך לקבלת קישור התחברות.');
      return;
    }

    if (!isSupabaseConfigured()) {
      setErrorMessage('מסד הנתונים Supabase אינו מוגדר בקובץ .env.local.');
      return;
    }

    setLoadingAction('magic');
    try {
      const supabase = createClient();
      const origin =
        typeof window !== 'undefined' ? window.location.origin : '';
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: `${origin}/auth/callback?next=/admin`,
        },
      });

      if (error) {
        setErrorMessage(`שגיאה בשליחת קישור התחברות: ${error.message}`);
        return;
      }

      setSuccessMessage(
        `קישור התחברות מהיר (Magic Link) נשלח אל ${cleanEmail}. אנא בדוק את תיבת הדואר שלך.`
      );
    } catch (err: any) {
      setErrorMessage(err?.message || 'שגיאה בשליחת קישור ההתחברות.');
    } finally {
      setLoadingAction(null);
    }
  };

  // 3. Forgot Password (Send Reset Email)
  const handleForgotPassword = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('נא להזין את כתובת הדוא"ל שלך כדי לאפס את הסיסמה.');
      return;
    }

    if (!isSupabaseConfigured()) {
      setErrorMessage('מסד הנתונים Supabase אינו מוגדר בקובץ .env.local.');
      return;
    }

    setLoadingAction('forgot');
    try {
      const supabase = createClient();
      const origin =
        typeof window !== 'undefined' ? window.location.origin : '';
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(
          '/admin/login?reset=1'
        )}`,
      });

      if (error) {
        setErrorMessage(`שגיאה בשליחת מייל איפוס סיסמה: ${error.message}`);
        return;
      }

      setSuccessMessage(
        `הוראות לאיפוס סיסמה נשלחו לכתובת ${cleanEmail}. לחץ על הקישור במייל לבחירת סיסמה חדשה.`
      );
    } catch (err: any) {
      setErrorMessage(err?.message || 'שגיאה בשליחת בקשת איפוס הסיסמה.');
    } finally {
      setLoadingAction(null);
    }
  };

  // 4. Update Password when returning from Forgot Password link
  const handleUpdateNewPassword = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!newPassword || newPassword.length < 6) {
      setErrorMessage('הסיסמה החדשה חייבת להכיל לפחות 6 תווים.');
      return;
    }

    setLoadingAction('update_password');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setErrorMessage(`שגיאה בעדכון הסיסמה: ${error.message}`);
        return;
      }

      setSuccessMessage('הסיסמה עודכנה בהצלחה! מעביר ללוח הבקרה...');
      setIsRecoveryMode(false);
      router.push('/admin');
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err?.message || 'שגיאה בעדכון הסיסמה.');
    } finally {
      setLoadingAction(null);
    }
  };

  const isBusy = loadingAction !== null;

  return (
    <div className="mx-auto flex min-h-[78vh] max-w-md flex-col justify-center py-8">
      <div className="glass-modal overflow-hidden p-6 sm:p-8 text-right">
        {/* Top Icon & Title */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-600 text-white shadow-lg shadow-indigo-600/25">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">
            כניסת הנהלה למערכת
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            מערכת ניהול ומעקב דיווחי שעות פרטניות בית-ספרית
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50/90 p-3.5 text-xs font-medium text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMessage && (
          <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-3.5 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {isAuthenticatingFromLink ? (
          <div className="my-10 flex flex-col items-center justify-center space-y-3.5 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-800">
                מאמת קישור כניסה מאובטח (Magic Link)...
              </h3>
              <p className="text-xs text-slate-500">
                מעביר אותך ישירות ללוח הניהול, אנא המתן/י
              </p>
            </div>
          </div>
        ) : isRecoveryMode ? (
          /* Password Recovery Mode */
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-xs text-indigo-900">
              הזן כעת את הסיסמה החדשה שלך למערכת הניהול:
            </div>
            <div>
              <label
                htmlFor="admin-new-password"
                className="block text-xs font-bold text-slate-700"
              >
                סיסמה חדשה
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  id="admin-new-password"
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-10 pl-10 text-right text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute left-3 top-2.5 rounded-lg p-1 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="button"
              disabled={isBusy}
              onClick={handleUpdateNewPassword}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {loadingAction === 'update_password' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              <span>שמור סיסמה חדשה והמשך למערכת</span>
            </button>

            <button
              type="button"
              onClick={() => setIsRecoveryMode(false)}
              className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              חזרה למסך ההתחברות הרגיל
            </button>
          </div>
        ) : (
          /* Standard Login Form */
          <div className="mt-6 space-y-4">
            {/* Email Input */}
            <div>
              <label
                htmlFor="admin-login-email"
                className="block text-xs font-bold text-slate-700"
              >
                כתובת דוא&quot;ל מנהל/ת
              </label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  id="admin-login-email"
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleLoginWithPassword();
                    }
                  }}
                  placeholder="admin@school.edu.il"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-10 pl-4 text-right text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="admin-login-password"
                  className="block text-xs font-bold text-slate-700"
                >
                  סיסמה
                </label>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleForgotPassword}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 transition hover:text-indigo-800 disabled:opacity-50"
                >
                  {loadingAction === 'forgot' && (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  <span>שכחתי סיסמה</span>
                </button>
              </div>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute right-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  id="admin-login-password"
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleLoginWithPassword();
                    }
                  }}
                  placeholder="••••••••••••"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-10 pl-10 text-right text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute left-3 top-2.5 rounded-lg p-1 text-slate-400 hover:text-slate-600"
                  aria-label="הצג או הסתר סיסמה"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Primary Action: Login with Password */}
            <div className="pt-2 space-y-2.5">
              <button
                type="button"
                disabled={isBusy}
                onClick={handleLoginWithPassword}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingAction === 'password' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                <span>
                  {loadingAction === 'password'
                    ? 'מתחבר למערכת...'
                    : 'התחברות עם סיסמה'}
                </span>
              </button>

              {/* Divider */}
              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-slate-200" />
                <span className="mx-3 shrink-0 text-[11px] font-medium text-slate-400">
                  או התחברות ללא סיסמה
                </span>
                <div className="flex-grow border-t border-slate-200" />
              </div>

              {/* Secondary Action: Send Magic Link */}
              <button
                type="button"
                disabled={isBusy}
                onClick={handleSendMagicLink}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/80 px-5 py-2.5 text-xs sm:text-sm font-bold text-indigo-800 shadow-sm transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingAction === 'magic' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                ) : (
                  <Wand2 className="h-4 w-4 text-indigo-600" />
                )}
                <span>
                  {loadingAction === 'magic'
                    ? 'שולח קישור לדוא"ל...'
                    : 'שלח קישור התחברות (Magic Link)'}
                </span>
              </button>

              {/* Forgot Password Button */}
              <button
                type="button"
                disabled={isBusy}
                onClick={handleForgotPassword}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
              >
                {loadingAction === 'forgot' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                ) : (
                  <KeyRound className="h-3.5 w-3.5 text-slate-500" />
                )}
                <span>שכחתי סיסמה / איפוס סיסמה בדוא&quot;ל</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[75vh] max-w-md items-center justify-center">
          <div className="glass-modal h-96 w-full animate-pulse bg-white/70 p-8" />
        </div>
      }
    >
      <AdminLoginContent />
    </Suspense>
  );
}

