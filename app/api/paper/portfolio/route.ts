// GET /api/paper/portfolio — paper trading balance + positions (auth required)

import { NextRequest, NextResponse } from "next/server";
import { getDB, withRetry } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureAccount(db: ReturnType<typeof getDB>, userId: string) {
  await withRetry(() => db`
    INSERT INTO paper_accounts (user_id) VALUES (${userId})
    ON CONFLICT (user_id) DO NOTHING
  `);
  const rows = await withRetry(() => db`SELECT balance FROM paper_accounts WHERE user_id = ${userId}`);
  return Number(rows[0].balance);
}

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const db = getDB();
  const balance = await ensureAccount(db, session.userId);

  const [positions, trades] = await Promise.all([
    withRetry(() => db`
      SELECT * FROM paper_positions
      WHERE user_id = ${session.userId}
      ORDER BY updated_at DESC
    `),
    withRetry(() => db`
      SELECT * FROM paper_trades
      WHERE user_id = ${session.userId}
      ORDER BY created_at DESC
      LIMIT 50
    `),
  ]);

  return NextResponse.json({
    balance,
    positions: positions.map(p => ({
      ...p,
      quantity: Number(p.quantity),
      avg_buy_price: Number(p.avg_buy_price),
    })),
    trades: trades.map(t => ({
      ...t,
      quantity: Number(t.quantity),
      price: Number(t.price),
      total: Number(t.total),
    })),
  });
}
