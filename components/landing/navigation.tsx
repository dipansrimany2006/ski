"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

export function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? "bg-background/95 backdrop-blur-xl border-b border-border/50" : "bg-transparent"
      }`}
    >
      <nav className="max-w-6xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <a href="/" className="flex items-center gap-2.5 group">
            <Image
              src="/ski-logo.png"
              alt="Ski"
              width={36}
              height={36}
              priority
              className="rounded-xl transition-transform duration-300 group-hover:scale-105"
            />
            <span className="text-base font-bold tracking-tight">Ski</span>
          </a>

          <div className="hidden md:flex items-center gap-1">
            {[
              { name: "How it works", href: "#how-it-works" },
              { name: "Features",     href: "#features" },
              { name: "The engine",   href: "#engine" },
            ].map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="px-3.5 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary/50"
              >
                {link.name}
              </a>
            ))}
          </div>

          <a
            href="/login"
            className="rounded-xl bg-foreground hover:bg-foreground/90 text-background px-4 py-2 text-sm font-semibold transition-colors"
          >
            Start free
          </a>
        </div>
      </nav>
    </header>
  );
}
