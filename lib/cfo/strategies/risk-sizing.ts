// Risk sizing helpers — ported from Python risk_sizing.py

import type { Candle } from "../types";

// Kelly Criterion position sizing
// Returns fraction of capital to deploy [0, 1]
export function kellySize(winRate: number, avgWin: number, avgLoss: number, fraction = 0.25): number {
  if (avgLoss === 0) return 0;
  const b = avgWin / avgLoss;          // odds ratio
  const q = 1 - winRate;
  const kelly = (b * winRate - q) / b; // full Kelly
  const halfKelly = Math.max(0, kelly) * fraction; // fractional Kelly
  return Math.min(1, halfKelly);
}

// Volatility scaling multiplier — scale down position when vol is high
// Returns multiplier in [0, 1]
export function volScalingMult(candles: Candle[], period = 14, targetVol = 0.02): number {
  if (candles.length < period + 1) return 1;
  const returns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i - 1].close === 0) continue;
    returns.push((candles[i].close - candles[i - 1].close) / candles[i - 1].close);
  }
  const recent = returns.slice(-period);
  if (recent.length === 0) return 1;
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const variance = recent.reduce((a, x) => a + (x - mean) ** 2, 0) / recent.length;
  const currentVol = Math.sqrt(variance);
  if (currentVol === 0) return 1;
  return Math.min(1, targetVol / currentVol);
}

// Compute recommended USD position size given signal strength
export function computePositionSize(
  signalStrength: number,   // [0, 1] absolute value
  availableCapital: number,
  perTradeCap: number,
  volMult: number,
  kellyFraction: number,
): number {
  const base = Math.min(availableCapital * kellyFraction, perTradeCap);
  const sized = base * Math.abs(signalStrength) * volMult;
  return Math.max(0, Math.min(sized, perTradeCap));
}
