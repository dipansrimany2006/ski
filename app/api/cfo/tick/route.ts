// POST /api/cfo/tick — runs the CFO engine for every active user.
// Called by Cloudflare cron trigger every 5 minutes.
// The CFO selects its own watchlist per user dynamically — no static list needed.

import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { runCFOEngine } from "@/lib/cfo/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("x-cron-secret") ?? req.headers.get("authorization");
    const provided = auth?.replace(/^Bearer\s+/i, "");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = getDB();
  const activeUsers = await db`
    SELECT id, risk_tolerance, cfo_strategy, cfo_wallet_address, cfo_wallet_key
    FROM users WHERE cfo_active = 1
  `;

  const results: Array<{ userId: string; decisions: number; cbTripped: boolean; error?: string }> = [];

  for (const user of activeUsers) {
    try {
      const result = await runCFOEngine({
        userId:        String(user.id),
        riskTolerance: String(user.risk_tolerance ?? "balanced"),
        strategyText:  user.cfo_strategy ? String(user.cfo_strategy) : undefined,
        walletAddress: user.cfo_wallet_address ? String(user.cfo_wallet_address) : undefined,
        encryptedKey:  user.cfo_wallet_key     ? String(user.cfo_wallet_key)     : undefined,
      });

      results.push({
        userId: String(user.id),
        decisions: result.decisions.length,
        cbTripped: result.circuitBreakerTripped,
      });
    } catch (err) {
      results.push({ userId: String(user.id), decisions: 0, cbTripped: false, error: String(err) });
      console.error(`[CFO/tick] Failed for user ${user.id}:`, err);
    }
  }

  return NextResponse.json({
    ran: results.length,
    results,
    timestamp: new Date().toISOString(),
  });
}
