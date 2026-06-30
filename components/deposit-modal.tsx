"use client";

import { useState, useEffect } from "react";

type Step = "amount" | "confirm" | "crediting" | "success" | "error";

interface DepositModalProps {
  open:      boolean;
  onClose:   () => void;
  onSuccess: (newBalanceUsd: number, amount: number) => void;
}

const QUICK_AMOUNTS = [500, 1000, 5000, 10000];

export function DepositModal({ open, onClose, onSuccess }: DepositModalProps) {
  const [step,      setStep]      = useState<Step>("amount");
  const [rawAmount, setRawAmount] = useState("");
  const [errorMsg,  setErrorMsg]  = useState("");
  const [newBalUsd, setNewBalUsd] = useState(0);

  const usdAmount = parseFloat(rawAmount) || 0;

  useEffect(() => {
    if (open) { setStep("amount"); setRawAmount(""); setErrorMsg(""); }
  }, [open]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  async function handleDeposit() {
    if (usdAmount <= 0) return;
    setStep("crediting");
    setErrorMsg("");

    try {
      const res  = await fetch("/api/paper/deposit", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ usdAmount }),
      });
      const data = await res.json() as { ok?: boolean; newBalanceUsd?: number; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Deposit failed");

      setNewBalUsd(data.newBalanceUsd ?? 0);
      setStep("success");
      onSuccess(data.newBalanceUsd ?? 0, usdAmount);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-[420px] rounded-2xl border border-white/10 bg-[#080808] shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">$</span>
            </div>
            <div>
              <h2 className="text-sm font-semibold leading-tight">Add Paper Funds</h2>
              <p className="text-[11px] text-white/30 mt-0.5">Paper trading · USD</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/8 transition-all text-sm">✕</button>
        </div>

        <div className="px-6 py-5">

          {/* ── Amount ─────────────────────────────────────────────────── */}
          {step === "amount" && (
            <div className="space-y-4">
              <div>
                <p className="text-[11px] text-white/35 mb-2 uppercase tracking-widest">Amount (USD)</p>
                <div className="relative rounded-xl bg-white/[0.04] border border-white/10 focus-within:border-white/20 transition-colors">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-white/30">$</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={rawAmount}
                    onChange={e => setRawAmount(e.target.value)}
                    placeholder="0"
                    className="w-full bg-transparent pl-8 pr-4 py-4 text-2xl font-semibold text-white placeholder:text-white/15 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {QUICK_AMOUNTS.map(n => (
                  <button
                    key={n}
                    onClick={() => setRawAmount(String(n))}
                    className={`rounded-lg py-2 text-xs font-medium transition-all border ${
                      usdAmount === n
                        ? "border-primary/60 bg-primary/15 text-primary"
                        : "border-white/8 bg-white/[0.03] text-white/40 hover:text-white/70 hover:bg-white/[0.06]"
                    }`}
                  >
                    ${n >= 1000 ? `${n/1000}k` : n}
                  </button>
                ))}
              </div>

              <div className="rounded-xl bg-white/[0.025] border border-white/6 divide-y divide-white/6">
                {[
                  { label: "Type",       value: "Paper trading funds" },
                  { label: "Managed by", value: "Your AI CFO" },
                  { label: "Network",    value: "Stellar (paper mode)" },
                ].map(r => (
                  <div key={r.label} className="flex justify-between items-center px-4 py-2.5 text-xs">
                    <span className="text-white/35">{r.label}</span>
                    <span className="text-white/70">{r.value}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStep("confirm")}
                disabled={usdAmount <= 0}
                className="w-full rounded-xl bg-foreground hover:bg-foreground/90 text-background py-3 text-sm font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Review
              </button>
            </div>
          )}

          {/* ── Confirm ────────────────────────────────────────────────── */}
          {step === "confirm" && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-primary/8 border border-primary/20 px-5 py-5 text-center">
                <p className="text-3xl font-bold text-white">${usdAmount.toLocaleString()}</p>
                <p className="text-sm text-white/35 mt-1">Paper trading USD</p>
              </div>

              <p className="text-[11px] text-white/25 text-center leading-relaxed px-2">
                This adds virtual USD to your paper account. No real money or blockchain transaction is involved.
              </p>

              <div className="flex gap-2.5">
                <button onClick={() => setStep("amount")} className="flex-1 rounded-xl border border-white/10 py-3 text-sm text-white/45 hover:bg-white/5 transition-colors">
                  Back
                </button>
                <button onClick={handleDeposit} className="flex-1 rounded-xl bg-foreground hover:bg-foreground/90 text-background py-3 text-sm font-semibold transition-colors">
                  Confirm
                </button>
              </div>
            </div>
          )}

          {/* ── Crediting ──────────────────────────────────────────────── */}
          {step === "crediting" && (
            <div className="py-10 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full border border-primary/30 bg-primary/8 flex items-center justify-center">
                <span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin inline-block" />
              </div>
              <div>
                <p className="font-semibold text-sm">Crediting account…</p>
              </div>
            </div>
          )}

          {/* ── Success ────────────────────────────────────────────────── */}
          {step === "success" && (
            <div className="py-6 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/12 border border-emerald-500/30 flex items-center justify-center text-xl">
                ✓
              </div>
              <div>
                <p className="font-semibold text-base">Funds added</p>
                <p className="text-sm text-white/40 mt-1">
                  ${usdAmount.toLocaleString()} added · new balance ${newBalUsd.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <button onClick={onClose} className="w-full rounded-xl bg-foreground hover:bg-foreground/90 text-background py-3 text-sm font-semibold transition-colors">
                Done
              </button>
            </div>
          )}

          {/* ── Error ──────────────────────────────────────────────────── */}
          {step === "error" && (
            <div className="py-8 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-xl">✕</div>
              <div>
                <p className="font-semibold text-sm">Deposit failed</p>
                <p className="text-xs text-white/35 mt-1 px-4 leading-relaxed">{errorMsg || "Something went wrong."}</p>
              </div>
              <div className="flex gap-2.5">
                <button onClick={onClose} className="flex-1 rounded-xl border border-white/10 py-3 text-sm text-white/45 hover:bg-white/5 transition-colors">Cancel</button>
                <button onClick={() => setStep("amount")} className="flex-1 rounded-xl bg-foreground hover:bg-foreground/90 text-background py-3 text-sm font-semibold transition-colors">Try again</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
