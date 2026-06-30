"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useRef, useState } from "react";

export function WalletButton() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!ready) {
    return <div className="h-9 w-36 animate-pulse rounded-lg bg-white/5" />;
  }

  if (authenticated && wallets.length > 0) {
    const wallet = wallets[0];
    const addr = wallet.address;
    const short = `${addr.slice(0, 6)}…${addr.slice(-4)}`;

    async function copyAddress() {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }

    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="font-mono text-xs">{short}</span>
          <svg
            className={`h-3 w-3 text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div className="absolute right-0 top-11 z-50 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#111] shadow-xl">
            <button
              onClick={copyAddress}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-white/80 transition-colors hover:bg-white/5"
            >
              {copied ? (
                <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <svg className="h-4 w-4 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
              {copied ? "Copied!" : "Copy Address"}
            </button>

            <div className="border-t border-white/5" />

            <button
              onClick={() => { setOpen(false); logout(); }}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-rose-400 transition-colors hover:bg-white/5"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              Disconnect Wallet
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => login()}
      className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
    >
      Connect Wallet
    </button>
  );
}
