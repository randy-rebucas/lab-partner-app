import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || 'lp_session';

// Paths anyone may open without signing in.
const PUBLIC_PREFIXES = ['/setup', '/login', '/verify', '/v1', '/api', '/dev', '/icon', '/apple-icon', '/opengraph-image', '/photos'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Two jobs, both cheap (docs/PLAN.md §1):
 * 1. A per-request CSP nonce. Scripts run only with the nonce; inline style attributes are allowed
 *    (React `style` props, e.g. the BrandLogo gradient).
 * 2. An optimistic redirect to /login when there is no session cookie at all. This is not the
 *    security check: every page and action verifies the session itself (lib/auth/guards.ts).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isPublic(pathname) && !request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Machine routes (/v1, /api) answer JSON and need no CSP or redirect.
      source: '/((?!v1|api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
