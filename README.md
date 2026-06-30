# Ski — Your Personal On-Chain CFO

Ski lets anyone spin up a personal AI Chief Financial Officer. It trades on Stellar,
applies proven strategies (momentum, mean-reversion, sentiment divergence, volume breakout),
and delivers CFO-grade guidance in plain language. No finance degree required.

Built for the **Stellar Monthly Builder Challenge**.

Live site: https://ski-trade.vercel.app

## What it does

- **Portfolio intelligence.** Reads live Stellar wallet balances via Horizon, computes allocation,
  value, and concentration risk, then writes a natural-language CFO Report.
- **Strategy-driven advice.** Deterministic strategy math (RSI, MACD, momentum, Bollinger Bands,
  Kelly sizing) produces signals; the AI explains why each fits your profile and how much to act on.
- **Conversational Q&A.** A chat that knows your real positions and answers questions like
  "should I take profit on my XLM?" with sized, reasoned answers.
- **CFO persona.** Set risk tolerance, goal, and horizon once; every recommendation is shaped to you.
- **Automated execution.** Optional live trading via Stellar SDEX path payments (PathPaymentStrictSend)
  using a server-side agent keypair.

## How AI is used

The reasoning engine is **Groq (Llama 3.3 70B)**. It receives structured context (the user's
persona, live portfolio, market signals, and the pre-computed strategy signals) and synthesizes
a CFO report and chat answers. The strategy math is deterministic and computed in `lib/cfo/`,
so the numbers are reproducible; the AI reasons on top of them rather than inventing figures.

If `GROQ_API_KEY` is absent, the app still works end to end. Portfolio data and deterministic
strategy signals render; only the AI narrative is disabled.

## Stellar integration

- **Horizon API** — live wallet balances (`loadAccount`) and transaction submission
- **SDEX path payments** — `PathPaymentStrictSend` executes swaps across any asset pair
- **Stellar assets** — XLM (native), USDC, BTC, ETH, SOL tracked via Pyth + CMC
- **Freighter wallet** — browser wallet for signing transactions
- **stellar.expert** — on-chain transaction explorer links

## Tech stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · Groq API (Llama 3.3 70B) ·
`@stellar/stellar-sdk` · CoinMarketCap API · Pyth Network · Neon PostgreSQL · Recharts · Vercel.

## Project structure

```
app/
  page.tsx                  Landing
  cfo/page.tsx              CFO dashboard + decisions
  strategy/page.tsx         Strategy skill builder + backtester
  api/
    cfo/                    Engine, wallet, chat, decisions
    portfolio/
      stellar-balance/      Horizon account balances
    agent/                  Stellar agent tools
    skill/                  Strategy generation + backtest
components/
  cfo-chat.tsx              Conversational CFO chat
  deposit-modal.tsx         Paper trading top-up
lib/
  stellar/assets.ts         Stellar asset registry
  wallet.ts                 Keypair generation + AES-256-GCM encryption
  sdex.ts                   SDEX path payment execution
  stellar-agent.ts          Agent tool definitions
  cfo/                      Engine, strategies, arbitration, Kelly sizing
  skill/                    LLM strategy generator + backtester
  market.ts                 Market signals (price, RSI, candles via Pyth)
  cmc.ts                    Fear & Greed + global metrics
```

## Run locally

```bash
npm install
cp .env.example .env.local   # add GROQ_API_KEY, DATABASE_URL, ENCRYPTION_KEY
npm run dev
```

Open http://localhost:3000, build your CFO persona, then connect a Stellar wallet or use paper mode.

## Roadmap

- **Phase 2, Proactive alerts.** Telegram / push notifications on significant signal changes,
  P&L swings, or rebalance opportunities detected by the CFO engine.
- Historical P&L tracking and a monthly CFO performance summary.
- Freighter wallet integration for browser-side transaction signing.
- SEP-24 anchor support for on/off-ramp via fiat currencies.
