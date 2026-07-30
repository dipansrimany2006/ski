"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { AppNav } from "@/components/app-nav";
import { CFOChat } from "@/components/cfo-chat";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserProfile {
  display_name: string | null;
  cfo_name: string | null;
  risk_tolerance: string | null;
  goal: string | null;
  horizon: string | null;
  cfo_active: number;
  cfo_watchlist: string | null;
  cfo_wallet_address: string | null;
  cfo_strategy: string | null;
}

interface MarketSentiment {
  fearGreed: number | null;
  fearGreedLabel: string | null;
  btcDominance: number | null;
}

const RISK_OPTIONS = [
  {
    value: "conservative",
    label: "Conservative",
    icon: "🛡",
    desc: "Lower risk, smaller positions",
    details: ["$250 / trade", "5% max drawdown", "5% max position"],
    accent: "#38bdf8",
  },
  {
    value: "balanced",
    label: "Balanced",
    icon: "⚖️",
    desc: "Moderate risk and reward",
    details: ["$500 / trade", "20% max drawdown", "20% max position"],
    accent: "#818cf8",
  },
  {
    value: "aggressive",
    label: "Aggressive",
    icon: "🔥",
    desc: "Higher risk, larger positions",
    details: ["$1,000 / trade", "40% max drawdown", "40% max position"],
    accent: "#f87171",
  },
] as const;

const GOAL_OPTIONS    = [
  { value: "preservation", label: "Preservation" },
  { value: "growth",       label: "Growth" },
  { value: "income",       label: "Income" },
] as const;

const HORIZON_OPTIONS = [
  { value: "short",  label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long",   label: "Long" },
] as const;

const DEFAULT_WATCHLIST = ["XLM/USD", "BTC/USD", "ETH/USD", "SOL/USD", "USDC/USD"];

interface Decision {
  id: string;
  display_symbol: string;
  symbol: string;
  action: "buy" | "sell" | "hold";
  blended_signal: number;
  llm_rationale: string;
  llm_passed: boolean;
  mandate_approved: boolean;
  mandate_veto_reason: string | null;
  final_size_usd: number;
  price_at_decision: number;
  regime: string;
  trade_id: string | null;
  stellar_tx_hash: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    maximumFractionDigits: n >= 1 ? 2 : 4,
  }).format(n);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function SignalMeter({ v }: { v: number }) {
  const pct   = Math.round(((v + 1) / 2) * 100);
  const color = v > 0.08 ? "#10b981" : v < -0.08 ? "#f43f5e" : "#ffffff30";
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-16 rounded-full bg-white/8 overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[11px] font-mono tabular-nums" style={{ color }}>
        {v > 0 ? "+" : ""}{v.toFixed(3)}
      </span>
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function ToggleSwitch({ on, loading, onToggle }: { on: boolean; loading: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      disabled={loading}
      aria-label={on ? "Deactivate CFO" : "Activate CFO"}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
        on ? "border-emerald-500 bg-emerald-500" : "border-white/20 bg-white/10"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 mt-[1px] ${
          on ? "translate-x-5" : "translate-x-0.5"
        } ${loading ? "animate-pulse" : ""}`}
      />
    </button>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-5 py-4">
      <p className="text-xs text-white/35 uppercase tracking-widest mb-2">{label}</p>
      <p className="text-3xl font-bold tabular-nums" style={accent ? { color: accent } : undefined}>{value}</p>
      {sub && <p className="text-xs text-white/30 mt-1">{sub}</p>}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function CFOPage() {
  const [user,          setUser]          = useState<UserProfile | null>(null);
  const [decisions,     setDecisions]     = useState<Decision[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [authed,        setAuthed]        = useState(true);
  const [running,       setRunning]       = useState(false);
  const [toggling,      setToggling]      = useState(false);
  const [runMsg,        setRunMsg]        = useState<{ type: "ok"|"warn"|"error"; text: string } | null>(null);

  const [watchlist,     setWatchlist]     = useState<string[]>(DEFAULT_WATCHLIST);
  const [watchlistEdit, setWatchlistEdit] = useState(false);
  const [watchInput,    setWatchInput]    = useState("");
  const [savingWatch,   setSavingWatch]   = useState(false);

  const [riskEdit,      setRiskEdit]      = useState(false);
  const [riskDraft,     setRiskDraft]     = useState("balanced");
  const [goalDraft,     setGoalDraft]     = useState("growth");
  const [horizonDraft,  setHorizonDraft]  = useState("medium");
  const [savingRisk,    setSavingRisk]    = useState(false);

  const [strategyEdit,  setStrategyEdit]  = useState(false);
  const [strategyDraft, setStrategyDraft] = useState("");
  const [savingStrategy,setSavingStrategy]= useState(false);

  const [sentiment,     setSentiment]     = useState<MarketSentiment | null>(null);

  // On-chain audit log (Soroban)
  interface OnChainDecision {
    asset: string;
    directionLabel: string;
    finalSizeXlm: number;
    approved: boolean;
    vetoReason: string | null;
    blendedSignal: number;
    recordedAt: number;
    ledgerSeq: number;
  }
  const [onChainDecisions,  setOnChainDecisions]  = useState<OnChainDecision[]>([]);
  const [onChainLoading,    setOnChainLoading]    = useState(false);
  const [onChainContractId, setOnChainContractId] = useState("");

  async function loadOnChainDecisions() {
    setOnChainLoading(true);
    try {
      const res  = await fetch("/api/soroban/decisions");
      if (!res.ok) return;
      const data = await res.json() as { decisions: OnChainDecision[]; contractId: string };
      setOnChainDecisions(data.decisions);
      setOnChainContractId(data.contractId ?? "");
    } catch { /* non-fatal */ }
    finally { setOnChainLoading(false); }
  }

  const loadData = useCallback(async () => {
    const [userRes, decisionsRes, sentimentRes] = await Promise.all([
      fetch("/api/user"),
      fetch("/api/cfo/decisions?limit=20"),
      fetch("/api/cfo/sentiment").catch(() => null),
    ]);
    if (userRes.status === 401) { setAuthed(false); return; }
    if (userRes.ok) {
      const d = await userRes.json() as { user: UserProfile };
      setUser(d.user);
      if (d.user.cfo_watchlist) {
        try { setWatchlist(JSON.parse(d.user.cfo_watchlist) as string[]); } catch { /* keep default */ }
      }
      if (d.user.risk_tolerance) setRiskDraft(d.user.risk_tolerance);
      if (d.user.goal)           setGoalDraft(d.user.goal);
      if (d.user.horizon)        setHorizonDraft(d.user.horizon);
      if (d.user.cfo_strategy)   setStrategyDraft(d.user.cfo_strategy);
    }
    if (decisionsRes.ok) {
      const d = await decisionsRes.json() as { decisions: Decision[] };
      setDecisions(d.decisions);
    }
    if (sentimentRes?.ok) {
      const d = await sentimentRes.json() as { fearGreed: number; fearGreedLabel: string; btcDominance: number };
      setSentiment({ fearGreed: d.fearGreed, fearGreedLabel: d.fearGreedLabel, btcDominance: d.btcDominance });
    }
  }, []);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
    loadOnChainDecisions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadData]);

  // Auto-dismiss run message
  useEffect(() => {
    if (!runMsg) return;
    const t = setTimeout(() => setRunMsg(null), 6000);
    return () => clearTimeout(t);
  }, [runMsg]);

  async function toggleCFO() {
    if (!user) return;
    setToggling(true);
    try {
      const r = await fetch("/api/user", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cfo_active: user.cfo_active ? 0 : 1 }),
      });
      if (r.ok) setUser((await r.json() as { user: UserProfile }).user);
    } finally { setToggling(false); }
  }

  async function runNow() {
    setRunning(true);
    setRunMsg(null);
    try {
      const r = await fetch("/api/cfo/run", { method: "POST" });
      const d = await r.json() as {
        analyzed?: number; buyCount?: number; sellCount?: number;
        holdCount?: number; execCount?: number;
        error?: string; warning?: string; circuitBreakerTripped?: boolean;
      };
      if (d.error) {
        setRunMsg({ type: "error", text: d.error });
      } else if (d.circuitBreakerTripped) {
        setRunMsg({ type: "warn", text: `Circuit breaker tripped — CFO halted. ${d.warning ?? ""}` });
        await loadData();
      } else {
        const analyzed = d.analyzed ?? 0;
        const buys = d.buyCount ?? 0, sells = d.sellCount ?? 0, execs = d.execCount ?? 0, holds = d.holdCount ?? 0;
        let text = `Analyzed ${analyzed} symbol${analyzed !== 1 ? "s" : ""}`;
        if (buys + sells > 0) text += ` · ${buys} buy${buys !== 1 ? "s" : ""}, ${sells} sell${sells !== 1 ? "s" : ""}${execs > 0 ? ` · ${execs} executed` : ""}`;
        else text += ` · ${holds} hold${holds !== 1 ? "s" : ""} — signal below threshold`;
        setRunMsg({ type: "ok", text });
        await loadData();
      }
    } catch { setRunMsg({ type: "error", text: "Run failed — check console" }); }
    finally { setRunning(false); }
  }

  async function saveWatchlist() {
    setSavingWatch(true);
    try {
      const r = await fetch("/api/user", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cfo_watchlist: JSON.stringify(watchlist) }),
      });
      if (r.ok) setWatchlistEdit(false);
    } finally { setSavingWatch(false); }
  }

  async function saveRiskProfile() {
    setSavingRisk(true);
    try {
      const r = await fetch("/api/user", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ risk_tolerance: riskDraft, goal: goalDraft, horizon: horizonDraft }),
      });
      if (r.ok) { setUser((await r.json() as { user: UserProfile }).user); setRiskEdit(false); }
    } finally { setSavingRisk(false); }
  }

  function addToken() {
    const t = watchInput.trim().toUpperCase();
    const sym = t.includes("/") ? t : `${t}/USD`;
    if (sym && !watchlist.includes(sym)) setWatchlist(w => [...w, sym]);
    setWatchInput("");
  }

  async function saveStrategy() {
    setSavingStrategy(true);
    try {
      await fetch("/api/user", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cfo_strategy: strategyDraft }),
      });
      setStrategyEdit(false);
    } finally { setSavingStrategy(false); }
  }

  // ── Unauthenticated ───────────────────────────────────────────────────────

  if (!authed) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <AppNav active="CFO" />
        <main className="mx-auto max-w-4xl px-6 py-32 text-center">
          <p className="text-white/40 mb-6">Sign in to manage your CFO agent</p>
          <Link href="/login" className="rounded-2xl bg-white text-black px-8 py-3 text-sm font-semibold">Sign In</Link>
        </main>
      </div>
    );
  }

  const cfoName  = user?.cfo_name ?? "Ski";
  const isActive = (user?.cfo_active ?? 0) === 1;
  const buyCount  = decisions.filter(d => d.action === "buy").length;
  const sellCount = decisions.filter(d => d.action === "sell").length;
  const execCount = decisions.filter(d => d.trade_id).length;
  const currentRisk = RISK_OPTIONS.find(o => o.value === (user?.risk_tolerance ?? "balanced")) ?? RISK_OPTIONS[1];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav active="CFO" />

      <main className="mx-auto max-w-6xl px-8 py-10 space-y-6">

        {loading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/5" />)}
          </div>
        ) : (
          <>

            {/* ── Agent hero card ───────────────────────────────────────── */}
            <div className={`relative overflow-hidden rounded-2xl border p-7 transition-colors ${
              isActive ? "border-emerald-500/30 bg-emerald-500/[0.04]" : "border-white/8 bg-white/[0.02]"
            }`}>
              {/* Glow when active */}
              {isActive && (
                <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
              )}

              <div className="relative flex items-center justify-between gap-6 flex-wrap">

                {/* Left: identity */}
                <div className="flex items-center gap-5">
                  {/* Avatar */}
                  <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold border ${
                    isActive ? "border-emerald-500/40 bg-emerald-500/10" : "border-white/10 bg-white/5"
                  }`}>
                    🤖
                  </div>

                  <div>
                    <div className="flex items-center gap-3 mb-0.5">
                      <h1 className="text-2xl font-bold tracking-tight">{cfoName}</h1>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        isActive ? "bg-emerald-500/15 text-emerald-400" : "bg-white/8 text-white/40"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-400 animate-pulse" : "bg-white/25"}`} />
                        {isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="text-sm text-white/40">
                      AI Trading Agent · <span className="text-yellow-400 font-medium">Stellar</span> ·{" "}
                      <span className="capitalize" style={{ color: currentRisk.accent }}>{user?.risk_tolerance ?? "balanced"}</span>
                      {" "}risk
                      {user?.goal && <> · <span className="capitalize text-white/40">{user.goal}</span></>}
                    </p>
                  </div>
                </div>

                {/* Right: controls */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-2.5">
                    <span className="text-sm text-white/50">{isActive ? "Running" : "Paused"}</span>
                    <ToggleSwitch on={isActive} loading={toggling} onToggle={toggleCFO} />
                  </div>

                  <button
                    onClick={runNow}
                    disabled={running || !isActive}
                    className="flex items-center gap-2 rounded-xl bg-white text-black px-5 py-2.5 text-sm font-semibold hover:bg-white/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {running ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        Analyzing…
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 3l14 9-14 9V3z" />
                        </svg>
                        Run now
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Run message toast */}
              {runMsg && (
                <div className={`mt-4 flex items-center gap-3 rounded-xl px-4 py-3 text-sm ${
                  runMsg.type === "error" ? "bg-rose-500/10 border border-rose-500/20 text-rose-300"
                  : runMsg.type === "warn" ? "bg-amber-500/10 border border-amber-500/20 text-amber-300"
                  : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                }`}>
                  <span className="text-base">
                    {runMsg.type === "error" ? "✕" : runMsg.type === "warn" ? "⚠" : "✓"}
                  </span>
                  {runMsg.text}
                  <button onClick={() => setRunMsg(null)} className="ml-auto text-current/50 hover:text-current">✕</button>
                </div>
              )}
            </div>

            {/* ── Stat cards row ────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="Decisions logged" value={decisions.length} sub="Last 20 shown below" />
              <StatCard
                label="Buys · Sells"
                value={`${buyCount} · ${sellCount}`}
                sub={`${buyCount + sellCount} total signals`}
                accent={buyCount > sellCount ? "#10b981" : sellCount > buyCount ? "#f43f5e" : undefined}
              />
              <StatCard label="Trades executed" value={execCount} sub="Positions opened/closed" accent={execCount > 0 ? "#10b981" : undefined} />
            </div>

            {/* ── CMC Sentiment + Strategy ──────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">

              {/* CMC Fear & Greed */}
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
                <p className="text-xs text-white/35 uppercase tracking-widest mb-3">CMC Market Sentiment</p>
                {sentiment ? (
                  <div className="flex items-center gap-4">
                    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold border ${
                      (sentiment.fearGreed ?? 50) <= 25 ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" :
                      (sentiment.fearGreed ?? 50) <= 40 ? "border-sky-500/40 bg-sky-500/10 text-sky-400" :
                      (sentiment.fearGreed ?? 50) <= 60 ? "border-white/15 bg-white/5 text-white/50" :
                      (sentiment.fearGreed ?? 50) <= 75 ? "border-amber-500/40 bg-amber-500/10 text-amber-400" :
                      "border-rose-500/40 bg-rose-500/10 text-rose-400"
                    }`}>
                      {sentiment.fearGreed ?? 50}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{sentiment.fearGreedLabel ?? "Neutral"}</p>
                      <p className="text-xs text-white/35 mt-0.5">BTC Dom: {sentiment.btcDominance?.toFixed(1) ?? "—"}%</p>
                      <p className="text-[11px] text-white/25 mt-1">
                        {(sentiment.fearGreed ?? 50) <= 40 ? "Contrarian buy signal" :
                         (sentiment.fearGreed ?? 50) >= 60 ? "Contrarian sell signal" :
                         "Neutral — no directional edge"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-white/25">Set CMC_API_KEY to enable sentiment data</p>
                )}
              </div>

              {/* Natural Language Strategy Mandate */}
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-white/35 uppercase tracking-widest">Strategy Mandate</p>
                  {!strategyEdit ? (
                    <button onClick={() => setStrategyEdit(true)}
                      className="text-xs text-white/40 hover:text-white/70 border border-white/10 rounded-lg px-2.5 py-1 hover:border-white/20 transition-all">
                      {user?.cfo_strategy ? "Edit" : "Set"}
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={saveStrategy} disabled={savingStrategy}
                        className="text-xs bg-white text-black rounded-lg px-2.5 py-1 font-medium disabled:opacity-50">
                        {savingStrategy ? "Saving…" : "Save"}
                      </button>
                      <button onClick={() => { setStrategyDraft(user?.cfo_strategy ?? ""); setStrategyEdit(false); }}
                        className="text-xs text-white/40 hover:text-white/60">Cancel</button>
                    </div>
                  )}
                </div>
                {strategyEdit ? (
                  <textarea
                    value={strategyDraft}
                    onChange={e => setStrategyDraft(e.target.value)}
                    placeholder="e.g. DCA into XLM when Fear & Greed < 30 and RSI is oversold"
                    className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 resize-none"
                    rows={3}
                  />
                ) : (
                  <div>
                    {user?.cfo_strategy ? (
                      <p className="text-sm text-white/70 leading-relaxed">&ldquo;{user.cfo_strategy}&rdquo;</p>
                    ) : (
                      <p className="text-xs text-white/25 italic">No strategy set — describe your trading rules in plain English, or tell the agent in chat.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Settings row ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">

              {/* Watchlist — read-only, CFO-managed */}
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold">Currently watching</h2>
                    <p className="text-xs text-white/35 mt-0.5">Selected by your CFO · updates each run</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[10px] text-white/30 font-mono">
                    AI-managed
                  </span>
                </div>

                {watchlist.length === 0 ? (
                  <p className="text-xs text-white/25 italic">No assets selected yet — run the CFO to let it choose.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {watchlist.map(sym => (
                      <span
                        key={sym}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/70"
                      >
                        {sym}
                      </span>
                    ))}
                  </div>
                )}

                <p className="text-[11px] text-white/20 mt-4 leading-relaxed">
                  Your CFO picks assets based on live market conditions and your risk profile. The list changes automatically every run — you don&apos;t need to set it.
                </p>
              </div>

              {/* Risk Profile */}
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold">Risk Profile</h2>
                    <p className="text-xs text-white/35 mt-0.5">Controls position sizing and limits</p>
                  </div>
                  {!riskEdit ? (
                    <button
                      onClick={() => setRiskEdit(true)}
                      className="text-xs text-white/40 hover:text-white/70 border border-white/10 rounded-lg px-3 py-1.5 hover:border-white/20 transition-all"
                    >
                      Edit
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={saveRiskProfile}
                        disabled={savingRisk}
                        className="text-xs bg-white text-black rounded-lg px-3 py-1.5 font-medium disabled:opacity-50 hover:bg-white/90 transition-colors"
                      >
                        {savingRisk ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => {
                          setRiskDraft(user?.risk_tolerance ?? "balanced");
                          setGoalDraft(user?.goal ?? "growth");
                          setHorizonDraft(user?.horizon ?? "medium");
                          setRiskEdit(false);
                        }}
                        className="text-xs text-white/40 hover:text-white/60 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {!riskEdit ? (
                  /* Read-only view */
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: currentRisk.accent + "40", background: currentRisk.accent + "0d" }}>
                      <span className="text-xl">{currentRisk.icon}</span>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: currentRisk.accent }}>{currentRisk.label}</p>
                        <p className="text-xs text-white/40">{currentRisk.desc}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {currentRisk.details.map(d => (
                        <span key={d} className="rounded-lg bg-white/5 border border-white/8 px-2.5 py-1 text-[11px] text-white/50">{d}</span>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <span className="rounded-lg bg-white/5 border border-white/8 px-2.5 py-1 text-[11px] text-white/50 capitalize">{user?.goal ?? "growth"}</span>
                      <span className="rounded-lg bg-white/5 border border-white/8 px-2.5 py-1 text-[11px] text-white/50 capitalize">{user?.horizon ?? "medium"}-term</span>
                    </div>
                  </div>
                ) : (
                  /* Edit mode */
                  <div className="space-y-4">
                    {/* Risk cards */}
                    <div className="grid grid-cols-3 gap-2">
                      {RISK_OPTIONS.map(opt => {
                        const sel = riskDraft === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => setRiskDraft(opt.value)}
                            className="rounded-xl border p-2.5 text-left transition-all"
                            style={sel
                              ? { borderColor: opt.accent + "60", background: opt.accent + "14" }
                              : { borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }
                            }
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-sm">{opt.icon}</span>
                              <span className="text-xs font-semibold" style={sel ? { color: opt.accent } : { color: "rgba(255,255,255,0.6)" }}>
                                {opt.label}
                              </span>
                            </div>
                            {opt.details.map(d => (
                              <p key={d} className="text-[10px] text-white/30 leading-tight">{d}</p>
                            ))}
                          </button>
                        );
                      })}
                    </div>

                    {/* Goal + Horizon pills */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Goal</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {GOAL_OPTIONS.map(opt => (
                            <button key={opt.value} onClick={() => setGoalDraft(opt.value)}
                              className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${goalDraft === opt.value ? "bg-white/15 text-white font-medium" : "bg-white/5 text-white/40 hover:bg-white/8"}`}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Horizon</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {HORIZON_OPTIONS.map(opt => (
                            <button key={opt.value} onClick={() => setHorizonDraft(opt.value)}
                              className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${horizonDraft === opt.value ? "bg-white/15 text-white font-medium" : "bg-white/5 text-white/40 hover:bg-white/8"}`}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Decision log ──────────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold">Decision Log</h2>
                  <p className="text-xs text-white/35 mt-0.5">Every action the CFO considered or took</p>
                </div>
                <span className="text-xs text-white/25 border border-white/8 rounded-lg px-3 py-1.5">Last 20</span>
              </div>

              {decisions.length === 0 ? (
                <div className="rounded-2xl border border-white/8 border-dashed py-16 text-center">
                  <div className="text-4xl mb-4 opacity-20">📋</div>
                  <p className="text-sm font-medium text-white/40 mb-1">No decisions yet</p>
                  <p className="text-xs text-white/25">Click <strong className="text-white/40">Run now</strong> to trigger the first CFO analysis</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/8 overflow-hidden">
                  {/* Table head */}
                  <div className="grid grid-cols-[80px_1fr_140px_90px_90px_110px] gap-4 px-5 py-3 text-[10px] font-medium text-white/25 uppercase tracking-widest border-b border-white/8 bg-white/[0.015]">
                    <span>Action</span>
                    <span>Asset · Rationale</span>
                    <span className="text-right">Signal</span>
                    <span className="text-center">Regime</span>
                    <span className="text-right">Size</span>
                    <span className="text-right">Time</span>
                  </div>

                  {decisions.map((d, i) => {
                    const isBuy  = d.action === "buy";
                    const isSell = d.action === "sell";
                    const executed = !!d.trade_id;
                    const vetoed   = !d.llm_passed;
                    const blocked  = d.llm_passed && !!d.mandate_veto_reason && !d.mandate_approved;

                    return (
                      <div
                        key={d.id}
                        className={`grid grid-cols-[80px_1fr_140px_90px_90px_110px] gap-4 px-5 py-3.5 items-center border-b border-white/[0.04] transition-colors hover:bg-white/[0.02] ${i === decisions.length - 1 ? "border-0" : ""}`}
                      >
                        {/* Action badge */}
                        <div>
                          <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${
                            isBuy  ? "bg-emerald-500/12 text-emerald-400" :
                            isSell ? "bg-rose-500/12 text-rose-400" :
                                     "bg-white/6 text-white/35"
                          }`}>
                            {d.action}
                          </span>
                        </div>

                        {/* Asset + rationale */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-sm font-semibold text-white">{d.display_symbol}</span>
                            {executed && !d.stellar_tx_hash && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                                ✓ paper
                              </span>
                            )}
                            {d.stellar_tx_hash && (
                              <a
                                href={`https://stellar.expert/explorer/public/tx/${d.stellar_tx_hash}`}
                                target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-md bg-yellow-400/10 px-1.5 py-0.5 text-[10px] font-medium text-yellow-400 hover:bg-yellow-400/20 transition-colors"
                              >
                                ✓ on-chain ↗
                              </a>
                            )}
                            {vetoed && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                                LLM vetoed
                              </span>
                            )}
                            {blocked && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-white/6 px-1.5 py-0.5 text-[10px] font-medium text-white/30">
                                blocked
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-white/35 line-clamp-1 leading-relaxed">{d.llm_rationale}</p>
                        </div>

                        {/* Signal */}
                        <div className="flex justify-end"><SignalMeter v={d.blended_signal} /></div>

                        {/* Regime */}
                        <div className="text-center">
                          <span className={`text-[11px] font-medium capitalize ${
                            d.regime === "trending" ? "text-sky-400" :
                            d.regime === "ranging"  ? "text-violet-400" :
                                                      "text-white/25"
                          }`}>
                            {d.regime ?? "—"}
                          </span>
                        </div>

                        {/* Size */}
                        <span className="text-sm text-right font-mono text-white/55 tabular-nums">
                          {d.final_size_usd > 0 ? fmt(d.final_size_usd) : "—"}
                        </span>

                        {/* Time */}
                        <span className="text-[11px] text-white/25 text-right tabular-nums whitespace-nowrap">
                          {fmtDate(d.created_at)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── On-chain audit log ────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div>
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    On-chain Audit Log
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-400/10 px-2 py-0.5 text-[10px] font-semibold text-yellow-400">
                      ⬡ Soroban · testnet
                    </span>
                  </h2>
                  <p className="text-xs text-white/35 mt-0.5">Immutable decisions written to the Stellar testnet contract</p>
                </div>
                <div className="flex items-center gap-3">
                  {onChainContractId && (
                    <a
                      href={`https://stellar.expert/explorer/testnet/contract/${onChainContractId}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-[11px] text-white/30 hover:text-white/60 transition-colors font-mono"
                    >
                      {onChainContractId.slice(0, 8)}…{onChainContractId.slice(-6)} ↗
                    </a>
                  )}
                  <button
                    onClick={loadOnChainDecisions}
                    disabled={onChainLoading}
                    className="text-xs text-white/40 hover:text-white/70 border border-white/10 rounded-lg px-3 py-1.5 hover:border-white/20 transition-all disabled:opacity-40"
                  >
                    {onChainLoading ? "Loading…" : "Refresh"}
                  </button>
                </div>
              </div>

              {onChainLoading ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <div key={i} className="h-12 animate-pulse rounded-xl bg-white/5" />)}
                </div>
              ) : onChainDecisions.length === 0 ? (
                <div className="rounded-2xl border border-white/8 border-dashed py-12 text-center">
                  <div className="text-3xl mb-3 opacity-20">⛓</div>
                  <p className="text-sm font-medium text-white/40 mb-1">No on-chain decisions yet</p>
                  <p className="text-xs text-white/25">
                    Decisions are written to Soroban after each CFO run.{" "}
                    <button onClick={loadOnChainDecisions} className="underline underline-offset-2 hover:text-white/40">Refresh</button>
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/8 overflow-hidden">
                  <div className="grid grid-cols-[80px_80px_1fr_120px_90px_100px] gap-4 px-5 py-3 text-[10px] font-medium text-white/25 uppercase tracking-widest border-b border-white/8 bg-white/[0.015]">
                    <span>Action</span>
                    <span>Asset</span>
                    <span>Signal · Status</span>
                    <span className="text-right">Size (XLM)</span>
                    <span className="text-center">Ledger</span>
                    <span className="text-right">Time</span>
                  </div>

                  {onChainDecisions.map((d, i) => {
                    const isBuy  = d.directionLabel === "buy";
                    const isSell = d.directionLabel === "sell";
                    const sig    = d.blendedSignal;
                    const sigColor = sig > 0.08 ? "#10b981" : sig < -0.08 ? "#f43f5e" : "#ffffff30";
                    const ts = d.recordedAt > 0
                      ? new Date(d.recordedAt * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "—";

                    return (
                      <div
                        key={i}
                        className={`grid grid-cols-[80px_80px_1fr_120px_90px_100px] gap-4 px-5 py-3.5 items-center border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${i === onChainDecisions.length - 1 ? "border-0" : ""}`}
                      >
                        {/* Direction badge */}
                        <span className={`inline-flex w-fit items-center rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${
                          isBuy  ? "bg-emerald-500/12 text-emerald-400" :
                          isSell ? "bg-rose-500/12 text-rose-400" :
                                   "bg-white/6 text-white/35"
                        }`}>
                          {d.directionLabel}
                        </span>

                        {/* Asset */}
                        <span className="text-sm font-semibold">{d.asset}</span>

                        {/* Signal + approval status */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <div className="relative h-1.5 w-14 rounded-full bg-white/8 overflow-hidden">
                              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.round(((sig + 1) / 2) * 100)}%`, background: sigColor }} />
                            </div>
                            <span className="text-[11px] font-mono tabular-nums" style={{ color: sigColor }}>
                              {sig > 0 ? "+" : ""}{sig.toFixed(3)}
                            </span>
                          </div>
                          {d.approved ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                              ✓ approved
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-white/6 px-1.5 py-0.5 text-[10px] font-medium text-white/30" title={d.vetoReason ?? ""}>
                              ✕ {d.vetoReason ?? "vetoed"}
                            </span>
                          )}
                        </div>

                        {/* Size */}
                        <span className="text-sm text-right font-mono text-white/55 tabular-nums">
                          {d.finalSizeXlm > 0 ? `${d.finalSizeXlm.toFixed(2)} XLM` : "—"}
                        </span>

                        {/* Ledger seq */}
                        <span className="text-[11px] text-center font-mono text-white/25 tabular-nums">
                          #{d.ledgerSeq.toLocaleString()}
                        </span>

                        {/* Timestamp */}
                        <span className="text-[11px] text-white/25 text-right tabular-nums whitespace-nowrap">{ts}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </>
        )}
      </main>

      <CFOChat cfoName={cfoName} />
    </div>
  );
}
