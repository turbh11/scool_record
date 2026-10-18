import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { isSuperAdminEmail } from '@/lib/super-admin';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const { pathname, searchParams } = request.nextUrl;

  // Never block /teacher routes (accessed via ?token=...) or /auth/callback
  if (pathname.startsWith('/teacher') || pathname.startsWith('/auth')) {
    return supabaseResponse;
  }

  // If Supabase environment variables are not configured, allow navigation in demo mode
  if (!isSupabaseConfigured()) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, any>;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session and fetch current authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAdminLoginRoute = pathname === '/admin/login' || pathname.startsWith('/admin/login/');
  const isProtectedAdminRoute =
    (pathname === '/admin' || pathname.startsWith('/admin/')) &&
    !isAdminLoginRoute;

  // Redirect unauthenticated users trying to access /admin to /admin/login
  if (isProtectedAdminRoute && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/admin/login';
    loginUrl.search = '';
    return NextResponse.redirect(loginUrl);
  }

  // If already logged in and visiting /admin/login (unless resetting password), redirect to /admin
  if (isAdminLoginRoute && user && searchParams.get('reset') !== '1') {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/admin';
    dashboardUrl.search = '';
    return NextResponse.redirect(dashboardUrl);
  }

  // Lock down /super-admin to emails listed in SUPER_ADMIN_EMAILS (comma-separated)
  const isSuperAdminRoute =
    pathname === '/super-admin' || pathname.startsWith('/super-admin/');

  if (isSuperAdminRoute) {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/admin/login';
      loginUrl.search = '';
      return NextResponse.redirect(loginUrl);
    }

    if (!isSuperAdminEmail(user.email)) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = '/admin';
      dashboardUrl.search = '';
      return NextResponse.redirect(dashboardUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and images:
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
