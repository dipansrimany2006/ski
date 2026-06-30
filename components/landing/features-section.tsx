"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AsciiCube } from "./ascii-cube";

const asciiAnimations = {
  signal: (frame: number) => {
    const bars = ["▁","▂","▃","▄","▅","▆","▇","█"];
    const h = [
      bars[(frame + 0) % bars.length],
      bars[(frame + 2) % bars.length],
      bars[(frame + 5) % bars.length],
      bars[(frame + 3) % bars.length],
      bars[(frame + 6) % bars.length],
      bars[(frame + 1) % bars.length],
    ];
    const sig = (frame % 6 < 3) ? "+0.31" : "+0.28";
    return `BTC/USD  ${sig}\n${h.join(" ")}\nBUY signal`;
  },
  loop: (frame: number) => {
    const steps = ["Signals","Arbitrate","LLM check","Risk size","Execute"];
    const active = frame % steps.length;
    return steps.map((s, i) => `${i === active ? "►" : "○"} ${s}`).join("  ");
  },
  chat: (frame: number) => {
    const c = Math.floor(frame / 3) % 2 === 0 ? "_" : " ";
    return `> Buy $500 of BTC${c}\n\n✓ Executed BTC/USD\n  @ $67,421  qty 0.007`;
  },
  risk: (frame: number) => {
    const levels = ["░░░░░░░░░░","▓▓▓▓▓░░░░░","▓▓░░░░░░░░"];
    const l = levels[frame % levels.length];
    return `Risk level\n[${l}]\nBalanced · draw 20% · pos 20%`;
  },
  portfolio: (frame: number) => {
    const pnl = ["+$412","+$387","+$441","+$398"];
    const p = pnl[frame % pnl.length];
    return `Portfolio value\n$10,${386 + (frame * 11) % 200}\nAll-time P&L  ${p}`;
  },
  log: (frame: number) => {
    const ages = ["now","2m","5m","12m"];
    const a = ages[frame % ages.length];
    return `Decision log\nBUY  BTC  ${a}\nSELL ETH  2m\nBUY  XLM  8m`;
  },
};

const features = [
  {
    icon: "📡",
    title: "Blended signal engine",
    description: "Six strategy families — Momentum, Mean Reversion, Volatility, Volume, Statistical, Smart Money — blended into one conviction score per asset.",
    animationKey: "signal" as const,
  },
  {
    icon: "🔁",
    title: "9-step decision loop",
    description: "Every trade passes through time gates, multi-strategy arbitration, LLM sanity check, Kelly sizing, and mandate validation before execution.",
    animationKey: "loop" as const,
  },
  {
    icon: "💬",
    title: "Talk to your CFO",
    description: "Chat in plain English. \"Buy $500 of BTC\", \"Switch to aggressive risk\", \"Show my portfolio\" — the CFO understands and acts.",
    animationKey: "chat" as const,
  },
  {
    icon: "🛡",
    title: "Risk mandate & circuit breakers",
    description: "Set your risk tolerance once. The mandate guard enforces max drawdown, max position size, and locks in stop-loss / take-profit at entry — never chasing targets.",
    animationKey: "risk" as const,
  },
  {
    icon: "💼",
    title: "Portfolio tracking",
    description: "Live P&L, position sizes, and all-time performance in one view. Every trade the CFO makes updates your portfolio in real time.",
    animationKey: "portfolio" as const,
  },
  {
    icon: "📋",
    title: "Full decision transparency",
    description: "Every decision logged: asset, direction, signal, LLM rationale, whether it was vetoed or blocked — so you always know why the CFO acted.",
    animationKey: "log" as const,
  },
];

function AnimatedAscii({ animationKey }: { animationKey: keyof typeof asciiAnimations }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setFrame((f) => f + 1), 500);
    return () => clearInterval(interval);
  }, []);
  const getAscii = useCallback(() => asciiAnimations[animationKey](frame), [animationKey, frame]);
  return (
    <pre className="font-mono text-xs text-primary leading-relaxed whitespace-pre-wrap break-words">
      {getAscii()}
    </pre>
  );
}

function FeatureCard({ feature, index }: { feature: (typeof features)[0]; index: number }) {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.1 }
    );
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={cardRef}
      className={`flex flex-col rounded-xl border border-border/50 bg-card/30 hover:border-primary/30 hover:bg-card/60 transition-all duration-500 overflow-hidden ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
      style={{ transitionDelay: `${index * 80}ms` }}
    >
      {/* Fixed-height ASCII block */}
      <div className="h-24 px-6 pt-6 overflow-hidden bg-black/20 border-b border-border/30">
        <AnimatedAscii animationKey={feature.animationKey} />
      </div>

      {/* Text content */}
      <div className="px-6 py-5">
        <div className="flex items-center gap-2 mb-2">
          <span>{feature.icon}</span>
          <h3 className="text-base font-semibold">{feature.title}</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
      </div>
    </div>
  );
}

export function FeaturesSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.1 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="features" ref={sectionRef} className="relative py-32 overflow-hidden">
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center mb-20">
          <div>
            <p className="text-sm font-mono text-primary mb-3">// WHAT IT DOES</p>
            <h2 className={`text-3xl lg:text-5xl font-semibold tracking-tight mb-6 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              A CFO that never<br />
              <span className="text-balance">sleeps or second-guesses.</span>
            </h2>
            <p className={`text-lg text-muted-foreground leading-relaxed transition-all duration-700 delay-100 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              Ski builds a complete trading agent around your risk profile — six strategy families,
              an LLM sanity layer, and hard mandate guardrails. You set the philosophy, it runs the execution.
            </p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <AsciiCube className="w-[420px] h-[560px]" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature, index) => (
            <FeatureCard key={feature.title} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
