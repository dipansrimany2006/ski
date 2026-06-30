// Shared types for the CFO 9-step decision loop

export interface Candle {
  time: number;  // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Signal range: [-1, 1]. Positive = bullish, negative = bearish, 0 = neutral.
export interface Signal {
  value: number;     // [-1, 1]
  detail: string;    // human-readable evidence for LLM arbiter
  name: string;      // strategy name
  family: "momentum" | "mean_reversion" | "volatility" | "volume" | "statistical" | "smart_money" | "sentiment";
}

export interface GateResult {
  pass: boolean;
  reason: string;
}

export interface ArbitrationResult {
  blendedSignal: number;   // [-1, 1]
  regime: "trending" | "ranging" | "unknown";
  adxValue: number;
  weights: Record<string, number>;
}

export interface LLMArbiterResult {
  pass: boolean;
  rationale: string;
}

export interface RiskSizing {
  positionSizeFraction: number;  // fraction of available capital [0, 1]
  recommendedUsd: number;
}

export interface MandateGuardResult {
  approved: boolean;
  finalSizeUsd: number;
  vetoReason?: string;
}

export type TradeAction = "buy" | "sell" | "hold";

export interface CFODecision {
  userId: string;
  assetId: string;
  symbol: string;
  displaySymbol: string;
  action: TradeAction;
  signals: Signal[];
  arbitration: ArbitrationResult;
  llmRationale: string;
  llmPassed: boolean;
  mandateApproved: boolean;
  mandateVetoReason?: string;
  finalSizeUsd: number;
  priceAtDecision: number;
  executedAt?: string;
  tradeId?: string;
}

export interface UserMandate {
  riskTolerance: "conservative" | "balanced" | "aggressive";
  maxDrawdownPct: number;     // e.g. 0.05 = 5%
  maxPositionPct: number;     // e.g. 0.20 = 20% of portfolio
  perTradeCap: number;        // max USD per trade
}

export function deriveMandateFromProfile(riskTolerance: string): UserMandate {
  switch (riskTolerance) {
    case "conservative":
      return { riskTolerance: "conservative", maxDrawdownPct: 0.05, maxPositionPct: 0.05, perTradeCap: 250 };
    case "aggressive":
      return { riskTolerance: "aggressive", maxDrawdownPct: 0.40, maxPositionPct: 0.40, perTradeCap: 1000 };
    default:
      return { riskTolerance: "balanced", maxDrawdownPct: 0.20, maxPositionPct: 0.20, perTradeCap: 500 };
  }
}
