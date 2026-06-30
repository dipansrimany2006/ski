// GET /api/asset/[symbol] — asset detail + live price
// [symbol] is display_symbol with "/" replaced by "-" e.g. "BTC-USD", "AAPL-USD"

import { NextRequest, NextResponse } from "next/server";
import { fetchAssetDetail } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await ctx.params;
  const displaySymbol = symbol.replace("-", "/");

  const asset = await fetchAssetDetail(displaySymbol).catch(() => null);
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  return NextResponse.json({ asset });
}
