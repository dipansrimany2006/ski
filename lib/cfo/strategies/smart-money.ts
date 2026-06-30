// Smart money strategy — ported from Python smart_money.py
// Long-only strategy that emits SL/TP hints alongside the signal.

import type { Candle, Signal } from "../types";
import { emaSeries } from "./momentum";

export interface SmartMoneySignal extends Signal {
  stopLoss?: number;
  takeProfit?: number;
}

export function smartMoney(candles: Candle[], emaPeriod = 20, atrPeriod = 14): SmartMoneySignal {
  if (candles.length < Math.max(emaPeriod, atrPeriod) + 1) {
    return { value: 0, detail: "insufficient data", name: "smart_money", family: "smart_money" };
  }

  const cl = candles.map(c => c.close);
  const hi = candles.map(c => c.high);
  const lo = candles.map(c => c.low);

  // EMA trend direction
  const emaArr = emaSeries(cl, emaPeriod);
  const lastEma = emaArr[emaArr.length - 1];

  // ATR for SL/TP sizing
  const trArr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const hl = hi[i] - lo[i];
    const hc = Math.abs(hi[i] - cl[i - 1]);
    const lc = Math.abs(lo[i] - cl[i - 1]);
    trArr.push(Math.max(hl, hc, lc));
  }
  const currentAtr = trArr.slice(-atrPeriod).reduce((a, b) => a + b, 0) / atrPeriod;

  const price = cl[cl.length - 1];
  if (isNaN(lastEma)) return { value: 0, detail: "invalid ema", name: "smart_money", family: "smart_money" };

  // Long-only: only signal when price is above EMA (trend confirmation)
  const trendUp = price > lastEma;
  // Volume surge confirmation
  const volumes = candles.map(c => c.volume);
  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
  const volSurge = candles[candles.length - 1].volume > avgVol * 1.5;

  let signal = 0;
  let stopLoss: number | undefined;
  let takeProfit: number | undefined;

  if (trendUp && volSurge) {
    signal = 0.8;
    stopLoss   = price - 1.5 * currentAtr;
    takeProfit = price + 3.0 * currentAtr;
  } else if (!trendUp && volSurge) {
    // Long-only: no short, but signal bearish so momentum is blocked
    signal = -0.3;
  }

  return {
    value: signal,
    detail: `price=${price.toFixed(4)},ema=${lastEma.toFixed(4)},trend_up=${trendUp},vol_surge=${volSurge},atr=${currentAtr.toFixed(4)}`,
    name: "smart_money",
    family: "smart_money",
    stopLoss,
    takeProfit,
  };
}

export function runSmartMoneyStrategies(candles: Candle[]): SmartMoneySignal[] {
  return [smartMoney(candles)];
}
