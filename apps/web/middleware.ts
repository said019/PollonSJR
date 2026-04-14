import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page through
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  // Admin routes are protected client-side via localStorage token check.
  // Server-side middleware can't access localStorage, so we let the request
  // through and the admin layout/components handle auth redirects.
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
