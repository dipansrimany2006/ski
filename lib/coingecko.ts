// Thin CoinGecko client with an in-memory cache, request coalescing, a single
// retry on 429, and stale-fallback — so bursty traffic on the free tier does not
// trip rate limits or fail user requests.

const BASE = "https://api.coingecko.com/api/v3";

// Optional free demo key (https://www.coingecko.com/en/api) raises the limit a lot.
const API_KEY = process.env.COINGECKO_API_KEY;

export interface SimplePrice {
  usd: number;
  usd_24h_change: number;
}

interface CacheEntry {
  ts: number;
  data: unknown;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rawFetch(url: string): Promise<unknown> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (API_KEY) headers["x-cg-demo-api-key"] = API_KEY;

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (res.ok) return res.json();
    // Back off once on rate limit, then give up to the caller's stale fallback.
    if (res.status === 429 && attempt === 0) {
      await sleep(700);
      continue;
    }
    throw new Error(`CoinGecko ${res.status}`);
  }
  throw new Error("CoinGecko 429");
}

// Returns cached data when fresh, coalesces concurrent calls, and falls back to
// stale data if a refresh fails (e.g. a 429).
async function cachedFetch(url: string, ttlMs: number): Promise<unknown> {
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && now - hit.ts < ttlMs) return hit.data;

  const existing = inflight.get(url);
  if (existing) return existing;

  const p = (async () => {
    try {
      const data = await rawFetch(url);
      cache.set(url, { ts: Date.now(), data });
      return data;
    } catch (err) {
      if (hit) return hit.data; // serve stale rather than fail
      throw err;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, p);
  return p;
}

export async function fetchPrices(ids: string[]): Promise<Record<string, SimplePrice>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return {};
  const url = `${BASE}/simple/price?ids=${unique.join(",")}&vs_currencies=usd&include_24hr_change=true`;
  return (await cachedFetch(url, 60_000)) as Record<string, SimplePrice>;
}

// Daily-ish closing prices for RSI / momentum. Cached for an hour.
export async function fetchPriceSeries(id: string, days = 30): Promise<number[]> {
  const url = `${BASE}/coins/${id}/market_chart?vs_currency=usd&days=${days}`;
  const data = (await cachedFetch(url, 3_600_000)) as { prices?: [number, number][] };
  return (data.prices ?? []).map((p) => p[1]);
}
