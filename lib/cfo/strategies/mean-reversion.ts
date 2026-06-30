// Mean reversion strategy family — ported from Python mean_reversion_algos.py

import type { Candle, Signal } from "../types";
import { emaSeries } from "./momentum";

function closes(candles: Candle[]): number[] {
  return candles.map(c => c.close);
}

function sma(prices: number[], period: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { out.push(NaN); continue; }
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += prices[j];
    out.push(s / period);
  }
  return out;
}

function stddev(prices: number[], period: number): number[] {
  const means = sma(prices, period);
  const out: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { out.push(NaN); continue; }
    const m = means[i];
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (prices[j] - m) ** 2;
    out.push(Math.sqrt(variance / period));
  }
  return out;
}

// ── 1. Z-Score ──────────────────────────────────────────────────────────────

export function zScore(candles: Candle[], period = 20): Signal {
  const cl = closes(candles);
  if (cl.length < period) return { value: 0, detail: "insufficient data", name: "z_score", family: "mean_reversion" };
  const means = sma(cl, period);
  const stds  = stddev(cl, period);
  const lastMean = means[means.length - 1];
  const lastStd  = stds[stds.length - 1];
  const price    = cl[cl.length - 1];
  if (isNaN(lastMean) || lastStd <= 0) return { value: 0, detail: "invalid stats", name: "z_score", family: "mean_reversion" };
  const z = (price - lastMean) / lastStd;
  // Invert: high z → overbought → sell signal
  const signal = Math.max(-1, Math.min(1, -z / 2));
  return {
    value: signal,
    detail: `z=${z.toFixed(4)},mean=${lastMean.toFixed(4)},std=${lastStd.toFixed(4)}`,
    name: "z_score",
    family: "mean_reversion",
  };
}

// ── 2. Bollinger Band Reversion ─────────────────────────────────────────────

export function bollingerReversion(candles: Candle[], period = 20, numStd = 2): Signal {
  const cl = closes(candles);
  if (cl.length < period) return { value: 0, detail: "insufficient data", name: "bollinger_reversion", family: "mean_reversion" };
  const means = sma(cl, period);
  const stds  = stddev(cl, period);
  const lastMean = means[means.length - 1];
  const lastStd  = stds[stds.length - 1];
  if (isNaN(lastMean) || lastStd <= 0) return { value: 0, detail: "invalid stats", name: "bollinger_reversion", family: "mean_reversion" };
  const upper  = lastMean + numStd * lastStd;
  const lower  = lastMean - numStd * lastStd;
  const price  = cl[cl.length - 1];
  let signal = 0;
  let detail = `price=${price.toFixed(4)},upper=${upper.toFixed(4)},lower=${lower.toFixed(4)},mid=${lastMean.toFixed(4)}`;
  if (price <= lower) { signal = 1; detail = "below_lower " + detail; }
  else if (price >= upper) { signal = -1; detail = "above_upper " + detail; }
  return { value: signal, detail, name: "bollinger_reversion", family: "mean_reversion" };
}

// ── 3. RSI Signal ───────────────────────────────────────────────────────────

export function rsiSignal(candles: Candle[], period = 14): Signal {
  const cl = closes(candles);
  if (cl.length < period + 1) return { value: 0, detail: "insufficient data", name: "rsi_signal", family: "mean_reversion" };

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = cl[i] - cl[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < cl.length; i++) {
    const diff = cl[i] - cl[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, diff)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -diff)) / period;
  }

  const rs  = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  let signal = 0;
  if (rsi <= 30) signal = (30 - rsi) / 30;         // oversold → buy
  else if (rsi >= 70) signal = -(rsi - 70) / 30;   // overbought → sell

  return {
    value: Math.max(-1, Math.min(1, signal)),
    detail: `rsi=${rsi.toFixed(2)}`,
    name: "rsi_signal",
    family: "mean_reversion",
  };
}

// ── 4. Stochastic Signal ────────────────────────────────────────────────────

export function stochasticSignal(candles: Candle[], kPeriod = 14, dPeriod = 3): Signal {
  // Warmup guard: need kPeriod + dPeriod candles minimum (bug fix from architecture doc)
  if (candles.length < kPeriod + dPeriod) {
    return { value: 0, detail: "insufficient data", name: "stochastic_signal", family: "mean_reversion" };
  }
  const hi = candles.map(c => c.high);
  const lo = candles.map(c => c.low);
  const cl = closes(candles);

  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const highestHigh = Math.max(...hi.slice(i - kPeriod + 1, i + 1));
    const lowestLow   = Math.min(...lo.slice(i - kPeriod + 1, i + 1));
    const range = highestHigh - lowestLow;
    kValues.push(range === 0 ? 50 : ((cl[i] - lowestLow) / range) * 100);
  }

  if (kValues.length < dPeriod) return { value: 0, detail: "insufficient k values", name: "stochastic_signal", family: "mean_reversion" };
  const dValue = kValues.slice(-dPeriod).reduce((a, b) => a + b, 0) / dPeriod;
  const lastK  = kValues[kValues.length - 1];

  let signal = 0;
  if (lastK < 20 && dValue < 20) signal = (20 - lastK) / 20;
  else if (lastK > 80 && dValue > 80) signal = -(lastK - 80) / 20;

  return {
    value: Math.max(-1, Math.min(1, signal)),
    detail: `k=${lastK.toFixed(2)},d=${dValue.toFixed(2)}`,
    name: "stochastic_signal",
    family: "mean_reversion",
  };
}

// ── 5. Range S/R ────────────────────────────────────────────────────────────

export function rangeSr(candles: Candle[], period = 20): Signal {
  if (candles.length < period) return { value: 0, detail: "insufficient data", name: "range_sr", family: "mean_reversion" };
  const hi     = candles.map(c => c.high);
  const lo     = candles.map(c => c.low);
  const cl     = closes(candles);
  const recentHi = Math.max(...hi.slice(-period));
  const recentLo = Math.min(...lo.slice(-period));
  const midPoint = (recentHi + recentLo) / 2;
  const price    = cl[cl.length - 1];
  const range    = recentHi - recentLo;
  if (range === 0) return { value: 0, detail: "zero range", name: "range_sr", family: "mean_reversion" };
  const posInRange = (price - recentLo) / range;  // 0 = at support, 1 = at resistance
  const signal = posInRange < 0.2 ? 1 : posInRange > 0.8 ? -1 : 0;
  return {
    value: signal,
    detail: `price=${price.toFixed(4)},high=${recentHi.toFixed(4)},low=${recentLo.toFixed(4)},pos=${posInRange.toFixed(2)}`,
    name: "range_sr",
    family: "mean_reversion",
  };
}

// ── Run all mean reversion strategies ───────────────────────────────────────

export function runMeanReversionStrategies(candles: Candle[]): Signal[] {
  return [
    zScore(candles),
    bollingerReversion(candles),
    rsiSignal(candles),
    stochasticSignal(candles),
    rangeSr(candles),
  ];
}
