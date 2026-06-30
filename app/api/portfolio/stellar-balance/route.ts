// GET /api/portfolio/stellar-balance?address=G...
// Fetches all asset balances for a Stellar public key via Horizon.

import { NextRequest, NextResponse } from "next/server";
import { Horizon } from "@stellar/stellar-sdk";
import { STELLAR_HORIZON_MAINNET, STELLAR_EXPLORER_BASE } from "@/lib/stellar/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");

  if (!address || !STELLAR_ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "Invalid or missing Stellar address (must start with G)." }, { status: 400 });
  }

  try {
    const server  = new Horizon.Server(STELLAR_HORIZON_MAINNET);
    const account = await server.loadAccount(address);

    const balances = account.balances.map(b => ({
      asset:   b.asset_type === "native" ? "XLM" : `${(b as { asset_code: string }).asset_code}`,
      issuer:  b.asset_type === "native" ? null    : (b as { asset_issuer: string }).asset_issuer ?? null,
      balance: parseFloat(b.balance),
    }));

    const xlmBalance = balances.find(b => b.asset === "XLM")?.balance ?? 0;

    return NextResponse.json({
      address,
      balances,
      xlmBalance,
      explorerUrl: `${STELLAR_EXPLORER_BASE}/account/${address}`,
      network:     "Stellar Mainnet",
    });
  } catch (err) {
    const msg = String(err);
    // Horizon 404 = account not funded yet
    if (msg.includes("404") || msg.includes("Not Found")) {
      return NextResponse.json({
        address,
        balances:    [],
        xlmBalance:  0,
        explorerUrl: `${STELLAR_EXPLORER_BASE}/account/${address}`,
        network:     "Stellar Mainnet",
        note:        "Account not yet funded. Send at least 1 XLM to activate.",
      });
    }
    console.error("[stellar-balance]", err);
    return NextResponse.json({ error: "Failed to fetch Stellar balance." }, { status: 500 });
  }
}
