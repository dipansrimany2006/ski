// GET /api/asset/[symbol]/chart?period=1D|1W|1M|3M|1Y
// Fetches OHLC from Pyth Benchmark TradingView shim.
// Returns { prices: [[timestamp_ms, price], ...] }

import { NextRequest, NextResponse } from "next/server";
import { fetchPythFeedsByType } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BENCHMARK = "https://benchmarks.pyth.network/v1/shims/tradingview/history";

type Period = "1D" | "1W" | "1M" | "3M" | "1Y";

function periodParams(period: Period): { resolution: string; from: number } {
  const now = Math.floor(Date.now() / 1000);
  switch (period) {
    case "1D":  return { resolution: "5",  from: now - 86_400 };
    case "1W":  return { resolution: "60", from: now - 604_800 };
    case "1M":  return { resolution: "D",  from: now - 2_592_000 };
    case "3M":  return { resolution: "D",  from: now - 7_776_000 };
    case "1Y":  return { resolution: "W",  from: now - 31_536_000 };
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await ctx.params;
  const displaySymbol = symbol.replace("-", "/");
  const period = (req.nextUrl.searchParams.get("period") ?? "1D") as Period;

  // Resolve the full Pyth symbol (e.g. "Crypto.BTC/USD") from feeds cache
  let pythSymbol: string | null = null;
  try {
    const [cryptoFeeds, equityFeeds] = await Promise.all([
      fetchPythFeedsByType("crypto"),
      fetchPythFeedsByType("equity").catch(() => []),
    ]);
    type PF = { attributes: { display_symbol: string; symbol: string } };
    const feed =
      (cryptoFeeds as PF[]).find(f => f.attributes.display_symbol === displaySymbol) ??
      (equityFeeds as PF[]).find(f => f.attributes.display_symbol === displaySymbol);
    pythSymbol = feed?.attributes.symbol ?? null;
  } catch {
    // fall through
  }

  if (!pythSymbol) {
    return NextResponse.json({ prices: [] });
  }

  const now = Math.floor(Date.now() / 1000);
  const { resolution, from } = periodParams(period);

  const url = `${BENCHMARK}?symbol=${encodeURIComponent(pythSymbol)}&resolution=${resolution}&from=${from}&to=${now}`;

  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return NextResponse.json({ prices: [] });

    const data = (await res.json()) as {
      s: string;
      t?: number[];
      c?: number[];
    };

    if (data.s !== "ok" || !data.t || !data.c) {
      return NextResponse.json({ prices: [] });
    }

    const prices: [number, number][] = data.t.map((ts, i) => [ts * 1000, data.c![i]]);
    return NextResponse.json({ prices });
  } catch {
    return NextResponse.json({ prices: [] });
  }
}

// Export for import in trading-client
export type { Period };
