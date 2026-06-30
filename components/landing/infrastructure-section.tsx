"use client";

import { useEffect, useState, useRef } from "react";
import { AsciiDna } from "./ascii-dna";

const LOOP_STEPS = [
  {
    step: "01",
    name: "Time gates",
    detail: "Session & day-of-week filters. No trading during illiquid hours.",
    icon: "🕐",
  },
  {
    step: "02",
    name: "Strategy ensemble",
    detail: "6 families run independently. Signals normalised to [-1, +1].",
    icon: "📡",
  },
  {
    step: "03",
    name: "Arbitration",
    detail: "Signals blended by weight, ADX regime detected, direction resolved.",
    icon: "⚖️",
  },
  {
    step: "04",
    name: "LLM sanity check",
    detail: "Fast LLM veto layer. Only overrides obvious contradictions — defaults to pass.",
    icon: "🧠",
  },
  {
    step: "05",
    name: "Kelly sizing",
    detail: "Position sized by win rate, edge, and vol-scaling. Capped by mandate.",
    icon: "📐",
  },
  {
    step: "06",
    name: "Mandate guard",
    detail: "Max drawdown, max position, circuit breaker — hard stops, no exceptions.",
    icon: "🛡",
  },
  {
    step: "07",
    name: "Execution",
    detail: "Trade executed. SL & TP locked at entry price, never recalculated.",
    icon: "⚡",
  },
  {
    step: "08",
    name: "Monitor",
    detail: "Open positions watched. SL/TP triggers close positions automatically.",
    icon: "👁",
  },
  {
    step: "09",
    name: "Log & learn",
    detail: "Decision written to DB with full rationale, signal, and outcome flags.",
    icon: "📋",
  },
];

export function InfrastructureSection() {
  const [isVisible, setIsVisible] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.1 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    const t = setInterval(() => setActiveStep(s => (s + 1) % LOOP_STEPS.length), 900);
    return () => clearInterval(t);
  }, [isVisible]);

  return (
    <section id="engine" ref={sectionRef} className="relative py-32 bg-secondary/20 overflow-hidden">
      <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-8 pointer-events-none">
        <AsciiDna className="w-[500px] h-[480px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          {/* Left */}
          <div className={`transition-all duration-700 ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"}`}>
            <p className="text-sm font-mono text-primary mb-4">// THE DECISION ENGINE</p>
            <h2 className="text-4xl lg:text-5xl font-semibold tracking-tight mb-6 text-balance">
              9 steps between<br />signal and trade.
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-10">
              Every decision your CFO makes passes through a rigid 9-step loop — no shortcuts, no
              guessing. Signal generation, arbitration, LLM veto, Kelly sizing, and mandate
              enforcement all happen before a single paper dollar moves.
            </p>

            <div className="space-y-3">
              {[
                { label: "Hard mandate limits",   detail: "Max drawdown and position caps enforced before every trade" },
                { label: "SL/TP locked at entry", detail: "Stop-loss and take-profit never move after a position opens" },
                { label: "Circuit breaker",       detail: "CFO auto-deactivates if daily loss exceeds your threshold" },
                { label: "LLM veto, not veto-first", detail: "LLM only blocks obvious contradictions — never overrides math" },
              ].map(item => (
                <div key={item.label} className="flex items-start gap-3">
                  <span className="text-primary mt-0.5 shrink-0">✓</span>
                  <div>
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className="text-sm text-muted-foreground"> — {item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: animated loop */}
          <div className={`transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border bg-secondary/20 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-xs text-muted-foreground">cfo-loop · running</span>
              </div>

              <div className="p-4 space-y-1">
                {LOOP_STEPS.map((s, i) => {
                  const isPast    = i < activeStep;
                  const isCurrent = i === activeStep;
                  return (
                    <div
                      key={s.step}
                      className={`flex items-start gap-3 rounded-lg px-3 py-2.5 transition-all duration-300 ${
                        isCurrent ? "bg-primary/8 border border-primary/20"
                        : isPast  ? "opacity-40"
                        : "opacity-20"
                      }`}
                    >
                      <span className="font-mono text-[11px] text-muted-foreground/60 w-5 shrink-0 mt-0.5">
                        {isPast ? "✓" : s.step}
                      </span>
                      <span className="text-sm mr-1">{s.icon}</span>
                      <div className="min-w-0">
                        <span className={`text-sm font-medium ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}>
                          {s.name}
                        </span>
                        {isCurrent && (
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed animate-in fade-in">
                            {s.detail}
                          </p>
                        )}
                      </div>
                      {isCurrent && (
                        <span className="ml-auto shrink-0">
                          <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin inline-block" />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
