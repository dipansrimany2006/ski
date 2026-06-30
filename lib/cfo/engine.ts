// CFO Engine — the 9-step decision loop.
// Runs for a given user + list of target tokens, returns decisions array.

import type { CFODecision, Signal, TradeAction } from "./types";
import { deriveMandateFromProfile } from "./types";
import { fetchCFOCandles }           from "./market-data";
import { fetchAssetDetail }          from "@/lib/market";
import { runMomentumStrategies, adxFilter } from "./strategies/momentum";
import { runMeanReversionStrategies }        from "./strategies/mean-reversion";
import { runVolatilityStrategies }           from "./strategies/volatility";
import { runVolumeStrategies }               from "./strategies/volume";
import { runStatisticalStrategies }          from "./strategies/statistical";
import { runSmartMoneyStrategies }           from "./strategies/smart-money";
import type { SmartMoneySignal }             from "./strategies/smart-money";
import { runSentimentStrategies }            from "./strategies/sentiment";
import { buyWithXLM, sellToUSDC } from "@/lib/sdex";
import { getStellarAsset } from "@/lib/stellar/assets";
import { sessionFilter, dayOfWeekFilter }    from "./strategies/time-filters";
import { kellySize, volScalingMult, computePositionSize } from "./strategies/risk-sizing";
import { arbitrate }                         from "./arbitration";
import { llmArbiter }                        from "./llm-arbiter";
import { mandateGuard, checkCircuitBreakers } from "./mandate-guard";
import { executePaperTrade, ensurePaperAccount } from "@/lib/paper-trading";
import { getDB } from "@/lib/db";
import { selectWatchlist } from "./watchlist-selector";

interface UserContext {
  userId: string;
  riskTolerance: string;
  walletAddress?: string;
  encryptedKey?: string;
  strategyText?: string;
}

export interface EngineResult {
  decisions: CFODecision[];
  circuitBreakerTripped: boolean;
  circuitBreakerReason?: string;
}

export async function runCFOEngine(ctx: UserContext): Promise<EngineResult> {
  const { userId, riskTolerance, walletAddress, encryptedKey, strategyText } = ctx;
  const mandate = deriveMandateFromProfile(riskTolerance);
  const agentAddress = walletAddress;
  const decisions: CFODecision[] = [];

  // Dynamic watchlist: CFO selects assets based on live market data + risk profile
  const watchlistSelection = await selectWatchlist(riskTolerance);
  const targetTokens = watchlistSelection.assets.map(a => a.displaySymbol);

  // Persist the chosen watchlist so the user can see what the CFO is currently watching
  const db = getDB();
  await db`UPDATE users SET cfo_watchlist = ${JSON.stringify(targetTokens)} WHERE id = ${userId}`;

  // Step 1 · Pre-trade time gates
  const sessionGate = sessionFilter("always");
  const dowGate     = dayOfWeekFilter([0, 1, 2, 3, 4, 5, 6]);
  if (!sessionGate.pass || !dowGate.pass) {
    return { decisions: [], circuitBreakerTripped: false };
  }

  const balance = await ensurePaperAccount(userId);

  const posRows = await db`SELECT * FROM paper_positions WHERE user_id = ${userId}`;
  const openPositionMap = new Map<string, {
    quantity: number; avg_buy_price: number; asset_id: string;
    name: string; category: string; symbol: string;
    stopLoss: number | null; takeProfit: number | null;
  }>();
  let totalOpenUsd = 0;

  for (const row of posRows) {
    openPositionMap.set(String(row.display_symbol), {
      quantity:      Number(row.quantity),
      avg_buy_price: Number(row.avg_buy_price),
      asset_id:      String(row.asset_id),
      name:          String(row.name),
      category:      String(row.category),
      symbol:        String(row.symbol),
      stopLoss:      row.stop_loss   != null ? Number(row.stop_loss)   : null,
      takeProfit:    row.take_profit != null ? Number(row.take_profit) : null,
    });
  }

  // ── Circuit breaker: compute daily loss from today's trades ───────────────
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString().slice(0, 10); // "YYYY-MM-DD"

  const todayTrades = await db`
    SELECT trade_type, total FROM paper_trades
    WHERE user_id = ${userId} AND created_at >= ${todayIso}
  `;
  let dailyLossUsd = 0;
  for (const t of todayTrades) {
    if (String(t.trade_type) === "buy")  dailyLossUsd += Number(t.total);
    if (String(t.trade_type) === "sell") dailyLossUsd -= Number(t.total);
  }

  // Compute current open value to check drawdown
  for (const [, pos] of openPositionMap) {
    totalOpenUsd += pos.quantity * pos.avg_buy_price; // use cost basis as rough estimate at this point
  }

  const cb = checkCircuitBreakers(balance, totalOpenUsd, dailyLossUsd, mandate);
  if (cb.tripped) {
    // Auto-halt the CFO
    await db`UPDATE users SET cfo_active = 0 WHERE id = ${userId}`;
    return { decisions: [], circuitBreakerTripped: true, circuitBreakerReason: cb.reason };
  }
  totalOpenUsd = 0; // reset — will be recomputed per-token below with live prices

  // ── Step 9 (monitor) · SL/TP exits — use levels locked in at entry time ────
  for (const [displaySymbol, pos] of openPositionMap) {
    try {
      // Skip if no SL/TP was stored at entry (position opened manually or before this fix)
      if (pos.stopLoss === null && pos.takeProfit === null) continue;

      const asset = await fetchAssetDetail(displaySymbol);
      if (!asset || asset.priceUsd <= 0) continue;
      const price = asset.priceUsd;

      const shouldStopLoss   = pos.stopLoss   !== null && price <= pos.stopLoss;
      const shouldTakeProfit = pos.takeProfit !== null && price >= pos.takeProfit;

      if (shouldStopLoss || shouldTakeProfit) {
        const reason = shouldStopLoss ? "stop_loss_hit" : "take_profit_hit";
        const execResult = await executePaperTrade({
          userId,
          assetId:       pos.asset_id,
          symbol:        pos.symbol,
          displaySymbol,
          name:          pos.name,
          category:      pos.category,
          tradeType:     "sell",
          quantity:      pos.quantity,
          price,
        });
        if (execResult.ok) {
          await logDecision(db, {
            userId, assetId: pos.asset_id, symbol: pos.symbol, displaySymbol,
            action: "sell", blendedSignal: shouldStopLoss ? -1 : 1,
            llmRationale: reason, llmPassed: true,
            mandateApproved: true, finalSizeUsd: pos.quantity * price,
            priceAtDecision: price, regime: "unknown",
            tradeId: execResult.result.trade.id,
          });
        }
      }
    } catch (err) {
      console.error(`[CFO] SL/TP check failed for ${displaySymbol}:`, err);
    }
  }

  // ── Main loop: evaluate each target token + any held positions not in watchlist ─
  // Union ensures held positions always get an exit signal even if removed from watchlist
  const analysisSymbols = [...new Set([...targetTokens, ...openPositionMap.keys()])];

  for (const displaySymbol of analysisSymbols) {
    try {
      const asset = await fetchAssetDetail(displaySymbol);
      if (!asset) continue;

      const price = asset.priceUsd;
      if (price <= 0) continue;

      const candles = await fetchCFOCandles(asset.pythSymbol);
      if (candles.length < 30) continue;

      // Step 2 · ADX gate (shapes regime, doesn't hard-block)
      const { isTrending, adxValue } = adxFilter(candles);

      // Step 3 · Strategy ensemble (technical + CMC sentiment)
      const momentumSignals    = runMomentumStrategies(candles);
      const mrSignals          = runMeanReversionStrategies(candles);
      const volSignals         = runVolatilityStrategies(candles);
      const volumeSignals      = runVolumeStrategies(candles);
      const statisticalSignals = runStatisticalStrategies(candles);
      const smartMoneySignals  = runSmartMoneyStrategies(candles);
      const sentimentSignals   = await runSentimentStrategies().catch(() => [] as Signal[]);

      const allSignals: Signal[] = [
        ...momentumSignals.filter(s => s.name !== "adx_filter"),
        ...mrSignals,
        ...volSignals,
        ...volumeSignals,
        ...statisticalSignals,
        ...smartMoneySignals,
        ...sentimentSignals,
      ];

      // Step 4 · Arbitration
      const arbitration = arbitrate(allSignals, adxValue, isTrending);
      const blended     = arbitration.blendedSignal;
      let rawDirection: TradeAction = blended > 0.08 ? "buy" : blended < -0.08 ? "sell" : "hold";

      // Cannot sell an asset we don't hold (no shorting in paper trading)
      const openPos = openPositionMap.get(displaySymbol);
      if (rawDirection === "sell" && !openPos) rawDirection = "hold";

      // Step 5 · LLM Arbiter — only invoke for actionable signals
      if (rawDirection === "hold") {
        // Push to decisions for the run summary but skip DB logging
        decisions.push({
          userId, assetId: asset.id, symbol: asset.symbol, displaySymbol,
          action: "hold", signals: allSignals, arbitration,
          llmRationale: `Blended signal ${blended.toFixed(3)} — below action threshold`, llmPassed: true,
          mandateApproved: false, mandateVetoReason: "signal_too_weak",
          finalSizeUsd: 0, priceAtDecision: price,
        });
        continue;
      }

      const llmResult = await llmArbiter(displaySymbol, blended, allSignals, arbitration, price, strategyText);

      if (!llmResult.pass) {
        decisions.push({
          userId, assetId: asset.id, symbol: asset.symbol, displaySymbol,
          action: rawDirection, signals: allSignals, arbitration,
          llmRationale: llmResult.rationale, llmPassed: false,
          mandateApproved: false, mandateVetoReason: "llm_vetoed",
          finalSizeUsd: 0, priceAtDecision: price,
        });
        // Log the intended direction (buy/sell), not "hold" — keeps decision log meaningful
        await logDecision(db, {
          userId, assetId: asset.id, symbol: asset.symbol, displaySymbol,
          action: rawDirection, blendedSignal: blended,
          llmRationale: llmResult.rationale, llmPassed: false,
          mandateApproved: false, mandateVetoReason: "llm_vetoed",
          finalSizeUsd: 0, priceAtDecision: price, regime: arbitration.regime,
        });
        continue;
      }

      // Step 6 · Risk sizing
      const volMult    = volScalingMult(candles);
      const kFraction  = kellySize(0.52, 1.5, 1.0);
      const openPosUsd = openPos ? openPos.quantity * price : 0;
      totalOpenUsd    += openPosUsd;
      const totalPortfolioUsd = balance + totalOpenUsd;

      const rawSize = computePositionSize(
        Math.abs(blended), balance, mandate.perTradeCap, volMult, kFraction || 0.1,
      );

      // Step 7 · Mandate guard
      const guardResult = mandateGuard(rawSize, rawDirection, balance, openPosUsd, totalPortfolioUsd, mandate);

      const decision: CFODecision = {
        userId, assetId: asset.id, symbol: asset.symbol, displaySymbol,
        // Keep the intended direction (buy/sell) even when blocked — "hold" never reaches DB
        action: rawDirection,
        signals: allSignals, arbitration,
        llmRationale: llmResult.rationale, llmPassed: true,
        mandateApproved: guardResult.approved,
        mandateVetoReason: guardResult.vetoReason,
        finalSizeUsd: guardResult.finalSizeUsd,
        priceAtDecision: price,
      };

      // Step 8 · Execution — paper trade always; real Stellar SDEX trade if AGENT_SECRET_KEY set
      if (guardResult.approved && guardResult.finalSizeUsd > 0) {
        const smEntry = smartMoneySignals[0] as SmartMoneySignal | undefined;
        const tradeParams = rawDirection === "buy"
          ? { userId, assetId: asset.id, symbol: asset.symbol, displaySymbol, name: asset.name, category: asset.category, tradeType: "buy" as const, amountUsd: guardResult.finalSizeUsd, price, stopLoss: smEntry?.stopLoss, takeProfit: smEntry?.takeProfit }
          : { userId, assetId: asset.id, symbol: asset.symbol, displaySymbol, name: asset.name, category: asset.category, tradeType: "sell" as const, quantity: openPos?.quantity ?? guardResult.finalSizeUsd / price, price };

        const execResult = await executePaperTrade(tradeParams);
        if (execResult.ok) {
          decision.executedAt = new Date().toISOString();
          decision.tradeId    = execResult.result.trade.id;
        }

        // Stellar on-chain execution via SDEX (PathPaymentStrictSend)
        const stellarAsset = getStellarAsset(asset.symbol);
        if (stellarAsset && encryptedKey) {
          try {
            const xlmAmount = guardResult.finalSizeUsd / price;
            const swapResult = rawDirection === "buy"
              ? await buyWithXLM({
                  encryptedKey,
                  destAssetCode:   stellarAsset.code,
                  destAssetIssuer: stellarAsset.issuer,
                  xlmAmount,
                })
              : await sellToUSDC({
                  encryptedKey,
                  srcAssetCode:   stellarAsset.code,
                  srcAssetIssuer: stellarAsset.issuer,
                  srcAmount:      openPos?.quantity ?? xlmAmount,
                });

            if (swapResult.ok && swapResult.txHash) {
              await db`
                UPDATE cfo_decisions SET stellar_tx_hash = ${swapResult.txHash}
                WHERE trade_id = ${decision.tradeId ?? null} AND user_id = ${userId}
              `.catch(() => null);
            }
          } catch (stellarErr) {
            console.error("[CFO] Stellar on-chain execution error:", stellarErr);
          }
        }
      }

      decisions.push(decision);

      // Step 9 · Log
      await logDecision(db, {
        userId, assetId: asset.id, symbol: asset.symbol, displaySymbol,
        action: decision.action, blendedSignal: blended,
        llmRationale: decision.llmRationale, llmPassed: true,
        mandateApproved: decision.mandateApproved,
        mandateVetoReason: decision.mandateVetoReason,
        finalSizeUsd: decision.finalSizeUsd,
        priceAtDecision: price, regime: arbitration.regime,
        tradeId: decision.tradeId,
      });
    } catch (err) {
      console.error(`[CFO] Error processing ${displaySymbol}:`, err);
    }
  }

  return { decisions, circuitBreakerTripped: false };
}

async function logDecision(db: ReturnType<typeof getDB>, d: {
  userId: string; assetId: string; symbol: string; displaySymbol: string;
  action: string; blendedSignal: number; llmRationale: string; llmPassed: boolean;
  mandateApproved: boolean; mandateVetoReason?: string; finalSizeUsd: number;
  priceAtDecision: number; regime: string; tradeId?: string;
}) {
  try {
    await db`
      INSERT INTO cfo_decisions
        (user_id, asset_id, symbol, display_symbol, action, blended_signal,
         llm_rationale, llm_passed, mandate_approved, mandate_veto_reason,
         final_size_usd, price_at_decision, regime, trade_id)
      VALUES
        (${d.userId}, ${d.assetId}, ${d.symbol}, ${d.displaySymbol}, ${d.action},
         ${d.blendedSignal}, ${d.llmRationale}, ${d.llmPassed}, ${d.mandateApproved},
         ${d.mandateVetoReason ?? null}, ${d.finalSizeUsd}, ${d.priceAtDecision},
         ${d.regime}, ${d.tradeId ?? null})
    `;
  } catch (err) {
    console.error("[CFO] Failed to log decision:", err);
  }
}
