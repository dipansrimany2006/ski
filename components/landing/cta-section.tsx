"use client";

import { useEffect, useRef, useState } from "react";
import { AsciiCube } from "./ascii-cube";

export function CtaSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.2 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="relative py-32 overflow-hidden">
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        <div
          className={`relative rounded-2xl overflow-hidden transition-all duration-1000 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="absolute inset-0 bg-foreground" />
          <div className="absolute inset-0 grid-pattern opacity-8" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-20 pointer-events-none">
            <AsciiCube className="w-[520px] h-[460px]" />
          </div>

          <div className="relative z-10 px-8 lg:px-16 py-14 lg:py-16">
            <div className="flex items-center justify-between gap-8">
              <div className="max-w-xl">
                <p className="font-mono text-sm text-background/40 mb-4">// YOUR PERSONAL ON-CHAIN CFO</p>

                <h2 className="text-3xl lg:text-5xl font-semibold tracking-tight mb-5 text-background text-balance">
                  Hire your CFO.<br />
                  Free to start.
                </h2>

                <p className="text-lg text-background/60 mb-8 leading-relaxed">
                  Name it, configure it, and let it run. Your AI Chief Financial Officer will
                  watch the markets 24/7, execute trades within your mandate, and explain
                  every single decision it makes.
                </p>

                <div className="flex flex-col sm:flex-row items-start gap-3">
                  <a
                    href="/login"
                    className="rounded-xl bg-background hover:bg-background/90 text-foreground px-6 py-3 text-sm font-semibold transition-colors"
                  >
                    Activate your CFO →
                  </a>
                  <a
                    href="/explore"
                    className="rounded-xl border border-background/20 hover:border-background/40 text-background hover:bg-background/8 px-6 py-3 text-sm font-medium transition-all"
                  >
                    Explore markets first
                  </a>
                </div>

                <p className="text-xs text-background/30 mt-6 font-mono">
                  On-chain · Powered by Stellar · No finance degree needed
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
