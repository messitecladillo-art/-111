import { NextResponse, type NextRequest } from 'next/server';

const BLOCKED_SCRAPER_UA = /(sqlmap|nikto|nmap|scrapy|httrack|webcopier|teleport|wget\/)/i;

export function proxy(request: NextRequest) {
  const ua = request.headers.get('user-agent') ?? '';
  if (BLOCKED_SCRAPER_UA.test(ua)) {
    return NextResponse.json(
      { error: { code: 'scraper_blocked', message: '拒绝自动化采集或批量抓取客户端。' } },
      { status: 403 },
    );
  }

  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set(
    'Referrer-Policy',
    request.nextUrl.pathname.startsWith('/api/') ? 'same-origin' : 'strict-origin-when-cross-origin',
  );
  if (
    request.nextUrl.pathname.startsWith('/agent')
    || request.nextUrl.pathname.startsWith('/api/')
    || request.nextUrl.pathname.startsWith('/projects')
    || request.nextUrl.pathname.startsWith('/invites')
    || request.nextUrl.pathname.startsWith('/s/')
  ) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }
  return response;
}

export const config = {
  matcher: ['/agent/:path*', '/workspace/:path*', '/api/:path*', '/projects/:path*', '/invites', '/s/:path*'],
};
