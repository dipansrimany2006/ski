import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET — triggered by <a href="/api/auth/logout"> in the navbar
export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const res = NextResponse.redirect(`${origin}/login`);
  clearSessionCookie(res);
  return res;
}

// POST — programmatic logout
export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
