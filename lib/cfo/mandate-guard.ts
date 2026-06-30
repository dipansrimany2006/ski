// Step 7: Mandate Guard — deterministic final check before execution.
// LLM cannot override this layer, ever.

import type { UserMandate, MandateGuardResult } from "./types";

export interface CircuitBreakerResult {
  tripped: boolean;
  reason?: string;
}

const STARTING_BALANCE = 10_000; // paper trading starting balance

// Circuit breaker: checks cumulative drawdown and daily loss against mandate limits.
// Returns { tripped: true } if trading should be halted for this user.
export function checkCircuitBreakers(
  currentBalance: number,
  openPositionValue: number,
  dailyLossUsd: number,
  mandate: UserMandate,
): CircuitBreakerResult {
  const totalValue     = currentBalance + openPositionValue;
  const drawdownPct    = (STARTING_BALANCE - totalValue) / STARTING_BALANCE;
  const dailyLossPct   = dailyLossUsd / STARTING_BALANCE;

  if (drawdownPct >= mandate.maxDrawdownPct) {
    return {
      tripped: true,
      reason: `max_drawdown_breached: portfolio at ${((1 - drawdownPct) * 100).toFixed(1)}% of starting value (limit ${((1 - mandate.maxDrawdownPct) * 100).toFixed(0)}%)`,
    };
  }

  // Daily loss cap: half of max drawdown
  const dailyLossLimit = mandate.maxDrawdownPct / 2;
  if (dailyLossPct >= dailyLossLimit) {
    return {
      tripped: true,
      reason: `daily_loss_breached: lost ${(dailyLossPct * 100).toFixed(1)}% today (limit ${(dailyLossLimit * 100).toFixed(0)}%)`,
    };
  }

  return { tripped: false };
}

export function mandateGuard(
  sizeUsd: number,
  direction: "buy" | "sell" | "hold",
  balance: number,
  openPositionUsd: number,   // current position value in this asset
  totalPortfolioUsd: number, // balance + all open positions
  mandate: UserMandate,
): MandateGuardResult {
  if (direction === "hold") {
    return { approved: false, finalSizeUsd: 0, vetoReason: "direction=hold" };
  }
  if (sizeUsd <= 0) {
    return { approved: false, finalSizeUsd: 0, vetoReason: "zero_size" };
  }

  // 1. Per-trade cap
  if (sizeUsd > mandate.perTradeCap) {
    sizeUsd = mandate.perTradeCap;
  }

  // 2. Sufficient balance for buys
  if (direction === "buy" && sizeUsd > balance) {
    sizeUsd = balance;
    if (sizeUsd <= 0) {
      return { approved: false, finalSizeUsd: 0, vetoReason: "insufficient_balance" };
    }
  }

  // 3. Max position % of portfolio
  const portfolio = totalPortfolioUsd > 0 ? totalPortfolioUsd : balance;
  const maxPositionUsd = portfolio * mandate.maxPositionPct;
  if (direction === "buy") {
    const newPositionUsd = openPositionUsd + sizeUsd;
    if (newPositionUsd > maxPositionUsd) {
      sizeUsd = Math.max(0, maxPositionUsd - openPositionUsd);
    }
  }

  if (sizeUsd < 1) {
    return { approved: false, finalSizeUsd: 0, vetoReason: "size_below_minimum_after_guard" };
  }

  return { approved: true, finalSizeUsd: sizeUsd };
}
