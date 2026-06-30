"use client";

import Image from "next/image";

const footerLinks = {
  Platform: [
    { name: "Explore markets", href: "/explore" },
    { name: "Portfolio",       href: "/portfolio" },
    { name: "CFO agent",       href: "/cfo" },
  ],
  "How it works": [
    { name: "Features",     href: "#features" },
    { name: "Decision loop", href: "#engine" },
    { name: "How it works", href: "#how-it-works" },
  ],
  Account: [
    { name: "Sign in",    href: "/login" },
    { name: "Get started", href: "/login" },
  ],
};

export function FooterSection() {
  return (
    <footer className="relative border-t border-border">
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        <div className="py-14">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            {/* Brand */}
            <div className="col-span-2">
              <a href="/" className="flex items-center gap-2.5 mb-5">
                <Image src="/ski-logo.png" alt="Ski" width={32} height={32} className="rounded-lg" />
                <span className="font-bold text-base tracking-tight">Ski</span>
              </a>
              <p className="text-sm text-muted-foreground leading-relaxed mb-1">
                Your personal on-chain CFO.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                An AI agent that reads the markets, sizes positions within your risk mandate,
                and executes trades — 24/7.
              </p>
            </div>

            {/* Links */}
            {Object.entries(footerLinks).map(([title, links]) => (
              <div key={title}>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/50 mb-4">
                  {title}
                </h3>
                <ul className="space-y-3">
                  {links.map((link) => (
                    <li key={link.name}>
                      <a
                        href={link.href}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="py-5 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground/50">
            © 2026 Ski. Not financial advice.
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            CFO online
          </div>
        </div>
      </div>
    </footer>
  );
}
