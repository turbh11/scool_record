'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Link2,
  Copy,
  Check,
  MessageCircle,
  Mail,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import {
  generateAdminLoginLink,
  sendMagicLinkEmail,
} from '@/app/actions/super-admin-actions';

export interface AdminDetails {
  name: string;
  school: string;
  email: string;
}

interface AdminLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  admin: AdminDetails | null;
  onShowToast?: (msg: string) => void;
}

export default function AdminLinkModal({
  isOpen,
  onClose,
  admin,
  onShowToast,
}: AdminLinkModalProps) {
  const [link, setLink] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);

  const fetchLink = useCallback(async () => {
    if (!admin?.email) return;

    setIsLoading(true);
    setError(null);
    setLink('');
    setCopied(false);

    try {
      const origin =
        typeof window !== 'undefined' ? window.location.origin : undefined;
      const res = await generateAdminLoginLink(admin.email, origin);

      if (res.success && res.link) {
        setLink(res.link);
      } else {
        setError(res.error || 'שגיאה ביצירת קישור התחברות');
      }
    } catch (err: any) {
      console.error('[AdminLinkModal] Failed to generate admin login link:', err);
      setError(err?.message || 'שגיאה בחיבור לשרת');
    } finally {
      setIsLoading(false);
    }
  }, [admin?.email]);

  useEffect(() => {
    if (isOpen && admin?.email) {
      fetchLink();
    } else {
      setLink('');
      setError(null);
      setCopied(false);
      setIsSendingEmail(false);
    }
  }, [isOpen, admin?.email, fetchLink]);

  if (!isOpen || !admin) return null;

  const handleCopy = () => {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopied(true);
    onShowToast?.(`קישור ההתחברות עבור ${admin.name} הועתק ללוח!`);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleWhatsApp = () => {
    if (!link) return;
    const msg = `שלום ${admin.name}, מצורף קישור התחברות מאובטח לממשק הניהול של ${admin.school}: ${link}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    onShowToast?.('נפתח וואטסאפ לשליחת הקישור');
  };

  const handleSendEmail = async () => {
    if (!link || !admin?.email) return;
    setIsSendingEmail(true);
    try {
      const res = await sendMagicLinkEmail(admin.email, link, admin.school);
      if (res.success) {
        onShowToast?.(`אימייל עם קישור התחברות נשלח בהצלחה אל ${admin.email}!`);
      } else {
        onShowToast?.(`שגיאה בשליחת הדוא״ל: ${res.error || 'נא לוודא הגדרות Gmail'}`);
      }
    } catch (err: any) {
      console.error('[AdminLinkModal] Error sending magic link email:', err);
      onShowToast?.('שגיאה בשליחת הדוא״ל');
    } finally {
      setIsSendingEmail(false);
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
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                קישור התחברות למנהל/ת
              </h2>
              <p className="text-xs text-slate-500">
                {admin.name} • {admin.school}
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

        {/* Content */}
        <div className="p-6 space-y-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-3 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              <p className="text-xs font-semibold">
                מייצר קישור התחברות מאובטח (Magic Link)...
              </p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 space-y-3">
              <div className="flex items-start gap-2 text-rose-800 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={fetchLink}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 transition"
              >
                נסה שוב
              </button>
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  קישור התחברות ישיר (Magic Link) לממשק ניהול בית הספר. הקישור מאפשר כניסה מיידית ומאובטחת למערכת ללא צורך בהזנת סיסמה.
                </p>
              </div>

              {/* Read-only Link Input */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-700">
                  קישור התחברות ישיר (URL):
                </label>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    dir="ltr"
                    value={link}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-800 outline-none select-all focus:border-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* 3 Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="block text-[11px] font-bold text-slate-700">
                  שליחת הקישור למנהל/ת:
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {/* Copy Link */}
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:border-slate-300"
                    title="העתק קישור ללוח"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4 text-slate-500" />
                    )}
                    <span>{copied ? 'הועתק!' : 'העתק קישור'}</span>
                  </button>

                  {/* WhatsApp */}
                  <button
                    type="button"
                    onClick={handleWhatsApp}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-800 shadow-2xs transition hover:bg-emerald-100 hover:border-emerald-300"
                    title="שלח קישור בוואטסאפ"
                  >
                    <MessageCircle className="h-4 w-4 text-emerald-600" />
                    <span>וואטסאפ</span>
                  </button>

                  {/* Email */}
                  <button
                    type="button"
                    disabled={isSendingEmail || !link}
                    onClick={handleSendEmail}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs font-bold text-sky-800 shadow-2xs transition hover:bg-sky-100 hover:border-sky-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={`שלח דוא״ל אל ${admin.email}`}
                  >
                    {isSendingEmail ? (
                      <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                    ) : (
                      <Mail className="h-4 w-4 text-sky-600" />
                    )}
                    <span>{isSendingEmail ? 'שולח...' : 'שלח בדוא״ל'}</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-100 bg-slate-50/50 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-200 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-300"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

