// Neon PostgreSQL client.
// Single module-level instance — avoids creating a new HTTP connection on every request.

import { neon, neonConfig, NeonQueryFunction } from "@neondatabase/serverless";

// Reuse HTTP connections across queries in the same process
neonConfig.fetchConnectionCache = true;

export type DB = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]>;
  query: (query: string, values?: unknown[]) => Promise<Record<string, unknown>[]>;
};

// Singleton — created once per process, reused across all API handlers
let _db: DB | null = null;

export function getDB(): DB {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url) as NeonQueryFunction<false, false>;
  _db = sql as unknown as DB;
  return _db;
}

// Wraps a db operation with one automatic retry on transient connection errors.
// Neon free-tier computes sleep and occasionally time out on cold start.
export async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const isTransient = err instanceof Error &&
        (err.message.includes("ETIMEDOUT") ||
         err.message.includes("fetch failed") ||
         err.message.includes("ECONNRESET") ||
         err.message.includes("connecting to database"));
      if (isTransient && i < attempts - 1) {
        await new Promise(r => setTimeout(r, 800));
        continue;
      }
      throw err;
    }
  }
  throw new Error("withRetry: unreachable");
}

// ── Row types ──────────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  wallet_address: string | null;
  email: string | null;
  google_id: string | null;
  display_name: string | null;
  country: string | null;
  experience: "beginner" | "intermediate" | "advanced" | null;
  risk_tolerance: "conservative" | "balanced" | "aggressive" | null;
  goal: "preservation" | "growth" | "income" | null;
  horizon: "short" | "medium" | "long" | null;
  cfo_name: string | null;
  cfo_active: number;
  cfo_strategy: string | null;
  cfo_watchlist: string | null;
  cfo_wallet_address: string | null;
  cfo_wallet_key: string | null;
  agreed_terms_at: string | null;
  agreed_risk_at: string | null;
  is_not_us_person: number;
  created_at: string;
  updated_at: string;
}

// ── User helpers ───────────────────────────────────────────────────────────

export async function getUserById(db: DB, id: string): Promise<UserRow | null> {
  const rows = await withRetry(() => db`SELECT * FROM users WHERE id = ${id} LIMIT 1`);
  return rows.length > 0 ? (rows[0] as unknown as UserRow) : null;
}

export async function getUserByEmail(db: DB, email: string): Promise<UserRow | null> {
  const rows = await withRetry(() => db`SELECT * FROM users WHERE email = ${email} LIMIT 1`);
  return rows.length > 0 ? (rows[0] as unknown as UserRow) : null;
}

export async function getUserByGoogleId(db: DB, google_id: string): Promise<UserRow | null> {
  const rows = await withRetry(() => db`SELECT * FROM users WHERE google_id = ${google_id} LIMIT 1`);
  return rows.length > 0 ? (rows[0] as unknown as UserRow) : null;
}

export async function createGoogleUser(
  db: DB,
  id: string,
  google_id: string,
  email: string,
  display_name: string | null,
): Promise<void> {
  await withRetry(() => db`INSERT INTO users (id, google_id, email, display_name)
           VALUES (${id}, ${google_id}, ${email}, ${display_name})`);
}

export async function updateUser(
  db: DB,
  id: string,
  fields: Partial<Omit<UserRow, "id" | "wallet_address" | "created_at">>,
): Promise<void> {
  const data = { ...fields, updated_at: new Date().toISOString() };
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  const setClauses = entries.map(([k], i) => `${k} = $${i + 1}`).join(", ");
  const values = [...entries.map(([, v]) => v), id];
  await withRetry(() => db.query(`UPDATE users SET ${setClauses} WHERE id = $${values.length}`, values));
}
