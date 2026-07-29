//! Ski CFO — Soroban smart contract
//!
//! On-chain mandate registry and CFO decision audit log for the Ski AI CFO platform.
//! Enforces user-defined risk limits deterministically; the LLM layer never touches
//! these numbers directly.
//!
//! Modules (added in subsequent commits):
//!   mandate     — risk parameters per user (drawdown, position size, per-trade cap)
//!   auth        — scoped trade validation against the mandate
//!   kill_switch — emergency halt per user
//!   events      — contract event definitions
//!   audit       — immutable on-chain CFO decision log

#![no_std]

pub mod mandate;

use soroban_sdk::{contract, contractimpl, symbol_short, Env, Symbol};

#[contract]
pub struct SkiCfoContract;

#[contractimpl]
impl SkiCfoContract {
    /// Returns the contract version string. Used to verify deployment.
    pub fn version(_env: Env) -> Symbol {
        symbol_short!("0_1_0")
    }
}
