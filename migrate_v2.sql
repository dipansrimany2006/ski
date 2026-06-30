-- Migration v2: add strategy config to agents, add reason to agent_runs
ALTER TABLE agents ADD COLUMN risk_tolerance TEXT NOT NULL DEFAULT 'balanced';
ALTER TABLE agents ADD COLUMN goal TEXT NOT NULL DEFAULT 'growth';
ALTER TABLE agents ADD COLUMN horizon TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE agents ADD COLUMN strategies TEXT NOT NULL DEFAULT '["RSI","Momentum","Rebalance"]';
ALTER TABLE agents ADD COLUMN target_tokens TEXT NOT NULL DEFAULT '["INJ","ATOM","WETH"]';
ALTER TABLE agents ADD COLUMN auto_trade INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN last_run_at TEXT;
ALTER TABLE agent_runs ADD COLUMN reason TEXT;
