use soroban_sdk::{contracttype, Address, Env};

// Persistent storage entries live for ~200 days at 5 s/ledger before needing a TTL bump.
const MANDATE_TTL_LEDGERS: u32 = 3_456_000;

// ── Storage key ────────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Mandate(Address),
}

// ── Mandate type ───────────────────────────────────────────────────────────────

/// Risk parameters a user locks on-chain. The CFO engine and on-chain
/// validate_trade (commit 5) both enforce these — neither can be bypassed
/// by the LLM layer.
#[contracttype]
#[derive(Clone)]
pub struct Mandate {
    /// Owning Stellar address. Must sign any mutation.
    pub owner: Address,

    /// 0 = conservative  |  1 = balanced  |  2 = aggressive
    pub risk_tolerance: u32,

    /// Maximum cumulative drawdown from starting capital, in basis points.
    /// e.g. 500 = 5 %.
    pub max_drawdown_bps: u32,

    /// Maximum allocation to a single asset as a fraction of total portfolio,
    /// in basis points. e.g. 2000 = 20 %.
    pub max_position_bps: u32,

    /// Hard cap on a single trade, in stroops (1 XLM = 10_000_000 stroops).
    pub per_trade_cap_stroops: i128,

    /// Ledger timestamp when the mandate was first registered.
    pub registered_at: u64,

    /// Ledger timestamp of the most recent update.
    pub updated_at: u64,
}

// ── Storage helpers ────────────────────────────────────────────────────────────

pub fn write_mandate(env: &Env, mandate: &Mandate) {
    let key = DataKey::Mandate(mandate.owner.clone());
    env.storage().persistent().set(&key, mandate);
    env.storage()
        .persistent()
        .extend_ttl(&key, MANDATE_TTL_LEDGERS, MANDATE_TTL_LEDGERS);
}

pub fn read_mandate(env: &Env, owner: &Address) -> Option<Mandate> {
    let key = DataKey::Mandate(owner.clone());
    env.storage().persistent().get(&key)
}

pub fn has_mandate(env: &Env, owner: &Address) -> bool {
    let key = DataKey::Mandate(owner.clone());
    env.storage().persistent().has(&key)
}
