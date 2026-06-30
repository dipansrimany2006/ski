-- Migration: Stellar CFO agent columns
-- Run against existing Neon DB:
--   psql $DATABASE_URL -f migrate_stellar.sql

-- Add Stellar wallet fields to users (cfo_wallet_address/key columns may already exist;
-- values hold Stellar keypairs: G... public key and encrypted secret key)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cfo_wallet_address TEXT,
  ADD COLUMN IF NOT EXISTS cfo_wallet_key     TEXT,
  ADD COLUMN IF NOT EXISTS cfo_strategy       TEXT;

-- Add Stellar tx hash to cfo_decisions (replaces bsc_tx_hash)
ALTER TABLE cfo_decisions
  ADD COLUMN IF NOT EXISTS stellar_tx_hash TEXT;
