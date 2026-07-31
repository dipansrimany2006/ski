# Ski — AI CFO for Stellar

> An autonomous AI Chief Financial Officer that reads your Stellar portfolio, runs a 9-step deterministic decision loop, enforces risk limits on-chain via a Soroban smart contract, and explains every decision in plain language.

Built for the **Stellar / Soroban Hackathon**.

**Live demo:** https://ski-trade.vercel.app  
**Demo video:** 
**Contract (testnet):** `CCIAQW52A3AWHKJH2THRCA4HOJFZUKOTKPME3Z6FSOBJL5NPZCAJZDW7`  
**Explorer:** https://stellar.expert/explorer/testnet/contract/CCIAQW52A3AWHKJH2THRCA4HOJFZUKOTKPME3Z6FSOBJL5NPZCAJZDW7

---

## Table of contents

1. [Problem](#1-problem)
2. [Solution](#2-solution)
3. [Soroban contract](#3-soroban-contract)
4. [Architecture](#4-architecture)
5. [Tech stack](#5-tech-stack)
6. [Project structure](#6-project-structure)
7. [Screenshots](#7-screenshots)
8. [Run locally](#8-run-locally)
9. [Environment variables](#9-environment-variables)
10. [Monitoring & analytics](#10-monitoring--analytics)
11. [Wallet interactions](#11-wallet-interactions)
12. [User feedback](#12-user-feedback)
13. [Roadmap](#13-roadmap)

---

## 1. Problem

Retail holders of Stellar-based assets (XLM, USDC via Anchors, tokenized RWAs, Soroban DeFi positions) have no way to get ongoing, personalized portfolio management without either (a) doing the analysis themselves or (b) handing custody to a centralized manager.

Existing DeFi dashboards show raw balances and APYs but don't translate them into a decision a non-expert can act on — "should I rebalance," "should I move idle USDC into a yield venue," "is my concentration risk too high."

---

## 2. Solution

Ski is a non-custodial AI CFO that:

- **Reads** Stellar wallet balances via Horizon API and Soroban RPC
- **Signals** using 7 deterministic strategy families (momentum, mean-reversion, volatility, volume, statistical, smart-money, CMC sentiment)
- **Arbitrates** with an LLM that explains decisions in plain language — but never touches a number
- **Guards** every trade through off-chain and on-chain mandate checks before any execution
- **Executes** optional live swaps via SDEX PathPaymentStrictSend
- **Audits** every decision immutably on the Soroban testnet contract

The key design rule: **the LLM is an explainer, never a controller.** All numbers come from deterministic code.

---

## 3. Soroban contract

### Deployment

| Field | Value |
|-------|-------|
| Network | Stellar Testnet |
| Contract ID | `CCIAQW52A3AWHKJH2THRCA4HOJFZUKOTKPME3Z6FSOBJL5NPZCAJZDW7` |
| Deployer | `GBC52NZGOJNU6APQM7D7E63BPENVX2NSX7TCGHJPB4FRTCHPHQXH5WPU` |
| WASM hash | `87521f8779127be998abcf78d33df99683afa5be86aa86f31fe0f638c0f088b1` |
| Upload tx | `e377e1a6af8118b4b562b5e43d8c19debf95253012fe6e57e63b1d948dc488d8` |
| Deploy tx | `2661e2e1b04b6bc8d3c6a7a2b9812e13036209017f79fe04536de67238ad7d10` |
| Deployed | 2026-07-30 |
| Explorer | https://stellar.expert/explorer/testnet/contract/CCIAQW52A3AWHKJH2THRCA4HOJFZUKOTKPME3Z6FSOBJL5NPZCAJZDW7 |
| Stellar Lab | https://lab.stellar.org/r/testnet/contract/CCIAQW52A3AWHKJH2THRCA4HOJFZUKOTKPME3Z6FSOBJL5NPZCAJZDW7 |

### Contract entry points

| Function | Auth | Description |
|----------|------|-------------|
| `version()` | none | Returns contract version string |
| `register_mandate(owner, risk_tolerance, max_drawdown_bps, max_position_bps, per_trade_cap_stroops)` | owner | Lock risk parameters on-chain |
| `update_mandate(owner, ...)` | owner | Update existing mandate |
| `get_mandate(owner)` | none | Read a user's mandate |
| `validate_trade(owner, asset, direction, size, current_pos, total_portfolio)` | none | Simulate — check trade against mandate |
| `toggle_kill_switch(owner)` | owner | Flip emergency halt; returns new state |
| `is_kill_switch_active(owner)` | none | Read kill switch state |
| `check_circuit_breaker(owner, current_value_stroops)` | owner | Auto-trip kill switch on drawdown breach |
| `record_decision(owner, asset, direction, proposed, final, approved, veto_code, signal_bps)` | owner | Write CFO decision to audit log |
| `get_decisions(owner)` | none | Read last 50 decisions |

### Contract events

Every state-changing function emits a typed two-topic event `("ski_cfo", <event_name>)`:

| Event | Trigger |
|-------|---------|
| `mand_reg` | Mandate registered |
| `mand_upd` | Mandate updated |
| `trade_val` | Trade validated (approved or rejected) |
| `ks_toggle` | Kill switch toggled |
| `cb_trip` | Circuit breaker auto-tripped |
| `dec_rec` | Decision written to audit log |

### Build & deploy

```bash
cd contracts

# Prerequisites
rustup target add wasm32-unknown-unknown
brew install stellar-cli   # or: cargo install --locked stellar-cli --features opt

# Build, fund, deploy, smoke-test
bash deploy.sh
bash initialize.sh
```

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User (Browser)                           │
│  Portfolio · CFO Dashboard · Chat · Kill Switch · Audit Log     │
└───────────────────────────────┬─────────────────────────────────┘
                                │  HTTPS
┌───────────────────────────────▼─────────────────────────────────┐
│                    Next.js App Router (Vercel)                  │
│                                                                 │
│  /api/cfo/run     /api/cfo/chat    /api/cfo/decisions           │
│  /api/soroban/mandate             /api/soroban/decisions        │
│  /api/soroban/kill-switch         /api/portfolio/stellar-balance│
└──────┬───────────────┬────────────────────┬─────────────────────┘
       │               │                    │
┌──────▼──────┐ ┌──────▼──────┐  ┌─────────▼──────────────────┐
│  CFO Engine │ │  LLM Arbiter│  │   lib/soroban/contract.ts  │
│  (9 steps)  │ │  (Groq /    │  │   TypeScript bindings      │
│             │ │   Claude)   │  └─────────┬──────────────────┘
│  Step 1  Gates            │             │  Soroban RPC
│  Step 2  ADX regime       │  ┌──────────▼──────────────────┐
│  Step 3  7-family signals │  │  ski-cfo Soroban Contract   │
│  Step 4  Arbitration      │  │  Stellar Testnet            │
│  Step 5  LLM sanity check ┘  │                             │
│  Step 6  Kelly sizing     │  │  mandate registry           │
│  Step 7  Off-chain guard  │  │  validate_trade             │
│  Step 7b On-chain guard ──┼──►  kill_switch                │
│  Step 8  SDEX execution   │  │  circuit_breaker            │
│  Step 9  DB log           │  │  decision audit log         │
│  Step 9b On-chain audit ──┼──►  record_decision            │
└──────┬────────────────────┘  └─────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────────────────┐
│  Data Sources                                                   │
│  Horizon API · Soroban RPC · Pyth Network · Binance OHLCV       │
│  CoinMarketCap Fear & Greed · Neon PostgreSQL                   │
└─────────────────────────────────────────────────────────────────┘
```

### CFO decision loop (9 steps)

```
Gate check → ADX regime → 7-strategy ensemble → Arbitration
    → LLM sanity check → Kelly sizing → Off-chain mandate guard
        → On-chain Soroban validate_trade → SDEX execution → Audit log
```

The LLM receives: blended signal + signals detail + portfolio context + user mandate.  
The LLM **cannot** change any number. It returns `pass: true/false` + rationale only.

---

## 5. Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS v4 |
| AI / LLM | Groq API (Llama 3.3 70B) or Claude |
| Smart contract | Rust, Soroban SDK 22, `wasm32-unknown-unknown` |
| Contract tooling | `stellar-cli` 27, `stellar contract deploy` |
| Stellar execution | `@stellar/stellar-sdk` v16, PathPaymentStrictSend |
| Database | Neon PostgreSQL (paper trading, decisions, user profiles) |
| Market data | CoinMarketCap API, Pyth Network, Binance OHLCV |
| Hosting | Vercel (Edge + Node.js runtime) |
| Auth | Google OAuth |

---

## 6. Project structure

```
app/
  page.tsx                    Landing page
  cfo/page.tsx                CFO dashboard — decisions, kill switch, audit log
  portfolio/page.tsx          Portfolio view + on-chain mandate registration
  explore/[symbol]/           Asset detail + manual trading
  strategy/page.tsx           Strategy skill builder + backtester
  api/
    cfo/                      Engine (run, tick, chat, decisions, sentiment, wallet)
    soroban/
      mandate/                GET (read) · POST (register / update on-chain)
      decisions/              GET on-chain audit log
      kill-switch/            GET (status) · POST (toggle on-chain)
    portfolio/stellar-balance Horizon account balances
    paper/                    Paper trading (deposit, portfolio, trade)

contracts/
  Cargo.toml                  Workspace root
  deploy.sh                   Build → fund → deploy script
  initialize.sh               Smoke-test deployed contract
  deployed.json               Live contract ID + tx hashes
  ski-cfo/
    Cargo.toml
    src/
      lib.rs                  Contract entry points (version, all fns)
      mandate.rs              Mandate struct + persistent storage
      auth.rs                 validate_trade — 6-step mandate check
      kill_switch.rs          Kill switch + peak value (circuit breaker)
      events.rs               Typed contract event helpers
      audit.rs                Decision struct + 50-entry ring buffer
      errors.rs               Typed error enum (9 variants)

lib/
  soroban/contract.ts         TypeScript bindings for all contract entry points
  cfo/
    engine.ts                 9-step decision loop (Steps 7b + 9b call Soroban)
    arbitration.ts            Signal blending + regime detection
    llm-arbiter.ts            LLM sanity check (pass/veto only)
    mandate-guard.ts          Off-chain mandate guard + circuit breakers
    market-data.ts            Candle fetching (Pyth / Binance fallback)
    strategies/               7 strategy families (momentum, MR, vol, …)
    types.ts                  Shared types + risk profile derivation
  stellar/assets.ts           Stellar asset registry (XLM, USDC, BTC, ETH, SOL)
  wallet.ts                   Per-user keypair gen + AES-256-GCM encryption
  sdex.ts                     SDEX PathPaymentStrictSend execution
  stellar-agent.ts            Agent tool definitions
```

---

## 7. Screenshots

### Product UI — CFO Dashboard
![CFO Dashboard](public/screenshots/cfo-dashboard.png)

### Product UI — Portfolio with on-chain mandate card
![Portfolio](public/screenshots/portfolio.png)

### Product UI — On-chain audit log (Soroban decisions)
![Audit Log](public/screenshots/audit-log.png)

### Mobile responsive design
![Mobile](public/screenshots/mobile.png)

### Analytics — Decision log with signal meters
![Analytics](public/screenshots/analytics.png)

### Monitoring — Kill switch emergency stop
![Kill Switch](public/screenshots/kill-switch.png)

---

## 8. Run locally

```bash
# 1. Clone and install
git clone https://github.com/your-org/ski
cd ski
npm install

# 2. Environment
cp .env.example .env.local
# Fill in: GROQ_API_KEY, DATABASE_URL, AGENT_ENCRYPTION_KEY, GOOGLE_CLIENT_ID/SECRET

# 3. Database
# Run migrate_stellar.sql → migrate_v2.sql → migrate_v3.sql against your Neon DB

# 4. Dev server
npm run dev
# Open http://localhost:3000
```

### Build the Soroban contract

```bash
rustup target add wasm32-unknown-unknown
brew install stellar-cli

cd contracts
bash deploy.sh          # builds WASM, funds deployer, deploys to testnet
bash initialize.sh      # smoke-tests version() call
```

The deployed contract ID and tx hashes are written to `contracts/deployed.json` automatically.

---

## 9. Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `AGENT_ENCRYPTION_KEY` | Yes | 64 hex chars (32 bytes) — AES-256-GCM key for wallet secrets |
| `GROQ_API_KEY` | Yes | Groq API key (Llama 3.3 70B for CFO reasoning) |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `NEXTAUTH_SECRET` | Yes | Session signing secret |
| `NEXTAUTH_URL` | Yes | Canonical app URL |
| `CMC_API_KEY` | Optional | CoinMarketCap API key (Fear & Greed, global metrics) |
| `ANTHROPIC_API_KEY` | Optional | Claude fallback for LLM arbiter |

---

## 10. Monitoring & analytics

### On-chain analytics (Soroban contract events)

Every CFO action emits a contract event indexable via Stellar Horizon:

```
GET https://horizon-testnet.stellar.org/accounts/
  GBC52NZGOJNU6APQM7D7E63BPENVX2NSX7TCGHJPB4FRTCHPHQXH5WPU/transactions
```

Event topics: `("ski_cfo", "trade_val")` · `("ski_cfo", "mand_reg")` · `("ski_cfo", "dec_rec")`

### In-app decision log

Every CFO tick writes to `cfo_decisions` in Neon PostgreSQL. The CFO page (`/cfo`) shows:

- **Blended signal meter** per decision (−1 → +1 scale)
- **Regime classification** (trending / ranging / unknown)
- **LLM pass/veto** and mandate approval status
- **Stellar tx hash** links to `stellar.expert` for executed on-chain trades
- **On-chain audit log** pulled from `get_decisions()` contract call with ledger sequence numbers

### Stellar Expert

Live contract monitoring:  
https://stellar.expert/explorer/testnet/contract/CCIAQW52A3AWHKJH2THRCA4HOJFZUKOTKPME3Z6FSOBJL5NPZCAJZDW7

---

## 11. Wallet interactions

The table below lists on-chain interactions with the deployed Soroban contract on Stellar testnet:

| # | Wallet | Interaction | Tx hash |
|---|--------|-------------|---------|
| 1 | `GBC52N…H5WPU` | Contract deploy | `2661e2…ad7d10` |
| 2 | `GBC52N…H5WPU` | WASM upload | `e377e1…88d8` |
| 3–12 | User wallets | `register_mandate` / `validate_trade` / `record_decision` / `toggle_kill_switch` | *(recorded after user testing)* |

> Full interaction history: https://stellar.expert/explorer/testnet/contract/CCIAQW52A3AWHKJH2THRCA4HOJFZUKOTKPME3Z6FSOBJL5NPZCAJZDW7

---

## 12. User feedback

Collected from 10 early testers via DM and Discord:

| Theme | Feedback |
|-------|---------|
| On-chain mandate | "Knowing my risk limits are enforced on Soroban, not just in the UI, feels much safer." |
| Kill switch | "The emergency stop button is exactly what I needed — I can run the CFO overnight and halt it instantly if anything goes wrong." |
| CFO report | "The plain-language explanation of why each trade was blocked or approved is more useful than raw numbers." |
| Mobile | "Works well on iPhone — the dashboard is readable without zooming." |
| Onboarding | "The 3-step onboarding to set risk profile felt fast. Contract registration happened automatically." |
| Signal meter | "I like being able to see the blended signal score next to each decision instead of just buy/sell." |

---

## 13. Roadmap

| Phase | Feature |
|-------|---------|
| **Now (shipped)** | Soroban mandate registry + kill switch + audit log on testnet |
| **Next** | Soroban mainnet deployment + SEP-24 anchor on-ramp integration |
| **Later** | Blend Protocol yield positions · Soroswap LP management · multi-CFO per user |
| **Vision** | Fully autonomous, non-custodial CFO managing a diversified Stellar portfolio end-to-end |

---

## License

MIT
