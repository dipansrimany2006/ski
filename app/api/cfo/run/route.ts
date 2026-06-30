// POST /api/cfo/run — trigger a CFO decision loop run for the authenticated user.
// The CFO selects its own watchlist dynamically based on market data and risk profile.

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDB } from "@/lib/db";
import { runCFOEngine } from "@/lib/cfo/engine";
import type { EngineResult } from "@/lib/cfo/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // suppress unused warning — body no longer used but keep req for NextRequest type
  void req;

  const db = getDB();
  const userRows = await db`SELECT * FROM users WHERE id = ${session.userId}`;
  const user = userRows[0];

  if (!user?.cfo_active) {
    return NextResponse.json({ error: "CFO is not active. Enable it from the CFO page first." }, { status: 403 });
  }

  const riskTolerance  = (user.risk_tolerance as string) ?? "balanced";
  const walletAddress  = user.cfo_wallet_address ? String(user.cfo_wallet_address) : undefined;
  const encryptedKey   = user.cfo_wallet_key     ? String(user.cfo_wallet_key)     : undefined;
  const strategyText   = user.cfo_strategy       ? String(user.cfo_strategy)       : undefined;

  try {
    const result: EngineResult = await runCFOEngine({
      userId: session.userId,
      riskTolerance,
      walletAddress,
      encryptedKey,
      strategyText,
    });

    if (result.circuitBreakerTripped) {
      return NextResponse.json({
        decisions: [],
        count: 0,
        circuitBreakerTripped: true,
        circuitBreakerReason: result.circuitBreakerReason,
        warning: `CFO halted and deactivated: ${result.circuitBreakerReason}`,
      });
    }

    const decisions = result.decisions;
    const buyCount  = decisions.filter(d => d.action === "buy").length;
    const sellCount = decisions.filter(d => d.action === "sell").length;
    const holdCount = decisions.filter(d => d.action === "hold").length;
    const execCount = decisions.filter(d => d.tradeId).length;

    return NextResponse.json({
      decisions,
      count:    decisions.length,
      analyzed: decisions.length,
      buyCount,
      sellCount,
      holdCount,
      execCount,
      agentAddress: walletAddress ?? null,
    });
  } catch (err) {
    console.error("[CFO/run] Engine error:", err);
    return NextResponse.json({ error: "CFO engine error", details: String(err) }, { status: 500 });
  }
}
