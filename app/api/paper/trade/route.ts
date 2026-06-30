// POST /api/paper/trade — execute a paper buy or sell (auth required)
//
// Body: {
//   asset_id, symbol, display_symbol, name, category,
//   trade_type: "buy" | "sell",
//   amount_usd: number,   // for buy  (USD to spend)
//   quantity: number,     // for sell (units to sell)
//   price: number,        // current price used for calculation
// }

import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureAccount(db: ReturnType<typeof getDB>, userId: string): Promise<number> {
  await db`INSERT INTO paper_accounts (user_id) VALUES (${userId}) ON CONFLICT (user_id) DO NOTHING`;
  const rows = await db`SELECT balance FROM paper_accounts WHERE user_id = ${userId}`;
  return Number(rows[0].balance);
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const { asset_id, symbol, display_symbol, name, category, trade_type, amount_usd, quantity, price } = body as {
    asset_id: string; symbol: string; display_symbol: string; name: string; category: string;
    trade_type: "buy" | "sell"; amount_usd?: number; quantity?: number; price: number;
  };

  if (!asset_id || !symbol || !display_symbol || !name || !category || !trade_type || !price) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (trade_type !== "buy" && trade_type !== "sell") {
    return NextResponse.json({ error: "trade_type must be buy or sell" }, { status: 400 });
  }

  const db = getDB();
  const balance = await ensureAccount(db, session.userId);

  if (trade_type === "buy") {
    const spend = amount_usd ?? 0;
    if (spend <= 0) return NextResponse.json({ error: "amount_usd must be positive" }, { status: 400 });
    if (spend > balance) return NextResponse.json({ error: "Insufficient paper balance" }, { status: 400 });

    const qty    = spend / price;
    const total  = spend;
    const newBal = balance - total;

    // Upsert position with new avg buy price
    const existing = await db`SELECT * FROM paper_positions WHERE user_id = ${session.userId} AND asset_id = ${asset_id}`;
    if (existing.length > 0) {
      const prevQty = Number(existing[0].quantity);
      const prevAvg = Number(existing[0].avg_buy_price);
      const newQty  = prevQty + qty;
      const newAvg  = (prevQty * prevAvg + qty * price) / newQty;
      await db`
        UPDATE paper_positions
        SET quantity = ${newQty}, avg_buy_price = ${newAvg},
            updated_at = to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        WHERE user_id = ${session.userId} AND asset_id = ${asset_id}
      `;
    } else {
      await db`
        INSERT INTO paper_positions (user_id, asset_id, symbol, display_symbol, name, category, quantity, avg_buy_price)
        VALUES (${session.userId}, ${asset_id}, ${symbol}, ${display_symbol}, ${name}, ${category}, ${qty}, ${price})
      `;
    }

    await db`UPDATE paper_accounts SET balance = ${newBal}, updated_at = to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') WHERE user_id = ${session.userId}`;
    await db`
      INSERT INTO paper_trades (user_id, asset_id, symbol, display_symbol, name, trade_type, quantity, price, total)
      VALUES (${session.userId}, ${asset_id}, ${symbol}, ${display_symbol}, ${name}, 'buy', ${qty}, ${price}, ${total})
    `;

    const pos = await db`SELECT * FROM paper_positions WHERE user_id = ${session.userId} AND asset_id = ${asset_id}`;
    return NextResponse.json({
      balance: newBal,
      position: pos.length > 0 ? { ...pos[0], quantity: Number(pos[0].quantity), avg_buy_price: Number(pos[0].avg_buy_price) } : null,
      trade: { type: "buy", quantity: qty, price, total },
    });
  }

  // sell
  const sellQty = quantity ?? 0;
  if (sellQty <= 0) return NextResponse.json({ error: "quantity must be positive" }, { status: 400 });

  const existing = await db`SELECT * FROM paper_positions WHERE user_id = ${session.userId} AND asset_id = ${asset_id}`;
  if (existing.length === 0) return NextResponse.json({ error: "No position to sell" }, { status: 400 });

  const currentQty = Number(existing[0].quantity);
  // Clamp to full position when within floating-point rounding tolerance (e.g. 100% button)
  const actualSellQty = sellQty >= currentQty * (1 - 1e-7) ? currentQty : sellQty;
  if (actualSellQty > currentQty) return NextResponse.json({ error: "Insufficient position" }, { status: 400 });

  const total  = actualSellQty * price;
  const newBal = balance + total;
  const remQty = currentQty - actualSellQty;

  if (remQty < 1e-10) {
    await db`DELETE FROM paper_positions WHERE user_id = ${session.userId} AND asset_id = ${asset_id}`;
  } else {
    await db`
      UPDATE paper_positions
      SET quantity = ${remQty}, updated_at = to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      WHERE user_id = ${session.userId} AND asset_id = ${asset_id}
    `;
  }

  await db`UPDATE paper_accounts SET balance = ${newBal}, updated_at = to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') WHERE user_id = ${session.userId}`;
  await db`
    INSERT INTO paper_trades (user_id, asset_id, symbol, display_symbol, name, trade_type, quantity, price, total)
    VALUES (${session.userId}, ${asset_id}, ${symbol}, ${display_symbol}, ${name}, 'sell', ${actualSellQty}, ${price}, ${total})
  `;

  const pos = remQty >= 1e-10
    ? await db`SELECT * FROM paper_positions WHERE user_id = ${session.userId} AND asset_id = ${asset_id}`
    : [];

  return NextResponse.json({
    balance: newBal,
    position: pos.length > 0 ? { ...pos[0], quantity: Number(pos[0].quantity), avg_buy_price: Number(pos[0].avg_buy_price) } : null,
    trade: { type: "sell", quantity: actualSellQty, price, total },
  });
}
