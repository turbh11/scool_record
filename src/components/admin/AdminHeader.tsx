'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Loader2, ShieldCheck, Building2, GraduationCap } from 'lucide-react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

export interface AdminHeaderProps {
  className?: string;
  schoolName?: string | null;
  institutionCode?: string | null;
  isSuperAdmin?: boolean;
  onSwitchToTeacher?: () => void;
  isSwitchingToTeacher?: boolean;
  availableSchools?: { id: string; name: string; semel_mosad: string }[];
  onSelectSchool?: (semel_mosad: string) => void;
}

export default function AdminHeader({
  className = '',
  schoolName,
  institutionCode,
  isSuperAdmin = false,
  onSwitchToTeacher,
  isSwitchingToTeacher = false,
  availableSchools = [],
  onSelectSchool,
}: AdminHeaderProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        await supabase.auth.signOut();
      }
      router.push('/admin/login');
      router.refresh();
    } catch (err) {
      console.error('Error signing out:', err);
      router.push('/admin/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2.5 ${className}`}>
      {(schoolName || institutionCode) && (
        <div className="hidden sm:flex items-center gap-2 rounded-xl border border-indigo-100 bg-white/90 px-3 py-1.5 shadow-sm backdrop-blur-md">
          <Building2 className="h-4 w-4 text-indigo-600 shrink-0" />
          {isSuperAdmin && availableSchools && availableSchools.length > 1 ? (
            <div className="flex items-center gap-2">
              <select
                value={institutionCode || ''}
                onChange={(e) => onSelectSchool?.(e.target.value)}
                className="bg-transparent text-xs sm:text-sm font-bold text-slate-800 outline-none cursor-pointer hover:text-indigo-600"
                title="בחר מוסד להצגה (Super Admin)"
              >
                {availableSchools.map((s) => (
                  <option key={s.id} value={s.semel_mosad}>
                    {s.name} ({s.semel_mosad})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              {schoolName && (
                <span className="text-xs sm:text-sm font-bold text-slate-800">
                  {schoolName}
                </span>
              )}
              {institutionCode && (
                <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-700">
                  מוסד: {institutionCode}
                </span>
              )}
            </>
          )}
        </div>
      )}

      {onSwitchToTeacher && (
        <button
          type="button"
          disabled={isSwitchingToTeacher}
          onClick={onSwitchToTeacher}
          className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white/90 px-3.5 py-2 text-xs sm:text-sm font-bold text-indigo-700 shadow-2xs transition hover:border-indigo-300 hover:bg-indigo-50/80 disabled:opacity-50"
          title="מעבר לדיווח אישי כמורה"
        >
          {isSwitchingToTeacher ? (
            <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
          ) : (
            <GraduationCap className="h-4 w-4 text-indigo-600" />
          )}
          <span>מעבר לדיווח אישי</span>
        </button>
      )}

      {isSuperAdmin && (
        <Link
          href="/super-admin"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-violet-600 to-indigo-600 px-3.5 py-2 text-xs sm:text-sm font-bold text-white shadow-md shadow-violet-600/25 transition hover:from-violet-700 hover:to-indigo-700"
          title="מעבר לממשק ניהול המערכת והקמת בתי ספר"
        >
          <ShieldCheck className="h-4 w-4" />
          <span>ניהול מערכת (Super Admin)</span>
        </Link>
      )}

      <button
        type="button"
        disabled={isLoggingOut}
        onClick={handleLogout}
        className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-2 text-xs sm:text-sm font-bold text-rose-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-100 disabled:opacity-50"
        title="התנתק מממשק הנהלה"
      >
        {isLoggingOut ? (
          <Loader2 className="h-4 w-4 animate-spin text-rose-600" />
        ) : (
          <LogOut className="h-4 w-4 text-rose-600" />
        )}
        <span>{isLoggingOut ? 'מתנתק...' : 'התנתק'}</span>
      </button>
    </div>
  );
}
