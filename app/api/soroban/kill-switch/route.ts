// GET  /api/soroban/kill-switch — read current on-chain kill switch state (no signing)
// POST /api/soroban/kill-switch — toggle the kill switch using the user's CFO keypair

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDB } from "@/lib/db";
import { getKeypair } from "@/lib/wallet";
import {
  isKillSwitchActive,
  toggleKillSwitch,
  CONTRACT_ID,
  EXPLORER_URL,
} from "@/lib/soroban/contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  void req;
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const db   = getDB();
  const rows = await db`SELECT cfo_wallet_address FROM users WHERE id = ${session.userId}`;
  const walletAddress = rows[0]?.cfo_wallet_address ? String(rows[0].cfo_wallet_address) : null;

  if (!walletAddress) {
    return NextResponse.json({ active: false, noWallet: true, contractId: CONTRACT_ID, explorerUrl: EXPLORER_URL });
  }

  try {
    const active = await isKillSwitchActive(walletAddress);
    return NextResponse.json({ active, noWallet: false, contractId: CONTRACT_ID, explorerUrl: EXPLORER_URL });
  } catch {
    return NextResponse.json({ active: false, noWallet: false, contractId: CONTRACT_ID, explorerUrl: EXPLORER_URL });
  }
}

export async function POST(req: NextRequest) {
  void req;
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const db   = getDB();
  const rows = await db`SELECT cfo_wallet_address, cfo_wallet_key FROM users WHERE id = ${session.userId}`;
  const user = rows[0];

  if (!user?.cfo_wallet_address || !user?.cfo_wallet_key) {
    return NextResponse.json(
      { error: "No CFO wallet found. Enable the CFO first to create one." },
      { status: 400 },
    );
  }

  const encryptedKey = String(user.cfo_wallet_key);

  try {
    const keypair  = getKeypair(encryptedKey);
    const newState = await toggleKillSwitch(keypair);

    // If kill switch just activated, also deactivate the CFO loop in the DB
    // so no further ticks are queued while the on-chain guard is live.
    if (newState) {
      await db`UPDATE users SET cfo_active = 0 WHERE id = ${session.userId}`;
    }

    return NextResponse.json({
      ok:          true,
      active:      newState,
      contractId:  CONTRACT_ID,
      explorerUrl: EXPLORER_URL,
    });
  } catch (err) {
    console.error("[soroban/kill-switch] Toggle error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
