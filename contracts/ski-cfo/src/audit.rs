use soroban_sdk::{contracttype, vec, Address, Env, Symbol, Vec};

const AUDIT_TTL_LEDGERS: u32 = 3_456_000;

/// Maximum decisions stored per user. Oldest entry is dropped when the cap is hit.
const MAX_DECISIONS: u32 = 50;

// ── Storage key ────────────────────────────────────────────────────────────────

#[contracttype]
pub enum AuditKey {
    Decisions(Address),
}

// ── Decision type ──────────────────────────────────────────────────────────────

/// One CFO decision as recorded on-chain. Immutable once written.
///
/// `blended_signal_bps` stores the float signal scaled by 10 000 to avoid
/// floating-point types (e.g. signal 0.35 → 3500, signal −0.12 → −1200).
#[contracttype]
#[derive(Clone)]
pub struct Decision {
    /// Stellar asset symbol the decision was made for ("XLM", "USDC", …).
    pub asset: Symbol,
    /// 0 = buy  |  1 = sell  |  2 = vetoed/hold
    pub direction: u32,
    /// Size proposed by the CFO engine before mandate guards.
    pub proposed_size_stroops: i128,
    /// Final clamped size after mandate guards (0 if not approved).
    pub final_size_stroops: i128,
    /// Whether the mandate guard approved execution.
    pub approved: bool,
    /// 0 = approved; otherwise the `Error` discriminant that blocked the trade.
    pub veto_code: u32,
    /// Blended multi-strategy signal × 10 000, as i32.
    pub blended_signal_bps: i32,
    /// Ledger timestamp at record time.
    pub recorded_at: u64,
    /// Ledger sequence number — allows total ordering of decisions.
    pub ledger_seq: u32,
}

// ── Storage helpers ────────────────────────────────────────────────────────────

pub fn read_decisions(env: &Env, owner: &Address) -> Vec<Decision> {
    let key = AuditKey::Decisions(owner.clone());
    env.storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| vec![env])
}

pub fn write_decisions(env: &Env, owner: &Address, decisions: &Vec<Decision>) {
    let key = AuditKey::Decisions(owner.clone());
    env.storage().persistent().set(&key, decisions);
    env.storage()
        .persistent()
        .extend_ttl(&key, AUDIT_TTL_LEDGERS, AUDIT_TTL_LEDGERS);
}

/// Append a decision, evicting the oldest entry once MAX_DECISIONS is reached.
pub fn append_decision(env: &Env, owner: &Address, decision: Decision) {
    let mut decisions = read_decisions(env, owner);

    if decisions.len() >= MAX_DECISIONS {
        // Drop the oldest (index 0) by rebuilding without it.
        let mut trimmed: Vec<Decision> = vec![env];
        for i in 1..decisions.len() {
            trimmed.push_back(decisions.get(i).unwrap());
        }
        decisions = trimmed;
    }

    decisions.push_back(decision);
    write_decisions(env, owner, &decisions);
}
