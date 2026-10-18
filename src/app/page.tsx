import Link from 'next/link';
import {
  ShieldCheck,
  UserCheck,
  CalendarClock,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
  Building2,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="space-y-8 py-6">
      {/* Hero Banner */}
      <section className="glass-card relative overflow-hidden p-8 sm:p-10">
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-indigo-50/80 px-3.5 py-1 text-xs font-semibold text-indigo-700">
            <Sparkles className="h-3.5 w-3.5" />
            <span>מותאם לבתי ספר בישראל • אופק חדש ועוז לתמורה</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            מערכת ניהול דיווחי שעות פרטניות
          </h1>
          <p className="text-base leading-relaxed text-slate-600 sm:text-lg">
            מעקב שבועי חכם, שקוף ומהיר אחר ביצוע שעות פרטניות. דיווח בקליק אחד
            למורים באמצעות קישור אישי מהיר (Magic Link) ותמונת מצב מלאה בזמן אמת
            להנהלת בית הספר.
          </p>
        </div>
      </section>

      {/* Role Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Admin Card */}
        <div className="glass-card flex flex-col justify-between p-7 transition hover:-translate-y-0.5 hover:shadow-lg">
          <div className="space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600/10 text-indigo-600">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                לוח בקרה להנהלה ורכזים
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                צפייה במדדי ביצוע שבועיים (KPI), לוח שעות כיתתי/מוסדי לפי ימים
                ושעות, עדכון סטטוס שעות פרטניות והגדרות מוסד חינוכי.
              </p>
            </div>

            <ul className="space-y-2 text-sm text-slate-700">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>מדדי השלמה שבועיים, סך שעות שבוצעו וחיווי חוסרים</span>
              </li>
              <li className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-indigo-600" />
                <span>מערכת שעות שבועית אינטראקטיבית עם דריסת סטטוס מהירה</span>
              </li>
              <li className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-sky-600" />
                <span>ניהול שם בית הספר וסמל מוסד</span>
              </li>
            </ul>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <Link
              href="/admin"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-700"
            >
              <span>כניסה לממשק הנהלה</span>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Teacher Card */}
        <div className="glass-card flex flex-col justify-between p-7 transition hover:-translate-y-0.5 hover:shadow-lg">
          <div className="space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-600/10 text-sky-600">
              <UserCheck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                אזור אישי ודיווח למורה
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                כניסה מהירה באמצעות קישור קסם אישי (Magic Link) או בחירת מורה,
                דיווח ביצוע שעה פרטנית בקליק או סימון כלל השעות השבועיות כבוצעו.
              </p>
            </div>

            <ul className="space-y-2 text-sm text-slate-700">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>כפתור &quot;סמן הכל כבוצע&quot; לדיווח שבועי מהיר</span>
              </li>
              <li className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-sky-600" />
                <span>עדכון מיידי ללא טעינה מחדש של העמוד (Optimistic UI)</span>
              </li>
              <li className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-600" />
                <span>תיעוד נושא השיעור והערות פרטניות לכל מפגש</span>
              </li>
            </ul>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <Link
              href="/teacher"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-sky-600/20 transition hover:bg-sky-700"
            >
              <span>כניסה לממשק מורה</span>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

