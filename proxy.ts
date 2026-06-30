import { NextRequest, NextResponse } from "next/server";
import {
  getSessionUser,
  createSessionToken,
  setSessionCookie,
  shouldRefreshSession,
} from "@/lib/auth";

const PUBLIC = [
  "/",
  "/explore",
  "/login",
  "/onboarding",
  "/api/auth/google",
  "/api/auth/logout",
  "/api/explore",
  "/api/asset",
];

function isPublic(pathname: string): boolean {
  return PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/ski-logo") ||
    pathname.startsWith("/signin-asset") ||
    pathname.startsWith("/auth-illustration") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  if (isPublic(pathname)) return NextResponse.next();

  const session = await getSessionUser(req);
  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();

  // Sliding session: re-issue the token when it's within 3 days of expiry
  // so active users never get logged out.
  if (shouldRefreshSession(session)) {
    const newToken = await createSessionToken({ userId: session.userId });
    setSessionCookie(response, newToken);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
