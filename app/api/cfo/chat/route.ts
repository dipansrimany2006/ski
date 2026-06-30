// GET  /api/cfo/chat — load persistent chat history
// POST /api/cfo/chat — send a message, persist both sides, return AI reply

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDB } from "@/lib/db";
import { executePaperTrade } from "@/lib/paper-trading";
import { fetchAssetDetail } from "@/lib/market";
import { runCFOEngine } from "@/lib/cfo/engine";
import { fetchFearGreed, fetchGlobalMetrics } from "@/lib/cmc";
import { getWalletXLMBalance } from "@/lib/wallet";
import Groq from "groq-sdk";

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";

const MODEL = "llama-3.3-70b-versatile";

type GroqTool = Parameters<Groq["chat"]["completions"]["create"]>[0]["tools"];
type GroqMsg  = Parameters<Groq["chat"]["completions"]["create"]>[0]["messages"][number];

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: GroqTool = [
  {
    type: "function",
    function: {
      name: "get_portfolio",
      description: "Get the user's current portfolio: balance, open positions, and recent trades.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_decisions",
      description: "Fetch the last N CFO decisions.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", description: "Max 20, default 10" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_cfo_analysis",
      description: "Trigger a full CFO analysis run and execute any resulting trades.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_buy",
      description: "Buy a specific asset.",
      parameters: {
        type: "object",
        properties: {
          display_symbol: { type: "string", description: "e.g. BTC/USD" },
          amount_usd:     { type: "number", description: "Dollar amount to spend" },
        },
        required: ["display_symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_sell",
      description: "Sell all of a held position.",
      parameters: {
        type: "object",
        properties: { display_symbol: { type: "string", description: "e.g. BTC/USD" } },
        required: ["display_symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_risk_profile",
      description: "Change the user's risk tolerance, goal, or time horizon.",
      parameters: {
        type: "object",
        properties: {
          risk_tolerance: { type: "string", enum: ["conservative", "balanced", "aggressive"] },
          goal:           { type: "string", enum: ["preservation", "growth", "income"] },
          horizon:        { type: "string", enum: ["short", "medium", "long"] },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_trading_strategy",
      description: "Save a natural-language trading strategy mandate. The agent will follow this when deciding trades on Stellar SDEX.",
      parameters: {
        type: "object",
        properties: {
          strategy: { type: "string", description: "The strategy in plain English, e.g. 'DCA into XLM when Fear & Greed < 30'" },
        },
        required: ["strategy"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_market_sentiment",
      description: "Fetch current CMC Fear & Greed index and global market metrics.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_stellar_wallet",
      description: "Return the agent's Stellar wallet address and XLM balance for on-chain SDEX trading.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

// ── Tool execution ────────────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>, userId: string): Promise<string> {
  const db = getDB();

  if (name === "get_portfolio") {
    const [accRows, posRows, tradeRows] = await Promise.all([
      db`SELECT balance FROM paper_accounts WHERE user_id = ${userId}`,
      db`SELECT * FROM paper_positions WHERE user_id = ${userId}`,
      db`SELECT * FROM paper_trades WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 10`,
    ]);

    const balance = accRows[0] ? Number(accRows[0].balance) : 0;
    const STARTING_BALANCE = 10_000;

    // Fetch live prices for all held positions concurrently
    const enrichedPositions = await Promise.all(posRows.map(async r => {
      const avgCost = Number(r.avg_buy_price);
      const qty     = Number(r.quantity);
      try {
        const asset = await fetchAssetDetail(String(r.display_symbol));
        const currentPrice  = asset?.priceUsd ?? avgCost;
        const currentValue  = qty * currentPrice;
        const costBasis     = qty * avgCost;
        const unrealizedPnl = currentValue - costBasis;
        const unrealizedPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;
        return {
          symbol: r.display_symbol,
          quantity: qty,
          avg_buy_price: avgCost,
          current_price: currentPrice,
          current_value_usd: currentValue,
          cost_basis_usd: costBasis,
          unrealized_pnl_usd: unrealizedPnl,
          unrealized_pnl_pct: unrealizedPct,
          status: unrealizedPnl >= 0 ? "profit" : "loss",
        };
      } catch {
        return { symbol: r.display_symbol, quantity: qty, avg_buy_price: avgCost };
      }
    }));

    const totalPositionValue = enrichedPositions.reduce((s, p) => s + (p.current_value_usd ?? 0), 0);
    const totalPortfolioValue = balance + totalPositionValue;
    const totalUnrealizedPnl = enrichedPositions.reduce((s, p) => s + (p.unrealized_pnl_usd ?? 0), 0);
    const overallPnl = totalPortfolioValue - STARTING_BALANCE;

    return JSON.stringify({
      balance_usd: balance,
      total_position_value_usd: totalPositionValue,
      total_portfolio_value_usd: totalPortfolioValue,
      overall_pnl_usd: overallPnl,
      overall_pnl_pct: (overallPnl / STARTING_BALANCE) * 100,
      overall_status: overallPnl >= 0 ? "profit" : "loss",
      unrealized_pnl_usd: totalUnrealizedPnl,
      positions: enrichedPositions,
      recent_trades: tradeRows.map(r => ({
        symbol: r.display_symbol, type: r.trade_type,
        quantity: Number(r.quantity), price: Number(r.price),
        total: Number(r.total), at: r.created_at,
      })),
    });
  }

  if (name === "get_recent_decisions") {
    const limit = Math.min(20, Number(args.limit ?? 10));
    const rows = await db`
      SELECT display_symbol, action, blended_signal, llm_passed, mandate_approved,
             mandate_veto_reason, final_size_usd, price_at_decision, llm_rationale, created_at
      FROM cfo_decisions WHERE user_id = ${userId}
      ORDER BY created_at DESC LIMIT ${limit}
    `;
    return JSON.stringify(rows.map(r => ({
      symbol: r.display_symbol, action: r.action,
      signal: Number(r.blended_signal), executed: !!r.mandate_approved,
      rationale: r.llm_rationale, at: r.created_at,
    })));
  }

  if (name === "run_cfo_analysis") {
    const userRows = await db`SELECT * FROM users WHERE id = ${userId}`;
    const user = userRows[0];
    if (!user?.cfo_active) return JSON.stringify({ error: "CFO is not active. Tell the user to activate it first." });
    const result = await runCFOEngine({ userId, riskTolerance: String(user.risk_tolerance ?? "balanced") });
    if (result.circuitBreakerTripped) return JSON.stringify({ error: `Circuit breaker: ${result.circuitBreakerReason}` });
    const execs = result.decisions.filter(d => d.tradeId);
    return JSON.stringify({
      analyzed: result.decisions.length, executed: execs.length,
      message: execs.length > 0
        ? `Ran ${result.decisions.length} analyses, executed ${execs.length} trade(s).`
        : `Ran ${result.decisions.length} analyses — no trades met the threshold.`,
    });
  }

  if (name === "execute_buy") {
    const sym = String(args.display_symbol ?? "").toUpperCase();
    const displaySymbol = sym.includes("/") ? sym : `${sym}/USD`;
    const asset = await fetchAssetDetail(displaySymbol);
    if (!asset) return JSON.stringify({ error: `Asset ${displaySymbol} not found.` });

    const userRows = await db`SELECT risk_tolerance FROM users WHERE id = ${userId}`;
    const risk = String(userRows[0]?.risk_tolerance ?? "balanced");
    const defaultAmt = risk === "conservative" ? 250 : risk === "aggressive" ? 1000 : 500;
    const amountUsd  = Number(args.amount_usd ?? defaultAmt);

    const result = await executePaperTrade({
      userId, assetId: asset.id, symbol: asset.symbol,
      displaySymbol, name: asset.name, category: asset.category,
      tradeType: "buy", amountUsd, price: asset.priceUsd,
    });
    if (!result.ok) return JSON.stringify({ error: result.error });
    return JSON.stringify({
      success: true,
      message: `Bought $${amountUsd.toFixed(2)} of ${displaySymbol} at $${asset.priceUsd.toFixed(4)} · got ${result.result.trade.quantity.toFixed(6)} units · balance now $${result.result.balance.toFixed(2)}.`,
    });
  }

  if (name === "execute_sell") {
    const sym = String(args.display_symbol ?? "").toUpperCase();
    const displaySymbol = sym.includes("/") ? sym : `${sym}/USD`;
    const posRows = await db`SELECT * FROM paper_positions WHERE user_id = ${userId} AND display_symbol = ${displaySymbol}`;
    if (posRows.length === 0) return JSON.stringify({ error: `No open position in ${displaySymbol}.` });

    const pos   = posRows[0];
    const asset = await fetchAssetDetail(displaySymbol);
    if (!asset) return JSON.stringify({ error: `Could not fetch price for ${displaySymbol}.` });

    const result = await executePaperTrade({
      userId, assetId: String(pos.asset_id), symbol: String(pos.symbol),
      displaySymbol, name: String(pos.name), category: String(pos.category),
      tradeType: "sell", quantity: Number(pos.quantity), price: asset.priceUsd,
    });
    if (!result.ok) return JSON.stringify({ error: result.error });
    return JSON.stringify({
      success: true,
      message: `Sold ${Number(pos.quantity).toFixed(6)} ${displaySymbol} at $${asset.priceUsd.toFixed(4)} for $${result.result.trade.total.toFixed(2)} · balance now $${result.result.balance.toFixed(2)}.`,
    });
  }

  if (name === "update_risk_profile") {
    const updates: Record<string, string> = {};
    if (args.risk_tolerance) updates.risk_tolerance = String(args.risk_tolerance);
    if (args.goal)           updates.goal           = String(args.goal);
    if (args.horizon)        updates.horizon        = String(args.horizon);
    if (Object.keys(updates).length === 0) return JSON.stringify({ error: "No fields provided." });

    for (const [k, v] of Object.entries(updates)) {
      await db.query(`UPDATE users SET ${k} = $1 WHERE id = $2`, [v, userId]);
    }
    return JSON.stringify({ success: true, updated: updates });
  }

  if (name === "set_trading_strategy") {
    const strategy = String(args.strategy ?? "").slice(0, 1000);
    if (!strategy) return JSON.stringify({ error: "Empty strategy" });
    await db`UPDATE users SET cfo_strategy = ${strategy} WHERE id = ${userId}`;
    return JSON.stringify({ success: true, message: `Strategy saved: "${strategy}". The agent will follow this on Stellar SDEX.` });
  }

  if (name === "get_market_sentiment") {
    const [fg, gm] = await Promise.all([fetchFearGreed(), fetchGlobalMetrics()]);
    return JSON.stringify({
      fearGreed: fg ? { value: fg.value, label: fg.valueText } : null,
      btcDominance: gm?.btcDominancePct ?? null,
      totalMarketCapUsd: gm?.totalMarketCapUsd ?? null,
      interpretation: fg
        ? fg.value <= 25 ? "Extreme fear — contrarian buy opportunity"
        : fg.value <= 40 ? "Fear — mild buy signal"
        : fg.value <= 60 ? "Neutral — no directional edge"
        : fg.value <= 75 ? "Greed — mild sell signal"
        : "Extreme greed — contrarian sell opportunity"
        : "Sentiment data unavailable (CMC_API_KEY not set)",
    });
  }

  if (name === "get_stellar_wallet") {
    const userRows = await db`SELECT cfo_wallet_address, cfo_wallet_key FROM users WHERE id = ${userId}`;
    const u = userRows[0];
    const address = u?.cfo_wallet_address ? String(u.cfo_wallet_address) : null;
    const balance = (address && u?.cfo_wallet_key)
      ? await getWalletXLMBalance(String(u.cfo_wallet_key)).catch(() => 0)
      : 0;
    return JSON.stringify({
      address:    address ?? "no wallet yet — call POST /api/cfo/wallet to create one",
      network:    "Stellar Mainnet",
      balanceXLM: balance,
      explorer:   address ? `https://stellar.expert/explorer/public/account/${address}` : null,
      funded:     balance >= 10,
      note: !address
        ? "No Stellar agent wallet yet. I can create one — just say 'create my agent wallet'."
        : balance < 10
        ? `Wallet exists but has only ${balance.toFixed(4)} XLM. Send at least 10 XLM to ${address} to enable live SDEX trading.`
        : `Live SDEX trading active — wallet has ${balance.toFixed(4)} XLM.`,
    });
  }

  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

// ── GET — load history ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const db   = getDB();
  const rows = await db`
    SELECT id, role, content, tool_calls, created_at
    FROM cfo_chat_messages
    WHERE user_id = ${session.userId}
    ORDER BY created_at ASC
    LIMIT 200
  `;

  return NextResponse.json({
    messages: rows.map(r => ({
      id:         String(r.id),
      role:       String(r.role),
      content:    String(r.content),
      toolCalls:  r.tool_calls ? JSON.parse(String(r.tool_calls)) as unknown[] : [],
      created_at: String(r.created_at),
    })),
  });
}

// ── POST — chat ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json() as { message: string };
  const { message } = body;
  if (!message?.trim()) return NextResponse.json({ error: "Empty message" }, { status: 400 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });

  const db = getDB();

  // Persist the user message
  await db`
    INSERT INTO cfo_chat_messages (user_id, role, content)
    VALUES (${session.userId}, 'user', ${message})
  `;

  // Load recent history for context (last 30 messages)
  const historyRows = await db`
    SELECT role, content FROM cfo_chat_messages
    WHERE user_id = ${session.userId}
    ORDER BY created_at DESC LIMIT 30
  `;
  const history = historyRows.reverse();

  // User context for system prompt
  const userRows = await db`
    SELECT display_name, cfo_name, risk_tolerance, goal, horizon, cfo_watchlist, cfo_active, cfo_strategy, cfo_wallet_address
    FROM users WHERE id = ${session.userId}
  `;
  const user     = userRows[0];
  const cfoName  = String(user?.cfo_name   ?? "Ski");
  const userName = String(user?.display_name ?? "there");
  const watchlist: string[] = user?.cfo_watchlist
    ? (JSON.parse(String(user.cfo_watchlist)) as string[])
    : [];
  const strategy   = user?.cfo_strategy        ? String(user.cfo_strategy)        : null;
  const walletAddr = user?.cfo_wallet_address   ? String(user.cfo_wallet_address)  : null;

  const systemPrompt = `You are ${cfoName}, an AI trading agent on Stellar. You trade live on the Stellar SDEX using CMC market data + a multi-strategy signal engine. Managing ${userName}'s portfolio.

Profile:
- Risk tolerance: ${user?.risk_tolerance ?? "balanced"}
- Goal: ${user?.goal ?? "growth"} · Horizon: ${user?.horizon ?? "medium"}
- Watching: ${watchlist.join(", ") || "XLM/USD, BTC/USD, ETH/USD, USDC/USD"}
- Status: ${user?.cfo_active ? "active" : "inactive"}
- Strategy mandate: ${strategy ?? "none set — use set_trading_strategy to define one"}
- Agent Stellar wallet: ${walletAddr ?? "not created yet — suggest the user creates one via the CFO page"}

Each user has their own isolated Stellar keypair. The secret key is encrypted server-side (AES-256-GCM) — you never see the raw key.
Data sources: CMC Fear & Greed, Binance OHLCV candles, Pyth Network price feeds, Stellar SDEX path payments.

CRITICAL RESPONSE RULES:
- After execute_buy or execute_sell succeeds, immediately confirm the trade to the user in one sentence. Do NOT call any other tool afterwards — the trade result contains everything you need.
- After calling get_portfolio, write your answer immediately. Do NOT call get_portfolio again in the same turn.
- After calling any tool, ALWAYS write a clear conversational reply using only that tool's result. One tool call per question is almost always enough.
- Be concise and direct. Never make up numbers. Never respond with just "Done." — always turn the data into a human answer.`;

  const groq     = new Groq({ apiKey });
  const messages: GroqMsg[] = history.map(r => ({ role: r.role as "user" | "assistant", content: String(r.content) }));

  try {
    let response = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 1024,
    });

    const toolCallResults: { tool: string; result: string }[] = [];

    for (let round = 0; round < 2; round++) {
      const choice = response.choices[0];
      if (choice.finish_reason !== "tool_calls" || !choice.message.tool_calls?.length) break;

      const assistantMsg: GroqMsg = {
        role:       "assistant",
        content:    choice.message.content ?? null,
        tool_calls: choice.message.tool_calls,
      };
      messages.push(assistantMsg);

      for (const tc of choice.message.tool_calls) {
        const args   = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
        const result = await callTool(tc.function.name, args, session.userId);
        toolCallResults.push({ tool: tc.function.name, result });
        messages.push({ role: "tool", content: result, tool_call_id: tc.id });
      }

      response = await groq.chat.completions.create({
        model: MODEL,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        tools: TOOLS,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 1024,
      });
    }

    // If the model is still trying to call tools after the loop, force it to speak
    let reply = response.choices[0]?.message?.content;
    if (!reply) {
      const forced = await groq.chat.completions.create({
        model: MODEL,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        tools: TOOLS,
        tool_choice: "none",
        temperature: 0.3,
        max_tokens: 1024,
      });
      reply = forced.choices[0]?.message?.content ?? "I couldn't generate a response. Please try again.";
    }

    // Persist the assistant reply
    await db`
      INSERT INTO cfo_chat_messages (user_id, role, content, tool_calls)
      VALUES (
        ${session.userId}, 'assistant', ${reply},
        ${toolCallResults.length > 0 ? JSON.stringify(toolCallResults) : null}
      )
    `;

    return NextResponse.json({ reply, toolCalls: toolCallResults });
  } catch (err) {
    console.error("CFO chat error:", err);
    return NextResponse.json({ error: "Chat failed — please try again." }, { status: 500 });
  }
}
