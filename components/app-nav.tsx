"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { WalletButton } from "@/components/wallet-button";

// ── Helpers ───────────────────────────────────────────────────────────────────

interface UserProfile {
  display_name: string | null;
  email: string | null;
  agreed_terms_at: string | null;
  agreed_risk_at: string | null;
  cfo_active?: number;
}

const COLORS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#14b8a6"];
function symbolColor(s: string) { return COLORS[s.charCodeAt(0) % COLORS.length]; }

function UserMenu({ user }: { user: UserProfile }) {
  const [open,       setOpen]       = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { logout: privyLogout } = usePrivy();

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    setOpen(false);
    try {
      // Disconnect wallet first, then clear JWT session
      await privyLogout().catch(() => {});
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  const initial = (user.display_name?.[0] ?? user.email?.[0] ?? "U").toUpperCase();
  const done    = user.agreed_terms_at && user.agreed_risk_at;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full font-semibold text-sm text-white transition-colors"
        style={{ background: symbolColor(user.display_name?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase() ?? "U") }}
      >
        {signingOut ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : initial}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-52 overflow-hidden rounded-xl border border-white/10 bg-[#111] shadow-xl">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="truncate text-sm font-medium">{user.display_name ?? "User"}</p>
            <p className="truncate text-xs text-white/40">{user.email}</p>
          </div>
          {!done && (
            <Link href="/onboarding" onClick={() => setOpen(false)} className="flex items-center px-4 py-2.5 text-sm text-white/70 hover:bg-white/5">
              Complete profile
            </Link>
          )}
          <button
            onClick={handleSignOut}
            className="flex w-full items-center px-4 py-2.5 text-sm text-rose-400 hover:bg-white/5 transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: "Explore",   href: "/explore" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Strategy",  href: "/strategy" },
  { label: "CFO",       href: "/cfo" },
];

// ── AppNav ────────────────────────────────────────────────────────────────────

export function AppNav({ active }: { active?: "Explore" | "Portfolio" | "Strategy" | "CFO" }) {
  const [user,        setUser]        = useState<UserProfile | null>(null);
  const [userLoading, setUserLoading] = useState(true);

  useEffect(() => {
    fetch("/api/user")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setUser((d as { user: UserProfile }).user); })
      .catch(() => {})
      .finally(() => setUserLoading(false));
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-xl px-10">
      <div className="mx-auto flex h-16 max-w-screen-2xl items-center justify-between gap-6 px-0">
        {/* Logo + nav */}
        <div className="flex items-center gap-8 shrink-0">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/ski-logo.png" alt="Ski" width={40} height={40} className="rounded-lg" priority />
          </Link>
          <nav className="hidden md:flex items-center gap-0.5">
            {NAV_ITEMS.map(item => (
              <Link
                key={item.label}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  item.label === active
                    ? "bg-white/10 text-white font-medium"
                    : "text-white/50 hover:text-white hover:bg-white/5"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2.5 shrink-0">
          <WalletButton />
          {userLoading ? (
            <div className="h-9 w-9 animate-pulse rounded-full bg-white/5" />
          ) : user ? (
            <UserMenu user={user} />
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
