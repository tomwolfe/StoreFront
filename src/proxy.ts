import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only proxy for API routes
  if (pathname.startsWith('/api')) {
    // Skip security check for auth routes to allow NextAuth to function
    if (pathname.startsWith('/api/auth')) {
      return NextResponse.next();
    }

    const internalKey = request.headers.get('x-internal-system-key');
    const validKey = process.env.INTERNAL_SYSTEM_KEY;

    if (!internalKey || internalKey !== validKey) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid Internal System Key' },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
