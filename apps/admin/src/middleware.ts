import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  return res;
}

export const config = {
  matcher: ['/admin/:path*'],
};
