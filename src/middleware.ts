import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Only middleware for API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
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
