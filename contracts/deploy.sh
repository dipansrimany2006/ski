#!/usr/bin/env bash
# deploy.sh — Build and deploy the ski-cfo Soroban contract to Stellar testnet.
#
# Prerequisites:
#   - Rust + wasm32-unknown-unknown target:
#       rustup target add wasm32-unknown-unknown
#   - stellar CLI ≥ 21.x:
#       cargo install --locked stellar-cli --features opt
#   - Internet access (Friendbot + Horizon testnet)
#
# Usage:
#   cd contracts && bash deploy.sh
#
# On success, writes contract-id and tx-hash to deployed.json.

set -euo pipefail

NETWORK="testnet"
NETWORK_RPC="https://soroban-testnet.stellar.org"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
DEPLOYER_ALIAS="ski-deployer"
WASM_PATH="target/wasm32-unknown-unknown/release/ski_cfo.wasm"
OUTPUT_FILE="deployed.json"

# ── Helpers ────────────────────────────────────────────────────────────────────

info()  { echo "[ski-deploy] $*"; }
error() { echo "[ski-deploy] ERROR: $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || error "'$1' not found. See prerequisites in this script."
}

# ── Pre-flight checks ──────────────────────────────────────────────────────────

require_cmd stellar
require_cmd cargo
require_cmd jq

info "stellar CLI: $(stellar --version)"
info "cargo: $(cargo --version)"

# ── Step 1: Build ─────────────────────────────────────────────────────────────

info "Building ski-cfo contract (release / wasm32-unknown-unknown)…"
cargo build \
  --target wasm32-unknown-unknown \
  --release \
  --manifest-path Cargo.toml 2>&1

[ -f "$WASM_PATH" ] || error "WASM not found at $WASM_PATH after build."
info "WASM size: $(wc -c < "$WASM_PATH") bytes"

# ── Step 2: Optimise ──────────────────────────────────────────────────────────

info "Optimising WASM with stellar contract optimize…"
stellar contract optimize --wasm "$WASM_PATH" 2>&1 || true  # non-fatal if wasm-opt absent

# ── Step 3: Configure testnet ─────────────────────────────────────────────────

info "Configuring Stellar testnet network…"
stellar network add \
  --rpc-url    "$NETWORK_RPC" \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  "$NETWORK" 2>/dev/null || true   # ignore "already exists" error

# ── Step 4: Generate or reuse deployer keypair ────────────────────────────────

if stellar keys show "$DEPLOYER_ALIAS" --network "$NETWORK" >/dev/null 2>&1; then
  info "Reusing existing deployer alias '$DEPLOYER_ALIAS'."
else
  info "Generating new deployer keypair '$DEPLOYER_ALIAS'…"
  stellar keys generate "$DEPLOYER_ALIAS" --network "$NETWORK"
fi

DEPLOYER_ADDRESS=$(stellar keys address "$DEPLOYER_ALIAS")
info "Deployer address: $DEPLOYER_ADDRESS"

# ── Step 5: Fund via Friendbot ────────────────────────────────────────────────

info "Funding deployer via Friendbot…"
curl -sf "https://friendbot.stellar.org/?addr=${DEPLOYER_ADDRESS}" | jq .id || true
# Friendbot returns 400 if already funded — that is fine, continue.
info "Friendbot request sent (ignore 400 if account already funded)."

# ── Step 6: Deploy contract ───────────────────────────────────────────────────

info "Deploying ski-cfo contract to $NETWORK…"
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$WASM_PATH" \
  --source "$DEPLOYER_ALIAS" \
  --network "$NETWORK" \
  2>&1)

# stellar contract deploy prints the contract ID on stdout.
# Strip any trailing whitespace/newlines.
CONTRACT_ID=$(echo "$CONTRACT_ID" | tr -d '[:space:]')

[[ "$CONTRACT_ID" =~ ^C[A-Z0-9]{55}$ ]] \
  || error "Unexpected contract ID format: '$CONTRACT_ID'. Check deploy output above."

info "Contract deployed: $CONTRACT_ID"

# ── Step 7: Write deployed.json ───────────────────────────────────────────────

DEPLOYED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

jq -n \
  --arg network    "$NETWORK" \
  --arg rpc        "$NETWORK_RPC" \
  --arg passphrase "$NETWORK_PASSPHRASE" \
  --arg id         "$CONTRACT_ID" \
  --arg deployer   "$DEPLOYER_ADDRESS" \
  --arg at         "$DEPLOYED_AT" \
  '{
    network:            $network,
    rpc_url:            $rpc,
    network_passphrase: $passphrase,
    contract_id:        $id,
    deployer_address:   $deployer,
    deployed_at:        $at,
    explorer:           ("https://stellar.expert/explorer/testnet/contract/" + $id)
  }' > "$OUTPUT_FILE"

info "Deployment record written to $OUTPUT_FILE"
cat "$OUTPUT_FILE"

info "Done. Contract live at:"
info "  https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}"
