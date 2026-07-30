/// Contract event helpers.
///
/// Each function publishes one event using a two-topic scheme:
///   topic[0] = "ski_cfo"   (contract namespace)
///   topic[1] = event name  (≤ 9 chars — symbol_short! limit)
///
/// Data payloads are tuples of XDR-encodable values so off-chain indexers
/// can decode them without the contract ABI.
use soroban_sdk::{symbol_short, Address, Env, Symbol};

/// Emitted when a user successfully registers a new mandate.
pub fn mandate_registered(env: &Env, owner: &Address, risk_tolerance: u32) {
    env.events().publish(
        (symbol_short!("ski_cfo"), symbol_short!("mand_reg")),
        (owner.clone(), risk_tolerance),
    );
}

/// Emitted when a user updates an existing mandate.
pub fn mandate_updated(env: &Env, owner: &Address, risk_tolerance: u32) {
    env.events().publish(
        (symbol_short!("ski_cfo"), symbol_short!("mand_upd")),
        (owner.clone(), risk_tolerance),
    );
}

/// Emitted on every `validate_trade` call — approved or not.
/// Indexers can use this to measure CFO approval rates per user.
pub fn trade_validated(
    env: &Env,
    owner: &Address,
    asset: &Symbol,
    approved: bool,
    final_size_stroops: i128,
    veto_code: u32,
) {
    env.events().publish(
        (symbol_short!("ski_cfo"), symbol_short!("trade_val")),
        (owner.clone(), asset.clone(), approved, final_size_stroops, veto_code),
    );
}

/// Emitted when the user manually flips their kill switch.
/// `active = true` means the CFO is now halted.
pub fn kill_switch_toggled(env: &Env, owner: &Address, active: bool) {
    env.events().publish(
        (symbol_short!("ski_cfo"), symbol_short!("ks_toggle")),
        (owner.clone(), active),
    );
}

/// Emitted when `check_circuit_breaker` automatically trips the kill switch.
/// `drawdown_bps` is the drawdown level that triggered the halt.
pub fn circuit_breaker_tripped(env: &Env, owner: &Address, drawdown_bps: u32) {
    env.events().publish(
        (symbol_short!("ski_cfo"), symbol_short!("cb_trip")),
        (owner.clone(), drawdown_bps),
    );
}

/// Emitted when the CFO engine writes a decision to the audit log.
pub fn decision_recorded(
    env: &Env,
    owner: &Address,
    asset: &Symbol,
    approved: bool,
    blended_signal_bps: i32,
) {
    env.events().publish(
        (symbol_short!("ski_cfo"), symbol_short!("dec_rec")),
        (owner.clone(), asset.clone(), approved, blended_signal_bps),
    );
}
