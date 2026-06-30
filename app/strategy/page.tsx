"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { AppNav } from "@/components/app-nav";
import type { StrategySpec, BacktestResult } from "@/lib/skill/types";

// ── Static data ───────────────────────────────────────────────────────────────

const SKILL_TYPES = [
  {
    type: "momentum" as const,
    name: "Momentum",
    icon: "📈",
    tagline: "Follow the trend",
    description: "Blends RSI, MACD, dual-momentum, and CMC Fear & Greed into precise entry and exit rules. Best in trending markets.",
    accent: "#10b981",
  },
  {
    type: "sentiment_divergence" as const,
    name: "Sentiment Divergence",
    icon: "⚡",
    tagline: "Buy fear, sell greed",
    description: "Fires only when CMC Fear & Greed contradicts technical momentum — high-conviction, low-frequency entries.",
    accent: "#f59e0b",
  },
  {
    type: "mean_reversion" as const,
    name: "Mean Reversion",
    icon: "🎯",
    tagline: "Buy the dip",
    description: "Uses Bollinger Bands and Z-score to buy oversold dips and exit when price reverts toward the mean. Best in ranging markets.",
    accent: "#8b5cf6",
  },
  {
    type: "volume_breakout" as const,
    name: "Volume Breakout",
    icon: "🔀",
    tagline: "Catch the surge",
    description: "Enters breakouts above resistance only when confirmed by volume surge and EMA crossover — filters out false moves.",
    accent: "#f43f5e",
  },
] as const;

const POPULAR_TOKENS = [
  "XLM/USD", "BTC/USD", "ETH/USD", "SOL/USD", "USDC/USD",
  "DOGE/USD", "ADA/USD", "AVAX/USD", "DOT/USD", "LINK/USD",
  "MATIC/USD", "UNI/USD", "AAVE/USD", "XRP/USD", "NEAR/USD",
];

const RISK_OPTIONS = [
  { value: "conservative" as const, label: "Conservative", detail: "$250/trade · 5% drawdown", accent: "#38bdf8" },
  { value: "balanced" as const,     label: "Balanced",     detail: "$500/trade · 20% drawdown", accent: "#818cf8" },
  { value: "aggressive" as const,   label: "Aggressive",   detail: "$1K/trade · 40% drawdown",  accent: "#f87171" },
];

const GEN_STEPS = [
  "Fetching CMC Fear & Greed index…",
  "Reading global market metrics…",
  "Pulling Binance Futures funding rates…",
  "Checking long/short positioning…",
  "Generating strategy spec via LLM…",
];

const BT_DURATIONS = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "180 days", days: 180 },
  { label: "1 year", days: 365 },
];

type SkillTypeValue = typeof SKILL_TYPES[number]["type"];
type Stage = "pick" | "configure" | "generating" | "spec" | "backtesting" | "results";

// ── Formatters ────────────────────────────────────────────────────────────────

function pct(n: number, sign = false): string {
  const s = (Math.abs(n) * 100).toFixed(1) + "%";
  if (!sign) return s;
  return (n >= 0 ? "+" : "−") + s;
}

function num2(n: number): string { return n.toFixed(2); }

function metricColor(key: string, value: number): string {
  if (key === "maxDrawdownPct") return "#f43f5e";
  if (key === "sharpeRatio" || key === "sortinoRatio" || key === "calmarRatio") {
    return value >= 1 ? "#10b981" : value >= 0.5 ? "#f59e0b" : "#f43f5e";
  }
  if (key === "profitFactor") return value >= 1.5 ? "#10b981" : value >= 1 ? "#f59e0b" : "#f43f5e";
  if (key === "winRate") return value >= 0.5 ? "#10b981" : "#f43f5e";
  return value >= 0 ? "#10b981" : "#f43f5e";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ label, value, formatted, colorKey }: { label: string; value: number; formatted: string; colorKey: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3.5">
      <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5">{label}</p>
      <p className="text-2xl font-bold tabular-nums" style={{ color: metricColor(colorKey, value) }}>{formatted}</p>
    </div>
  );
}

function ConditionRow({ cond }: { cond: StrategySpec["entryConditions"][number] }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-white/[0.05] last:border-0">
      <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-mono text-emerald-400 mt-0.5">AND</span>
      <div className="min-w-0">
        <p className="text-sm text-white/80">
          <span className="font-mono text-indigo-300">{cond.signal}</span>
          {" "}<span className="text-white/35">{cond.operator}</span>{" "}
          <span className="font-mono text-white">{cond.threshold}</span>
          {cond.threshold2 !== undefined && (
            <><span className="text-white/35"> – </span><span className="font-mono text-white">{cond.threshold2}</span></>
          )}
        </p>
        <p className="text-xs text-white/35 mt-0.5">{cond.description}</p>
      </div>
    </div>
  );
}

const EXIT_ICONS: Record<string, string> = {
  stop_loss: "🛑", take_profit: "✅", signal_reversal: "↩️", time_limit: "⏱️",
};

function ExitRuleRow({ rule }: { rule: StrategySpec["exitRules"][number] }) {
  const formatted = rule.type === "time_limit"
    ? `${rule.value} bars`
    : `${(rule.value * 100).toFixed(1)}%`;
  return (
    <div className="flex items-center gap-3 py-2 border-b border-white/[0.05] last:border-0">
      <span className="text-sm">{EXIT_ICONS[rule.type] ?? "•"}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/70 capitalize">{rule.type.replace(/_/g, " ")}</p>
        <p className="text-[11px] text-white/35">{rule.description}</p>
      </div>
      <span className="font-mono text-xs text-white/50 shrink-0">{formatted}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StrategyPage() {
  const router = useRouter();

  const [authed, setAuthed] = useState(true);
  const [stage, setStage] = useState<Stage>("pick");

  // Config
  const [skillType, setSkillType] = useState<SkillTypeValue | null>(null);
  const [universe, setUniverse] = useState<string[]>(["BTC/USD", "ETH/USD", "SOL/USD"]);
  const [tokenInput, setTokenInput] = useState("");
  const [riskProfile, setRiskProfile] = useState<"conservative" | "balanced" | "aggressive">("balanced");
  const [customMandate, setCustomMandate] = useState("");

  // Generation
  const [genStep, setGenStep] = useState(0);
  const [spec, setSpec] = useState<StrategySpec | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  // Backtest
  const [btDays, setBtDays] = useState(90);
  const [btInterval, setBtInterval] = useState<"1h" | "4h" | "1d">("1h");
  const [btResult, setBtResult] = useState<BacktestResult | null>(null);
  const [btError, setBtError] = useState<string | null>(null);

  // UI
  const [copied, setCopied] = useState(false);
  const [sentToCFO, setSentToCFO] = useState(false);
  const specRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/user").then(r => { if (r.status === 401) setAuthed(false); }).catch(() => {});
  }, []);

  // When skill selected, scroll config into view
  function pickSkill(type: SkillTypeValue) {
    setSkillType(type);
    setStage("configure");
    setTimeout(() => {
      document.getElementById("configure-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  function addToken() {
    const raw = tokenInput.trim().toUpperCase();
    if (!raw) return;
    const sym = raw.includes("/") ? raw : `${raw}/USD`;
    if (!universe.includes(sym)) setUniverse(u => [...u, sym]);
    setTokenInput("");
  }

  function removeToken(sym: string) {
    setUniverse(u => u.filter(s => s !== sym));
  }

  function togglePopular(sym: string) {
    if (universe.includes(sym)) removeToken(sym);
    else setUniverse(u => [...u, sym]);
  }

  async function generate() {
    if (!skillType || universe.length === 0) return;
    setStage("generating");
    setGenStep(0);
    setGenError(null);
    setBtResult(null);

    const timer = setInterval(() => {
      setGenStep(s => (s < GEN_STEPS.length - 1 ? s + 1 : s));
    }, 700);

    try {
      const res = await fetch("/api/skill/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillType, universe, riskProfile,
          customMandate: customMandate.trim() || undefined,
        }),
      });
      clearInterval(timer);
      setGenStep(GEN_STEPS.length);
      const data = await res.json() as { spec?: StrategySpec; error?: string };
      if (data.spec) {
        setSpec(data.spec);
        setStage("spec");
        setTimeout(() => specRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
      } else {
        setGenError(data.error ?? "Generation failed");
        setStage("configure");
      }
    } catch {
      clearInterval(timer);
      setGenError("Network error — please retry");
      setStage("configure");
    }
  }

  async function runBacktest() {
    if (!spec) return;
    setStage("backtesting");
    setBtError(null);

    const now = Date.now();
    const fromMs = now - btDays * 24 * 60 * 60 * 1000;

    try {
      const res = await fetch("/api/skill/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec, symbols: universe.slice(0, 3), interval: btInterval, fromMs, toMs: now }),
      });
      const data = await res.json() as { result?: BacktestResult; error?: string };
      if (data.result) {
        setBtResult(data.result);
        setStage("results");
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
      } else {
        setBtError(data.error ?? "Backtest failed");
        setStage("spec");
      }
    } catch {
      setBtError("Network error");
      setStage("spec");
    }
  }

  function copySpec() {
    if (!spec) return;
    navigator.clipboard.writeText(JSON.stringify(spec, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function sendToCFO() {
    if (!spec) return;
    const mandate = `${spec.name}: ${spec.entryConditions.map(c => c.description).join("; ")}.`;
    await fetch("/api/user", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cfo_strategy: mandate }),
    });
    setSentToCFO(true);
    setTimeout(() => router.push("/cfo"), 1200);
  }

  const selectedSkill = SKILL_TYPES.find(s => s.type === skillType);
  const isGenerating = stage === "generating";
  const isBacktesting = stage === "backtesting";

  if (!authed) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <AppNav active="Strategy" />
        <main className="mx-auto max-w-lg px-6 py-32 text-center">
          <p className="text-white/40 mb-6">Sign in to build strategies</p>
          <Link href="/login" className="rounded-2xl bg-white text-black px-8 py-3 text-sm font-semibold">Sign In</Link>
        </main>
      </div>
    );
  }

  // Equity chart data
  const chartData = btResult?.equityCurve.filter((_, i) => i % 4 === 0).map(pt => ({
    date: new Date(pt.time * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: Math.round(pt.value * 100) / 100,
  })) ?? [];

  const totalReturn = btResult?.totalReturnPct ?? 0;
  const chartColor = totalReturn >= 0 ? "#10b981" : "#f43f5e";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav active="Strategy" />

      <main className="mx-auto max-w-5xl px-8 py-10 space-y-12 pb-32">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-indigo-400">CMC Skill</span>
            <span className="text-white/20 text-xs">·</span>
            <span className="text-xs text-white/30">Powered by CoinMarketCap + Binance Futures</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Strategy Builder</h1>
          <p className="mt-2 text-white/40 text-sm max-w-xl">
            Pick a skill type, configure your universe, and the AI generates a backtestable strategy spec — entry rules, exit rules, position sizing, all of it.
          </p>
        </div>

        {/* ── Step 1: Skill type ──────────────────────────────────────────── */}
        <section>
          <p className="text-xs text-white/30 uppercase tracking-widest mb-4">Step 1 · Choose a skill</p>
          <div className="grid grid-cols-2 gap-3">
            {SKILL_TYPES.map(skill => {
              const selected = skillType === skill.type;
              return (
                <button
                  key={skill.type}
                  onClick={() => pickSkill(skill.type)}
                  disabled={isGenerating || isBacktesting}
                  className="group relative overflow-hidden rounded-2xl border p-5 text-left transition-all disabled:opacity-50"
                  style={selected
                    ? { borderColor: skill.accent + "50", background: skill.accent + "0e" }
                    : { borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)" }
                  }
                >
                  {selected && (
                    <div className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full blur-2xl opacity-30" style={{ background: skill.accent }} />
                  )}
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{skill.icon}</span>
                      <span className="text-sm font-semibold" style={selected ? { color: skill.accent } : { color: "rgba(255,255,255,0.75)" }}>
                        {skill.name}
                      </span>
                      {selected && (
                        <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: skill.accent + "25", color: skill.accent }}>
                          Selected
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-white/35 font-medium mb-1" style={selected ? { color: skill.accent + "99" } : {}}>
                      {skill.tagline}
                    </p>
                    <p className="text-xs text-white/45 leading-relaxed">{skill.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Step 2: Configure ─────────────────────────────────────────────── */}
        {(stage === "configure" || stage === "generating" || stage === "spec" || stage === "backtesting" || stage === "results") && (
          <section id="configure-section" className="space-y-6">
            <p className="text-xs text-white/30 uppercase tracking-widest">Step 2 · Configure</p>

            {/* Universe */}
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
              <p className="text-sm font-semibold mb-1">Universe</p>
              <p className="text-xs text-white/35 mb-4">Which assets should this strategy trade?</p>

              {/* Popular token chips */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {POPULAR_TOKENS.map(sym => {
                  const active = universe.includes(sym);
                  return (
                    <button
                      key={sym}
                      onClick={() => togglePopular(sym)}
                      disabled={isGenerating || isBacktesting}
                      className="rounded-full border px-2.5 py-1 text-xs transition-all disabled:opacity-40"
                      style={active
                        ? { borderColor: (selectedSkill?.accent ?? "rgba(255,255,255,0.3)") + "50", background: (selectedSkill?.accent ?? "rgba(255,255,255,0.08)") + "15", color: selectedSkill?.accent ?? "white" }
                        : { borderColor: "rgba(255,255,255,0.08)", background: "transparent", color: "rgba(255,255,255,0.4)" }
                      }
                    >
                      {sym.replace("/USD", "")}
                    </button>
                  );
                })}
              </div>

              {/* Custom input */}
              <div className="flex gap-2">
                <input
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addToken()}
                  placeholder="Add custom symbol (e.g. PEPE)"
                  disabled={isGenerating || isBacktesting}
                  className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/25 disabled:opacity-40"
                />
                <button
                  onClick={addToken}
                  disabled={isGenerating || isBacktesting || !tokenInput.trim()}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 hover:text-white hover:border-white/20 transition-all disabled:opacity-30"
                >
                  Add
                </button>
              </div>

              {/* Selected chips */}
              {universe.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {universe.map(sym => (
                    <span key={sym} className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1 text-xs text-white/70">
                      {sym}
                      <button
                        onClick={() => removeToken(sym)}
                        disabled={isGenerating || isBacktesting}
                        className="text-white/30 hover:text-white/60 transition-colors disabled:opacity-0"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Risk profile + mandate */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
                <p className="text-sm font-semibold mb-3">Risk Profile</p>
                <div className="grid grid-cols-3 gap-2">
                  {RISK_OPTIONS.map(opt => {
                    const sel = riskProfile === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setRiskProfile(opt.value)}
                        disabled={isGenerating || isBacktesting}
                        className="rounded-xl border p-2.5 text-left transition-all disabled:opacity-40"
                        style={sel
                          ? { borderColor: opt.accent + "50", background: opt.accent + "12" }
                          : { borderColor: "rgba(255,255,255,0.07)", background: "transparent" }
                        }
                      >
                        <p className="text-xs font-semibold mb-0.5" style={sel ? { color: opt.accent } : { color: "rgba(255,255,255,0.6)" }}>{opt.label}</p>
                        <p className="text-[10px] text-white/30 leading-tight">{opt.detail}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
                <p className="text-sm font-semibold mb-1">Custom mandate <span className="text-white/25 font-normal">(optional)</span></p>
                <p className="text-[11px] text-white/30 mb-3">Override the AI with a specific instruction</p>
                <textarea
                  value={customMandate}
                  onChange={e => setCustomMandate(e.target.value)}
                  placeholder="e.g. Only enter when funding rate is negative and F&G < 35"
                  disabled={isGenerating || isBacktesting}
                  rows={3}
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/25 resize-none disabled:opacity-40"
                />
              </div>
            </div>

            {/* Generate button */}
            {(stage === "configure" || stage === "spec" || stage === "results" || stage === "backtesting") && (
              <div className="flex items-center gap-3">
                <button
                  onClick={generate}
                  disabled={!skillType || universe.length === 0 || isGenerating || isBacktesting}
                  className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-black transition-all disabled:opacity-40"
                  style={{ background: selectedSkill?.accent ?? "white" }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {spec ? "Regenerate strategy" : "Generate strategy"}
                </button>
                {genError && <p className="text-xs text-rose-400">{genError}</p>}
              </div>
            )}
          </section>
        )}

        {/* ── Step 3: Generating ──────────────────────────────────────────── */}
        {stage === "generating" && (
          <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-8">
            <p className="text-xs text-white/30 uppercase tracking-widest mb-6">Generating…</p>
            <div className="space-y-3">
              {GEN_STEPS.map((step, i) => {
                const done    = i < genStep;
                const current = i === genStep;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 text-[10px] transition-all ${
                      done    ? "bg-emerald-500/20 text-emerald-400" :
                      current ? "bg-white/8 text-white/60" :
                                "bg-white/4 text-white/20"
                    }`}>
                      {done ? "✓" : current ? <span className="w-2.5 h-2.5 rounded-full border border-white/30 border-t-white/70 animate-spin inline-block" /> : "○"}
                    </div>
                    <p className={`text-sm transition-colors ${done ? "text-white/50 line-through" : current ? "text-white/80" : "text-white/20"}`}>
                      {step}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Step 3: Spec display ─────────────────────────────────────────── */}
        {spec && (stage === "spec" || stage === "backtesting" || stage === "results") && (
          <section ref={specRef} className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-white/30 uppercase tracking-widest">Strategy Spec</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={copySpec}
                  className="text-xs border border-white/10 rounded-lg px-3 py-1.5 text-white/40 hover:text-white/70 hover:border-white/20 transition-all"
                >
                  {copied ? "Copied!" : "Copy JSON"}
                </button>
                {sentToCFO ? (
                  <span className="text-xs text-emerald-400">Sent to CFO ✓</span>
                ) : (
                  <button
                    onClick={sendToCFO}
                    className="text-xs border border-emerald-500/30 bg-emerald-500/10 rounded-lg px-3 py-1.5 text-emerald-400 hover:bg-emerald-500/20 transition-all"
                  >
                    Send to CFO →
                  </button>
                )}
              </div>
            </div>

            {/* Spec header card */}
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="flex-1">
                  <h2 className="text-xl font-bold tracking-tight">{spec.name}</h2>
                  <p className="text-sm text-white/50 mt-1 leading-relaxed">{spec.description}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-white/40 capitalize">{spec.skillType.replace(/_/g, " ")}</span>
                  <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-white/40 capitalize">{spec.positionSizing.method.replace(/_/g, " ")} sizing</span>
                </div>
              </div>

              {/* Market context snapshot */}
              <div className="flex flex-wrap gap-2 pt-4 border-t border-white/6">
                <span className="text-[11px] text-white/30">Market context when generated:</span>
                <span className={`text-[11px] font-medium ${spec.marketContext.fearGreedValue <= 35 ? "text-emerald-400" : spec.marketContext.fearGreedValue >= 65 ? "text-rose-400" : "text-white/50"}`}>
                  F&G {spec.marketContext.fearGreedValue} ({spec.marketContext.fearGreedLabel})
                </span>
                <span className="text-white/20">·</span>
                <span className="text-[11px] text-white/40">BTC Dom {spec.marketContext.btcDominancePct.toFixed(1)}%</span>
                <span className="text-white/20">·</span>
                <span className="text-[11px] text-white/40 capitalize">{spec.marketContext.regime} regime</span>
              </div>
            </div>

            {/* Entry + Exit */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
                <p className="text-xs text-white/30 uppercase tracking-widest mb-3">Entry Conditions</p>
                <p className="text-[11px] text-white/25 mb-3">All must be true simultaneously</p>
                <div>
                  {spec.entryConditions.map((cond, i) => (
                    <ConditionRow key={i} cond={cond} />
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
                <p className="text-xs text-white/30 uppercase tracking-widest mb-3">Exit Rules</p>
                <p className="text-[11px] text-white/25 mb-3">Any one triggers trade close</p>
                <div>
                  {spec.exitRules.map((rule, i) => (
                    <ExitRuleRow key={i} rule={rule} />
                  ))}
                </div>
              </div>
            </div>

            {/* Rationale */}
            {spec.rationale && (
              <div className="rounded-2xl border border-white/6 bg-white/[0.015] px-5 py-4">
                <p className="text-[10px] text-white/25 uppercase tracking-widest mb-2">LLM Rationale</p>
                <p className="text-sm text-white/45 leading-relaxed italic">&ldquo;{spec.rationale}&rdquo;</p>
              </div>
            )}

            {/* Backtest launcher */}
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="text-sm font-semibold">Run Backtest</p>
                  <p className="text-xs text-white/35 mt-0.5">Replay this strategy against real historical data from Binance</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Duration selector */}
                  <div className="flex gap-1">
                    {BT_DURATIONS.map(d => (
                      <button
                        key={d.days}
                        onClick={() => setBtDays(d.days)}
                        disabled={isBacktesting}
                        className={`rounded-lg px-2.5 py-1.5 text-xs transition-all disabled:opacity-40 ${btDays === d.days ? "bg-white/12 text-white font-medium" : "text-white/35 hover:text-white/60"}`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  {/* Interval selector */}
                  <div className="flex gap-1">
                    {(["1h", "4h", "1d"] as const).map(iv => (
                      <button
                        key={iv}
                        onClick={() => setBtInterval(iv)}
                        disabled={isBacktesting}
                        className={`rounded-lg px-2.5 py-1.5 text-xs transition-all disabled:opacity-40 ${btInterval === iv ? "bg-white/12 text-white font-medium" : "text-white/35 hover:text-white/60"}`}
                      >
                        {iv}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={runBacktest}
                    disabled={isBacktesting || isGenerating}
                    className="flex items-center gap-2 rounded-xl bg-white text-black px-5 py-2 text-sm font-semibold hover:bg-white/90 transition-all disabled:opacity-40"
                  >
                    {isBacktesting ? (
                      <><span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />Running…</>
                    ) : "Run backtest"}
                  </button>
                </div>
              </div>
              {btError && <p className="text-xs text-rose-400 mt-3">{btError}</p>}
            </div>
          </section>
        )}

        {/* ── Step 4: Backtest results ─────────────────────────────────────── */}
        {btResult && stage === "results" && (
          <section ref={resultsRef} className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-white/30 uppercase tracking-widest">Backtest Results</p>
              <div className="flex items-center gap-2 text-xs text-white/30">
                <span>{btResult.symbols.join(", ")}</span>
                <span className="text-white/15">·</span>
                <span>{btInterval} bars</span>
                <span className="text-white/15">·</span>
                <span>{btResult.totalTrades} trades</span>
              </div>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-6 gap-3">
              <MetricCard label="Total Return" value={btResult.totalReturnPct} formatted={pct(btResult.totalReturnPct, true)} colorKey="totalReturnPct" />
              <MetricCard label="Annual Return" value={btResult.annualizedReturnPct} formatted={pct(btResult.annualizedReturnPct, true)} colorKey="annualizedReturnPct" />
              <MetricCard label="Sharpe Ratio" value={btResult.sharpeRatio} formatted={num2(btResult.sharpeRatio)} colorKey="sharpeRatio" />
              <MetricCard label="Max Drawdown" value={btResult.maxDrawdownPct} formatted={pct(btResult.maxDrawdownPct)} colorKey="maxDrawdownPct" />
              <MetricCard label="Win Rate" value={btResult.winRate} formatted={pct(btResult.winRate)} colorKey="winRate" />
              <MetricCard label="Profit Factor" value={btResult.profitFactor} formatted={num2(btResult.profitFactor === Infinity ? 99 : btResult.profitFactor)} colorKey="profitFactor" />
            </div>

            {/* Equity curve */}
            {chartData.length > 0 && (
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold">Equity Curve</p>
                  <span className="text-xs text-white/30 font-mono">
                    ${btResult.initialCapital.toLocaleString()} → ${Math.round(btResult.finalCapital).toLocaleString()}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={chartColor} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.25)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.25)" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toLocaleString()}`} width={70} />
                    <Tooltip
                      contentStyle={{ background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                      labelStyle={{ color: "rgba(255,255,255,0.5)" }}
                      itemStyle={{ color: chartColor }}
                      formatter={(v: unknown) => [`$${Number(v).toLocaleString()}`, "Portfolio"]}
                    />
                    <Area type="monotone" dataKey="value" stroke={chartColor} strokeWidth={1.5} fill="url(#eq)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Trade log */}
            {btResult.trades.length > 0 && (
              <div className="rounded-2xl border border-white/8 overflow-hidden">
                <div className="px-5 py-3 border-b border-white/8 bg-white/[0.015]">
                  <p className="text-sm font-semibold">Trade Log</p>
                </div>
                <div className="grid grid-cols-[80px_100px_100px_90px_90px_90px_1fr] gap-3 px-5 py-2.5 text-[10px] font-medium text-white/25 uppercase tracking-widest border-b border-white/6 bg-white/[0.01]">
                  <span>Symbol</span><span>Entry</span><span>Exit</span>
                  <span className="text-right">Entry $</span><span className="text-right">Exit $</span>
                  <span className="text-right">Return</span><span>Exit reason</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {btResult.trades.slice(0, 50).map((t, i) => {
                    const pos = t.returnPct >= 0;
                    return (
                      <div key={i} className="grid grid-cols-[80px_100px_100px_90px_90px_90px_1fr] gap-3 px-5 py-2.5 items-center border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                        <span className="text-xs font-medium text-white/70">{t.symbol.replace("/USD", "")}</span>
                        <span className="text-[11px] text-white/35">{new Date(t.entryTime * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                        <span className="text-[11px] text-white/35">{new Date(t.exitTime * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                        <span className="text-right text-xs font-mono text-white/50">${t.entryPrice.toFixed(2)}</span>
                        <span className="text-right text-xs font-mono text-white/50">${t.exitPrice.toFixed(2)}</span>
                        <span className={`text-right text-xs font-mono font-semibold ${pos ? "text-emerald-400" : "text-rose-400"}`}>
                          {pos ? "+" : "−"}{Math.abs(t.returnPct * 100).toFixed(2)}%
                        </span>
                        <span className="text-[11px] text-white/30 truncate">{t.exitReason}</span>
                      </div>
                    );
                  })}
                  {btResult.trades.length > 50 && (
                    <p className="px-5 py-3 text-[11px] text-white/25">+{btResult.trades.length - 50} more trades</p>
                  )}
                </div>
              </div>
            )}

            {btResult.totalTrades === 0 && (
              <div className="rounded-2xl border border-white/8 border-dashed py-12 text-center">
                <p className="text-sm text-white/40 mb-1">No trades triggered</p>
                <p className="text-xs text-white/25">The entry conditions were too strict for this period. Try a longer lookback, different interval, or lower the entry threshold.</p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
