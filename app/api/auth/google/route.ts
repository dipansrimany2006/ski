// GET /api/auth/google
// Initiates the Google OAuth 2.0 flow.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth not configured." }, { status: 500 });
  }

  const from = req.nextUrl.searchParams.get("from") ?? "/dashboard";
  const stateToken = crypto.randomUUID();
  const origin = req.nextUrl.origin;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: "code",
    scope: "email profile",
    state: stateToken,
    access_type: "offline",
    prompt: "select_account",
  });

  const res = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );

  res.cookies.set("oauth_state", stateToken, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });
  res.cookies.set("oauth_from", from, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });

  return res;
}
