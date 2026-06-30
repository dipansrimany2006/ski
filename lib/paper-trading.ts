// Shared paper trading execution — used by both the manual trade API and the CFO engine.
// Extracted from app/api/paper/trade/route.ts to avoid HTTP roundtrip from the CFO engine.

import { getDB } from "@/lib/db";

interface TradeParams {
  userId: string;
  assetId: string;
  symbol: string;
  displaySymbol: string;
  name: string;
  category: string;
  tradeType: "buy" | "sell";
  amountUsd?: number;   // for buy
  quantity?: number;    // for sell
  price: number;
  stopLoss?: number;    // locked-in at entry, stored on the position row
  takeProfit?: number;
}

interface TradeResult {
  balance: number;
  position: {
    quantity: number;
    avg_buy_price: number;
    asset_id: string;
    display_symbol: string;
  } | null;
  trade: { type: string; quantity: number; price: number; total: number; id?: string };
}

export async function ensurePaperAccount(userId: string): Promise<number> {
  const db = getDB();
  await db`INSERT INTO paper_accounts (user_id) VALUES (${userId}) ON CONFLICT (user_id) DO NOTHING`;
  const rows = await db`SELECT balance FROM paper_accounts WHERE user_id = ${userId}`;
  return Number(rows[0].balance);
}

export async function executePaperTrade(params: TradeParams): Promise<{ ok: true; result: TradeResult } | { ok: false; error: string }> {
  const { userId, assetId, symbol, displaySymbol, name, category, tradeType, price } = params;
  const db = getDB();
  const balance = await ensurePaperAccount(userId);

  if (tradeType === "buy") {
    const spend = params.amountUsd ?? 0;
    if (spend <= 0) return { ok: false, error: "amount_usd must be positive" };
    if (spend > balance) return { ok: false, error: "Insufficient paper balance" };

    const qty    = spend / price;
    const newBal = balance - spend;

    const sl = params.stopLoss   ?? null;
    const tp = params.takeProfit ?? null;

    const existing = await db`SELECT * FROM paper_positions WHERE user_id = ${userId} AND asset_id = ${assetId}`;
    if (existing.length > 0) {
      const prevQty = Number(existing[0].quantity);
      const prevAvg = Number(existing[0].avg_buy_price);
      const newQty  = prevQty + qty;
      const newAvg  = (prevQty * prevAvg + qty * price) / newQty;
      // Keep existing SL/TP if new ones weren't provided; otherwise take the new entry's levels
      const newSl = sl ?? (existing[0].stop_loss  ? Number(existing[0].stop_loss)  : null);
      const newTp = tp ?? (existing[0].take_profit ? Number(existing[0].take_profit) : null);
      await db`
        UPDATE paper_positions
        SET quantity = ${newQty}, avg_buy_price = ${newAvg},
            stop_loss = ${newSl}, take_profit = ${newTp},
            updated_at = to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        WHERE user_id = ${userId} AND asset_id = ${assetId}
      `;
    } else {
      await db`
        INSERT INTO paper_positions (user_id, asset_id, symbol, display_symbol, name, category, quantity, avg_buy_price, stop_loss, take_profit)
        VALUES (${userId}, ${assetId}, ${symbol}, ${displaySymbol}, ${name}, ${category}, ${qty}, ${price}, ${sl}, ${tp})
      `;
    }

    await db`UPDATE paper_accounts SET balance = ${newBal}, updated_at = to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') WHERE user_id = ${userId}`;
    const tradeRows = await db`
      INSERT INTO paper_trades (user_id, asset_id, symbol, display_symbol, name, trade_type, quantity, price, total)
      VALUES (${userId}, ${assetId}, ${symbol}, ${displaySymbol}, ${name}, 'buy', ${qty}, ${price}, ${spend})
      RETURNING id
    `;
    const pos = await db`SELECT * FROM paper_positions WHERE user_id = ${userId} AND asset_id = ${assetId}`;
    return {
      ok: true,
      result: {
        balance: newBal,
        position: pos.length > 0 ? {
          quantity: Number(pos[0].quantity),
          avg_buy_price: Number(pos[0].avg_buy_price),
          asset_id: String(pos[0].asset_id),
          display_symbol: String(pos[0].display_symbol),
        } : null,
        trade: { type: "buy", quantity: qty, price, total: spend, id: String(tradeRows[0]?.id ?? "") },
      },
    };
  }

  // sell
  const sellQty = params.quantity ?? 0;
  if (sellQty <= 0) return { ok: false, error: "quantity must be positive" };

  const existing = await db`SELECT * FROM paper_positions WHERE user_id = ${userId} AND asset_id = ${assetId}`;
  if (existing.length === 0) return { ok: false, error: "No position to sell" };

  const currentQty = Number(existing[0].quantity);
  if (sellQty > currentQty) return { ok: false, error: "Insufficient position" };

  const total  = sellQty * price;
  const newBal = balance + total;
  const remQty = currentQty - sellQty;

  if (remQty < 1e-10) {
    await db`DELETE FROM paper_positions WHERE user_id = ${userId} AND asset_id = ${assetId}`;
  } else {
    await db`
      UPDATE paper_positions
      SET quantity = ${remQty}, updated_at = to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      WHERE user_id = ${userId} AND asset_id = ${assetId}
    `;
  }

  await db`UPDATE paper_accounts SET balance = ${newBal}, updated_at = to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') WHERE user_id = ${userId}`;
  const tradeRows = await db`
    INSERT INTO paper_trades (user_id, asset_id, symbol, display_symbol, name, trade_type, quantity, price, total)
    VALUES (${userId}, ${assetId}, ${symbol}, ${displaySymbol}, ${name}, 'sell', ${sellQty}, ${price}, ${total})
    RETURNING id
  `;

  const pos = remQty >= 1e-10
    ? await db`SELECT * FROM paper_positions WHERE user_id = ${userId} AND asset_id = ${assetId}`
    : [];

  return {
    ok: true,
    result: {
      balance: newBal,
      position: pos.length > 0 ? {
        quantity: Number(pos[0].quantity),
        avg_buy_price: Number(pos[0].avg_buy_price),
        asset_id: String(pos[0].asset_id),
        display_symbol: String(pos[0].display_symbol),
      } : null,
      trade: { type: "sell", quantity: sellQty, price, total, id: String(tradeRows[0]?.id ?? "") },
    },
  };
}
