import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BENCHMARK  = "https://benchmarks.pyth.network/v1/shims/tradingview/history";
const KRAKEN_API = "https://api.kraken.com/0/public/OHLC";

export async function GET() {
  const results: Record<string, unknown> = {};
  const now = Math.floor(Date.now() / 1000);

  // Binance
  try {
    const res = await fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=5", { signal: AbortSignal.timeout(6_000) });
    results["binance"] = { status: res.status };
  } catch (err) {
    results["binance"] = { error: String(err) };
  }

  // Pyth with Crypto.BTC/USD format
  try {
    const url = `${BENCHMARK}?symbol=${encodeURIComponent("Crypto.BTC/USD")}&resolution=60&from=${now - 5 * 3600}&to=${now}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const json = await res.json() as { s?: string; t?: unknown[] };
    results["pyth_crypto_format"] = { status: res.status, s: json.s, bars: json.t?.length ?? 0 };
  } catch (err) {
    results["pyth_crypto_format"] = { error: String(err) };
  }

  // Kraken
  try {
    const since = now - 5 * 3600;
    const url = `${KRAKEN_API}?pair=XBTUSD&interval=60&since=${since}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const json = await res.json() as { error: string[]; result?: Record<string, unknown[]> };
    const key = json.result ? Object.keys(json.result).find(k => k !== "last") : undefined;
    const bars = key ? (json.result![key] as unknown[]).length : 0;
    results["kraken"] = { status: res.status, errors: json.error, bars };
  } catch (err) {
    results["kraken"] = { error: String(err) };
  }

  return NextResponse.json(results);
}
