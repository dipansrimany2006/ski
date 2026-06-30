// CMC Strategy Skill — Backtest Engine
// Replays a StrategySpec against historical OHLCV candles from Binance.
// Computes performance metrics: Sharpe, Sortino, Calmar, max drawdown, win rate, profit factor.

import type { StrategySpec, BacktestResult, BacktestTrade, SignalCondition } from "./types";
import type { Candle } from "@/lib/cfo/types";
import { fetchHistoricalCandles } from "@/lib/cfo/market-data";
import { runMomentumStrategies, adxFilter } from "@/lib/cfo/strategies/momentum";
import { runMeanReversionStrategies } from "@/lib/cfo/strategies/mean-reversion";
import { arbitrate } from "@/lib/cfo/arbitration";
import type { Signal } from "@/lib/cfo/types";

// ── Signal extraction ───────────────────────────────────────────────────────

// Signal name aliases: the LLM may use shorthand names; map them to actual signal names
const SIGNAL_ALIASES: Record<string, string> = {
  rsi:        "rsi_signal",
  macd:       "macd_signal",
  stochastic: "stochastic_signal",
  bollinger:  "bollinger_reversion",
  z_score_signal: "z_score",
  ma:         "ma_crossover",
  ema:        "ema_crossover",
};

// Compute a named signal value from the signal array or derived values.
// Returns null only when truly unavailable (e.g. fear_greed in a candle-only backtest).
function extractSignalValue(
  signalName: string,
  allSignals: Signal[],
  blendedSignal: number,
  _fearGreedValue: number,  // not used in backtest — no historical series
): number | null {
  if (signalName === "blended_signal") return blendedSignal;
  // funding_rate / ls_ratio are not available in the candle-only backtest — skip them
  if (signalName === "funding_rate" || signalName === "ls_ratio") return null;
  // Fear & Greed: we have no historical series, so treat as neutral (0 = neutral in [-1,+1] convention)
  if (signalName === "fear_greed") return 0;

  const resolved = SIGNAL_ALIASES[signalName] ?? signalName;
  const found = allSignals.find(s => s.name === resolved);
  return found?.value ?? null;
}

function evalCondition(condition: SignalCondition, value: number): boolean {
  const { operator, threshold, threshold2 } = condition;
  switch (operator) {
    case ">":       return value > threshold;
    case "<":       return value < threshold;
    case ">=":      return value >= threshold;
    case "<=":      return value <= threshold;
    case "between": return threshold2 !== undefined && value >= threshold && value <= threshold2;
    default:        return false;
  }
}

// ── Entry / exit evaluation ─────────────────────────────────────────────────

function checkEntry(
  spec: StrategySpec,
  allSignals: Signal[],
  blended: number,
  fearGreed: number,
  regime: "trending" | "ranging" | "unknown",
): boolean {
  // Regime filter — soft in backtesting:
  // "unknown" is always allowed (insufficient data to classify).
  // Mismatched regime raises the bar (requires stronger blended signal) but does not hard-block.
  let regimePenalty = false;
  if (spec.regimeFilter && regime !== "unknown") {
    if (!spec.regimeFilter.allowedRegimes.includes(regime)) {
      regimePenalty = true; // will require higher blended threshold below
    }
  }

  // Primary gate: blended signal must be directionally bullish.
  // Apply a higher threshold when regime doesn't match.
  const blendedMin = regimePenalty ? 0.45 : 0;
  if (blended <= blendedMin) return false;

  // Partition conditions: explicit blended_signal conditions vs others
  const blendedConds = spec.entryConditions.filter(c => c.signal === "blended_signal");
  const otherConds   = spec.entryConditions.filter(c => c.signal !== "blended_signal");

  // Hard-check blended_signal conditions (if any) — these are well-calibrated.
  // In a regime mismatch, skip blended conditions (the primary gate above is already strict enough).
  if (!regimePenalty) {
    for (const cond of blendedConds) {
      if (!evalCondition(cond, blended)) return false;
    }
  }

  // For all other conditions: score the ones that are available, skip nulls.
  // Enter if >= 50% of available conditions are satisfied (or there are none).
  let met = 0;
  let available = 0;
  for (const cond of otherConds) {
    const value = extractSignalValue(cond.signal, allSignals, blended, fearGreed);
    if (value === null) continue;  // signal not available in candle-only backtest
    available++;
    if (evalCondition(cond, value)) met++;
  }

  return available === 0 || met >= Math.ceil(available * 0.5);
}

function checkExit(
  spec: StrategySpec,
  entryPrice: number,
  currentPrice: number,
  barsHeld: number,
  allSignals: Signal[],
  blended: number,
): { exit: boolean; reason: string } {
  for (const rule of spec.exitRules) {
    if (rule.type === "stop_loss") {
      const lossPct = (entryPrice - currentPrice) / entryPrice;
      if (lossPct >= rule.value) return { exit: true, reason: `stop_loss (−${(lossPct * 100).toFixed(2)}%)` };
    }
    if (rule.type === "take_profit") {
      const gainPct = (currentPrice - entryPrice) / entryPrice;
      if (gainPct >= rule.value) return { exit: true, reason: `take_profit (+${(gainPct * 100).toFixed(2)}%)` };
    }
    if (rule.type === "time_limit" && barsHeld >= rule.value) {
      return { exit: true, reason: `time_limit (${barsHeld} bars)` };
    }
    if (rule.type === "signal_reversal") {
      if (blended < -rule.value) return { exit: true, reason: `signal_reversal (blended=${blended.toFixed(3)})` };
    }
  }
  return { exit: false, reason: "" };
}

// ── Performance metrics ─────────────────────────────────────────────────────

function computeMetrics(
  equityCurve: number[],
  trades: BacktestTrade[],
  initialCapital: number,
  barsPerYear: number,
) {
  const finalCapital = equityCurve[equityCurve.length - 1] ?? initialCapital;
  const totalReturnPct = (finalCapital - initialCapital) / initialCapital;

  const numYears = equityCurve.length / barsPerYear;
  const annualizedReturnPct =
    numYears > 0 ? Math.pow(1 + totalReturnPct, 1 / numYears) - 1 : 0;

  // Bar-level returns for Sharpe / Sortino
  const barReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    barReturns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
  }

  const avgReturn = barReturns.reduce((a, b) => a + b, 0) / (barReturns.length || 1);
  const variance  = barReturns.reduce((a, b) => a + (b - avgReturn) ** 2, 0) / (barReturns.length || 1);
  const stdDev    = Math.sqrt(variance);
  const annStd    = stdDev * Math.sqrt(barsPerYear);
  const sharpeRatio = annStd > 0 ? (annualizedReturnPct / annStd) : 0;

  const downSide = barReturns.filter(r => r < 0);
  const downVar  = downSide.reduce((a, b) => a + b ** 2, 0) / (downSide.length || 1);
  const annDown  = Math.sqrt(downVar) * Math.sqrt(barsPerYear);
  const sortinoRatio = annDown > 0 ? (annualizedReturnPct / annDown) : 0;

  // Max drawdown
  let peak = equityCurve[0] ?? initialCapital;
  let maxDrawdown = 0;
  for (const v of equityCurve) {
    if (v > peak) peak = v;
    const dd = (peak - v) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const calmarRatio = maxDrawdown > 0 ? annualizedReturnPct / maxDrawdown : 0;

  // Trade stats
  const wins = trades.filter(t => t.returnPct > 0);
  const losses = trades.filter(t => t.returnPct <= 0);
  const winRate = trades.length > 0 ? wins.length / trades.length : 0;

  const grossProfit = wins.reduce((a, t) => a + t.returnPct * t.sizeUsd, 0);
  const grossLoss   = Math.abs(losses.reduce((a, t) => a + t.returnPct * t.sizeUsd, 0));
  // Cap at 99 — Infinity serializes as null in JSON, breaking client-side toFixed calls
  const profitFactor = grossLoss > 0 ? Math.min(grossProfit / grossLoss, 99) : grossProfit > 0 ? 99 : 0;

  const avgTradeReturn = trades.length > 0
    ? trades.reduce((a, t) => a + t.returnPct, 0) / trades.length
    : 0;

  // Sanitize: JSON.stringify converts Infinity/NaN to null, breaking client toFixed calls
  const fin = (v: number) => (isFinite(v) ? v : 0);

  return {
    finalCapital:        fin(finalCapital),
    totalReturnPct:      fin(totalReturnPct),
    annualizedReturnPct: fin(annualizedReturnPct),
    sharpeRatio:         fin(sharpeRatio),
    sortinoRatio:        fin(sortinoRatio),
    calmarRatio:         fin(calmarRatio),
    maxDrawdownPct:      fin(maxDrawdown),
    winRate:             fin(winRate),
    avgTradeReturn:      fin(avgTradeReturn),
    profitFactor:        fin(profitFactor),
  };
}

// ── Main backtest runner ────────────────────────────────────────────────────

const BARS_PER_YEAR: Record<string, number> = { "1h": 8760, "4h": 2190, "1d": 365 };
const WINDOW = 100;  // candles used to compute indicators at each step

export async function runBacktest(opts: {
  spec: StrategySpec;
  symbols: string[];
  interval: "1h" | "4h" | "1d";
  fromMs: number;
  toMs: number;
  initialCapital?: number;
}): Promise<BacktestResult> {
  const { spec, symbols, interval, fromMs, toMs } = opts;
  const initialCapital = opts.initialCapital ?? 10_000;

  // Fixed static Fear & Greed value — in a real backtest you'd have historical series
  // For Track 2 we use the spec's snapshot value (generated at spec creation time)
  const fearGreedValue = spec.marketContext.fearGreedValue;

  const trades: BacktestTrade[] = [];
  const equityCurve: { time: number; value: number }[] = [];
  let capital = initialCapital;
  let totalBars = 0;

  // Fetch all symbols in parallel
  const candleMap = await Promise.all(
    symbols.map(s => fetchHistoricalCandles(s, interval, fromMs, toMs).then(c => ({ symbol: s, candles: c })))
  );

  for (const { symbol, candles } of candleMap) {
    if (candles.length < WINDOW + 10) continue;

    totalBars += candles.length;

    let positionOpen = false;
    let entryBar: Candle | null = null;
    let barsHeld = 0;

    for (let i = WINDOW; i < candles.length; i++) {
      const window = candles.slice(i - WINDOW, i);
      const current = candles[i];

      const { adxValue, isTrending } = adxFilter(window);
      const momentumSignals = runMomentumStrategies(window).filter(s => s.name !== "adx_filter");
      const mrSignals = runMeanReversionStrategies(window);
      // Synthetic sentiment signal from spec snapshot — no historical F&G series available
      const fg = fearGreedValue;
      const fgSentiment: Signal = {
        name: "fear_greed_contrarian",
        family: "sentiment",
        value: fg <= 25 ? 0.7 + ((25 - fg) / 25) * 0.3
             : fg <= 40 ? ((40 - fg) / 15) * 0.5
             : fg <= 60 ? 0
             : fg <= 75 ? -((fg - 60) / 15) * 0.5
             : -(0.7 + ((fg - 75) / 25) * 0.3),
        detail: `F&G snapshot=${fg}`,
      };
      const allSignals: Signal[] = [...momentumSignals, ...mrSignals, fgSentiment];
      const { blendedSignal, regime } = arbitrate(allSignals, adxValue, isTrending);

      // Track equity at each bar
      if (positionOpen && entryBar) {
        const unrealised = (current.close - entryBar.close) / entryBar.close;
        const posSize = capital * spec.positionSizing.riskPerTradePct / 0.02; // rough position size
        equityCurve.push({ time: current.time, value: capital + unrealised * posSize });
      } else {
        equityCurve.push({ time: current.time, value: capital });
      }

      if (!positionOpen) {
        const shouldEnter = checkEntry(spec, allSignals, blendedSignal, fearGreedValue, regime);
        if (shouldEnter) {
          positionOpen = true;
          entryBar = current;
          barsHeld = 0;
        }
      } else if (entryBar) {
        barsHeld++;
        const { exit, reason } = checkExit(
          spec, entryBar.close, current.close, barsHeld, allSignals, blendedSignal,
        );

        if (exit) {
          const returnPct = (current.close - entryBar.close) / entryBar.close;
          const maxPos = capital * Math.min(spec.positionSizing.maxPositionPct, 0.5);
          const sizeUsd = maxPos * spec.positionSizing.riskPerTradePct / 0.01;

          capital += returnPct * Math.min(sizeUsd, maxPos);

          trades.push({
            symbol,
            entryTime:  entryBar.time,
            exitTime:   current.time,
            entryPrice: entryBar.close,
            exitPrice:  current.close,
            direction:  "long",
            returnPct,
            sizeUsd:    Math.min(sizeUsd, maxPos),
            exitReason: reason,
          });

          positionOpen = false;
          entryBar = null;
          barsHeld = 0;
        }
      }
    }
  }

  const equityValues = equityCurve.map(e => e.value);
  const barsPerYear = BARS_PER_YEAR[interval] ?? 8760;
  const metrics = computeMetrics(equityValues, trades, initialCapital, barsPerYear);

  return {
    specId:              spec.id,
    specName:            spec.name,
    symbols,
    interval,
    period:              { fromMs, toMs, bars: totalBars },
    initialCapital,
    finalCapital:        metrics.finalCapital,
    totalReturnPct:      metrics.totalReturnPct,
    annualizedReturnPct: metrics.annualizedReturnPct,
    sharpeRatio:         metrics.sharpeRatio,
    sortinoRatio:        metrics.sortinoRatio,
    calmarRatio:         metrics.calmarRatio,
    maxDrawdownPct:      metrics.maxDrawdownPct,
    winRate:             metrics.winRate,
    totalTrades:         trades.length,
    avgTradeReturnPct:   metrics.avgTradeReturn,
    profitFactor:        metrics.profitFactor,
    equityCurve,
    trades,
    ranAt:               new Date().toISOString(),
  };
}
