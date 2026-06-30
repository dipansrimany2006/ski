// GET  /api/agent — Stellar AI Agent metadata + status
// POST /api/agent — execute a Stellar agent tool call

import { NextRequest, NextResponse } from "next/server";
import { STELLAR_AGENT_CONFIG, STELLAR_AGENT_TOOLS, executeStellarAgentTool } from "@/lib/stellar-agent";
import { fetchFearGreed, fetchGlobalMetrics } from "@/lib/cmc";
import { getSessionUser } from "@/lib/auth";
import { getUserById, getDB } from "@/lib/db";
import { getWalletXLMBalance } from "@/lib/wallet";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);

  const [fg, gm] = await Promise.all([
    fetchFearGreed().catch(() => null),
    fetchGlobalMetrics().catch(() => null),
  ]);

  let walletInfo = null;
  if (session) {
    const db   = getDB();
    const user = await getUserById(db, session.userId);
    if (user?.cfo_wallet_address) {
      const balance = user.cfo_wallet_key
        ? await getWalletXLMBalance(user.cfo_wallet_key).catch(() => 0)
        : 0;
      walletInfo = {
        address:    user.cfo_wallet_address,
        balanceXLM: balance,
        funded:     balance >= 10,
        mode:       balance >= 10 ? "live-stellar" : "paper-trade",
      };
    }
  }

  return NextResponse.json({
    agent:  STELLAR_AGENT_CONFIG,
    tools:  STELLAR_AGENT_TOOLS,
    status: {
      wallet:        walletInfo,
      fearGreed:     fg ? { value: fg.value, label: fg.valueText } : null,
      btcDominance:  gm?.btcDominancePct ?? null,
      authenticated: !!session,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { tool: string; args?: Record<string, unknown> };
  const { tool, args = {} } = body;
  if (!tool) return NextResponse.json({ error: "Missing tool name" }, { status: 400 });

  const session = await getSessionUser(req);
  if (session) {
    const db   = getDB();
    const user = await getUserById(db, session.userId);
    if (user?.cfo_wallet_address) args.walletAddress = user.cfo_wallet_address;
  }

  const result = await executeStellarAgentTool(tool, args);
  return NextResponse.json({ tool, result });
}
