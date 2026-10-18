import type { Metadata } from 'next';
import { Rubik } from 'next/font/google';
import AppHeader from '@/components/AppHeader';
import './globals.css';

const rubik = Rubik({
  subsets: ['hebrew', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-rubik',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'מערכת ניהול דיווחי שעות פרטניות',
  description: 'מערכת חכמה לניהול, מעקב ודיווח שעות פרטניות בבתי ספר בישראל',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={rubik.variable}>
      <body className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/40 to-sky-50/60 font-sans text-slate-800 antialiased selection:bg-indigo-600 selection:text-white">
        {/* Decorative ambient background blobs for glassmorphism */}
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-indigo-200/35 blur-3xl" />
          <div className="absolute top-1/3 -left-24 h-96 w-96 rounded-full bg-sky-200/35 blur-3xl" />
          <div className="absolute bottom-0 right-1/3 h-80 w-80 rounded-full bg-emerald-100/30 blur-3xl" />
        </div>

        <AppHeader />

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </body>
    </html>
  );
}
