// CMC Strategy Skill Generator
// Takes current market context (CMC data + Pyth candles) and generates a backtestable StrategySpec via LLM.

import Groq from "groq-sdk";
import type { StrategySpec, SkillType, MarketContext } from "./types";
import { fetchFearGreed, fetchGlobalMetrics, fetchTopCMCTokens } from "@/lib/cmc";

const MODEL = "llama-3.3-70b-versatile";

const CORE_SYMBOLS = ["XLM/USD", "BTC/USD", "ETH/USD", "SOL/USD"];

// ── Skill system prompts ────────────────────────────────────────────────────

const SKILL_PROMPTS: Record<SkillType, string> = {
  momentum: `You are a quantitative strategist building a momentum-based crypto trading skill.
Your strategy blends RSI, MACD, dual-momentum, and CMC Fear & Greed into precise entry and exit rules.
- In trending markets: require blended_signal > entry threshold and Fear & Greed confirmation
- In ranging markets: tighten thresholds significantly, reduce position size
- Entry: multiple momentum signals must agree before entry
- Exit: use ATR-based take profit (2.5× ATR) and stop loss (1.5× ATR), plus signal reversal failsafe
- Generate entry thresholds calibrated to current Fear & Greed level`,

  sentiment_divergence: `You are a quantitative strategist specialising in sentiment divergence.
Your strategy flags when CMC Fear & Greed index disagrees with technical momentum signals.
- Divergence bullish: Fear & Greed < 30 (fear) but technical signals turning positive → strong buy
- Divergence bearish: Fear & Greed > 70 (greed) but technical signals negative → strong sell
- No divergence: skip the trade (alignment = no edge)
- Entry only fires on confirmed divergence; position size scales with divergence magnitude
- Exit: time-limited (hold max 48 bars) or signal convergence`,

  mean_reversion: `You are a quantitative strategist building a mean-reversion trading skill.
Your strategy uses Bollinger Bands and Z-score to buy dips and sell rips.
- Buy when price falls below the lower Bollinger Band AND Z-score signals oversold (< -1.5)
- Sell when price reverts toward the mean (middle band) or reaches the upper band
- Works best in ranging markets; reduce size aggressively in trending markets
- Entry: bollinger_reversion > 0.6 AND z_score > 0.4 (both confirm oversold)
- Exit: take profit at mean reversion (bollinger_reversion near 0), stop loss if trend accelerates`,

  volume_breakout: `You are a quantitative strategist building a volume-confirmed breakout skill.
Your strategy buys breakouts above recent resistance only when volume surges confirm the move.
- Entry: blended_signal > 0.12 (price momentum) confirmed by ema_crossover > 0.3 (trend shift)
- Avoid false breakouts: require MACD crossover (macd_signal > 0.05) as additional filter
- Position size scales with signal strength; reduce size if Fear & Greed > 75 (overheated)
- Exit: trailing stop (1.5× ATR), time limit (24 bars), or signal reversal`,

  regime_detection: `You are a quantitative strategist building a market regime detection skill.
Your strategy uses ADX and volatility metrics to classify the market as trending, ranging, or unknown before applying any directional bias.
- Trending regime (ADX > 25): follow momentum; enter on blended_signal > 0.10, larger position size
- Ranging regime (ADX < 20): fade extremes; enter on mean-reversion signals only, tighter stops
- Unknown regime: reduce position size by 50%, require higher signal confidence before entry
- Regime shifts: exit immediately when regime changes against the open trade direction
- Exit: ATR-based stops scaled to regime volatility (wider in trending, tighter in ranging)`,

  perps_divergence: `You are a quantitative strategist specialising in perpetual futures funding rate divergence.
Your strategy exploits when funding rates (market sentiment) diverge from spot price momentum.
- Bullish divergence: funding rate negative (shorts pay longs) but spot momentum positive → buy spot, collect funding
- Bearish divergence: funding rate very positive (longs pay shorts) but spot weakening → sell or avoid
- No divergence: skip the trade; alignment between funding and price provides no edge
- Entry: require both divergence AND blended_signal confirmation; scale size with divergence magnitude
- Exit: funding rate normalises (divergence collapses), time limit (36 bars), or stop loss at 1.5× ATR`,
};

// ── Market context builder ──────────────────────────────────────────────────

async function buildMarketContext(universe: string[]): Promise<MarketContext & {
  topTokens: Array<{ symbol: string; priceUsd: number; change24h: number; volume24hUsd: number }>;
}> {
  const [fg, gm, topTokens] = await Promise.all([
    fetchFearGreed().catch(() => null),
    fetchGlobalMetrics().catch(() => null),
    fetchTopCMCTokens(20).catch(() => []),
  ]);

  void universe;

  const top10 = topTokens.slice(0, 10);
  const topMover = [...top10].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))[0];

  const regime = fg
    ? fg.value > 60 ? "trending" : fg.value < 40 ? "ranging" : "unknown"
    : "unknown";

  return {
    fearGreedValue:    fg?.value ?? 50,
    fearGreedLabel:    fg?.valueText ?? "Neutral",
    btcDominancePct:   gm?.btcDominancePct ?? 0,
    totalMarketCapUsd: gm?.totalMarketCapUsd ?? 0,
    regime: regime as MarketContext["regime"],
    topMoverSymbol:    topMover?.symbol ?? "XLM",
    topMoverChange24h: topMover?.change24h ?? 0,
    topTokens: top10.map(t => ({
      symbol: t.symbol, priceUsd: t.priceUsd,
      change24h: t.change24h, volume24hUsd: t.volume24hUsd,
    })),
  };
}

// ── LLM spec generation ─────────────────────────────────────────────────────

function buildPrompt(
  skillType: SkillType,
  universe: string[],
  riskProfile: "conservative" | "balanced" | "aggressive",
  ctx: Awaited<ReturnType<typeof buildMarketContext>>,
  customMandate?: string,
): string {
  const topLines = ctx.topTokens
    .map(t => `  ${t.symbol}: $${t.priceUsd.toFixed(2)}, 24h ${t.change24h >= 0 ? "+" : ""}${t.change24h.toFixed(2)}%`)
    .join("\n");

  return `${SKILL_PROMPTS[skillType]}

=== CURRENT MARKET CONTEXT (CMC + Stellar ecosystem) ===
CMC Fear & Greed: ${ctx.fearGreedValue} (${ctx.fearGreedLabel})
BTC Dominance: ${ctx.btcDominancePct.toFixed(1)}%
Global Market Cap: $${(ctx.totalMarketCapUsd / 1e12).toFixed(2)}T
Detected Regime: ${ctx.regime}
Top Mover: ${ctx.topMoverSymbol} (${ctx.topMoverChange24h >= 0 ? "+" : ""}${ctx.topMoverChange24h.toFixed(2)}%)

Top 10 tokens by market cap:
${topLines}

=== STRATEGY PARAMETERS ===
Skill type: ${skillType}
Universe: ${universe.join(", ")}
Risk profile: ${riskProfile}
Execution: Stellar SDEX (path payments via Horizon)
${customMandate ? `Custom mandate: ${customMandate}` : ""}

=== SIGNAL VALUE RANGES — CRITICAL ===
All signal values are normalised to [-1, +1]. Use these calibrated thresholds:

  blended_signal  : composite score in [-1, +1]. Bullish threshold: > 0.05 (moderate) or > 0.12 (strong)
  rsi_signal      : RSI mapped to [-1,+1]. Only non-zero in extremes: Oversold (RSI<30) → +0.3 to +1.0. Overbought (RSI>70) → -0.3 to -1.0. RSI 30-70 → 0.
                    To catch oversold bounce use: "rsi_signal > 0.3"
                    Do NOT use rsi_signal > 0.0 as a condition — it only fires at RSI<30 (extreme oversold).
  macd_signal     : MACD histogram normalised. Bullish crossover → +0.3 to +1. Bearish → -0.3 to -1. Near zero → 0.
                    Bullish confirmation: "macd_signal > 0.05"
  stochastic_signal: Stochastic %K/%D mapped to [-1,+1]. Oversold → +0.7. Overbought → -0.7.
  bollinger_reversion: Price vs Bollinger Bands in [-1,+1]. Below lower band → +0.8. Above upper → -0.8.
  ma_crossover    : 50/200 MA crossover in [-1,+1]. Golden cross → +1. Death cross → -1.
  ema_crossover   : Fast/slow EMA crossover in [-1,+1]. Bullish crossover → +0.5 to +1.
  z_score         : Price Z-score mapped to [-1,+1]. Below mean (buy dip) → positive values.
  fear_greed      : Treated as neutral in backtests (no historical series). Omit or use only as context.

IMPORTANT: Generate 2–4 entry conditions using ONLY blended_signal and candle-based signals above.
Set thresholds appropriate for the [-1,+1] range. Using threshold=30 for rsi_signal is WRONG.
ALWAYS set regimeFilter.allowedRegimes to ["trending", "ranging", "unknown"] — all three must be included.
Crypto markets frequently switch between trending and ranging; excluding any regime eliminates most trade opportunities.

=== OUTPUT FORMAT ===
Return ONLY valid JSON matching this schema exactly — no prose, no markdown fences:
{
  "name": "string — concise strategy name",
  "description": "string — 2–3 sentence description of what the strategy does and why",
  "rationale": "string — why these specific thresholds and rules suit the current market context",
  "entryConditions": [
    {
      "signal": "blended_signal | rsi_signal | macd_signal | stochastic_signal | bollinger_reversion | ma_crossover | ema_crossover | z_score",
      "operator": "> | < | >= | <= | between",
      "threshold": number,
      "threshold2": number_or_null,
      "description": "string"
    }
  ],
  "exitRules": [
    {
      "type": "stop_loss | take_profit | signal_reversal | time_limit",
      "value": number,
      "description": "string"
    }
  ],
  "positionSizing": {
    "method": "fixed_risk | kelly | vol_scaled",
    "riskPerTradePct": number,
    "maxPositionPct": number
  },
  "regimeFilter": {
    "allowedRegimes": ["trending", "ranging", "unknown"],
    "adxMin": number_or_null,
    "adxMax": number_or_null
  },
  "riskLimits": {
    "maxDrawdownPct": number,
    "maxOpenPositions": number,
    "dailyLossLimitPct": number
  }
}`;
}

// ── Public API ──────────────────────────────────────────────────────────────

export { CORE_SYMBOLS };

export async function generateStrategySpec(opts: {
  skillType: SkillType;
  universe: string[];
  riskProfile: "conservative" | "balanced" | "aggressive";
  customMandate?: string;
}): Promise<StrategySpec> {
  const { skillType, universe, riskProfile, customMandate } = opts;

  const ctx = await buildMarketContext(universe);

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const prompt = buildPrompt(skillType, universe, riskProfile, ctx, customMandate);

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: "You are a quantitative trading strategist. Output only valid JSON — no markdown, no explanation outside the JSON object.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 1200,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";

  let parsed: Partial<StrategySpec>;
  try {
    const cleaned = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {};
  }

  const spec: StrategySpec = {
    id:          crypto.randomUUID(),
    name:        parsed.name ?? `${skillType} strategy`,
    description: parsed.description ?? "",
    rationale:   parsed.rationale ?? "",
    skillType,
    universe,
    entryConditions: parsed.entryConditions ?? [
      { signal: "blended_signal", operator: ">", threshold: 0.10, description: "Default: blended signal bullish" },
    ],
    exitRules: parsed.exitRules ?? [
      { type: "stop_loss",   value: 0.05, description: "5% stop loss" },
      { type: "take_profit", value: 0.10, description: "10% take profit" },
    ],
    positionSizing: parsed.positionSizing ?? { method: "fixed_risk", riskPerTradePct: 0.01, maxPositionPct: 0.20 },
    regimeFilter:   parsed.regimeFilter,
    riskLimits:     parsed.riskLimits ?? { maxDrawdownPct: 0.20, maxOpenPositions: 5, dailyLossLimitPct: 0.05 },
    generatedAt: new Date().toISOString(),
    marketContext: {
      fearGreedValue:    ctx.fearGreedValue,
      fearGreedLabel:    ctx.fearGreedLabel,
      btcDominancePct:   ctx.btcDominancePct,
      totalMarketCapUsd: ctx.totalMarketCapUsd,
      regime:            ctx.regime,
      topMoverSymbol:    ctx.topMoverSymbol,
      topMoverChange24h: ctx.topMoverChange24h,
    },
  };

  return spec;
}
