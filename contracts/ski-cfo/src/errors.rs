use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    MandateNotFound       = 1,
    MandateAlreadyExists  = 2,
    InvalidRiskTolerance  = 3,
    InvalidDrawdownBps    = 4,
    InvalidPositionBps    = 5,
    InvalidTradeCap       = 6,
    KillSwitchActive      = 7,
}
