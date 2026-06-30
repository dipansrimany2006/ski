// Volatility strategy family — ported from Python volatility_algos.py

import type { Candle, Signal } from "../types";
import { emaSeries } from "./momentum";

function closes(candles: Candle[]): number[] {
  return candles.map(c => c.close);
}

function sma(prices: number[], period: number): number {
  if (prices.length < period) return NaN;
  return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function stddev(prices: number[], period: number): number {
  const m = sma(prices, period);
  if (isNaN(m)) return NaN;
  const slice = prices.slice(-period);
  const variance = slice.reduce((a, x) => a + (x - m) ** 2, 0) / period;
  return Math.sqrt(variance);
}

function atr(candles: Candle[], period: number): number {
  if (candles.length < period + 1) return NaN;
  const trArr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low  - candles[i - 1].close);
    trArr.push(Math.max(hl, hc, lc));
  }
  return trArr.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// ── 1. ATR Breakout ──────────────────────────────────────────────────────────

export function atrBreakout(candles: Candle[], period = 14, multiplier = 1.5): Signal {
  if (candles.length < period + 2) return { value: 0, detail: "insufficient data", name: "atr_breakout", family: "volatility" };
  const cl = closes(candles);
  const currentAtr = atr(candles, period);
  if (isNaN(currentAtr) || currentAtr === 0) return { value: 0, detail: "invalid atr", name: "atr_breakout", family: "volatility" };
  const prevClose = cl[cl.length - 2];
  const price     = cl[cl.length - 1];
  const change    = Math.abs(price - prevClose);
  const signal    = change > multiplier * currentAtr ? (price > prevClose ? 1 : -1) : 0;
  return {
    value: signal,
    detail: `price=${price.toFixed(4)},atr=${currentAtr.toFixed(4)},change=${change.toFixed(4)},thresh=${(multiplier * currentAtr).toFixed(4)}`,
    name: "atr_breakout",
    family: "volatility",
  };
}

// ── 2. Bollinger Squeeze ─────────────────────────────────────────────────────

export function bollingerSqueeze(candles: Candle[], period = 20, numStd = 2): Signal {
  const cl = closes(candles);
  if (cl.length < period) return { value: 0, detail: "insufficient data", name: "bollinger_squeeze", family: "volatility" };
  const mid   = sma(cl, period);
  const std   = stddev(cl, period);
  if (isNaN(mid) || isNaN(std) || std === 0) return { value: 0, detail: "invalid stats", name: "bollinger_squeeze", family: "volatility" };
  const upper  = mid + numStd * std;
  const lower  = mid - numStd * std;
  const bWidth = (upper - lower) / mid;
  const price  = cl[cl.length - 1];
  // Low bandwidth = squeeze, high bandwidth = expansion
  const signal = bWidth < 0.04 ? (price > mid ? 0.5 : -0.5) : 0;
  return {
    value: signal,
    detail: `bandwidth=${bWidth.toFixed(4)},upper=${upper.toFixed(4)},lower=${lower.toFixed(4)},squeeze=${bWidth < 0.04}`,
    name: "bollinger_squeeze",
    family: "volatility",
  };
}

// ── 3. Keltner-Bollinger ─────────────────────────────────────────────────────

export function keltnerBollinger(candles: Candle[], bbPeriod = 20, keltnerPeriod = 20, numStd = 2): Signal {
  const cl = closes(candles);
  if (cl.length < Math.max(bbPeriod, keltnerPeriod) + 1) {
    return { value: 0, detail: "insufficient data", name: "keltner_bollinger", family: "volatility" };
  }
  const midBB  = sma(cl, bbPeriod);
  const stdBB  = stddev(cl, bbPeriod);
  if (isNaN(midBB) || isNaN(stdBB) || stdBB === 0) {
    return { value: 0, detail: "invalid bb stats", name: "keltner_bollinger", family: "volatility" };
  }
  const bbUpper = midBB + numStd * stdBB;
  const bbLower = midBB - numStd * stdBB;

  const emaArr    = emaSeries(cl, keltnerPeriod);
  const currentEma = emaArr[emaArr.length - 1];
  const currentAtr = atr(candles, keltnerPeriod);
  if (isNaN(currentEma) || isNaN(currentAtr)) {
    return { value: 0, detail: "invalid keltner stats", name: "keltner_bollinger", family: "volatility" };
  }
  const kUpper = currentEma + 1.5 * currentAtr;
  const kLower = currentEma - 1.5 * currentAtr;

  // BB inside Keltner = squeeze
  const inSqueeze = bbUpper < kUpper && bbLower > kLower;
  const price     = cl[cl.length - 1];
  const signal    = inSqueeze ? (price > currentEma ? 0.5 : -0.5) : 0;

  return {
    value: signal,
    detail: `squeeze=${inSqueeze},bb_upper=${bbUpper.toFixed(4)},k_upper=${kUpper.toFixed(4)},price=${price.toFixed(4)}`,
    name: "keltner_bollinger",
    family: "volatility",
  };
}

// ── Run all volatility strategies ────────────────────────────────────────────

export function runVolatilityStrategies(candles: Candle[]): Signal[] {
  return [
    atrBreakout(candles),
    bollingerSqueeze(candles),
    keltnerBollinger(candles),
  ];
}
