-- Migration v3: CFO associated wallet
ALTER TABLE users ADD COLUMN IF NOT EXISTS cfo_wallet_address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cfo_wallet_key      TEXT;
