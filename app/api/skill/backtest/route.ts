// POST /api/skill/backtest
// Run a historical backtest against a StrategySpec.
// Returns equity curve, trade log, and performance metrics.

import { NextRequest, NextResponse } from "next/server";
import { runBacktest } from "@/lib/skill/backtest";
import type { StrategySpec } from "@/lib/skill/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55; // leave 5s buffer under Vercel's 60s limit

const VALID_INTERVALS = ["1h", "4h", "1d"] as const;
// Cap lookback at 90 days — longer periods time out on serverless
const MAX_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;
// Hard timeout: resolve before Vercel kills the function
const BACKTEST_TIMEOUT_MS = 45_000;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const {
    spec,
    symbols,
    interval = "1h",
    fromMs,
    toMs,
    initialCapital = 10_000,
  } = body as {
    spec?: StrategySpec;
    symbols?: string[];
    interval?: string;
    fromMs?: number;
    toMs?: number;
    initialCapital?: number;
  };

  if (!spec || typeof spec !== "object") {
    return NextResponse.json({ error: "spec is required." }, { status: 400 });
  }

  if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
    return NextResponse.json(
      { error: "symbols must be a non-empty array, e.g. [\"BTC/USD\"]" },
      { status: 400 },
    );
  }

  if (!VALID_INTERVALS.includes(interval as typeof VALID_INTERVALS[number])) {
    return NextResponse.json(
      { error: `interval must be one of: ${VALID_INTERVALS.join(", ")}` },
      { status: 400 },
    );
  }

  const now = Date.now();
  const resolvedTo   = typeof toMs   === "number" ? Math.min(toMs, now) : now;
  const resolvedFrom = typeof fromMs === "number"
    ? Math.max(fromMs, resolvedTo - MAX_LOOKBACK_MS)
    : resolvedTo - 30 * 24 * 60 * 60 * 1000; // default: 30 days (safe for serverless)

  if (resolvedFrom >= resolvedTo) {
    return NextResponse.json({ error: "fromMs must be before toMs." }, { status: 400 });
  }

  try {
    // Race the backtest against a hard timeout so the function always responds
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), BACKTEST_TIMEOUT_MS)
    );

    const result = await Promise.race([
      runBacktest({
        spec,
        symbols: symbols.slice(0, 3), // cap at 3 symbols
        interval: interval as "1h" | "4h" | "1d",
        fromMs:   resolvedFrom,
        toMs:     resolvedTo,
        initialCapital: Math.max(100, Math.min(initialCapital, 1_000_000)),
      }),
      timeoutPromise,
    ]);

    // Thin the equity curve to at most 500 points for fast JSON transfer
    const MAX_CURVE_POINTS = 500;
    if (result.equityCurve.length > MAX_CURVE_POINTS) {
      const step = Math.ceil(result.equityCurve.length / MAX_CURVE_POINTS);
      result.equityCurve = result.equityCurve.filter((_, i) => i % step === 0);
    }

    return NextResponse.json({ result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "TIMEOUT") {
      console.error("[skill/backtest] timed out after", BACKTEST_TIMEOUT_MS, "ms");
      return NextResponse.json(
        { error: "Backtest timed out. Try a shorter period (30 days) or fewer symbols." },
        { status: 504 },
      );
    }
    console.error("[skill/backtest]", err);
    return NextResponse.json({ error: "Backtest failed." }, { status: 500 });
  }
}
