// GET /api/auth/google/callback
// Handles the Google OAuth redirect, creates/finds a user, and issues a session.

import { NextRequest, NextResponse } from "next/server";
import {
  getDB,
  getUserByGoogleId,
  getUserByEmail,
  getUserById,
  createGoogleUser,
  updateUser,
} from "@/lib/db";
import { createSessionToken, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");
  const storedState = req.cookies.get("oauth_state")?.value;
  const from = req.cookies.get("oauth_from")?.value ?? "/dashboard";

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/login?error=config", origin));
  }

  if (!code || !returnedState || returnedState !== storedState) {
    return NextResponse.redirect(new URL("/login?error=oauth_mismatch", origin));
  }

  try {
    // Exchange authorization code for tokens.
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      throw new Error("Token exchange failed");
    }
    const tokens = (await tokenRes.json()) as { access_token: string };

    // Fetch Google profile.
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileRes.ok) {
      throw new Error("Failed to fetch Google profile");
    }
    const profile = (await profileRes.json()) as {
      id: string;
      email: string;
      name?: string;
    };

    const db = getDB();

    // Find or create user.
    let user = await getUserByGoogleId(db, profile.id);
    const isNew = !user;

    if (!user) {
      user = await getUserByEmail(db, profile.email);
      if (!user) {
        const id = crypto.randomUUID();
        await createGoogleUser(db, id, profile.id, profile.email, profile.name ?? null);
        user = await getUserById(db, id);
      } else {
        // Link google_id to existing email-matched user.
        await updateUser(db, user.id, { google_id: profile.id });
        user = await getUserById(db, user.id);
      }
    }

    if (!user) {
      throw new Error("User creation failed");
    }

    const token = await createSessionToken({ userId: user.id });
    // New users (no onboarding) go to /onboarding; returning users go to /explore
    const onboardingDone = !!(user.agreed_terms_at && user.agreed_risk_at);
    const redirectTo = isNew || !onboardingDone ? "/onboarding" : "/explore";

    const res = NextResponse.redirect(new URL(redirectTo, origin));

    setSessionCookie(res, token);
    res.cookies.delete("oauth_state");
    res.cookies.delete("oauth_from");
    return res;
  } catch {
    return NextResponse.redirect(new URL("/login?error=google_failed", origin));
  }
}
