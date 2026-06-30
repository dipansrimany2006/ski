// Market data: Pyth for prices; CoinGecko for logos, change %, volume, market cap, sparklines.

const PYTH_BASE = "https://hermes.pyth.network";
const CG_BASE   = "https://api.coingecko.com/api/v3";

function pythHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  const k = process.env.PYTH_API_KEY;
  if (k) h["Authorization"] = `Bearer ${k}`;
  return h;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface AssetData {
  id: string;
  symbol: string;
  name: string;
  displaySymbol: string;
  priceUsd: number;
  change24h: number;
  change24hUsd: number;
  volume24h: number;
  marketCap: number;
  logo: string;
  sparkline: number[];
  isMajor: boolean;
  category: "crypto" | "equity";
  country?: string;
}

const CG_BY_SYMBOL: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", AVAX: "avalanche-2",
  DOT: "polkadot", NEAR: "near", ATOM: "cosmos", TIA: "celestia",
  XLM: "stellar", LINK: "chainlink", USDC: "usd-coin",
  USDT: "tether", DOGE: "dogecoin", XRP: "ripple",
  ADA: "cardano", MATIC: "matic-network", LTC: "litecoin",
  UNI: "uniswap", AAVE: "aave", MKR: "maker", OP: "optimism",
  ARB: "arbitrum", SUI: "sui", APT: "aptos", SEI: "sei-network",
};

// ── Pyth feed metadata ─────────────────────────────────────────────────────

interface PythFeed {
  id: string;
  attributes: {
    asset_type: string;
    base: string;
    description: string;
    display_symbol: string;
    symbol: string;
    country?: string;
    quote_currency?: string;
  };
}

const feedCaches: Partial<Record<string, { ts: number; feeds: PythFeed[] }>> = {};

export async function fetchPythFeedsByType(assetType: string): Promise<PythFeed[]> {
  const cached = feedCaches[assetType];
  if (cached && Date.now() - cached.ts < 3_600_000) return cached.feeds;
  const res = await fetch(`${PYTH_BASE}/v2/price_feeds?asset_type=${assetType}`, {
    headers: pythHeaders(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Pyth feeds (${assetType}) ${res.status}`);
  const feeds = (await res.json()) as PythFeed[];
  feedCaches[assetType] = { ts: Date.now(), feeds };
  return feeds;
}

// ── Pyth batch price fetch ─────────────────────────────────────────────────

interface PythParsed {
  id: string;
  price:     { price: string; expo: number };
  ema_price: { price: string; expo: number };
}

function toFloat(raw: { price: string; expo: number }): number {
  return Number(raw.price) * Math.pow(10, raw.expo);
}

async function fetchPricesBatch(ids: string[]): Promise<Map<string, { price: number; ema: number }>> {
  const BATCH = 100;
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH) batches.push(ids.slice(i, i + BATCH));

  const results = await Promise.all(
    batches.map(async (batch) => {
      const params = batch.map((id) => `ids[]=${id}`).join("&");
      const res = await fetch(
        `${PYTH_BASE}/v2/updates/price/latest?${params}&parsed=true`,
        { headers: pythHeaders(), next: { revalidate: 15 } },
      );
      if (!res.ok) return [] as PythParsed[];
      const data = (await res.json()) as { parsed: PythParsed[] };
      return data.parsed;
    }),
  );

  const map = new Map<string, { price: number; ema: number }>();
  for (const batch of results) {
    for (const p of batch) {
      map.set(p.id.toLowerCase(), { price: toFloat(p.price), ema: toFloat(p.ema_price) });
    }
  }
  return map;
}

// ── CoinGecko (logos, change %, volume, market cap, 7-day sparkline) ───────

interface CGMarket {
  id: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  price_change_24h: number;
  total_volume: number;
  market_cap: number;
  image: string;
  sparkline_in_7d: { price: number[] };
}

async function fetchCGMarkets(cgIds: string[]): Promise<Map<string, CGMarket>> {
  const url = `${CG_BASE}/coins/markets?vs_currency=usd&ids=${cgIds.join(",")}&sparkline=true&price_change_percentage=24h&order=market_cap_desc&per_page=50`;
  const headers: Record<string, string> = { Accept: "application/json" };
  const k = process.env.COINGECKO_API_KEY;
  if (k) headers["x-cg-demo-api-key"] = k;
  const res = await fetch(url, { headers, next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const data = (await res.json()) as CGMarket[];
  const map = new Map<string, CGMarket>();
  for (const m of data) map.set(m.id, m);
  return map;
}

function downsample(arr: number[], n = 30): number[] {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
}

// ── Single asset detail ─────────────────────────────────────────────────────

export interface AssetDetail extends AssetData {
  pythSymbol: string; // full Pyth symbol e.g. "Crypto.BTC/USD" — used for chart API
}

export async function fetchAssetDetail(displaySymbol: string): Promise<AssetDetail | null> {
  const [cryptoFeeds, equityFeeds] = await Promise.all([
    fetchPythFeedsByType("crypto").catch(() => [] as PythFeed[]),
    fetchPythFeedsByType("equity").catch(() => [] as PythFeed[]),
  ]);

  let feed = cryptoFeeds.find(f => f.attributes.display_symbol === displaySymbol);
  let category: "crypto" | "equity" = "crypto";
  if (!feed) {
    feed = equityFeeds.find(f => f.attributes.display_symbol === displaySymbol);
    category = "equity";
  }
  if (!feed) return null;

  const priceMap = await fetchPricesBatch([feed.id]).catch(() => new Map<string, { price: number; ema: number }>());
  const pyth = priceMap.get(feed.id.toLowerCase());
  if (!pyth || pyth.price <= 0) return null;

  const pythSymbol = feed.attributes.symbol;

  if (category === "equity") {
    const symbol  = feed.attributes.base;
    const rawName = feed.attributes.description.split(" / ")[0];
    const name    = rawName.split(" ").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
    const change24h = pyth.ema > 0 ? ((pyth.price - pyth.ema) / pyth.ema) * 100 : 0;
    return {
      id: feed.id, symbol, name,
      displaySymbol: feed.attributes.display_symbol,
      priceUsd: pyth.price, change24h,
      change24hUsd: pyth.ema > 0 ? pyth.price - pyth.ema : 0,
      volume24h: 0, marketCap: 0, logo: "", sparkline: [],
      isMajor: false, category: "equity",
      country: feed.attributes.country,
      pythSymbol,
    };
  }

  const symbol = feed.attributes.base;
  const cgId   = CG_BY_SYMBOL[symbol];
  let cg: CGMarket | undefined;
  if (cgId) {
    const cgMap = await fetchCGMarkets([cgId]).catch(() => new Map<string, CGMarket>());
    cg = cgMap.get(cgId);
  }
  const change24h = cg?.price_change_percentage_24h ??
    (pyth.ema > 0 ? ((pyth.price - pyth.ema) / pyth.ema) * 100 : 0);

  return {
    id: feed.id, symbol,
    name: cg?.name ?? feed.attributes.description.split(" / ")[0],
    displaySymbol: feed.attributes.display_symbol,
    priceUsd: pyth.price, change24h,
    change24hUsd: cg?.price_change_24h ?? 0,
    volume24h: cg?.total_volume ?? 0,
    marketCap: cg?.market_cap ?? 0,
    logo: cg?.image ?? "",
    sparkline: downsample([...(cg?.sparkline_in_7d?.price ?? [])].reverse(), 30),
    isMajor: !!cg, category: "crypto",
    pythSymbol,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

function buildCryptoAssets(
  feeds: PythFeed[],
  priceMap: Map<string, { price: number; ema: number }>,
  cgMap: Map<string, CGMarket>,
): AssetData[] {
  return feeds
    .map((feed): AssetData | null => {
      const symbol = feed.attributes.base;
      const pyth   = priceMap.get(feed.id.toLowerCase());
      if (!pyth || pyth.price <= 0) return null;

      const cgId = CG_BY_SYMBOL[symbol];
      const cg   = cgId ? cgMap.get(cgId) : undefined;

      const change24h =
        cg?.price_change_percentage_24h ??
        (pyth.ema > 0 ? ((pyth.price - pyth.ema) / pyth.ema) * 100 : 0);

      return {
        id: feed.id, symbol,
        name: cg?.name ?? feed.attributes.description.split(" / ")[0],
        displaySymbol: feed.attributes.display_symbol,
        priceUsd: pyth.price, change24h,
        change24hUsd: cg?.price_change_24h ?? 0,
        volume24h: cg?.total_volume ?? 0,
        marketCap: cg?.market_cap ?? 0,
        logo: cg?.image ?? "",
        sparkline: downsample([...(cg?.sparkline_in_7d?.price ?? [])].reverse(), 30),
        isMajor: !!cg,
        category: "crypto",
      };
    })
    .filter((a): a is AssetData => a !== null);
}

function buildEquityAssets(
  feeds: PythFeed[],
  priceMap: Map<string, { price: number; ema: number }>,
): AssetData[] {
  const usdFeeds = feeds.filter((f) => f.attributes.quote_currency === "USD");
  return usdFeeds
    .map((feed): AssetData | null => {
      const pyth = priceMap.get(feed.id.toLowerCase());
      if (!pyth || pyth.price <= 0) return null;

      const symbol  = feed.attributes.base;
      const rawName = feed.attributes.description.split(" / ")[0];
      const name    = rawName
        .split(" ")
        .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
        .join(" ");
      const change24h = pyth.ema > 0 ? ((pyth.price - pyth.ema) / pyth.ema) * 100 : 0;

      return {
        id: feed.id, symbol, name,
        displaySymbol: feed.attributes.display_symbol,
        priceUsd: pyth.price, change24h,
        change24hUsd: pyth.ema > 0 ? pyth.price - pyth.ema : 0,
        volume24h: 0, marketCap: 0,
        logo: "",
        sparkline: [],
        isMajor: false,
        category: "equity",
        country: feed.attributes.country,
      };
    })
    .filter((a): a is AssetData => a !== null);
}

export async function fetchAssets(): Promise<AssetData[]> {
  const [cryptoFeeds, equityFeeds] = await Promise.all([
    fetchPythFeedsByType("crypto"),
    fetchPythFeedsByType("equity").catch(() => [] as PythFeed[]),
  ]);

  const seenEquity = new Set<string>();
  const dedupedEquity = equityFeeds.filter((f) => {
    if (seenEquity.has(f.attributes.display_symbol)) return false;
    seenEquity.add(f.attributes.display_symbol);
    return true;
  });

  const allFeeds = [...cryptoFeeds, ...dedupedEquity];

  const priceMap = await fetchPricesBatch(allFeeds.map((f) => f.id)).catch(
    () => new Map<string, { price: number; ema: number }>(),
  );

  const knownSymbols = Object.keys(CG_BY_SYMBOL);
  const cgIds = [...new Set(
    cryptoFeeds.filter((f) => knownSymbols.includes(f.attributes.base))
      .map((f) => CG_BY_SYMBOL[f.attributes.base]),
  )];
  const cgMap = await fetchCGMarkets(cgIds).catch(() => new Map<string, CGMarket>());

  const cryptoAssets = buildCryptoAssets(cryptoFeeds, priceMap, cgMap);
  const equityAssets = buildEquityAssets(dedupedEquity, priceMap);

  cryptoAssets.sort((a, b) => {
    if (a.isMajor && b.isMajor) return b.marketCap - a.marketCap;
    if (a.isMajor) return -1;
    if (b.isMajor) return 1;
    return b.priceUsd - a.priceUsd;
  });

  equityAssets.sort((a, b) => b.priceUsd - a.priceUsd);

  return [...cryptoAssets, ...equityAssets];
}
