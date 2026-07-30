// GET /api/soroban/decisions
// Returns the on-chain CFO decision audit log for the authenticated user.
// Reads from the ski-cfo Soroban contract via RPC simulation (no signing).

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDB } from "@/lib/db";
import { getDecisions, VETO_REASONS, CONTRACT_ID, EXPLORER_URL } from "@/lib/soroban/contract";

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
    return NextResponse.json({ decisions: [], contractId: CONTRACT_ID, explorerUrl: EXPLORER_URL });
  }

  try {
    const raw = await getDecisions(walletAddress);

    // Convert BigInt fields to strings for JSON serialisation, enrich with labels.
    const decisions = [...raw].reverse().map(d => ({
      asset:               String(d.asset),
      direction:           Number(d.direction),
      directionLabel:      d.direction === 0 ? "buy" : d.direction === 1 ? "sell" : "hold",
      proposedSizeStroops: String(d.proposed_size_stroops),
      finalSizeStroops:    String(d.final_size_stroops),
      finalSizeXlm:        Number(d.final_size_stroops) / 10_000_000,
      approved:            Boolean(d.approved),
      vetoCode:            Number(d.veto_code),
      vetoReason:          Number(d.veto_code) > 0 ? (VETO_REASONS[Number(d.veto_code)] ?? "unknown") : null,
      blendedSignalBps:    Number(d.blended_signal_bps),
      blendedSignal:       Number(d.blended_signal_bps) / 10_000,
      recordedAt:          Number(d.recorded_at),
      ledgerSeq:           Number(d.ledger_seq),
    }));

    return NextResponse.json({ decisions, contractId: CONTRACT_ID, explorerUrl: EXPLORER_URL });
  } catch (err) {
    console.error("[soroban/decisions] Error:", err);
    return NextResponse.json({ decisions: [], contractId: CONTRACT_ID, explorerUrl: EXPLORER_URL });
  }
}
