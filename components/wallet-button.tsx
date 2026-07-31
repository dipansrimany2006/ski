"use client";

import { isConnected, requestAccess, getAddress } from "@stellar/freighter-api";
import { useEffect, useRef, useState } from "react";

type FreighterState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "disconnected" }
  | { status: "connected"; address: string };

const LS_KEY = "ski_freighter_address";

export function WalletButton() {
  const [state, setState] = useState<FreighterState>({ status: "loading" });
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // On mount: check if Freighter is installed, then restore a saved session.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const { isConnected: installed } = await isConnected();
      if (cancelled) return;

      if (!installed) {
        setState({ status: "unavailable" });
        return;
      }

      // Try to restore the previously connected address silently (no popup).
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const result = await getAddress();
        if (!cancelled) {
          if (!result.error && result.address) {
            setState({ status: "connected", address: result.address });
            return;
          }
          localStorage.removeItem(LS_KEY);
        }
      }

      if (!cancelled) setState({ status: "disconnected" });
    }
    init();
    return () => { cancelled = true; };
  }, []);

  async function connect() {
    const result = await requestAccess();
    if (result.error) {
      // user rejected or Freighter error — stay disconnected
      return;
    }
    localStorage.setItem(LS_KEY, result.address);
    setState({ status: "connected", address: result.address });
  }

  function disconnect() {
    localStorage.removeItem(LS_KEY);
    setState({ status: "disconnected" });
    setOpen(false);
  }

  async function copyAddress(address: string) {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (state.status === "loading") {
    return <div className="h-9 w-36 animate-pulse rounded-lg bg-white/5" />;
  }

  if (state.status === "unavailable") {
    return (
      <a
        href="https://freighter.app"
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white/80"
      >
        Install Freighter ↗
      </a>
    );
  }

  if (state.status === "connected") {
    const { address } = state;
    const short = `${address.slice(0, 6)}…${address.slice(-4)}`;

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
          <div className="absolute right-0 top-11 z-50 w-52 overflow-hidden rounded-xl border border-white/10 bg-[#111] shadow-xl">
            <button
              onClick={() => copyAddress(address)}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-white/80 transition-colors hover:bg-white/5"
            >
              {copied ? (
                <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <svg className="h-4 w-4 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
              {copied ? "Copied!" : "Copy Address"}
            </button>

            <div className="border-t border-white/5" />

            <a
              href={`https://stellar.expert/explorer/testnet/account/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-white/60 transition-colors hover:bg-white/5"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
              </svg>
              View on Explorer
            </a>

            <div className="border-t border-white/5" />

            <button
              onClick={disconnect}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-rose-400 transition-colors hover:bg-white/5"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  // status === "disconnected"
  return (
    <button
      onClick={connect}
      className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10"
    >
      Connect Wallet
    </button>
  );
}
