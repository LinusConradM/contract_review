import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

const authRoutes = ["/login", "/signup"];
const protectedRoutes = ["/dashboard", "/dev"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = !!request.cookies.get(SESSION_COOKIE)?.value;

  const isAuthRoute = authRoutes.some((r) => pathname.startsWith(r));
  const isProtected = protectedRoutes.some((r) => pathname.startsWith(r));

  if (isProtected && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/dev/:path*", "/login", "/signup"],
};
