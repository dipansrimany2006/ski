// POST /api/paper/deposit
// Credits USD to the user's paper trading account.
// For live on-chain funding, the user sends XLM to their Stellar agent wallet
// via /api/cfo/wallet — this endpoint handles paper-only top-ups.

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDB } from "@/lib/db";

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json() as { usdAmount: number };
  const { usdAmount } = body;

  if (!usdAmount || usdAmount <= 0 || usdAmount > 100_000) {
    return NextResponse.json({ error: "Invalid amount (must be 0 < amount ≤ 100,000)" }, { status: 400 });
  }

  const db = getDB();

  // Ensure account exists
  await db`INSERT INTO paper_accounts (user_id, balance) VALUES (${session.userId}, 0) ON CONFLICT (user_id) DO NOTHING`;

  // Credit USD to paper balance
  await db`
    UPDATE paper_accounts
    SET balance    = balance + ${usdAmount},
        updated_at = to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    WHERE user_id = ${session.userId}
  `;

  const rows = await db`SELECT balance FROM paper_accounts WHERE user_id = ${session.userId}`;
  const newBalanceUsd = Number(rows[0].balance);

  return NextResponse.json({
    ok:             true,
    creditedUsd:    usdAmount,
    newBalanceUsd,
  });
}
