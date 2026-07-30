#!/usr/bin/env bash
# initialize.sh — Smoke-test the deployed ski-cfo contract on Stellar testnet.
#
# Reads contract_id and deployer_address from deployed.json (written by deploy.sh),
# then calls version() to verify the deployment is live and callable.
#
# Usage:
#   cd contracts && bash initialize.sh

set -euo pipefail

NETWORK="testnet"
DEPLOYER_ALIAS="ski-deployer"
OUTPUT_FILE="deployed.json"

info()  { echo "[ski-init] $*"; }
error() { echo "[ski-init] ERROR: $*" >&2; exit 1; }

[ -f "$OUTPUT_FILE" ] || error "$OUTPUT_FILE not found. Run deploy.sh first."

CONTRACT_ID=$(jq -r '.contract_id' "$OUTPUT_FILE")
info "Contract ID : $CONTRACT_ID"
info "Network     : $NETWORK"
info ""

# ── Smoke test: version() ─────────────────────────────────────────────────────

info "Calling version()…"
stellar contract invoke \
  --id      "$CONTRACT_ID" \
  --source  "$DEPLOYER_ALIAS" \
  --network "$NETWORK" \
  -- version

info ""
info "Contract is live and responding."
info "Explorer: https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}"
