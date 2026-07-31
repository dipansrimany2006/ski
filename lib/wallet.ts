// Per-user Stellar agent wallet — generation, encryption, and signing
// Each user gets their own isolated Stellar keypair. Secret key is encrypted
// with AES-256-GCM using the server-side AGENT_ENCRYPTION_KEY.

import { Keypair, Horizon } from "@stellar/stellar-sdk";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { STELLAR_HORIZON_TESTNET } from "./stellar/assets";

// ── Encryption helpers ─────────────────────────────────────────────────────────

function getEncKey(): Buffer {
  const hex = process.env.AGENT_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error("AGENT_ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
  return Buffer.from(hex, "hex");
}

export function encryptSecretKey(secretKey: string): string {
  const key = getEncKey();
  const iv  = randomBytes(12); // 96-bit nonce for AES-256-GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(secretKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag(); // 128-bit auth tag
  // Layout: 12-byte IV | 16-byte tag | ciphertext
  return Buffer.concat([iv, tag, enc]).toString("hex");
}

export function decryptSecretKey(cipherHex: string): string {
  const key  = getEncKey();
  const data = Buffer.from(cipherHex, "hex");
  const iv   = data.subarray(0, 12);
  const tag  = data.subarray(12, 28);
  const enc  = data.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// ── Wallet generation ──────────────────────────────────────────────────────────

export interface AgentWallet {
  address: string;      // Stellar public key (G... 56-char base32)
  encryptedKey: string; // AES-256-GCM encrypted secret key — store in DB, never the raw key
}

export function generateAgentWallet(): AgentWallet {
  const keypair   = Keypair.random();
  const address   = keypair.publicKey();
  const secretKey = keypair.secret();
  return {
    address,
    encryptedKey: encryptSecretKey(secretKey),
  };
}

// ── Keypair from encrypted key ────────────────────────────────────────────────

export function getKeypair(encryptedKey: string): Keypair {
  const secretKey = decryptSecretKey(encryptedKey);
  return Keypair.fromSecret(secretKey);
}

// ── XLM balance via Horizon ───────────────────────────────────────────────────

export async function getWalletXLMBalance(encryptedKey: string): Promise<number> {
  try {
    const keypair = getKeypair(encryptedKey);
    const server  = new Horizon.Server(STELLAR_HORIZON_TESTNET);
    const account = await server.loadAccount(keypair.publicKey());
    const xlm     = account.balances.find(b => b.asset_type === "native");
    return xlm ? parseFloat(xlm.balance) : 0;
  } catch {
    return 0;
  }
}
