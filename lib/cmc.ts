// CoinMarketCap AI Agent Hub client
// Provides Fear & Greed, global metrics, and Stellar asset listings

const CMC_BASE = "https://pro-api.coinmarketcap.com";

export interface FearGreedData {
  value: number;
  valueText: string;
  timestamp: string;
}

export interface GlobalMetrics {
  totalMarketCapUsd: number;
  totalVolume24hUsd: number;
  btcDominancePct: number;
  ethDominancePct: number;
  activeCryptocurrencies: number;
}

export interface CMCToken {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  cmcRank: number;
  priceUsd: number;
  volume24hUsd: number;
  marketCapUsd: number;
  change24h: number;
  change7d: number;
}

// In-memory caches (5 min TTL)
const CACHE_TTL = 300_000;
let fgCache:      { data: FearGreedData; ts: number } | null = null;
let globalCache:  { data: GlobalMetrics; ts: number } | null = null;
let xlmCache:     { data: CMCToken[];    ts: number } | null = null;
const topCache = new Map<number, { data: CMCToken[]; ts: number }>();

function cmcHeaders(): Record<string, string> {
  return {
    "X-CMC_PRO_API_KEY": process.env.CMC_API_KEY ?? "",
    Accept: "application/json",
  };
}

export async function fetchFearGreed(): Promise<FearGreedData> {
  if (fgCache && Date.now() - fgCache.ts < CACHE_TTL) return fgCache.data;

  const k = process.env.CMC_API_KEY;
  if (!k) {
    return { value: 50, valueText: "Neutral", timestamp: new Date().toISOString() };
  }

  try {
    const res = await fetch(`${CMC_BASE}/v3/fear-and-greed/latest`, {
      headers: cmcHeaders(),
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`CMC F&G ${res.status}`);

    const json = await res.json() as {
      data: { value: number; value_classification: string; timestamp: string };
    };
    const data: FearGreedData = {
      value:     json.data.value,
      valueText: json.data.value_classification,
      timestamp: json.data.timestamp,
    };
    fgCache = { data, ts: Date.now() };
    return data;
  } catch {
    return { value: 50, valueText: "Neutral", timestamp: new Date().toISOString() };
  }
}

export async function fetchGlobalMetrics(): Promise<GlobalMetrics | null> {
  if (globalCache && Date.now() - globalCache.ts < CACHE_TTL) return globalCache.data;

  const k = process.env.CMC_API_KEY;
  if (!k) return null;

  try {
    const res = await fetch(`${CMC_BASE}/v1/global-metrics/quotes/latest`, {
      headers: cmcHeaders(),
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;

    const json = await res.json() as {
      data: {
        total_market_cap: { USD: number };
        total_volume_24h: { USD: number };
        btc_dominance: number;
        eth_dominance: number;
        active_cryptocurrencies: number;
      };
    };
    const d = json.data;
    const data: GlobalMetrics = {
      totalMarketCapUsd:    d.total_market_cap.USD,
      totalVolume24hUsd:    d.total_volume_24h.USD,
      btcDominancePct:      d.btc_dominance,
      ethDominancePct:      d.eth_dominance,
      activeCryptocurrencies: d.active_cryptocurrencies,
    };
    globalCache = { data, ts: Date.now() };
    return data;
  } catch {
    return null;
  }
}

// Parse the standard CMC listings response into CMCToken[]
function parseCMCListings(json: {
  data: Array<{
    id: number; name: string; symbol: string; slug: string; cmc_rank: number;
    quote: { USD: { price: number; volume_24h: number; market_cap: number; percent_change_24h: number; percent_change_7d: number } };
  }>;
}): CMCToken[] {
  return json.data.map(d => ({
    id:           d.id,
    name:         d.name,
    symbol:       d.symbol,
    slug:         d.slug,
    cmcRank:      d.cmc_rank,
    priceUsd:     d.quote.USD.price,
    volume24hUsd: d.quote.USD.volume_24h,
    marketCapUsd: d.quote.USD.market_cap,
    change24h:    d.quote.USD.percent_change_24h,
    change7d:     d.quote.USD.percent_change_7d,
  }));
}

// Top N tokens by global market cap — the broad universe for CMC Strategy Skills
export async function fetchTopCMCTokens(limit = 100): Promise<CMCToken[]> {
  const cached = topCache.get(limit);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const k = process.env.CMC_API_KEY;
  if (!k) return [];

  try {
    const res = await fetch(
      `${CMC_BASE}/v1/cryptocurrency/listings/latest?limit=${limit}&sort=market_cap`,
      { headers: cmcHeaders(), next: { revalidate: 300 } },
    );
    if (!res.ok) return [];

    const json = await res.json() as Parameters<typeof parseCMCListings>[0];
    const data = parseCMCListings(json);
    topCache.set(limit, { data, ts: Date.now() });
    return data;
  } catch {
    return [];
  }
}

// Core Stellar ecosystem tokens with hardcoded fallback prices
export async function fetchStellarTokens(): Promise<CMCToken[]> {
  if (xlmCache && Date.now() - xlmCache.ts < CACHE_TTL) return xlmCache.data;

  const k = process.env.CMC_API_KEY;

  const fallback: CMCToken[] = [
    { id: 512,  name: "Stellar Lumens", symbol: "XLM",  slug: "stellar",  cmcRank: 20, priceUsd: 0, volume24hUsd: 0, marketCapUsd: 0, change24h: 0, change7d: 0 },
    { id: 3408, name: "USD Coin",        symbol: "USDC", slug: "usd-coin", cmcRank: 7,  priceUsd: 1, volume24hUsd: 0, marketCapUsd: 0, change24h: 0, change7d: 0 },
    { id: 1,    name: "Bitcoin",         symbol: "BTC",  slug: "bitcoin",  cmcRank: 1,  priceUsd: 0, volume24hUsd: 0, marketCapUsd: 0, change24h: 0, change7d: 0 },
    { id: 1027, name: "Ethereum",        symbol: "ETH",  slug: "ethereum", cmcRank: 2,  priceUsd: 0, volume24hUsd: 0, marketCapUsd: 0, change24h: 0, change7d: 0 },
  ];

  if (!k) return fallback;

  try {
    const ids = "512,3408,1,1027"; // XLM, USDC, BTC, ETH
    const res = await fetch(
      `${CMC_BASE}/v1/cryptocurrency/quotes/latest?id=${ids}`,
      { headers: cmcHeaders(), next: { revalidate: 300 } },
    );
    if (!res.ok) return fallback;

    const json = await res.json() as {
      data: Record<string, {
        id: number; name: string; symbol: string; slug: string; cmc_rank: number;
        quote: { USD: { price: number; volume_24h: number; market_cap: number; percent_change_24h: number; percent_change_7d: number } };
      }>;
    };

    const data = Object.values(json.data).map(d => ({
      id:           d.id,
      name:         d.name,
      symbol:       d.symbol,
      slug:         d.slug,
      cmcRank:      d.cmc_rank,
      priceUsd:     d.quote.USD.price,
      volume24hUsd: d.quote.USD.volume_24h,
      marketCapUsd: d.quote.USD.market_cap,
      change24h:    d.quote.USD.percent_change_24h,
      change7d:     d.quote.USD.percent_change_7d,
    }));
    xlmCache = { data, ts: Date.now() };
    return data;
  } catch {
    return fallback;
  }
}
