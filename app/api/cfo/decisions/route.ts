// GET /api/cfo/decisions — fetch recent CFO decisions for the authenticated user
// Query params: limit (default 20), symbol (filter by display_symbol)

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDB } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const limit  = Math.min(100, parseInt(params.get("limit") ?? "20", 10));
  const symbol = params.get("symbol");

  const db = getDB();

  const rows = symbol
    ? await db`
        SELECT * FROM cfo_decisions
        WHERE user_id = ${session.userId} AND display_symbol = ${symbol}
        ORDER BY created_at DESC LIMIT ${limit}
      `
    : await db`
        SELECT * FROM cfo_decisions
        WHERE user_id = ${session.userId}
        ORDER BY created_at DESC LIMIT ${limit}
      `;

  return NextResponse.json({
    decisions: rows.map(r => ({
      ...r,
      blended_signal: Number(r.blended_signal),
      final_size_usd: Number(r.final_size_usd),
      price_at_decision: Number(r.price_at_decision),
    })),
  });
}
