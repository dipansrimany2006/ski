// Stellar AI Agent integration
// Wraps the CFO engine as a Stellar agent with Horizon-compatible tool definitions

import { fetchFearGreed, fetchGlobalMetrics } from "./cmc";
import { STELLAR_ASSETS, STELLAR_EXPLORER_BASE } from "./stellar/assets";

// ── Tool schema ────────────────────────────────────────────────────────────────

export const STELLAR_AGENT_TOOLS = [
  {
    name: "get_market_sentiment",
    description: "Fetch CMC Fear & Greed index and BTC dominance for Stellar trading decisions",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_stellar_asset_prices",
    description: "Get current prices and 24h changes for core Stellar assets (XLM, USDC, BTC, ETH)",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_agent_wallet",
    description: "Return the agent's Stellar wallet address and XLM balance",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_trading_signals",
    description: "Get multi-strategy signals (momentum, mean reversion, sentiment) for a Stellar asset",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Asset symbol: XLM, BTC, ETH, or USDC" },
      },
      required: ["symbol"],
    },
  },
] as const;

// ── Tool execution ─────────────────────────────────────────────────────────────

export async function executeStellarAgentTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (toolName === "get_market_sentiment") {
    const [fg, gm] = await Promise.all([fetchFearGreed(), fetchGlobalMetrics()]);
    return {
      fearGreedValue:    fg?.value    ?? 50,
      fearGreedLabel:    fg?.valueText ?? "Neutral",
      btcDominancePct:   gm?.btcDominancePct   ?? null,
      totalMarketCapUsd: gm?.totalMarketCapUsd  ?? null,
      signal: fg
        ? fg.value <= 25 ? "strong_buy"
        : fg.value <= 40 ? "buy"
        : fg.value <= 60 ? "neutral"
        : fg.value <= 75 ? "sell"
        : "strong_sell"
        : "neutral",
    };
  }

  if (toolName === "get_stellar_asset_prices") {
    const { fetchAssetDetail } = await import("./market");
    const core = ["XLM", "BTC", "ETH", "USDC"];
    const prices = await Promise.allSettled(
      core.map(sym => fetchAssetDetail(`${sym}/USD`)),
    );
    return core.map((sym, i) => {
      const r     = prices[i];
      const asset = r.status === "fulfilled" ? r.value : null;
      return asset
        ? { symbol: sym, priceUsd: asset.priceUsd, change24h: asset.change24h ?? null }
        : { symbol: sym, priceUsd: null, change24h: null };
    });
  }

  if (toolName === "get_agent_wallet") {
    const address = (args.walletAddress as string | undefined) ?? null;
    return {
      address:    address ?? "call POST /api/cfo/wallet to create one",
      network:    "Stellar Mainnet",
      dex:        "Stellar DEX (SDEX)",
      horizonUrl: "https://horizon.stellar.org",
      explorer:   address ? `${STELLAR_EXPLORER_BASE}/account/${address}` : null,
      note:       "Each user has their own isolated Stellar keypair — secret key is AES-256-GCM encrypted server-side.",
    };
  }

  if (toolName === "get_trading_signals") {
    const sym   = String(args.symbol ?? "XLM").toUpperCase();
    const asset = STELLAR_ASSETS.find(a => a.symbol === sym);
    if (!asset) return { error: `Unknown Stellar asset: ${sym}` };

    const { fetchCFOCandles }                    = await import("./cfo/market-data");
    const { runMomentumStrategies, adxFilter }   = await import("./cfo/strategies/momentum");
    const { runMeanReversionStrategies }         = await import("./cfo/strategies/mean-reversion");
    const { arbitrate }                          = await import("./cfo/arbitration");
    const { runSentimentStrategies }             = await import("./cfo/strategies/sentiment");

    const candles = await fetchCFOCandles(asset.pythSymbol);
    if (candles.length < 30) return { error: "Insufficient candle data" };

    const { isTrending, adxValue } = adxFilter(candles);
    const allSignals = [
      ...runMomentumStrategies(candles).filter(s => s.name !== "adx_filter"),
      ...runMeanReversionStrategies(candles),
      ...(await runSentimentStrategies().catch(() => [])),
    ];
    const arb = arbitrate(allSignals, adxValue, isTrending);

    return {
      symbol:       sym,
      blendedSignal: arb.blendedSignal,
      direction:    arb.blendedSignal > 0.08 ? "buy" : arb.blendedSignal < -0.08 ? "sell" : "hold",
      regime:       arb.regime,
      adx:          adxValue,
      signalCount:  allSignals.length,
      topSignals:   allSignals.slice(0, 3).map(s => ({ name: s.name, value: s.value, detail: s.detail })),
    };
  }

  return { error: `Unknown tool: ${toolName}` };
}

// ── Agent metadata ─────────────────────────────────────────────────────────────

export const STELLAR_AGENT_CONFIG = {
  name:        "Ski — Stellar Autonomous CFO Agent",
  description: "An AI CFO agent that reads Stellar markets via CMC Fear & Greed and multi-strategy signals, then autonomously signs and submits trades on Stellar via the SDEX (Stellar Decentralized Exchange).",
  network:     "stellar",
  networkPassphrase: "Public Global Stellar Network ; September 2015",
  dataSources: ["CoinMarketCap", "Binance OHLCV API", "Pyth Network", "Stellar Horizon"],
  execution:   "Stellar SDEX PathPaymentStrictSend",
  strategies:  ["Momentum", "Mean Reversion", "Volatility", "Volume", "Statistical", "Smart Money", "CMC Sentiment"],
  riskControls: ["Kelly criterion sizing", "Max drawdown circuit breaker", "Per-trade cap", "LLM sanity check"],
} as const;
