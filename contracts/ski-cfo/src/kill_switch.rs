use soroban_sdk::{contracttype, Address, Env};

const KS_TTL_LEDGERS: u32 = 3_456_000;

// ── Storage keys ───────────────────────────────────────────────────────────────

#[contracttype]
pub enum KsKey {
    /// Bool: whether the user has halted the CFO.
    KillSwitch(Address),
    /// i128: highest recorded portfolio value in stroops — used by circuit breaker.
    PeakValue(Address),
}

// ── Kill switch ────────────────────────────────────────────────────────────────

pub fn is_active(env: &Env, owner: &Address) -> bool {
    env.storage()
        .persistent()
        .get(&KsKey::KillSwitch(owner.clone()))
        .unwrap_or(false)
}

pub fn set_active(env: &Env, owner: &Address, active: bool) {
    let key = KsKey::KillSwitch(owner.clone());
    env.storage().persistent().set(&key, &active);
    env.storage()
        .persistent()
        .extend_ttl(&key, KS_TTL_LEDGERS, KS_TTL_LEDGERS);
}

// ── Peak value (circuit breaker baseline) ─────────────────────────────────────

pub fn read_peak_value(env: &Env, owner: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&KsKey::PeakValue(owner.clone()))
        .unwrap_or(0)
}

pub fn write_peak_value(env: &Env, owner: &Address, value: i128) {
    let key = KsKey::PeakValue(owner.clone());
    env.storage().persistent().set(&key, &value);
    env.storage()
        .persistent()
        .extend_ttl(&key, KS_TTL_LEDGERS, KS_TTL_LEDGERS);
}
