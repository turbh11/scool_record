/**
 * Super Admin helpers (server / middleware only).
 *
 * SUPER_ADMIN_EMAILS is a comma-separated list of emails, e.g.:
 *   SUPER_ADMIN_EMAILS=owner@example.com, partner@example.com
 *
 * NOTE: This variable is intentionally NOT prefixed with NEXT_PUBLIC_, so it is never
 * shipped to the browser. Client components must ask the server via the
 * `getIsSuperAdmin()` server action instead of reading it directly.
 */
export function getSuperAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return getSuperAdminEmails().includes(email.trim().toLowerCase());
}

