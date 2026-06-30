// Stellar DEX (SDEX) path payment execution
// Uses per-user encrypted Stellar keypairs (see lib/wallet.ts).
// Submits PathPaymentStrictSend operations through Stellar Horizon.

import {
  Horizon,
  TransactionBuilder,
  Operation,
  Asset,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { getKeypair } from "./wallet";
import {
  STELLAR_HORIZON_MAINNET,
  STELLAR_NETWORK_PASSPHRASE_MAINNET,
  STELLAR_USDC_ISSUER,
} from "./stellar/assets";

export interface SwapResult {
  ok: boolean;
  txHash?: string;
  amountIn?: string;
  amountOut?: string;
  error?: string;
}

const server = new Horizon.Server(STELLAR_HORIZON_MAINNET);

function makeAsset(code: string, issuer: string | null): Asset {
  return issuer ? new Asset(code, issuer) : Asset.native();
}

function buildPathAssets(
  raw: Array<{ asset_type: string; asset_code?: string; asset_issuer?: string }>,
): Asset[] {
  return raw.map(p =>
    p.asset_type === "native" ? Asset.native() : new Asset(p.asset_code!, p.asset_issuer!),
  );
}

// Buy destAsset using XLM (native) → SDEX path payment
export async function buyWithXLM(params: {
  encryptedKey: string;
  destAssetCode: string;
  destAssetIssuer: string | null;
  xlmAmount: number;
  slippagePct?: number;
}): Promise<SwapResult> {
  const { encryptedKey, destAssetCode, destAssetIssuer, xlmAmount, slippagePct = 1 } = params;
  try {
    const keypair    = getKeypair(encryptedKey);
    const account    = await server.loadAccount(keypair.publicKey());
    const sendAsset  = Asset.native();
    const destAsset  = makeAsset(destAssetCode, destAssetIssuer);
    const sendAmount = xlmAmount.toFixed(7);

    const paths = await server.strictSendPaths(sendAsset, sendAmount, [destAsset]).call();
    if (!paths.records.length) return { ok: false, error: "No SDEX path found for this swap" };

    const best        = paths.records[0];
    const expectedOut = parseFloat(best.destination_amount);
    const minDest     = (expectedOut * (1 - slippagePct / 100)).toFixed(7);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: STELLAR_NETWORK_PASSPHRASE_MAINNET,
    })
      .addOperation(
        Operation.pathPaymentStrictSend({
          sendAsset,
          sendAmount,
          destination: keypair.publicKey(),
          destAsset,
          destMin: minDest,
          path: buildPathAssets(best.path ?? []),
        }),
      )
      .setTimeout(300)
      .build();

    tx.sign(keypair);
    const result = await server.submitTransaction(tx);

    return { ok: true, txHash: result.hash, amountIn: sendAmount, amountOut: expectedOut.toFixed(7) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// Sell srcAsset back to USDC via SDEX path payment
export async function sellToUSDC(params: {
  encryptedKey: string;
  srcAssetCode: string;
  srcAssetIssuer: string | null;
  srcAmount: number;
  slippagePct?: number;
}): Promise<SwapResult> {
  const { encryptedKey, srcAssetCode, srcAssetIssuer, srcAmount, slippagePct = 1 } = params;
  try {
    const keypair    = getKeypair(encryptedKey);
    const account    = await server.loadAccount(keypair.publicKey());
    const sendAsset  = makeAsset(srcAssetCode, srcAssetIssuer);
    const destAsset  = new Asset("USDC", STELLAR_USDC_ISSUER);
    const sendAmount = srcAmount.toFixed(7);

    const paths = await server.strictSendPaths(sendAsset, sendAmount, [destAsset]).call();
    if (!paths.records.length) return { ok: false, error: "No SDEX path found for this swap" };

    const best        = paths.records[0];
    const expectedOut = parseFloat(best.destination_amount);
    const minDest     = (expectedOut * (1 - slippagePct / 100)).toFixed(7);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: STELLAR_NETWORK_PASSPHRASE_MAINNET,
    })
      .addOperation(
        Operation.pathPaymentStrictSend({
          sendAsset,
          sendAmount,
          destination: keypair.publicKey(),
          destAsset,
          destMin: minDest,
          path: buildPathAssets(best.path ?? []),
        }),
      )
      .setTimeout(300)
      .build();

    tx.sign(keypair);
    const result = await server.submitTransaction(tx);

    return { ok: true, txHash: result.hash, amountIn: sendAmount, amountOut: expectedOut.toFixed(7) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
