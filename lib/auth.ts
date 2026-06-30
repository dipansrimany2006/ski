import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE = "ski_session";
const SESSION_DURATION_DAYS = 7;
const REFRESH_THRESHOLD_DAYS = 3;

function jwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  exp?: number;
}

export async function createSessionToken(payload: Omit<SessionPayload, "exp">): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_DAYS}d`)
    .sign(jwtSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    return {
      userId: payload.userId as string,
      exp: payload.exp as number | undefined,
    };
  } catch {
    return null;
  }
}

export function getSessionToken(req: NextRequest): string | undefined {
  return req.cookies.get(SESSION_COOKIE)?.value;
}

export async function getSessionUser(req: NextRequest): Promise<SessionPayload | null> {
  const token = getSessionToken(req);
  if (!token) return null;
  return verifySessionToken(token);
}

function sessionCookieOptions() {
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_DURATION_DAYS);
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    expires,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
}

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    expires: new Date(0),
  });
}

// Returns true if the session should be re-issued (expiring within REFRESH_THRESHOLD_DAYS).
export function shouldRefreshSession(session: SessionPayload): boolean {
  if (!session.exp) return false;
  const secondsLeft = session.exp - Math.floor(Date.now() / 1000);
  return secondsLeft < REFRESH_THRESHOLD_DAYS * 24 * 60 * 60;
}
