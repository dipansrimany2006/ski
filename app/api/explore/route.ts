// GET /api/explore — returns asset list with Pyth prices + CoinGecko sparklines.

import { NextResponse } from "next/server";
import { fetchAssets } from "@/lib/market";

export const runtime = "nodejs";
export const revalidate = 30;

export async function GET() {
  try {
    const assets = await fetchAssets();
    return NextResponse.json({ assets });
  } catch {
    return NextResponse.json({ assets: [] });
  }
}
