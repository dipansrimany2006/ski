use soroban_sdk::{contracttype, Address, Env};

use crate::errors::Error;
use crate::kill_switch;
use crate::mandate::read_mandate;

pub const DIRECTION_BUY: u32  = 0;
pub const DIRECTION_SELL: u32 = 1;

/// Minimum trade size enforced on-chain: 0.1 XLM in stroops.
const MIN_TRADE_STROOPS: i128 = 1_000_000;

// ── Return type ────────────────────────────────────────────────────────────────

/// Result of an on-chain mandate validation.
/// When `approved` is false, `final_size_stroops` is 0 and `veto_code` is the
/// corresponding `Error` discriminant so the TypeScript layer can decode it.
#[contracttype]
#[derive(Clone)]
pub struct TradeValidation {
    pub approved: bool,
    /// Clamped trade size after all mandate guards have been applied.
    pub final_size_stroops: i128,
    /// 0 = approved. Otherwise equals the `Error` repr value that blocked the trade.
    pub veto_code: u32,
}

// ── Core validation logic ──────────────────────────────────────────────────────

/// Validate a proposed trade against the user's on-chain mandate.
///
/// Steps (mirrors `lib/cfo/mandate-guard.ts`):
///   1. Kill switch — reject immediately if halted.
///   2. Mandate exists — reject if the user has not registered one.
///   3. Direction — must be DIRECTION_BUY (0) or DIRECTION_SELL (1).
///   4. Per-trade cap — clamp `size_stroops` to `mandate.per_trade_cap_stroops`.
///   5. Max-position guard (buy only) — clamp so new position stays within
///      `max_position_bps` of `total_portfolio_stroops`.
///   6. Minimum size — reject if the clamped size is below MIN_TRADE_STROOPS.
pub fn validate(
    env: &Env,
    owner: &Address,
    direction: u32,
    mut size_stroops: i128,
    current_position_stroops: i128,
    total_portfolio_stroops: i128,
) -> TradeValidation {
    let reject = |code: Error| TradeValidation {
        approved: false,
        final_size_stroops: 0,
        veto_code: code as u32,
    };

    // 1. Kill switch
    if kill_switch::is_active(env, owner) {
        return reject(Error::KillSwitchActive);
    }

    // 2. Mandate must exist
    let mandate = match read_mandate(env, owner) {
        Some(m) => m,
        None    => return reject(Error::MandateNotFound),
    };

    // 3. Direction check
    if direction != DIRECTION_BUY && direction != DIRECTION_SELL {
        return reject(Error::InvalidDirection);
    }

    // 4. Clamp to per-trade cap
    if size_stroops > mandate.per_trade_cap_stroops {
        size_stroops = mandate.per_trade_cap_stroops;
    }

    // 5. Max-position guard (buy only)
    if direction == DIRECTION_BUY && total_portfolio_stroops > 0 {
        let max_position = total_portfolio_stroops
            * mandate.max_position_bps as i128
            / 10_000;
        let projected = current_position_stroops + size_stroops;
        if projected > max_position {
            size_stroops = (max_position - current_position_stroops).max(0);
        }
    }

    // 6. Minimum size
    if size_stroops < MIN_TRADE_STROOPS {
        return reject(Error::TradeBelowMinimum);
    }

    TradeValidation {
        approved: true,
        final_size_stroops: size_stroops,
        veto_code: 0,
    }
}
