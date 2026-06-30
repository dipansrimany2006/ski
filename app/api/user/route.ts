// GET  /api/user         — current user profile (requires session)
// PATCH /api/user         — update profile (onboarding + persona)

import { NextRequest, NextResponse } from "next/server";
import { getDB, getUserById, updateUser, withRetry } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const db = getDB();
  const user = await getUserById(db, session.userId);
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  return NextResponse.json({ user });
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const ALLOWED = [
    "display_name", "country", "experience",
    "risk_tolerance", "goal", "horizon", "cfo_name",
    "agreed_terms_at", "agreed_risk_at", "is_not_us_person",
    "cfo_active",
    "cfo_watchlist",
    "cfo_strategy",
  ];

  const fields: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) fields[key] = body[key];
  }

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const db = getDB();
  await updateUser(db, session.userId, fields as Parameters<typeof updateUser>[2]);
  const user = await getUserById(db, session.userId);
  return NextResponse.json({ user });
}
