// GET /api/paper/portfolio — paper trading balance + positions (auth required)

import { NextRequest, NextResponse } from "next/server";
import { getDB, withRetry } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

async function ensurePaperTables(db: ReturnType<typeof getDB>) {
  await db`
    CREATE TABLE IF NOT EXISTS paper_accounts (
      user_id    TEXT PRIMARY KEY,
      balance    NUMERIC(20,8) NOT NULL DEFAULT 10000,
      created_at TEXT NOT NULL DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
      updated_at TEXT NOT NULL DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS paper_positions (
      id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id        TEXT NOT NULL,
      asset_id       TEXT NOT NULL,
      symbol         TEXT NOT NULL,
      display_symbol TEXT NOT NULL,
      name           TEXT NOT NULL,
      category       TEXT NOT NULL,
      quantity       NUMERIC(30,10) NOT NULL DEFAULT 0,
      avg_buy_price  NUMERIC(20,8)  NOT NULL DEFAULT 0,
      stop_loss      NUMERIC(20,8),
      take_profit    NUMERIC(20,8),
      created_at     TEXT NOT NULL DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
      updated_at     TEXT NOT NULL DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
      UNIQUE(user_id, asset_id)
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS paper_trades (
      id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id        TEXT NOT NULL,
      asset_id       TEXT NOT NULL,
      symbol         TEXT NOT NULL,
      display_symbol TEXT NOT NULL,
      name           TEXT NOT NULL,
      trade_type     TEXT NOT NULL CHECK(trade_type IN ('buy','sell')),
      quantity       NUMERIC(30,10) NOT NULL,
      price          NUMERIC(20,8)  NOT NULL,
      total          NUMERIC(20,8)  NOT NULL,
      created_at     TEXT NOT NULL DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
    )
  `;
}

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

  try {
    const db = getDB();
    await ensurePaperTables(db);
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
  } catch (err) {
    console.error("[paper/portfolio] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
