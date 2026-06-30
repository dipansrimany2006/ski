// Sentiment strategy: CMC Fear & Greed + BTC dominance → contrarian signals
// High fear  → contrarian buy  (market oversold)
// High greed → contrarian sell (market overextended)

import type { Signal } from "../types";
import { fetchFearGreed, fetchGlobalMetrics } from "@/lib/cmc";

export async function runSentimentStrategies(): Promise<Signal[]> {
  const signals: Signal[] = [];

  const [fg, gm] = await Promise.all([
    fetchFearGreed().catch(() => null),
    fetchGlobalMetrics().catch(() => null),
  ]);

  if (fg) {
    const v = fg.value;
    let value: number;
    if (v <= 25)      value =  0.7 + ((25 - v) / 25) * 0.3;   // extreme fear:  +0.7 → +1.0
    else if (v <= 40) value =  ((40 - v) / 15) * 0.5;          // fear:           0 → +0.5
    else if (v <= 60) value =  0;                               // neutral:        0
    else if (v <= 75) value = -((v - 60) / 15) * 0.5;          // greed:          0 → -0.5
    else              value = -(0.7 + ((v - 75) / 25) * 0.3);  // extreme greed: -0.7 → -1.0

    signals.push({
      name:   "fear_greed_contrarian",
      family: "sentiment",
      value:  Math.max(-1, Math.min(1, value)),
      detail: `F&G=${v} (${fg.valueText}) → contrarian ${value >= 0 ? "buy" : "sell"}`,
    });
  }

  if (gm) {
    const dom = gm.btcDominancePct;
    // High BTC dom (>55%) = risk-off → sell alts; Low (<40%) = alt-season → buy
    const value = dom > 55 ? -0.35 : dom < 40 ? 0.35 : 0;
    signals.push({
      name:   "btc_dominance",
      family: "sentiment",
      value,
      detail: `BTC dominance ${dom.toFixed(1)}% → ${value > 0 ? "alt-season risk-on" : value < 0 ? "BTC dominance risk-off" : "neutral"}`,
    });
  }

  return signals;
}
