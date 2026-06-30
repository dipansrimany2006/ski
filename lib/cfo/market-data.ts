// OHLCV candle fetching
// Spot candles: Binance public API (no key) — supports any USDT pair
// Fallback:     Pyth Benchmark TradingView shim
// Historical:   Binance → Pyth (Crypto.X/USD format) → Kraken

import type { Candle } from "./types";

const BENCHMARK   = "https://benchmarks.pyth.network/v1/shims/tradingview/history";
const BINANCE_HOSTS = [
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api4.binance.com",
];
const BINANCE_API = `${BINANCE_HOSTS[0]}/api/v3/klines`;
const KRAKEN_API  = "https://api.kraken.com/0/public/OHLC";

// Derive a Binance USDT spot pair from a Pyth display symbol ("BTC/USD") or plain symbol ("BTC")
function toBinancePair(symbol: string): string {
  const base = symbol.replace(/\/USD[T]?$/, "").toUpperCase();
  return `${base}USDT`;
}

// Kraken uses different pair names for some assets
const KRAKEN_PAIR_MAP: Record<string, string> = {
  BTC: "XBTUSD", ETH: "ETHUSD", SOL: "SOLUSD", XRP: "XRPUSD",
  DOGE: "DOGEUSD", ADA: "ADAUSD", DOT: "DOTUSD", LINK: "LINKUSD",
  AVAX: "AVAXUSD", MATIC: "MATICUSD", UNI: "UNIUSD", AAVE: "AAVEUSD",
};
function toKrakenPair(symbol: string): string {
  const base = symbol.replace(/\/USD[T]?$/, "").toUpperCase();
  return KRAKEN_PAIR_MAP[base] ?? `${base}USD`;
}

// Kraken interval in minutes
const KRAKEN_INTERVAL: Record<string, number> = { "1h": 60, "4h": 240, "1d": 1440 };

async function fetchBinanceCandles(pair: string, limit = 200, interval = "5m"): Promise<Candle[]> {
  const url = `${BINANCE_API}?symbol=${pair}&interval=${interval}&limit=${limit}`;
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json() as [number, string, string, string, string, string, ...unknown[]][];
    return data.map(k => ({
      time:   Math.floor(k[0] / 1000),
      open:   parseFloat(k[1]),
      high:   parseFloat(k[2]),
      low:    parseFloat(k[3]),
      close:  parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch {
    return [];
  }
}

async function fetchPythCandles(pythSymbol: string, resolution = "5", lookbackSeconds = 86400): Promise<Candle[]> {
  const now  = Math.floor(Date.now() / 1000);
  const from = now - lookbackSeconds;
  const url  = `${BENCHMARK}?symbol=${encodeURIComponent(pythSymbol)}&resolution=${resolution}&from=${from}&to=${now}`;
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json() as {
      s: string; t?: number[]; o?: number[]; h?: number[]; l?: number[]; c?: number[]; v?: number[];
    };
    if (data.s !== "ok" || !data.t || !data.c) return [];
    return data.t.map((t, i) => ({
      time:   t,
      open:   data.o?.[i] ?? data.c![i],
      high:   data.h?.[i] ?? data.c![i],
      low:    data.l?.[i] ?? data.c![i],
      close:  data.c![i],
      volume: data.v?.[i] ?? 0,
    }));
  } catch {
    return [];
  }
}

// For CFO engine: ~200 5-min candles.
// pythSymbol can be a full Pyth symbol ("Crypto.BTC/USD") or display symbol ("BTC/USD").
export async function fetchCFOCandles(pythSymbol: string): Promise<Candle[]> {
  const pair = toBinancePair(pythSymbol);
  const candles = await fetchBinanceCandles(pair, 200, "5m");
  if (candles.length >= 30) return candles;
  return fetchPythCandles(pythSymbol, "5", 200 * 5 * 60);
}

// Generic candle fetch (used by chart API)
export async function fetchCandles(pythSymbol: string, resolution = "5", lookbackSeconds = 86400): Promise<Candle[]> {
  const pair = toBinancePair(pythSymbol);
  const interval = resolution === "60" ? "1h" : resolution === "240" ? "4h" : resolution === "D" ? "1d" : "5m";
  const limit = Math.ceil(lookbackSeconds / (parseInt(resolution) * 60) || 200);
  const candles = await fetchBinanceCandles(pair, Math.min(limit, 1000), interval);
  if (candles.length >= 30) return candles;
  return fetchPythCandles(pythSymbol, resolution, lookbackSeconds);
}

const PYTH_RESOLUTION: Record<string, string> = { "1h": "60", "4h": "240", "1d": "D" };

// Pyth Benchmark historical — requires "Crypto.BTC/USD" symbol format
async function fetchPythHistoricalCandles(
  symbol: string,
  interval: "1h" | "4h" | "1d",
  fromMs: number,
  toMs: number,
): Promise<Candle[]> {
  const resolution = PYTH_RESOLUTION[interval] ?? "60";
  const from = Math.floor(fromMs / 1000);
  const to   = Math.floor(toMs   / 1000);
  // Pyth TradingView shim needs "Crypto.BTC/USD" format
  const base = symbol.replace(/\/USD[T]?$/, "").toUpperCase();
  const pythSym = `Crypto.${base}/USD`;
  const url = `${BENCHMARK}?symbol=${encodeURIComponent(pythSym)}&resolution=${resolution}&from=${from}&to=${to}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      console.warn(`[market-data] Pyth ${res.status} for ${pythSym}`);
      return [];
    }
    const data = await res.json() as {
      s: string; t?: number[]; o?: number[]; h?: number[]; l?: number[]; c?: number[]; v?: number[];
    };
    if (data.s !== "ok" || !data.t || !data.c) {
      console.warn(`[market-data] Pyth s=${data.s} for ${pythSym}`);
      return [];
    }
    return data.t.map((t, i) => ({
      time:   t,
      open:   data.o?.[i] ?? data.c![i],
      high:   data.h?.[i] ?? data.c![i],
      low:    data.l?.[i] ?? data.c![i],
      close:  data.c![i],
      volume: data.v?.[i] ?? 0,
    }));
  } catch (err) {
    console.warn(`[market-data] Pyth historical error for ${pythSym}:`, err);
    return [];
  }
}

// Kraken historical OHLCV — US-accessible, no auth required
// Returns up to 720 bars per request; paginates via `since`
async function fetchKrakenHistoricalCandles(
  symbol: string,
  interval: "1h" | "4h" | "1d",
  fromMs: number,
  toMs: number,
): Promise<Candle[]> {
  const pair = toKrakenPair(symbol);
  const intervalMin = KRAKEN_INTERVAL[interval] ?? 60;
  const all: Candle[] = [];
  let since = Math.floor(fromMs / 1000);

  while (true) {
    const url = `${KRAKEN_API}?pair=${pair}&interval=${intervalMin}&since=${since}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        console.warn(`[market-data] Kraken ${res.status} for ${pair}`);
        break;
      }
      const json = await res.json() as {
        error: string[];
        result?: Record<string, [number, string, string, string, string, string, number, number][]> & { last?: number };
      };
      if (json.error?.length) {
        console.warn(`[market-data] Kraken error for ${pair}:`, json.error);
        break;
      }
      if (!json.result) break;

      const resultKey = Object.keys(json.result).find(k => k !== "last");
      if (!resultKey) break;
      const rows = json.result[resultKey];
      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        const t = row[0];
        if (t > Math.floor(toMs / 1000)) break;
        all.push({
          time:   t,
          open:   parseFloat(row[1]),
          high:   parseFloat(row[2]),
          low:    parseFloat(row[3]),
          close:  parseFloat(row[4]),
          volume: parseFloat(row[6].toString()),
        });
      }

      const last = json.result.last as number | undefined;
      if (!last || rows.length < 720) break;
      since = last;
    } catch (err) {
      console.warn(`[market-data] Kraken fetch error for ${pair}:`, err);
      break;
    }
  }

  return all.filter(c => c.time <= Math.floor(toMs / 1000));
}

// Historical paginated candles — for backtesting.
// Priority: Binance → Pyth (Crypto.X/USD) → Kraken
// On 451 (geo-block), skips remaining Binance hosts immediately to avoid wasted timeouts.
export async function fetchHistoricalCandles(
  symbol: string,        // e.g. "BTC/USD" or "ETH/USD"
  interval: "1h" | "4h" | "1d",
  fromMs: number,        // unix milliseconds
  toMs: number,
): Promise<Candle[]> {
  const pair = toBinancePair(symbol);
  let geoBlocked = false;

  for (const host of BINANCE_HOSTS) {
    if (geoBlocked) break; // 451 from any host means all are blocked — skip early

    const all: Candle[] = [];
    let startTime = fromMs;
    let failed = false;

    while (startTime < toMs) {
      const url = `${host}/api/v3/klines?symbol=${pair}&interval=${interval}&startTime=${startTime}&endTime=${toMs}&limit=1000`;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
        if (!res.ok) {
          if (res.status === 451) geoBlocked = true; // all hosts share this restriction
          failed = true;
          break;
        }
        const data = await res.json() as [number, string, string, string, string, string, ...unknown[]][];
        if (!data.length) break;

        const batch: Candle[] = data.map(k => ({
          time:   Math.floor(k[0] / 1000),
          open:   parseFloat(k[1]),
          high:   parseFloat(k[2]),
          low:    parseFloat(k[3]),
          close:  parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));

        all.push(...batch);

        const lastMs = data[data.length - 1][0] as number;
        if (lastMs <= startTime) break;
        startTime = lastMs + 1;

        if (data.length < 1000) break;
      } catch {
        failed = true;
        break;
      }
    }

    if (!failed && all.length > 0) return all;
    if (failed) continue;
    return all;
  }

  // Pyth fallback (Crypto.X/USD format)
  const pythCandles = await fetchPythHistoricalCandles(symbol, interval, fromMs, toMs);
  if (pythCandles.length >= 50) return pythCandles;

  // Kraken fallback — US-accessible exchange
  return fetchKrakenHistoricalCandles(symbol, interval, fromMs, toMs);
}
