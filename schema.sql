-- Ski platform D1 schema
-- Run: npm run db:migrate (remote) or npm run db:migrate:local (local wrangler)

-- Users: one row per wallet address that has completed sign-up.
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,                 -- uuid v4
  wallet_address TEXT NOT NULL UNIQUE,             -- inj1... mainnet address
  display_name   TEXT,
  country        TEXT,
  experience     TEXT CHECK(experience IN ('beginner','intermediate','advanced')),
  -- CFO persona (moved from localStorage)
  risk_tolerance TEXT CHECK(risk_tolerance IN ('conservative','balanced','aggressive')),
  goal           TEXT CHECK(goal IN ('preservation','growth','income')),
  horizon        TEXT CHECK(horizon IN ('short','medium','long')),
  cfo_name       TEXT DEFAULT 'Ski',
  -- Onboarding compliance
  agreed_terms_at     TEXT,   -- ISO datetime when user accepted terms
  agreed_risk_at      TEXT,   -- ISO datetime when user accepted risk disclosure
  is_not_us_person    INTEGER NOT NULL DEFAULT 0,  -- 1 = confirmed not a US person
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Short-lived nonces for the wallet-signature challenge.
-- Each login attempt gets one; they expire after 5 minutes.
CREATE TABLE IF NOT EXISTS auth_challenges (
  nonce          TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  expires_at     TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Active sessions. Token hash stored (never the raw JWT).
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Agents — one per row, many per user.
-- The mnemonic is stored AES-256-GCM encrypted; only the server can decrypt it.
CREATE TABLE IF NOT EXISTS agents (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL DEFAULT 'My Agent',
  agent_address       TEXT NOT NULL,          -- inj1... testnet address
  encrypted_mnemonic  TEXT NOT NULL,          -- base64(iv + ciphertext)
  network             TEXT NOT NULL DEFAULT 'testnet',
  status              TEXT NOT NULL DEFAULT 'inactive'
                        CHECK(status IN ('inactive','active','paused')),
  principal_inj       REAL NOT NULL DEFAULT 0,
  -- Strategy configuration set at creation time
  risk_tolerance      TEXT NOT NULL DEFAULT 'balanced'
                        CHECK(risk_tolerance IN ('conservative','balanced','aggressive')),
  goal                TEXT NOT NULL DEFAULT 'growth'
                        CHECK(goal IN ('preservation','growth','income')),
  horizon             TEXT NOT NULL DEFAULT 'medium'
                        CHECK(horizon IN ('short','medium','long')),
  strategies          TEXT NOT NULL DEFAULT '["RSI","Momentum","Rebalance"]', -- JSON array
  target_tokens       TEXT NOT NULL DEFAULT '["INJ","ATOM","WETH"]',          -- JSON array
  auto_trade          INTEGER NOT NULL DEFAULT 0,   -- 1 = autonomous trading enabled
  last_run_at         TEXT,                         -- ISO timestamp of last strategy run
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tracks every time the user deposits principal into the agent wallet.
-- Used to compute P&L: current_balance - total_deposited.
CREATE TABLE IF NOT EXISTS agent_deposits (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_inj REAL NOT NULL,        -- human-readable INJ (not base units)
  tx_hash    TEXT,                 -- on-chain tx hash (nullable if manually recorded)
  deposited_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deposits_agent ON agent_deposits(agent_id);

-- Audit log of every on-chain action the agent takes.
CREATE TABLE IF NOT EXISTS agent_runs (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,        -- deposit | withdraw | send | rebalance | hold
  amount     REAL,
  denom      TEXT,
  tx_hash    TEXT,
  success    INTEGER NOT NULL DEFAULT 0,
  error      TEXT,
  reason     TEXT,                 -- AI reasoning for this action
  ran_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indices for hot read paths
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_agents_user    ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_runs_agent     ON agent_runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_challenges_exp ON auth_challenges(expires_at);

-- Migration v2: strategy config columns (run if upgrading from v1 schema)
-- npx wrangler d1 execute ski --local --file=migrate_v2.sql
-- npx wrangler d1 execute ski --remote --file=migrate_v2.sql
