'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpenCheck, ShieldCheck, UserCheck } from 'lucide-react';

export interface AppHeaderProps {
  schoolName?: string | null;
  institutionCode?: string | null;
}

export default function AppHeader({
  schoolName,
  institutionCode,
}: AppHeaderProps = {}) {
  const pathname = usePathname();
  // Strict Teacher Isolation: When inside /teacher, hide cross-navigation to /admin or landing page
  const isTeacherRoute = pathname?.startsWith('/teacher');

  return (
    <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
        {isTeacherRoute ? (
          <div className="flex items-center gap-3 text-slate-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-600 to-indigo-600 text-white shadow-md shadow-sky-500/20">
              <BookOpenCheck className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-base font-bold leading-tight text-slate-900">
                מערכת דיווח שעות פרטניות
              </span>
              <span className="block text-xs text-slate-500">
                אזור דיווח אישי למורה
              </span>
            </div>
          </div>
        ) : (
          <Link
            href="/"
            className="flex items-center gap-3 text-slate-900 transition hover:opacity-90"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-sky-600 text-white shadow-md shadow-indigo-500/20">
              <BookOpenCheck className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-base font-bold leading-tight text-slate-900">
                שעות פרטניות
              </span>
              <span className="block text-xs text-slate-500">
                מערכת ניהול ומעקב בית-ספרית
              </span>
            </div>
          </Link>
        )}

        {/* Hide Admin & Cross-Navigation links when on the isolated /teacher route */}
        {!isTeacherRoute && (
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-700"
            >
              <ShieldCheck className="h-4 w-4 text-indigo-600" />
              <span>ממשק הנהלה</span>
            </Link>
            <Link
              href="/teacher"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/60 hover:text-sky-700"
            >
              <UserCheck className="h-4 w-4 text-sky-600" />
              <span>דיווח מורה</span>
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}

