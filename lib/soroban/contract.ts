// TypeScript bindings for the ski-cfo Soroban contract.
//
// Wraps every contract entry point so the CFO engine never constructs raw XDR.
// Read-only calls use simulateTransaction (no fee, no signing).
// Write calls build, sign with the caller's keypair, and submit via RPC.
//
// Contract address and network config are read from contracts/deployed.json
// so this file never needs updating after a redeploy — just re-run deploy.sh.

import {
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
  rpc as SorobanRpc,
  BASE_FEE,
} from "@stellar/stellar-sdk";

import deployed from "../../contracts/deployed.json";

// ── Network config (from deployed.json) ────────────────────────────────────────

export const CONTRACT_ID   = deployed.contract_id;
export const NETWORK       = deployed.network;
export const RPC_URL       = deployed.rpc_url;
export const EXPLORER_URL  = deployed.explorer;

const NETWORK_PASSPHRASE =
  NETWORK === "testnet"
    ? Networks.TESTNET
    : Networks.PUBLIC;

const server   = new SorobanRpc.Server(RPC_URL, { allowHttp: false });
const contract = new Contract(CONTRACT_ID);

// ── Shared types ───────────────────────────────────────────────────────────────

export interface Mandate {
  owner:                string;
  risk_tolerance:       number;   // 0=conservative 1=balanced 2=aggressive
  max_drawdown_bps:     number;   // e.g. 500 = 5%
  max_position_bps:     number;   // e.g. 2000 = 20%
  per_trade_cap_stroops: bigint;  // 1 XLM = 10_000_000n stroops
  registered_at:        bigint;   // ledger timestamp
  updated_at:           bigint;
}

export interface TradeValidation {
  approved:            boolean;
  final_size_stroops:  bigint;
  veto_code:           number;   // 0 = approved; matches Error enum discriminant
}

export interface Decision {
  asset:                   string;
  direction:               number;   // 0=buy 1=sell 2=vetoed
  proposed_size_stroops:   bigint;
  final_size_stroops:      bigint;
  approved:                boolean;
  veto_code:               number;
  blended_signal_bps:      number;   // signal × 10_000 as i32
  recorded_at:             bigint;
  ledger_seq:              number;
}

export const DIRECTION_BUY  = 0;
export const DIRECTION_SELL = 1;

// Maps veto_code back to a human-readable string for the CFO report.
export const VETO_REASONS: Record<number, string> = {
  1: "mandate_not_found",
  2: "mandate_already_exists",
  3: "invalid_risk_tolerance",
  4: "invalid_drawdown_bps",
  5: "invalid_position_bps",
  6: "invalid_trade_cap",
  7: "kill_switch_active",
  8: "invalid_direction",
  9: "trade_below_minimum",
};

// ── Internal helpers ───────────────────────────────────────────────────────────

async function simulate<T>(method: string, ...args: xdr.ScVal[]): Promise<T> {
  const account = await server.getAccount(deployed.deployer_address);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const result = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(result)) {
    throw new Error(`Soroban simulate error (${method}): ${result.error}`);
  }
  const returnVal = (result as SorobanRpc.Api.SimulateTransactionSuccessResponse).result?.retval;
  if (!returnVal) throw new Error(`No return value from ${method}`);
  return scValToNative(returnVal) as T;
}

async function invoke(keypair: Keypair, method: string, ...args: xdr.ScVal[]): Promise<unknown> {
  const account = await server.getAccount(keypair.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(keypair);

  const response = await server.sendTransaction(prepared);
  if (response.status === "ERROR") {
    throw new Error(`Soroban invoke error (${method}): ${JSON.stringify(response.errorResult)}`);
  }

  // Poll until the transaction is confirmed.
  let poll = await server.getTransaction(response.hash);
  while (poll.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) {
    await new Promise(r => setTimeout(r, 1500));
    poll = await server.getTransaction(response.hash);
  }

  if (poll.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
    throw new Error(`Transaction failed (${method}): ${response.hash}`);
  }

  const retval = (poll as SorobanRpc.Api.GetSuccessfulTransactionResponse).returnValue;
  return retval ? scValToNative(retval) : undefined;
}

// ── Contract entry points ──────────────────────────────────────────────────────

/** Verify the contract is live. Returns "0_1_0" on the current deployment. */
export async function getVersion(): Promise<string> {
  return simulate<string>("version");
}

// ── Mandate ───────────────────────────────────────────────────────────────────

export async function registerMandate(
  keypair: Keypair,
  riskTolerance: number,
  maxDrawdownBps: number,
  maxPositionBps: number,
  perTradeCapStroops: bigint,
): Promise<Mandate> {
  return invoke(
    keypair,
    "register_mandate",
    nativeToScVal(keypair.publicKey(), { type: "address" }),
    nativeToScVal(riskTolerance,        { type: "u32" }),
    nativeToScVal(maxDrawdownBps,        { type: "u32" }),
    nativeToScVal(maxPositionBps,        { type: "u32" }),
    nativeToScVal(perTradeCapStroops,    { type: "i128" }),
  ) as Promise<Mandate>;
}

export async function updateMandate(
  keypair: Keypair,
  riskTolerance: number,
  maxDrawdownBps: number,
  maxPositionBps: number,
  perTradeCapStroops: bigint,
): Promise<Mandate> {
  return invoke(
    keypair,
    "update_mandate",
    nativeToScVal(keypair.publicKey(), { type: "address" }),
    nativeToScVal(riskTolerance,        { type: "u32" }),
    nativeToScVal(maxDrawdownBps,        { type: "u32" }),
    nativeToScVal(maxPositionBps,        { type: "u32" }),
    nativeToScVal(perTradeCapStroops,    { type: "i128" }),
  ) as Promise<Mandate>;
}

export async function getMandate(ownerAddress: string): Promise<Mandate | null> {
  try {
    return await simulate<Mandate>(
      "get_mandate",
      nativeToScVal(ownerAddress, { type: "address" }),
    );
  } catch {
    return null; // MandateNotFound
  }
}

// ── Trade validation (read-only — no signing needed) ──────────────────────────

export async function validateTrade(params: {
  ownerAddress:          string;
  asset:                 string;
  direction:             number;
  sizeStoops:            bigint;
  currentPositionStroops: bigint;
  totalPortfolioStroops:  bigint;
}): Promise<TradeValidation> {
  const raw = await simulate<Record<string, unknown>>(
    "validate_trade",
    nativeToScVal(params.ownerAddress,           { type: "address" }),
    nativeToScVal(params.asset,                  { type: "symbol" }),
    nativeToScVal(params.direction,              { type: "u32" }),
    nativeToScVal(params.sizeStoops,             { type: "i128" }),
    nativeToScVal(params.currentPositionStroops, { type: "i128" }),
    nativeToScVal(params.totalPortfolioStroops,  { type: "i128" }),
  );
  return raw as unknown as TradeValidation;
}

// ── Kill switch ───────────────────────────────────────────────────────────────

/** Toggle the kill switch. Returns the new state (true = halted). */
export async function toggleKillSwitch(keypair: Keypair): Promise<boolean> {
  return invoke(
    keypair,
    "toggle_kill_switch",
    nativeToScVal(keypair.publicKey(), { type: "address" }),
  ) as Promise<boolean>;
}

export async function isKillSwitchActive(ownerAddress: string): Promise<boolean> {
  return simulate<boolean>(
    "is_kill_switch_active",
    nativeToScVal(ownerAddress, { type: "address" }),
  );
}

// ── Circuit breaker ───────────────────────────────────────────────────────────

/** Check drawdown and auto-trip the kill switch if breached. Returns true if tripped. */
export async function checkCircuitBreaker(
  keypair: Keypair,
  currentValueStroops: bigint,
): Promise<boolean> {
  return invoke(
    keypair,
    "check_circuit_breaker",
    nativeToScVal(keypair.publicKey(),  { type: "address" }),
    nativeToScVal(currentValueStroops,  { type: "i128" }),
  ) as Promise<boolean>;
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export async function recordDecision(
  keypair: Keypair,
  params: {
    asset:                 string;
    direction:             number;
    proposedSizeStroops:   bigint;
    finalSizeStroops:      bigint;
    approved:              boolean;
    vetoCode:              number;
    blendedSignalBps:      number;
  },
): Promise<void> {
  await invoke(
    keypair,
    "record_decision",
    nativeToScVal(keypair.publicKey(),        { type: "address" }),
    nativeToScVal(params.asset,               { type: "symbol" }),
    nativeToScVal(params.direction,           { type: "u32" }),
    nativeToScVal(params.proposedSizeStroops, { type: "i128" }),
    nativeToScVal(params.finalSizeStroops,    { type: "i128" }),
    nativeToScVal(params.approved),
    nativeToScVal(params.vetoCode,            { type: "u32" }),
    nativeToScVal(params.blendedSignalBps,    { type: "i32" }),
  );
}

export async function getDecisions(ownerAddress: string): Promise<Decision[]> {
  const raw = await simulate<unknown[]>(
    "get_decisions",
    nativeToScVal(ownerAddress, { type: "address" }),
  );
  return (raw ?? []) as Decision[];
}

// ── Convenience: XLM ↔ stroops ────────────────────────────────────────────────

export const XLM_TO_STROOPS = BigInt(10_000_000);

export function xlmToStroops(xlm: number): bigint {
  return BigInt(Math.round(xlm * 10_000_000));
}

export function stroopsToXlm(stroops: bigint): number {
  return Number(stroops) / 10_000_000;
}

// ── Convenience: derive mandate params from CFO risk profile ──────────────────

export function mandateParamsFromRisk(riskTolerance: "conservative" | "balanced" | "aggressive") {
  const profiles = {
    conservative: { riskCode: 0, maxDrawdownBps: 500,  maxPositionBps: 500,  perTradeCapXlm: 250  },
    balanced:     { riskCode: 1, maxDrawdownBps: 2000, maxPositionBps: 2000, perTradeCapXlm: 500  },
    aggressive:   { riskCode: 2, maxDrawdownBps: 4000, maxPositionBps: 4000, perTradeCapXlm: 1000 },
  };
  const p = profiles[riskTolerance];
  return {
    riskTolerance:      p.riskCode,
    maxDrawdownBps:     p.maxDrawdownBps,
    maxPositionBps:     p.maxPositionBps,
    perTradeCapStroops: xlmToStroops(p.perTradeCapXlm),
  };
}
