-- Ski platform PostgreSQL schema (Neon DB)
-- Run: psql $DATABASE_URL -f schema.pg.sql

CREATE TABLE IF NOT EXISTS users (
  id                  TEXT PRIMARY KEY,
  wallet_address      TEXT UNIQUE,
  email               TEXT UNIQUE,
  google_id           TEXT UNIQUE,
  display_name        TEXT,
  country             TEXT,
  experience          TEXT CHECK(experience IN ('beginner','intermediate','advanced')),
  risk_tolerance      TEXT CHECK(risk_tolerance IN ('conservative','balanced','aggressive')),
  goal                TEXT CHECK(goal IN ('preservation','growth','income')),
  horizon             TEXT CHECK(horizon IN ('short','medium','long')),
  cfo_name            TEXT DEFAULT 'Ski',
  cfo_active          INTEGER NOT NULL DEFAULT 0,
  cfo_watchlist       TEXT,
  agreed_terms_at     TEXT,
  agreed_risk_at      TEXT,
  is_not_us_person    INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
  updated_at          TEXT NOT NULL DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);

CREATE TABLE IF NOT EXISTS auth_challenges (
  nonce          TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  expires_at     TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);

CREATE TABLE IF NOT EXISTS agents (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL DEFAULT 'My Agent',
  agent_address       TEXT NOT NULL,
  encrypted_mnemonic  TEXT NOT NULL,
  network             TEXT NOT NULL DEFAULT 'testnet',
  status              TEXT NOT NULL DEFAULT 'inactive'
                        CHECK(status IN ('inactive','active','paused')),
  principal_inj       FLOAT NOT NULL DEFAULT 0,
  risk_tolerance      TEXT NOT NULL DEFAULT 'balanced'
                        CHECK(risk_tolerance IN ('conservative','balanced','aggressive')),
  goal                TEXT NOT NULL DEFAULT 'growth'
                        CHECK(goal IN ('preservation','growth','income')),
  horizon             TEXT NOT NULL DEFAULT 'medium'
                        CHECK(horizon IN ('short','medium','long')),
  strategies          TEXT NOT NULL DEFAULT '["RSI","Momentum","Rebalance"]',
  target_tokens       TEXT NOT NULL DEFAULT '["INJ","ATOM","WETH"]',
  auto_trade          INTEGER NOT NULL DEFAULT 0,
  last_run_at         TEXT,
  created_at          TEXT NOT NULL DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
  updated_at          TEXT NOT NULL DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);

CREATE TABLE IF NOT EXISTS agent_deposits (
  id           TEXT PRIMARY KEY,
  agent_id     TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_inj   FLOAT NOT NULL,
  tx_hash      TEXT,
  deposited_at TEXT NOT NULL DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,
  amount     FLOAT,
  denom      TEXT,
  tx_hash    TEXT,
  success    INTEGER NOT NULL DEFAULT 0,
  error      TEXT,
  reason     TEXT,
  ran_at     TEXT NOT NULL DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);

-- Paper trading
CREATE TABLE IF NOT EXISTS paper_accounts (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance    NUMERIC(20,8) NOT NULL DEFAULT 10000,
  created_at TEXT NOT NULL DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);

CREATE TABLE IF NOT EXISTS paper_positions (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id       TEXT NOT NULL,
  symbol         TEXT NOT NULL,
  display_symbol TEXT NOT NULL,
  name           TEXT NOT NULL,
  category       TEXT NOT NULL,
  quantity       NUMERIC(30,10) NOT NULL DEFAULT 0,
  avg_buy_price  NUMERIC(20,8)  NOT NULL DEFAULT 0,
  stop_loss      NUMERIC(20,8),
  take_profit    NUMERIC(20,8),
  created_at     TEXT NOT NULL DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
  updated_at     TEXT NOT NULL DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
  UNIQUE(user_id, asset_id)
);

CREATE TABLE IF NOT EXISTS paper_trades (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id       TEXT NOT NULL,
  symbol         TEXT NOT NULL,
  display_symbol TEXT NOT NULL,
  name           TEXT NOT NULL,
  trade_type     TEXT NOT NULL CHECK(trade_type IN ('buy','sell')),
  quantity       NUMERIC(30,10) NOT NULL,
  price          NUMERIC(20,8)  NOT NULL,
  total          NUMERIC(20,8)  NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);

-- CFO decision audit trail
CREATE TABLE IF NOT EXISTS cfo_decisions (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id            TEXT NOT NULL,
  symbol              TEXT NOT NULL,
  display_symbol      TEXT NOT NULL,
  action              TEXT NOT NULL CHECK(action IN ('buy','sell','hold')),
  blended_signal      NUMERIC(10,6) NOT NULL DEFAULT 0,
  llm_rationale       TEXT,
  llm_passed          BOOLEAN NOT NULL DEFAULT TRUE,
  mandate_approved    BOOLEAN NOT NULL DEFAULT FALSE,
  mandate_veto_reason TEXT,
  final_size_usd      NUMERIC(20,8) NOT NULL DEFAULT 0,
  price_at_decision   NUMERIC(20,8) NOT NULL DEFAULT 0,
  regime              TEXT,
  trade_id            TEXT REFERENCES paper_trades(id) ON DELETE SET NULL,
  stellar_tx_hash     TEXT,
  created_at          TEXT NOT NULL DEFAULT (to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_token   ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_agents_user      ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_runs_agent       ON agent_runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_deposits_agent   ON agent_deposits(agent_id);
CREATE INDEX IF NOT EXISTS idx_challenges_exp   ON auth_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_cfo_decisions_user ON cfo_decisions(user_id, created_at DESC);
