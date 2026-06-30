// Step 4: Code arbitration — regime switch + correlation-aware weighting
// Design: average within family first (handles correlation), then apply regime weights.

import type { Signal, ArbitrationResult } from "./types";

// Weights by regime — all rows sum to 1.00
const TRENDING_WEIGHTS: Record<string, number> = {
  momentum:       0.47,
  mean_reversion: 0.21,
  volatility:     0.09,
  volume:         0.05,
  statistical:    0.03,
  smart_money:    0.03,
  sentiment:      0.12,
};

const RANGING_WEIGHTS: Record<string, number> = {
  momentum:       0.21,
  mean_reversion: 0.47,
  volatility:     0.09,
  volume:         0.05,
  statistical:    0.03,
  smart_money:    0.03,
  sentiment:      0.12,
};

const UNKNOWN_WEIGHTS: Record<string, number> = {
  momentum:       0.25,
  mean_reversion: 0.25,
  volatility:     0.12,
  volume:         0.08,
  statistical:    0.07,
  smart_money:    0.10,
  sentiment:      0.13,
};

export function arbitrate(
  signals: Signal[],
  adxValue: number,
  isTrending: boolean,
): ArbitrationResult {
  const regime: "trending" | "ranging" | "unknown" =
    adxValue > 25 ? "trending" : adxValue > 15 ? "ranging" : "unknown";

  const weights =
    regime === "trending" ? TRENDING_WEIGHTS :
    regime === "ranging"  ? RANGING_WEIGHTS  :
    UNKNOWN_WEIGHTS;

  // Step 1: average within each family
  const familyMap: Record<string, number[]> = {};
  for (const s of signals) {
    if (!familyMap[s.family]) familyMap[s.family] = [];
    familyMap[s.family].push(s.value);
  }

  const familyAvg: Record<string, number> = {};
  for (const [family, vals] of Object.entries(familyMap)) {
    familyAvg[family] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  // Step 2: apply regime weights
  let blended = 0;
  let totalWeight = 0;
  for (const [family, avg] of Object.entries(familyAvg)) {
    const w = weights[family] ?? 0.05;
    blended     += avg * w;
    totalWeight += w;
  }
  if (totalWeight > 0) blended /= totalWeight;

  return {
    blendedSignal: Math.max(-1, Math.min(1, blended)),
    regime,
    adxValue,
    weights: { ...weights },
  };
}
