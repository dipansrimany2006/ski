"use client";

import { useEffect, useState } from "react";
import { AsciiWave } from "./ascii-wave";

const TICKER_LINES = [
  { sym: "BTC/USD", dir: "BUY",  signal: "+0.31", size: "$500",   price: "$67,421",  color: "#10b981" },
  { sym: "ETH/USD", dir: "SELL", signal: "−0.18", size: "$320",   price: "$3,512",   color: "#f43f5e" },
  { sym: "SOL/USD", dir: "BUY",  signal: "+0.12", size: "$250",   price: "$148.90",  color: "#10b981" },
  { sym: "XLM/USD", dir: "HOLD", signal: "+0.04", size: "—",      price: "$0.142",   color: "#ffffff44" },
];

function CFOCard() {
  const [step, setStep] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setStep(s => (s + 1) % TICKER_LINES.length), 2800);
    return () => clearInterval(t);
  }, []);

  const current = TICKER_LINES[step];
  const dots = ".".repeat((tick % 30 < 10) ? 1 : (tick % 30 < 20) ? 2 : 3);

  return (
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl overflow-hidden shadow-2xl">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 bg-white/[0.02]">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold">Your CFO</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] text-emerald-400 font-medium">Active</span>
        </div>
      </div>

      {/* Analysis feed */}
      <div className="px-4 py-4 space-y-2.5 font-mono text-xs">
        <div className="text-white/30">// cycle #{142 + step} · analyzing {current.sym}{dots}</div>

        <div className="rounded-lg bg-white/[0.04] border border-white/6 px-3 py-2.5 space-y-1.5">
          <div className="flex justify-between">
            <span className="text-white/40">blended signal</span>
            <span style={{ color: current.color }}>{current.signal}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">regime</span>
            <span className="text-sky-400">trending</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">LLM sanity check</span>
            <span className="text-emerald-400">✓ pass</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">mandate guard</span>
            <span className="text-emerald-400">✓ approved</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">position size</span>
            <span className="text-white/70">{current.size}</span>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg px-3 py-2.5 border"
          style={{
            background: current.dir === "HOLD" ? "rgba(255,255,255,0.02)" : current.color + "12",
            borderColor: current.dir === "HOLD" ? "rgba(255,255,255,0.08)" : current.color + "40",
          }}
        >
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm" style={{ color: current.color }}>{current.dir}</span>
            <span className="text-white/50">{current.sym}</span>
          </div>
          {current.dir !== "HOLD" && (
            <span className="text-white/40">@ {current.price}</span>
          )}
        </div>
      </div>

      {/* Recent decisions strip */}
      <div className="px-4 pb-4 flex gap-2">
        {TICKER_LINES.map((t, i) => (
          <div key={i} className={`flex-1 h-1 rounded-full transition-all duration-500 ${i === step ? "opacity-100" : "opacity-20"}`}
            style={{ background: t.color }} />
        ))}
      </div>
    </div>
  );
}

export function HeroSection() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => { setIsVisible(true); }, []);

  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden pt-16">
      <div className="absolute inset-0 grid-pattern opacity-30" />
      <div className="absolute inset-0 opacity-15 pointer-events-none overflow-hidden">
        <AsciiWave className="w-full h-full" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-8 py-16 lg:py-24">
        <div className="grid lg:grid-cols-2 gap-16 items-center">

          {/* Left: copy */}
          <div>
            <div className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground mb-8 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live on Stellar · AI-powered CFO
            </div>

            <h1 className={`text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05] mb-6 transition-all duration-700 delay-100 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              Your personal<br />
              <span className="text-primary">on-chain CFO.</span>
            </h1>

            <p className={`text-lg text-muted-foreground leading-relaxed mb-10 max-w-md transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              Ski assigns you an AI Chief Financial Officer that reads the markets, runs a 9-step decision loop, and executes trades within your personal risk mandate — 24/7.
            </p>

            <div className={`flex items-center gap-3 transition-all duration-700 delay-300 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              <a
                href="/login"
                className="rounded-xl bg-foreground hover:bg-foreground/90 text-background px-6 py-3 text-sm font-semibold transition-colors"
              >
                Activate your CFO →
              </a>
              <a
                href="#how-it-works"
                className="rounded-xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/8 px-6 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-all"
              >
                See how it works
              </a>
            </div>

            <p className={`mt-6 text-xs text-muted-foreground/50 transition-all duration-700 delay-400 ${isVisible ? "opacity-100" : "opacity-0"}`}>
              Free to start · No finance degree required
            </p>
          </div>

          {/* Right: live CFO card */}
          <div className={`flex justify-center lg:justify-end transition-all duration-1000 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <CFOCard />
          </div>
        </div>

        {/* Stats strip */}
        <div className={`mt-20 grid grid-cols-2 lg:grid-cols-4 gap-px bg-border/50 rounded-xl overflow-hidden transition-all duration-700 delay-500 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          {[
            { value: "9-step",  label: "Decision loop",       sub: "Signal → Trade" },
            { value: "6",       label: "Strategy families",   sub: "Blended into one" },
            { value: "< 1s",    label: "Decision speed",      sub: "Signal to execution" },
            { value: "24/7",    label: "Always watching",     sub: "You sleep, it works" },
          ].map((s) => (
            <div key={s.label} className="bg-card p-6 lg:p-8">
              <div className="font-mono text-2xl lg:text-3xl font-semibold text-primary mb-1">{s.value}</div>
              <div className="text-sm font-medium">{s.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
