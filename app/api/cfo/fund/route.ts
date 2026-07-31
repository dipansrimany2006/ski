// POST /api/cfo/fund — fund the user's CFO agent wallet via Stellar Friendbot (testnet only)

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDB, getUserById } from "@/lib/db";
import { getWalletXLMBalance } from "@/lib/wallet";
import { STELLAR_EXPLORER_BASE } from "@/lib/stellar/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  void req;

  const db   = getDB();
  const user = await getUserById(db, session.userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (!user.cfo_wallet_address) {
    return NextResponse.json({ error: "No CFO wallet found. Create one first." }, { status: 400 });
  }

  const address = String(user.cfo_wallet_address);

  // Friendbot returns 200 on first fund, 400 if already funded — both are OK.
  const fbRes = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
  const alreadyFunded = fbRes.status === 400;

  // Read the resulting balance (testnet Horizon).
  const balance = user.cfo_wallet_key
    ? await getWalletXLMBalance(user.cfo_wallet_key as string).catch(() => 0)
    : 0;

  return NextResponse.json({
    ok:          true,
    address,
    balanceXLM:  balance,
    alreadyFunded,
    explorerUrl: `${STELLAR_EXPLORER_BASE}/account/${address}`,
    message:     alreadyFunded
      ? "Wallet already funded — current balance shown."
      : "Funded with 10 000 XLM via Friendbot.",
  });
}
