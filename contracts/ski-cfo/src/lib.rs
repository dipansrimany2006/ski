//! Ski CFO — Soroban smart contract
//!
//! On-chain mandate registry and CFO decision audit log for the Ski AI CFO platform.
//! Enforces user-defined risk limits deterministically; the LLM layer never touches
//! these numbers directly.
//!
//! Modules:
//!   mandate     — risk parameters per user (drawdown, position size, per-trade cap)
//!   auth        — scoped trade validation against the mandate
//!   kill_switch — emergency halt per user
//!   events      — contract event definitions
//!   audit       — immutable on-chain CFO decision log
//!   errors      — typed contract error enum

#![no_std]

pub mod audit;
pub mod auth;
pub mod errors;
pub mod events;
pub mod kill_switch;
pub mod mandate;

use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env, Symbol, Vec};

use audit::Decision;
use auth::TradeValidation;

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
        events::mandate_registered(&env, &m.owner, m.risk_tolerance);
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
        events::mandate_updated(&env, &m.owner, m.risk_tolerance);
        Ok(m)
    }

    /// Read the mandate for `owner`. Returns an error if none is registered.
    pub fn get_mandate(env: Env, owner: Address) -> Result<Mandate, Error> {
        read_mandate(&env, &owner).ok_or(Error::MandateNotFound)
    }

    // ── Trade validation ───────────────────────────────────────────────────────

    /// Validate a proposed trade against the caller's on-chain mandate.
    /// Does NOT require auth — read-only check that the CFO engine calls before
    /// submitting any transaction. Auth is enforced on the mandate mutations.
    ///
    /// `direction`                 : 0 = buy, 1 = sell
    /// `size_stroops`              : proposed trade size in stroops
    /// `current_position_stroops`  : caller's current holding of this asset
    /// `total_portfolio_stroops`   : caller's total portfolio value in stroops
    pub fn validate_trade(
        env: Env,
        owner: Address,
        asset: Symbol,
        direction: u32,
        size_stroops: i128,
        current_position_stroops: i128,
        total_portfolio_stroops: i128,
    ) -> TradeValidation {
        let result = auth::validate(
            &env,
            &owner,
            direction,
            size_stroops,
            current_position_stroops,
            total_portfolio_stroops,
        );
        events::trade_validated(
            &env,
            &owner,
            &asset,
            result.approved,
            result.final_size_stroops,
            result.veto_code,
        );
        result
    }

    // ── Audit log ─────────────────────────────────────────────────────────────

    /// Record a CFO decision on-chain. Called by the CFO engine after every tick,
    /// regardless of whether the trade was approved. Requires `owner` auth so only
    /// the user's own keypair (held by the CFO engine) can write to their log.
    ///
    /// `blended_signal_bps`: the float signal × 10 000 as i32 (e.g. 0.35 → 3500).
    pub fn record_decision(
        env: Env,
        owner: Address,
        asset: Symbol,
        direction: u32,
        proposed_size_stroops: i128,
        final_size_stroops: i128,
        approved: bool,
        veto_code: u32,
        blended_signal_bps: i32,
    ) {
        owner.require_auth();

        let decision = Decision {
            asset,
            direction,
            proposed_size_stroops,
            final_size_stroops,
            approved,
            veto_code,
            blended_signal_bps,
            recorded_at: env.ledger().timestamp(),
            ledger_seq: env.ledger().sequence(),
        };

        audit::append_decision(&env, &owner, decision);
        events::decision_recorded(&env, &owner, &asset, approved, blended_signal_bps);
    }

    /// Return the stored decision log for `owner` (up to the last 50 entries,
    /// oldest first). Returns an empty vec if no decisions have been recorded yet.
    pub fn get_decisions(env: Env, owner: Address) -> Vec<Decision> {
        audit::read_decisions(&env, &owner)
    }

    // ── Kill switch & circuit breaker ─────────────────────────────────────────

    /// Flip the kill switch for `owner`. When active, `validate_trade` always rejects.
    /// Returns the new state: `true` = halted, `false` = resumed.
    pub fn toggle_kill_switch(env: Env, owner: Address) -> Result<bool, Error> {
        owner.require_auth();
        let next = !kill_switch::is_active(&env, &owner);
        kill_switch::set_active(&env, &owner, next);
        events::kill_switch_toggled(&env, &owner, next);
        Ok(next)
    }

    /// Read whether the kill switch is currently active for `owner`.
    pub fn is_kill_switch_active(env: Env, owner: Address) -> bool {
        kill_switch::is_active(&env, &owner)
    }

    /// Compare `current_value_stroops` against the user's `max_drawdown_bps` mandate.
    /// Automatically trips the kill switch if the drawdown limit is breached.
    /// Pass the current total portfolio value; peak is tracked on-chain.
    /// Returns `true` if the circuit breaker just fired (or was already tripped).
    pub fn check_circuit_breaker(
        env: Env,
        owner: Address,
        current_value_stroops: i128,
    ) -> Result<bool, Error> {
        owner.require_auth();

        let mandate = read_mandate(&env, &owner).ok_or(Error::MandateNotFound)?;

        // Already halted — nothing more to do.
        if kill_switch::is_active(&env, &owner) {
            return Ok(true);
        }

        // Update peak if this is a new high.
        let stored_peak = kill_switch::read_peak_value(&env, &owner);
        let peak = if current_value_stroops > stored_peak {
            kill_switch::write_peak_value(&env, &owner, current_value_stroops);
            current_value_stroops
        } else {
            stored_peak
        };

        if peak == 0 {
            return Ok(false);
        }

        // drawdown_bps = (peak − current) / peak × 10 000
        let drawdown_bps = if current_value_stroops < peak {
            ((peak - current_value_stroops) * 10_000 / peak) as u32
        } else {
            0
        };

        if drawdown_bps >= mandate.max_drawdown_bps {
            kill_switch::set_active(&env, &owner, true);
            events::circuit_breaker_tripped(&env, &owner, drawdown_bps);
            return Ok(true);
        }

        Ok(false)
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
