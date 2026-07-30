// GET  /api/soroban/mandate — read the user's on-chain mandate (no signing needed)
// POST /api/soroban/mandate — register or update the mandate using the user's CFO keypair

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDB } from "@/lib/db";
import { getKeypair } from "@/lib/wallet";
import {
  getMandate,
  registerMandate,
  updateMandate,
  mandateParamsFromRisk,
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
    return NextResponse.json({ mandate: null, contractId: CONTRACT_ID, explorerUrl: EXPLORER_URL });
  }

  try {
    const mandate = await getMandate(walletAddress);
    return NextResponse.json({ mandate, contractId: CONTRACT_ID, explorerUrl: EXPLORER_URL });
  } catch {
    return NextResponse.json({ mandate: null, contractId: CONTRACT_ID, explorerUrl: EXPLORER_URL });
  }
}

export async function POST(req: NextRequest) {
  void req;
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const db   = getDB();
  const rows = await db`
    SELECT cfo_wallet_address, cfo_wallet_key, risk_tolerance
    FROM users WHERE id = ${session.userId}
  `;
  const user = rows[0];

  if (!user?.cfo_wallet_address || !user?.cfo_wallet_key) {
    return NextResponse.json(
      { error: "No CFO wallet found. Enable the CFO first to create one." },
      { status: 400 },
    );
  }

  const walletAddress = String(user.cfo_wallet_address);
  const encryptedKey  = String(user.cfo_wallet_key);
  const riskTolerance = String(user.risk_tolerance ?? "balanced") as "conservative" | "balanced" | "aggressive";

  const params  = mandateParamsFromRisk(riskTolerance);
  const keypair = getKeypair(encryptedKey);

  try {
    // Check if one already exists — update instead of re-registering.
    const existing = await getMandate(walletAddress);
    let mandate;
    if (existing) {
      mandate = await updateMandate(
        keypair,
        params.riskTolerance,
        params.maxDrawdownBps,
        params.maxPositionBps,
        params.perTradeCapStroops,
      );
    } else {
      mandate = await registerMandate(
        keypair,
        params.riskTolerance,
        params.maxDrawdownBps,
        params.maxPositionBps,
        params.perTradeCapStroops,
      );
    }

    return NextResponse.json({
      ok: true,
      mandate,
      action:      existing ? "updated" : "registered",
      contractId:  CONTRACT_ID,
      explorerUrl: EXPLORER_URL,
      stellarExplorerAccount: `https://stellar.expert/explorer/testnet/account/${walletAddress}`,
    });
  } catch (err) {
    console.error("[soroban/mandate] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
