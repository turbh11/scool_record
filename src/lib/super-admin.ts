/**
 * Super Admin helpers.
 *
 * SUPER_ADMIN_EMAILS is a comma-separated list of emails, e.g.:
 *   SUPER_ADMIN_EMAILS=barakbenacon@gmail.com, partner@example.com
 *
 * Includes the primary Super Admin email as a fallback so client and server
 * evaluations never fail during initial session hydration.
 */

const DEFAULT_SUPER_ADMIN_FALLBACKS = ['barakbenacon@gmail.com'];

export function getSuperAdminEmails(): string[] {
  const envEmails = (
    process.env.SUPER_ADMIN_EMAILS ||
    process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAILS ||
    ''
  )
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set([...envEmails, ...DEFAULT_SUPER_ADMIN_FALLBACKS]));
}

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return getSuperAdminEmails().includes(email.trim().toLowerCase());
}

