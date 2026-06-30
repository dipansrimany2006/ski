// Statistical strategy family — ported from Python statistical_algos.py

import type { Candle, Signal } from "../types";

function closes(candles: Candle[]): number[] {
  return candles.map(c => c.close);
}

// ── 1. Linear Regression Channel ────────────────────────────────────────────

export function linearRegressionChannel(candles: Candle[], period = 20): Signal {
  const cl = closes(candles);
  if (cl.length < period) return { value: 0, detail: "insufficient data", name: "linear_regression_channel", family: "statistical" };
  const slice = cl.slice(-period);
  const n = slice.length;

  // Ordinary least squares
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX  += i;
    sumY  += slice[i];
    sumXY += i * slice[i];
    sumXX += i * i;
  }
  const slope     = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const predicted = slope * (n - 1) + intercept;

  // Standard error of residuals
  let sumResiduals = 0;
  for (let i = 0; i < n; i++) {
    const res = slice[i] - (slope * i + intercept);
    sumResiduals += res * res;
  }
  const stdErr = Math.sqrt(sumResiduals / n);

  const price  = cl[cl.length - 1];
  const upper  = predicted + 2 * stdErr;
  const lower  = predicted - 2 * stdErr;
  const signal = stdErr > 0 ? Math.max(-1, Math.min(1, -(price - predicted) / (2 * stdErr))) : 0;

  return {
    value: signal,
    detail: `price=${price.toFixed(4)},predicted=${predicted.toFixed(4)},upper=${upper.toFixed(4)},lower=${lower.toFixed(4)},slope=${slope.toFixed(6)}`,
    name: "linear_regression_channel",
    family: "statistical",
  };
}

// ── 2. Kalman Fair Value ─────────────────────────────────────────────────────

export function kalmanFairValue(candles: Candle[], processNoise = 0.0001, measurementNoise = 0.01): Signal {
  const cl = closes(candles);
  if (cl.length < 2) return { value: 0, detail: "insufficient data", name: "kalman_fair_value", family: "statistical" };

  // Simple 1D Kalman filter
  let x = cl[0];   // state estimate (fair value)
  let p = 1.0;     // estimate uncertainty

  for (let i = 1; i < cl.length; i++) {
    // Predict
    const pPred = p + processNoise;
    // Update
    const k = pPred / (pPred + measurementNoise);
    x = x + k * (cl[i] - x);
    p = (1 - k) * pPred;
  }

  const price = cl[cl.length - 1];
  const dev   = (price - x) / (x || 1);
  // Invert: above fair value → sell, below → buy
  const signal = Math.max(-1, Math.min(1, -dev * 20));

  return {
    value: signal,
    detail: `price=${price.toFixed(4)},fair_value=${x.toFixed(4)},deviation=${dev.toFixed(4)}`,
    name: "kalman_fair_value",
    family: "statistical",
  };
}

// ── Run all statistical strategies ──────────────────────────────────────────

export function runStatisticalStrategies(candles: Candle[]): Signal[] {
  return [
    linearRegressionChannel(candles),
    kalmanFairValue(candles),
  ];
}
