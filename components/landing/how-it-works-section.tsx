"use client";

import { useEffect, useRef, useState } from "react";

const steps = [
  {
    number: "01",
    title: "Name your CFO & set your philosophy",
    description: "Give your CFO a name, pick a risk tolerance (conservative, balanced, or aggressive), set your investment goal and time horizon. The mandate is locked in — the CFO never exceeds it.",
    preview: `cfo.setProfile({
  name:      "Ski",
  risk:      "balanced",
  goal:      "growth",
  horizon:   "medium",
  maxDraw:   0.20,   // 20% max drawdown
  maxPos:    0.20,   // 20% max position
})`,
  },
  {
    number: "02",
    title: "Configure your watchlist",
    description: "Tell the CFO which assets to track — BTC, ETH, SOL, stocks, anything on Pyth. You can update the watchlist anytime, or just tell it in chat: \"Add AVAX to the watchlist.\"",
    preview: `cfo.watchlist([
  "BTC/USD",
  "ETH/USD",
  "SOL/USD",
  "XLM/USD",
  "AAPL/USD",
])`,
  },
  {
    number: "03",
    title: "CFO runs a 9-step analysis cycle",
    description: "On every run: time gates → 6-family strategy ensemble → signal arbitration → LLM sanity check → Kelly position sizing → mandate guard → paper execution → SL/TP monitor.",
    preview: `// Inside every cycle:
[✓] Time & session gates
[✓] 6-family signal blend
[✓] Arbitration + regime
[✓] LLM veto check
[✓] Kelly sizing
[✓] Mandate guard
[→] Execute trade`,
  },
  {
    number: "04",
    title: "Review every decision",
    description: "The decision log shows every asset analyzed: the signal score, the regime, whether the LLM passed or vetoed, whether the mandate approved or blocked — and the full rationale.",
    preview: `// Decision log entry:
{
  symbol:   "BTC/USD",
  action:   "buy",
  signal:   +0.31,
  regime:   "trending",
  llm:      "pass",
  mandate:  "approved",
  size_usd: 500,
  executed: true,
}`,
  },
];

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightCode(line: string): string {
  const commentIdx = line.indexOf("//");
  const code = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
  const comment = commentIdx >= 0 ? line.slice(commentIdx) : "";

  const tokenRe = /('[^']*'|"[^"]*")|\b(cfo|true|false|null)\b|([{}()[\]:,])/g;
  let html = "";
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = tokenRe.exec(code)) !== null) {
    if (m.index > last) html += escapeHtml(code.slice(last, m.index));
    if (m[1]) html += `<span class="text-green-400">${escapeHtml(m[1])}</span>`;
    else if (m[2]) html += `<span class="text-primary">${escapeHtml(m[2])}</span>`;
    else if (m[3]) html += `<span class="text-muted-foreground/60">${escapeHtml(m[3])}</span>`;
    last = tokenRe.lastIndex;
  }
  if (last < code.length) html += escapeHtml(code.slice(last));
  if (comment) html += `<span class="text-muted-foreground/40">${escapeHtml(comment)}</span>`;
  return html;
}

export function HowItWorksSection() {
  const [activeStep, setActiveStep] = useState(0);
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

  useEffect(() => {
    const interval = setInterval(() => setActiveStep((prev) => (prev + 1) % steps.length), 4500);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="how-it-works" ref={sectionRef} className="relative py-32 overflow-hidden bg-secondary/20">
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        <div className="mb-16">
          <p className="text-sm font-mono text-primary mb-3">// HOW IT WORKS</p>
          <h2 className={`text-3xl lg:text-5xl font-semibold tracking-tight mb-4 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            From profile to<br />
            <span className="text-balance">live decisions in minutes.</span>
          </h2>
          <p className={`text-lg text-muted-foreground max-w-xl transition-all duration-700 delay-100 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            Four steps to get your CFO running. The whole setup takes under five minutes.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Steps */}
          <div className="space-y-2">
            {steps.map((step, index) => (
              <button
                key={step.number}
                type="button"
                onClick={() => setActiveStep(index)}
                className={`w-full text-left p-5 rounded-xl border transition-all duration-300 ${
                  activeStep === index
                    ? "bg-card border-primary/40"
                    : "bg-transparent border-transparent hover:bg-card/40"
                }`}
              >
                <div className="flex items-start gap-4">
                  <span className={`font-mono text-sm shrink-0 mt-0.5 transition-colors ${activeStep === index ? "text-primary" : "text-muted-foreground/40"}`}>
                    {step.number}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-base font-semibold mb-1 transition-colors ${activeStep === index ? "text-foreground" : "text-muted-foreground"}`}>
                      {step.title}
                    </h3>
                    <p className={`text-sm leading-relaxed transition-colors ${activeStep === index ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
                      {step.description}
                    </p>
                  </div>
                </div>

                {activeStep === index && (
                  <div className="mt-3 ml-10">
                    <div className="h-0.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ animation: "progress 4.5s linear forwards" }}
                      />
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Code preview */}
          <div className="lg:sticky lg:top-28">
            <div className="rounded-xl overflow-hidden border border-border bg-card shadow-lg">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-secondary/20">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/20" />
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/20" />
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/20" />
                </div>
                <span className="text-xs font-mono text-muted-foreground">cfo.ts · step {steps[activeStep].number}</span>
              </div>

              <div className="p-6 font-mono text-sm min-h-[220px]">
                <pre className="text-muted-foreground">
                  {steps[activeStep].preview.split("\n").map((line, i) => (
                    <div
                      key={`${activeStep}-${i}`}
                      className="leading-relaxed animate-in fade-in slide-in-from-bottom-1"
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <span className="text-muted-foreground/30 select-none w-6 inline-block text-right mr-3">{i + 1}</span>
                      <span dangerouslySetInnerHTML={{ __html: highlightCode(line) }} />
                    </div>
                  ))}
                </pre>
              </div>

              <div className="border-t border-border px-4 py-3 bg-secondary/10 flex items-center gap-2 font-mono text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-emerald-500">CFO running</span>
                <span className="text-muted-foreground/40 ml-auto">step {activeStep + 1}/{steps.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes progress { from { width: 0%; } to { width: 100%; } }
      `}</style>
    </section>
  );
}
