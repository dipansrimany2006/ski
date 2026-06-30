"use client";

import { useEffect, useState, useRef } from "react";
import { AsciiWave } from "./ascii-wave";

function AnimatedCounter({ end, suffix = "", prefix = "" }: { end: number; suffix?: string; prefix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          const duration = 1800;
          const startTime = performance.now();
          const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * end));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, hasAnimated]);

  return (
    <div ref={ref} className="font-mono text-4xl lg:text-5xl font-semibold tracking-tight text-primary">
      {prefix}{count.toLocaleString()}{suffix}
    </div>
  );
}

const STRATEGIES = [
  { name: "Momentum",      detail: "RSI, ADX, EMA cross" },
  { name: "Mean Reversion", detail: "Bollinger, Z-score" },
  { name: "Volatility",    detail: "ATR, breakout bands" },
  { name: "Volume",        detail: "VWAP, OBV, CVD" },
  { name: "Statistical",   detail: "Hurst, entropy, skew" },
  { name: "Smart Money",   detail: "Order flow, sweeps" },
];

const FEED_ENTRIES = [
  { sym: "BTC/USD", action: "BUY",  signal: "+0.31", regime: "trending",  ok: true },
  { sym: "ETH/USD", action: "SELL", signal: "−0.19", regime: "ranging",   ok: true },
  { sym: "SOL/USD", action: "HOLD", signal: "+0.04", regime: "ranging",   ok: false },
  { sym: "XLM/USD", action: "BUY",  signal: "+0.14", regime: "trending",  ok: true },
  { sym: "XRP/USD", action: "HOLD", signal: "−0.02", regime: "uncertain", ok: false },
];

export function MetricsSection() {
  const [time, setTime] = useState<Date | null>(null);
  const [activeFeed, setActiveFeed] = useState(0);

  useEffect(() => {
    setTime(new Date());
    const clock = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setActiveFeed(i => (i + 1) % FEED_ENTRIES.length), 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <section id="metrics" className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center opacity-8 pointer-events-none">
        <AsciiWave className="w-full h-full" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-16">
          <div>
            <p className="text-sm font-mono text-primary mb-3">// BY THE NUMBERS</p>
            <h2 className="text-3xl lg:text-5xl font-semibold tracking-tight text-balance">
              Built for serious<br />trading discipline.
            </h2>
          </div>
          <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>CFO online</span>
            <span className="text-border mx-2">|</span>
            <span suppressHydrationWarning>{time ? time.toLocaleTimeString() : "--:--:--"}</span>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border/50 rounded-xl overflow-hidden mb-12">
          {[
            { end: 6,     suffix: "",     label: "Strategy families",   sub: "Blended into one signal" },
            { end: 9,     suffix: "",     label: "Decision loop steps", sub: "Signal to executed trade" },
            { end: 10000, suffix: "",     prefix: "$", label: "Starting balance", sub: "Allocated at onboarding" },
            { end: 100,   suffix: "%",    label: "Decision transparency", sub: "Every move logged" },
          ].map((m) => (
            <div key={m.label} className="bg-card p-7 flex flex-col gap-3">
              <AnimatedCounter end={m.end} suffix={m.suffix} prefix={m.prefix} />
              <div>
                <div className="text-sm font-medium">{m.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{m.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Two-column: strategies + live feed */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Strategy families */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span className="font-mono text-sm text-muted-foreground">Strategy ensemble</span>
            </div>
            <div className="space-y-2">
              {STRATEGIES.map((s, i) => (
                <div key={s.name} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground/50 w-4">{i + 1}</span>
                    <span className="text-sm font-medium">{s.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">{s.detail}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Live decision feed */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-mono text-sm text-muted-foreground">Live decision feed</span>
            </div>
            <div className="space-y-2">
              {FEED_ENTRIES.map((entry, i) => (
                <div
                  key={entry.sym}
                  className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-all duration-500 ${
                    i === activeFeed ? "bg-primary/8 border border-primary/20" : "border border-transparent"
                  }`}
                >
                  <span className={`text-xs font-bold font-mono w-9 ${
                    entry.action === "BUY" ? "text-emerald-400"
                    : entry.action === "SELL" ? "text-rose-400"
                    : "text-muted-foreground/40"
                  }`}>{entry.action}</span>
                  <span className="text-sm flex-1">{entry.sym}</span>
                  <span className={`text-xs font-mono ${Number(entry.signal) > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {entry.signal}
                  </span>
                  <span className="text-xs text-muted-foreground/50 w-16 text-right">{entry.regime}</span>
                  {entry.ok && (
                    <span className="text-[10px] text-emerald-400 font-mono">exec</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
