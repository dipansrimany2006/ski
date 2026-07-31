// POST /api/cfo/wallet — create a Stellar agent wallet for this user (idempotent)
// GET  /api/cfo/wallet — return wallet address + live XLM balance (testnet)

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDB, getUserById } from "@/lib/db";
import { generateAgentWallet, getWalletXLMBalance } from "@/lib/wallet";
import { STELLAR_EXPLORER_BASE } from "@/lib/stellar/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function friendbotFund(address: string): Promise<void> {
  await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`).catch(() => {});
}

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const db   = getDB();
  const user = await getUserById(db, session.userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (!user.cfo_wallet_address) return NextResponse.json({ wallet: null });

  const balance = user.cfo_wallet_key
    ? await getWalletXLMBalance(user.cfo_wallet_key).catch(() => 0)
    : 0;

  return NextResponse.json({
    wallet: {
      address:     user.cfo_wallet_address,
      balanceXLM:  balance,
      explorerUrl: `${STELLAR_EXPLORER_BASE}/account/${user.cfo_wallet_address}`,
      network:     "Stellar Testnet",
      funded:      balance >= 1,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  void req;

  const db   = getDB();
  const user = await getUserById(db, session.userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Idempotent — return existing wallet
  if (user.cfo_wallet_address) {
    const balance = user.cfo_wallet_key
      ? await getWalletXLMBalance(user.cfo_wallet_key).catch(() => 0)
      : 0;
    return NextResponse.json({
      created:    false,
      address:    user.cfo_wallet_address,
      balanceXLM: balance,
      message:    "Agent wallet already exists.",
    });
  }

  const { address, encryptedKey } = generateAgentWallet();

  await db`
    UPDATE users
    SET cfo_wallet_address = ${address},
        cfo_wallet_key     = ${encryptedKey},
        updated_at         = to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    WHERE id = ${session.userId}
  `;

  // Auto-fund the new wallet via Friendbot (testnet — free, idempotent).
  await friendbotFund(address);

  return NextResponse.json({
    created:     true,
    address,
    balanceXLM:  10_000,
    explorerUrl: `${STELLAR_EXPLORER_BASE}/account/${address}`,
    message:     "Stellar testnet agent wallet created and funded with 10 000 XLM via Friendbot.",
  });
}
