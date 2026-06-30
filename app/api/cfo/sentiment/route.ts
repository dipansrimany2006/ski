// GET /api/cfo/sentiment — returns CMC Fear & Greed + global metrics

import { NextResponse } from "next/server";
import { fetchFearGreed, fetchGlobalMetrics } from "@/lib/cmc";

export const dynamic = "force-dynamic";

export async function GET() {
  const [fg, gm] = await Promise.all([
    fetchFearGreed().catch(() => null),
    fetchGlobalMetrics().catch(() => null),
  ]);

  return NextResponse.json({
    fearGreed:      fg?.value ?? null,
    fearGreedLabel: fg?.valueText ?? null,
    btcDominance:   gm?.btcDominancePct ?? null,
    totalMarketCap: gm?.totalMarketCapUsd ?? null,
    timestamp:      fg?.timestamp ?? new Date().toISOString(),
  });
}
