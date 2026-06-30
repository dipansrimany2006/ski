// Volume strategy family — ported from Python volume_algos.py

import type { Candle, Signal } from "../types";
import { emaSeries } from "./momentum";

function closes(candles: Candle[]): number[] {
  return candles.map(c => c.close);
}

// ── 1. VWAP Deviation ────────────────────────────────────────────────────────

export function vwapDeviation(candles: Candle[], period = 20): Signal {
  if (candles.length < period) return { value: 0, detail: "insufficient data", name: "vwap_deviation", family: "volume" };
  const slice = candles.slice(-period);
  let totalPV = 0, totalVol = 0;
  for (const c of slice) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    totalPV  += typicalPrice * c.volume;
    totalVol += c.volume;
  }
  if (totalVol === 0) return { value: 0, detail: "zero volume", name: "vwap_deviation", family: "volume" };
  const vwap  = totalPV / totalVol;
  const price = closes(candles)[candles.length - 1];
  const dev   = (price - vwap) / vwap;
  // Invert: price far above VWAP → likely to revert
  const signal = Math.max(-1, Math.min(1, -dev * 20));
  return {
    value: signal,
    detail: `vwap=${vwap.toFixed(4)},price=${price.toFixed(4)},dev=${dev.toFixed(4)}`,
    name: "vwap_deviation",
    family: "volume",
  };
}

// ── 2. OBV Trend ─────────────────────────────────────────────────────────────

export function obvTrend(candles: Candle[], period = 14): Signal {
  if (candles.length < period + 1) return { value: 0, detail: "insufficient data", name: "obv_trend", family: "volume" };
  const cl = closes(candles);

  // Build OBV series
  const obv: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    if (cl[i] > cl[i - 1]) obv.push(obv[i - 1] + candles[i].volume);
    else if (cl[i] < cl[i - 1]) obv.push(obv[i - 1] - candles[i].volume);
    else obv.push(obv[i - 1]);
  }

  // OBV EMA trend
  const obvEMA = emaSeries(obv, period);
  const lastOBV    = obv[obv.length - 1];
  const lastOBVEMA = obvEMA[obvEMA.length - 1];
  if (isNaN(lastOBVEMA)) return { value: 0, detail: "insufficient obv ema", name: "obv_trend", family: "volume" };
  const diff   = lastOBV - lastOBVEMA;
  const signal = diff > 0 ? Math.min(1, diff / (Math.abs(lastOBVEMA) || 1) * 10) : Math.max(-1, diff / (Math.abs(lastOBVEMA) || 1) * 10);

  return {
    value: Math.max(-1, Math.min(1, signal)),
    detail: `obv=${lastOBV.toFixed(0)},obv_ema=${lastOBVEMA.toFixed(0)},diff_pct=${(diff / (Math.abs(lastOBVEMA) || 1)).toFixed(4)}`,
    name: "obv_trend",
    family: "volume",
  };
}

// ── Run all volume strategies ────────────────────────────────────────────────

export function runVolumeStrategies(candles: Candle[]): Signal[] {
  return [
    vwapDeviation(candles),
    obvTrend(candles),
  ];
}
