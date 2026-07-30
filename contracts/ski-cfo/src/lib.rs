//! Ski CFO — Soroban smart contract
//!
//! On-chain mandate registry and CFO decision audit log for the Ski AI CFO platform.
//! Enforces user-defined risk limits deterministically; the LLM layer never touches
//! these numbers directly.
//!
//! Modules (added in subsequent commits):
//!   auth        — scoped trade validation against the mandate
//!   kill_switch — emergency halt per user
//!   events      — contract event definitions
//!   audit       — immutable on-chain CFO decision log

#![no_std]

pub mod errors;
pub mod mandate;

use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env, Symbol};

use errors::Error;
use mandate::{has_mandate, read_mandate, write_mandate, Mandate};

#[contract]
pub struct SkiCfoContract;

#[contractimpl]
impl SkiCfoContract {
    /// Returns the contract version string. Used to verify deployment.
    pub fn version(_env: Env) -> Symbol {
        symbol_short!("0_1_0")
    }

    /// Register a new mandate for `owner`. Caller must be `owner` (auth enforced).
    /// Panics if a mandate already exists — use `update_mandate` to change it.
    ///
    /// `risk_tolerance`       : 0 = conservative, 1 = balanced, 2 = aggressive
    /// `max_drawdown_bps`     : max cumulative drawdown in basis points (≤ 10 000)
    /// `max_position_bps`     : max single-asset allocation in basis points (≤ 10 000)
    /// `per_trade_cap_stroops`: hard per-trade cap in stroops (1 XLM = 10_000_000)
    pub fn register_mandate(
        env: Env,
        owner: Address,
        risk_tolerance: u32,
        max_drawdown_bps: u32,
        max_position_bps: u32,
        per_trade_cap_stroops: i128,
    ) -> Result<Mandate, Error> {
        owner.require_auth();

        if has_mandate(&env, &owner) {
            return Err(Error::MandateAlreadyExists);
        }

        Self::validate_params(risk_tolerance, max_drawdown_bps, max_position_bps, per_trade_cap_stroops)?;

        let now = env.ledger().timestamp();
        let m = Mandate {
            owner,
            risk_tolerance,
            max_drawdown_bps,
            max_position_bps,
            per_trade_cap_stroops,
            registered_at: now,
            updated_at: now,
        };

        write_mandate(&env, &m);
        Ok(m)
    }

    /// Update an existing mandate. Caller must be `owner` (auth enforced).
    /// Panics if no mandate exists yet — use `register_mandate` first.
    pub fn update_mandate(
        env: Env,
        owner: Address,
        risk_tolerance: u32,
        max_drawdown_bps: u32,
        max_position_bps: u32,
        per_trade_cap_stroops: i128,
    ) -> Result<Mandate, Error> {
        owner.require_auth();

        let existing = read_mandate(&env, &owner).ok_or(Error::MandateNotFound)?;

        Self::validate_params(risk_tolerance, max_drawdown_bps, max_position_bps, per_trade_cap_stroops)?;

        let m = Mandate {
            owner,
            risk_tolerance,
            max_drawdown_bps,
            max_position_bps,
            per_trade_cap_stroops,
            registered_at: existing.registered_at,
            updated_at: env.ledger().timestamp(),
        };

        write_mandate(&env, &m);
        Ok(m)
    }

    /// Read the mandate for `owner`. Returns an error if none is registered.
    pub fn get_mandate(env: Env, owner: Address) -> Result<Mandate, Error> {
        read_mandate(&env, &owner).ok_or(Error::MandateNotFound)
    }

    // ── Internal ───────────────────────────────────────────────────────────────

    fn validate_params(
        risk_tolerance: u32,
        max_drawdown_bps: u32,
        max_position_bps: u32,
        per_trade_cap_stroops: i128,
    ) -> Result<(), Error> {
        if risk_tolerance > 2 {
            return Err(Error::InvalidRiskTolerance);
        }
        if max_drawdown_bps == 0 || max_drawdown_bps > 10_000 {
            return Err(Error::InvalidDrawdownBps);
        }
        if max_position_bps == 0 || max_position_bps > 10_000 {
            return Err(Error::InvalidPositionBps);
        }
        if per_trade_cap_stroops <= 0 {
            return Err(Error::InvalidTradeCap);
        }
        Ok(())
    }
}
