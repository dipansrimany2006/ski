"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { AppNav } from "@/components/app-nav";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Position {
  id: string;
  asset_id: string;
  symbol: string;
  display_symbol: string;
  name: string;
  category: string;
  quantity: number;
  avg_buy_price: number;
}

interface Trade {
  id: string;
  symbol: string;
  display_symbol: string;
  name: string;
  trade_type: "buy" | "sell";
  quantity: number;
  price: number;
  total: number;
  created_at: string;
}

interface Portfolio {
  balance: number;
  positions: Position[];
  trades: Trade[];
}

interface LiveData {
  price: number;
  change24h: number;
  logo: string;
}

interface AgentWallet {
  address: string;
  balanceXLM: number;
  xlmPriceUsd: number;
  explorerUrl: string;
}

interface FreighterBalance {
  asset: string;
  issuer: string | null;
  balance: number;
  valueUsd?: number;
  priceUsd?: number;
  change24h?: number;
  logo?: string;
}

interface FreighterWallet {
  address: string;
  balances: FreighterBalance[];
  explorerUrl: string;
  xlmPriceUsd: number;
}

type Tab = "chart" | "allocation" | "statistics";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, opts?: { digits?: number }): string {
  if (!Number.isFinite(n)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: opts?.digits ?? (Math.abs(n) >= 1 ? 2 : 6),
  }).format(n);
}

function fmtQty(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)     return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return n < 0.01 ? n.toFixed(6) : n.toFixed(4);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const PALETTE = ["#10b981","#8b5cf6","#f59e0b","#3b82f6","#ec4899","#6366f1","#ef4444","#14b8a6"];
function assetColor(sym: string, idx: number) { return PALETTE[idx % PALETTE.length]; }

function AssetLogo({ symbol, logo, color, size = 36 }: { symbol: string; logo: string; color: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (!logo || err) {
    return (
      <div className="rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white"
        style={{ width: size, height: size, background: color }}>
        {symbol.slice(0, 2)}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={logo} alt={symbol} width={size} height={size} onError={() => setErr(true)} className="rounded-full shrink-0" style={{ width: size, height: size }} />;
}

function buildChartData(trades: Trade[], balance: number): { label: string; value: number }[] {
  const now = Date.now();
  const sorted = [...trades].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const points: { label: string; value: number }[] = [];
  const startTime = sorted.length ? new Date(sorted[0].created_at).getTime() - 60_000 : now - 3_600_000;
  points.push({ label: new Date(startTime).toLocaleDateString(), value: 10_000 });
  let running = 10_000;
  for (const t of sorted) {
    running += t.trade_type === "sell" ? t.total : -t.total;
    points.push({ label: new Date(t.created_at).toLocaleDateString(), value: Math.max(0, running) });
  }
  points.push({ label: new Date().toLocaleDateString(), value: balance });
  return points;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatChip({ label, pct, usd, positive }: { label: string; pct: number; usd: number; positive: boolean }) {
  return (
    <div>
      <p className="text-xs text-white/40 mb-0.5">{label}</p>
      <p className={`text-sm font-semibold ${positive ? "text-emerald-400" : "text-rose-400"}`}>
        {positive ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}% ({positive ? "+" : ""}{fmt(usd)})
      </p>
    </div>
  );
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { value: number }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#111] px-3 py-2 text-xs shadow-xl">
      <p className="text-white font-semibold">{fmt(payload[0].value)}</p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const router = useRouter();
  const [portfolio,    setPortfolio]    = useState<Portfolio | null>(null);
  const [liveData,     setLiveData]     = useState<Map<string, LiveData>>(new Map());
  const [loading,      setLoading]      = useState(true);
  const [authed,       setAuthed]       = useState(true);
  const [tab,          setTab]          = useState<Tab>("allocation");
  const [actionMenu,   setActionMenu]   = useState<string | null>(null);
  const [portfolioErr, setPortfolioErr] = useState("");

  // Agent wallet (Stellar Testnet)
  const [agentWallet,   setAgentWallet]   = useState<AgentWallet | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  // On-chain mandate (Soroban / Stellar testnet)
  type MandateStatus = "idle" | "loading" | "registered" | "none" | "registering" | "error";
  const [mandateStatus,  setMandateStatus]  = useState<MandateStatus>("idle");
  const [mandateData,    setMandateData]    = useState<{ contractId: string; explorerUrl: string; action?: string } | null>(null);
  const [mandateError,   setMandateError]   = useState("");

  // Freighter wallet
  const [freighterWallet,   setFreighterWallet]   = useState<FreighterWallet | null>(null);
  const [freighterLoading,  setFreighterLoading]  = useState(false);
  const [freighterAddr,     setFreighterAddr]      = useState<string | null>(null);

  // Deposit modal
  const [depositOpen,   setDepositOpen]   = useState(false);
  type DepositStep = "form" | "creating" | "pending" | "confirming" | "success" | "error";
  const [depositStep,   setDepositStep]   = useState<DepositStep>("form");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositTxHash, setDepositTxHash] = useState("");
  const [depositError,  setDepositError]  = useState("");
  const [depositedXlm,  setDepositedXlm]  = useState(0);

  useEffect(() => {
    fetch("/api/paper/portfolio")
      .then(async r => {
        if (r.status === 401) { setAuthed(false); return null; }
        const body = await r.json().catch(() => null) as (Portfolio & { error?: string }) | null;
        if (!r.ok) {
          setPortfolioErr((body as { error?: string } | null)?.error ?? `Server error ${r.status}`);
          return null;
        }
        return body;
      })
      .then(d => {
        if (!d) return;
        setPortfolio(d);
        if (d.positions.length > 0) {
          Promise.all(
            d.positions.map(pos =>
              fetch(`/api/asset/${pos.display_symbol.replace("/", "-")}`)
                .then(r => r.ok ? r.json() : null)
                .then(a => {
                  const asset = (a as { asset?: { priceUsd: number; change24h: number; logo: string } } | null)?.asset;
                  return asset ? [pos.display_symbol, { price: asset.priceUsd, change24h: asset.change24h, logo: asset.logo ?? "" }] as [string, LiveData] : null;
                })
                .catch(() => null)
            )
          ).then(results => {
            const map = new Map<string, LiveData>();
            for (const r of results) if (r) map.set(r[0], r[1]);
            setLiveData(map);
          });
        }
      })
      .catch(err => setPortfolioErr(String(err)))
      .finally(() => setLoading(false));

    // Load agent wallet
    loadAgentWallet();

    // Load on-chain mandate status
    loadMandate();

    // Load Freighter wallet (address stored in localStorage by wallet-button)
    const saved = localStorage.getItem("ski_freighter_address");
    setFreighterAddr(saved);
    if (saved) loadFreighterWallet(saved);

    // Keep in sync when user connects/disconnects from the nav
    function onStorage(e: StorageEvent) {
      if (e.key !== "ski_freighter_address") return;
      const addr = e.newValue;
      setFreighterAddr(addr);
      if (addr) loadFreighterWallet(addr);
      else setFreighterWallet(null);
    }
    window.addEventListener("storage", onStorage);

    const handler = () => setActionMenu(null);
    document.addEventListener("click", handler);
    return () => {
      document.removeEventListener("click", handler);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  async function loadAgentWallet() {
    setWalletLoading(true);
    try {
      const res = await fetch("/api/cfo/wallet");
      if (!res.ok) return;
      const data = await res.json() as { wallet?: { address: string; balanceXLM?: number; explorerUrl?: string } | null };
      if (!data.wallet?.address) return;

      const address = data.wallet.address;

      // Fetch live XLM price alongside the Stellar testnet balance.
      const [balRes, xlmRes] = await Promise.all([
        fetch(`/api/portfolio/stellar-balance?address=${address}`).then(r => r.ok ? r.json() : null),
        fetch("/api/asset/XLM-USD").then(r => r.ok ? r.json() : null),
      ]);

      const balanceXLM  = (balRes as { xlmBalance?: number } | null)?.xlmBalance ?? 0;
      const xlmPriceUsd = (xlmRes as { asset?: { priceUsd: number } } | null)?.asset?.priceUsd ?? 0;

      setAgentWallet({
        address,
        balanceXLM,
        xlmPriceUsd,
        explorerUrl: `https://stellar.expert/explorer/testnet/account/${address}`,
      });
    } catch {
      // wallet not available
    } finally {
      setWalletLoading(false);
    }
  }

  async function loadMandate() {
    setMandateStatus("loading");
    try {
      const res  = await fetch("/api/soroban/mandate");
      const data = await res.json() as { mandate: unknown; contractId: string; explorerUrl: string };
      setMandateData({ contractId: data.contractId, explorerUrl: data.explorerUrl });
      setMandateStatus(data.mandate ? "registered" : "none");
    } catch {
      setMandateStatus("none");
    }
  }

  async function loadFreighterWallet(address: string) {
    setFreighterLoading(true);
    try {
      const balRes = await fetch(`/api/portfolio/stellar-balance?address=${encodeURIComponent(address)}`).then(r => r.ok ? r.json() : null);
      const rawBalances = (balRes as { balances?: { asset: string; issuer: string | null; balance: number }[] } | null)?.balances ?? [];

      const balances: FreighterBalance[] = await Promise.all(
        rawBalances.map(async b => {
          try {
            const slug = `${b.asset}-USD`;
            const assetRes = await fetch(`/api/asset/${slug}`).then(r => r.ok ? r.json() : null);
            const assetData = (assetRes as { asset?: { priceUsd: number; change24h: number; logo: string } } | null)?.asset;
            return {
              ...b,
              priceUsd: assetData?.priceUsd,
              change24h: assetData?.change24h,
              logo: assetData?.logo,
              valueUsd: assetData?.priceUsd ? b.balance * assetData.priceUsd : undefined,
            };
          } catch {
            return { ...b };
          }
        })
      );

      const xlmPriceUsd = balances.find(b => b.asset === "XLM")?.priceUsd ?? 0;

      setFreighterWallet({
        address,
        balances,
        explorerUrl: `https://stellar.expert/explorer/testnet/account/${address}`,
        xlmPriceUsd,
      });
    } catch {
      // wallet data unavailable — don't crash the page
    } finally {
      setFreighterLoading(false);
    }
  }

  async function registerOnChainMandate() {
    setMandateStatus("registering");
    setMandateError("");
    try {
      const res  = await fetch("/api/soroban/mandate", { method: "POST" });
      const data = await res.json() as { ok?: boolean; error?: string; contractId: string; explorerUrl: string; action?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to register mandate.");
      setMandateData({ contractId: data.contractId, explorerUrl: data.explorerUrl, action: data.action });
      setMandateStatus("registered");
    } catch (err) {
      setMandateError(err instanceof Error ? err.message : "Error registering mandate.");
      setMandateStatus("error");
    }
  }

  async function ensureWallet(): Promise<string | null> {
    if (agentWallet?.address) return agentWallet.address;
    const res  = await fetch("/api/cfo/wallet", { method: "POST" });
    const data = await res.json() as { address?: string };
    if (data.address) { await loadAgentWallet(); return data.address; }
    return null;
  }

  async function handleDeposit() {
    setDepositError("");
    let toAddress = agentWallet?.address ?? null;

    if (!toAddress) {
      setDepositStep("creating");
      toAddress = await ensureWallet();
      if (!toAddress) { setDepositError("Could not create wallet."); setDepositStep("error"); return; }
    }

    setDepositStep("pending");
    try {
      const res  = await fetch("/api/cfo/fund", { method: "POST" });
      const data = await res.json() as { ok?: boolean; balanceXLM?: number; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Friendbot funding failed.");
      setDepositedXlm(data.balanceXLM ?? 10_000);
      setDepositStep("success");
      setTimeout(() => loadAgentWallet(), 2000);
    } catch (err) {
      setDepositError(err instanceof Error ? err.message : "Funding failed.");
      setDepositStep("error");
    }
  }

  function openDeposit() {
    setDepositStep("form");
    setDepositAmount("");
    setDepositTxHash("");
    setDepositError("");
    setDepositOpen(true);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const positions = portfolio?.positions ?? [];
  const trades    = portfolio?.trades    ?? [];

  // Freighter wallet totals (primary balance source)
  const freighterTotalUsd = useMemo(() =>
    (freighterWallet?.balances ?? []).reduce((s, b) => s + (b.valueUsd ?? 0), 0),
  [freighterWallet]);

  const freighter24hChangeUsd = useMemo(() =>
    (freighterWallet?.balances ?? []).reduce((s, b) => {
      if (b.valueUsd === undefined || b.change24h === undefined) return s;
      return s + b.valueUsd * (b.change24h / 100);
    }, 0),
  [freighterWallet]);

  const freighter24hChangePct = freighterTotalUsd > 0 ? (freighter24hChangeUsd / freighterTotalUsd) * 100 : 0;

  // Allocation from freighter balances
  const allocItems = useMemo(() => {
    if (!freighterWallet || freighterTotalUsd === 0) return [];
    return freighterWallet.balances
      .filter(b => (b.valueUsd ?? 0) > 0)
      .map((b, i) => ({
        label: b.asset,
        pct: ((b.valueUsd ?? 0) / freighterTotalUsd) * 100,
        color: PALETTE[i % PALETTE.length],
      }))
      .filter(i => i.pct > 0.1)
      .sort((a, b) => b.pct - a.pct);
  }, [freighterWallet, freighterTotalUsd]);

  const chartData = useMemo(() => buildChartData(trades, portfolio?.balance ?? 0), [trades, portfolio]);
  const chartMin  = useMemo(() => Math.min(...chartData.map(d => d.value)) * 0.998, [chartData]);
  const chartMax  = useMemo(() => Math.max(...chartData.map(d => d.value)) * 1.002, [chartData]);

  // ── Unauthenticated ───────────────────────────────────────────────────────

  if (!authed) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <AppNav active="Portfolio" />
        <main className="mx-auto max-w-4xl px-6 py-32 text-center">
          <p className="text-white/40 mb-6">Sign in to view your portfolio</p>
          <Link href="/login" className="rounded-2xl bg-white text-black px-8 py-3 text-sm font-semibold">Sign In</Link>
        </main>
      </div>
    );
  }

  const pos24Up = freighter24hChangeUsd >= 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav active="Portfolio" />

      <main className="mx-auto max-w-6xl px-8 py-8">

        {/* ── Page title ──────────────────────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight">Portfolio</h1>
          <p className="text-white/30 text-sm mt-1 italic">
            Updated on {fmtDate(new Date().toISOString())}
          </p>
        </div>

        {/* ── Error banner ────────────────────────────────────────────────── */}
        {portfolioErr && (
          <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/5 px-5 py-4">
            <p className="text-xs font-semibold text-rose-400 uppercase tracking-wide mb-1">Portfolio fetch error</p>
            <p className="text-xs text-rose-300/70 font-mono break-all">{portfolioErr}</p>
          </div>
        )}

        {/* ── Balance row ─────────────────────────────────────────────────── */}
        <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
          <div>
            <p className="text-xs text-white/40 mb-1 flex items-center gap-1">
              Current balance
              <span className="text-white/20 text-[10px] border border-white/15 rounded-full w-4 h-4 flex items-center justify-center leading-none">i</span>
            </p>
            {freighterLoading ? (
              <div className="h-12 w-56 animate-pulse rounded-xl bg-white/5" />
            ) : !freighterAddr ? (
              <div>
                <p className="text-2xl font-semibold text-white/30">—</p>
                <p className="text-sm text-white/30 mt-1">Connect your Freighter wallet to see your balance</p>
              </div>
            ) : (
              <>
                <p className="text-5xl font-bold tracking-tight">{fmt(freighterTotalUsd)}</p>
                {freighterWallet && (
                  <p className={`text-sm mt-1.5 font-semibold flex items-center gap-2 ${pos24Up ? "text-emerald-400" : "text-rose-400"}`}>
                    {pos24Up ? "+" : ""}{fmt(freighter24hChangeUsd)} ({pos24Up ? "+" : ""}{freighter24hChangePct.toFixed(2)}%)
                    <span className="text-xs bg-white/8 text-white/40 rounded-md px-1.5 py-0.5 font-normal">24H</span>
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/cfo"
              className="flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white/70 hover:text-white hover:border-white/30 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              CFO Settings
            </Link>
            <button
              onClick={openDeposit}
              className="flex items-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black px-5 py-2.5 text-sm font-semibold transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
              </svg>
              Deposit
            </button>
            <Link
              href="/cfo"
              className="flex items-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black px-5 py-2.5 text-sm font-semibold transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
              </svg>
              Run CFO
            </Link>
          </div>
        </div>

        {/* ── Wallet summary strip ────────────────────────────────────────── */}
        {freighterWallet && freighterWallet.balances.length > 0 && (
          <div className="flex items-center gap-10 mb-8 flex-wrap">
            <div>
              <p className="text-xs text-white/40 mb-0.5">Assets</p>
              <p className="text-sm font-semibold text-white">{freighterWallet.balances.length} token{freighterWallet.balances.length !== 1 ? "s" : ""}</p>
            </div>
            {freighterWallet.balances.some(b => b.valueUsd === undefined) && (
              <div>
                <p className="text-xs text-white/40 mb-0.5">Unpriced assets</p>
                <p className="text-sm font-semibold text-white/50">{freighterWallet.balances.filter(b => b.valueUsd === undefined).length} token{freighterWallet.balances.filter(b => b.valueUsd === undefined).length !== 1 ? "s" : ""}</p>
              </div>
            )}
          </div>
        )}

        {/* ── On-chain mandate card ────────────────────────────────────────── */}
        <div className="mb-6 rounded-2xl border border-white/8 bg-white/[0.02] px-6 py-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              {/* Status dot */}
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                mandateStatus === "registered" ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" :
                mandateStatus === "registering" || mandateStatus === "loading" ? "bg-amber-400 animate-pulse" :
                mandateStatus === "error" ? "bg-rose-400" : "bg-white/20"
              }`} />
              <div>
                <p className="text-sm font-semibold text-white">
                  {mandateStatus === "registered" && (mandateData?.action === "updated" ? "Mandate updated on-chain" : "Mandate registered on-chain")}
                  {mandateStatus === "none"        && "Mandate not yet on-chain"}
                  {mandateStatus === "loading"     && "Checking on-chain mandate…"}
                  {mandateStatus === "registering" && "Signing & submitting to Stellar testnet…"}
                  {mandateStatus === "error"       && "Registration failed"}
                  {mandateStatus === "idle"        && "On-chain mandate"}
                </p>
                <p className="text-xs text-white/35 mt-0.5 font-mono truncate max-w-xs">
                  {mandateData?.contractId
                    ? `Contract: ${mandateData.contractId.slice(0, 12)}…${mandateData.contractId.slice(-6)}`
                    : "Stellar testnet · Soroban contract"}
                </p>
                {mandateError && (
                  <p className="text-xs text-rose-400 mt-1">{mandateError}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {mandateData?.explorerUrl && (
                <a
                  href={mandateData.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-white/40 hover:text-white/70 transition-colors underline underline-offset-2"
                >
                  View contract ↗
                </a>
              )}
              {(mandateStatus === "none" || mandateStatus === "error" || mandateStatus === "registered") && (
                <button
                  onClick={registerOnChainMandate}
                  disabled={false}
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                    mandateStatus === "registered"
                      ? "border border-white/15 text-white/50 hover:text-white hover:border-white/30"
                      : "bg-emerald-500 hover:bg-emerald-400 text-black"
                  }`}
                >
                  {mandateStatus === "registered" ? "Re-sync mandate" : "Register mandate"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Freighter wallet status bar ──────────────────────────────────── */}
        <div className="mb-6 rounded-2xl border border-white/8 bg-white/[0.02] px-6 py-4 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              freighterAddr
                ? "bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.6)]"
                : "bg-white/20"
            }`} />
            <div>
              <p className="text-sm font-semibold text-white">Freighter Wallet</p>
              <p className="text-xs text-white/35 font-mono truncate max-w-xs">
                {freighterAddr
                  ? `${freighterAddr.slice(0, 8)}…${freighterAddr.slice(-6)}`
                  : "Not connected — use the wallet button in the top nav"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {freighterWallet && (
              <a
                href={freighterWallet.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-white/40 hover:text-white/70 transition-colors underline underline-offset-2"
              >
                View on Explorer ↗
              </a>
            )}
            {freighterAddr && (
              <button
                onClick={() => loadFreighterWallet(freighterAddr)}
                className="text-xs text-white/40 hover:text-white/70 transition-colors"
                title="Refresh balances"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-6">
          {(["chart", "allocation", "statistics"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-5 py-2 text-sm font-medium capitalize transition-all ${
                tab === t
                  ? "bg-white text-black"
                  : "border border-white/15 text-white/50 hover:text-white hover:border-white/30"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── Tab content ──────────────────────────────────────────────────── */}
        {loading ? (
          <div className="h-32 animate-pulse rounded-2xl bg-white/5 mb-8" />
        ) : tab === "chart" ? (
          <div className="h-52 mb-8">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="portGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={pos24Up ? "#10b981" : "#f43f5e"} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={pos24Up ? "#10b981" : "#f43f5e"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" hide />
                <YAxis domain={[chartMin, chartMax]} hide />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="value"
                  stroke={pos24Up ? "#10b981" : "#f43f5e"} strokeWidth={2}
                  fill="url(#portGrad)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

        ) : tab === "allocation" ? (
          <div className="mb-8">
            {allocItems.length === 0 ? (
              <p className="text-sm text-white/30 py-8 text-center">No holdings to allocate</p>
            ) : (
              <>
                {/* Stacked bar */}
                <div className="flex h-12 rounded-lg overflow-hidden mb-4 gap-0.5">
                  {allocItems.map((item, i) => (
                    <div
                      key={item.label}
                      className="h-full transition-all duration-700 first:rounded-l-lg last:rounded-r-lg"
                      style={{ width: `${item.pct}%`, background: item.color }}
                      title={`${item.label} ${item.pct.toFixed(2)}%`}
                    />
                  ))}
                </div>
                {/* Legend */}
                <div className="flex items-center flex-wrap gap-6">
                  {allocItems.map(item => (
                    <span key={item.label} className="flex items-center gap-1.5 text-sm text-white/60">
                      <span className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                      {item.label}
                      <span className="text-white/30">{item.pct.toFixed(2)}%</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

        ) : (
          /* Statistics tab */
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Total trades",    value: String(trades.length) },
              { label: "Buy orders",      value: String(trades.filter(t => t.trade_type === "buy").length) },
              { label: "Sell orders",     value: String(trades.filter(t => t.trade_type === "sell").length) },
              { label: "Open positions",  value: String(positions.length) },
            ].map(s => (
              <div key={s.label} className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
                <p className="text-xs text-white/40 uppercase tracking-wider mb-2">{s.label}</p>
                <p className="text-3xl font-bold">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Your holdings ────────────────────────────────────────────────── */}
        <h2 className="text-2xl font-bold mb-5">Your holdings</h2>

        {freighterLoading ? (
          <div className="flex flex-col gap-3">
            {[1,2,3].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/5" />)}
          </div>
        ) : !freighterAddr ? (
          <div className="rounded-2xl border border-white/8 py-16 text-center">
            <p className="text-white/30 mb-3">Connect your Freighter wallet to see your holdings</p>
            <p className="text-xs text-white/20">Use the wallet button in the top navigation to connect</p>
          </div>
        ) : !freighterWallet || freighterWallet.balances.length === 0 ? (
          <div className="rounded-2xl border border-white/8 py-16 text-center">
            <p className="text-white/30 mb-3">No assets found in your Freighter wallet</p>
            <p className="text-xs text-white/20">Fund via Friendbot or receive XLM to activate your account</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/8 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[2fr_1fr_80px_1fr_1fr] gap-4 px-6 py-3.5 text-xs font-medium text-white/30 uppercase tracking-widest border-b border-white/8 bg-white/[0.015]">
              <span>Asset</span>
              <span className="text-right">Price</span>
              <span className="text-right">24H</span>
              <span className="text-right">Balance</span>
              <span className="text-right">Value (USD)</span>
            </div>

            {freighterWallet.balances.map((b, idx) => {
              const color  = PALETTE[idx % PALETTE.length];
              const chg24  = b.change24h ?? 0;
              const chgUp  = chg24 >= 0;
              return (
                <div
                  key={`${b.asset}-${b.issuer ?? "native"}`}
                  className="grid grid-cols-[2fr_1fr_80px_1fr_1fr] gap-4 px-6 py-4 border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors items-center"
                >
                  {/* Asset */}
                  <div className="flex items-center gap-3 min-w-0">
                    <AssetLogo symbol={b.asset} logo={b.logo ?? ""} color={color} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{b.asset}</p>
                      {b.issuer && (
                        <p className="text-[10px] text-white/25 font-mono truncate">{b.issuer.slice(0, 8)}…</p>
                      )}
                    </div>
                  </div>

                  {/* Price */}
                  <p className="text-sm text-right font-mono">
                    {b.priceUsd !== undefined ? fmt(b.priceUsd) : <span className="text-white/25">—</span>}
                  </p>

                  {/* 24H */}
                  <p className={`text-sm text-right font-semibold ${b.change24h === undefined ? "text-white/25" : chgUp ? "text-emerald-400" : "text-rose-400"}`}>
                    {b.change24h === undefined ? "—" : `${chgUp ? "▲" : "▼"} ${Math.abs(chg24).toFixed(2)}%`}
                  </p>

                  {/* Balance */}
                  <p className="text-sm text-right font-mono text-white/70">{fmtQty(b.balance)}</p>

                  {/* Value */}
                  <p className="text-sm text-right font-mono">
                    {b.valueUsd !== undefined ? fmt(b.valueUsd) : <span className="text-white/25">—</span>}
                  </p>
                </div>
              );
            })}

            {/* Total row */}
            <div className="grid grid-cols-[2fr_1fr_80px_1fr_1fr] gap-4 px-6 py-3 bg-white/[0.015] border-t border-white/8">
              <p className="text-xs text-white/30 uppercase tracking-widest">Total</p>
              <p /><p /><p />
              <p className="text-sm font-semibold text-right">
                {fmt(freighterTotalUsd)}
                {freighterWallet.balances.some(b => b.valueUsd === undefined) && (
                  <span className="text-white/30 text-xs ml-1">+</span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* ── Recent transactions ──────────────────────────────────────────── */}
        {trades.length > 0 && (
          <div className="mt-10">
            <h2 className="text-2xl font-bold mb-5">Recent transactions</h2>
            <div className="rounded-2xl border border-white/8 overflow-hidden">
              <div className="grid grid-cols-[2fr_80px_1fr_1fr_1fr] gap-4 px-6 py-3.5 text-xs font-medium text-white/30 uppercase tracking-widest border-b border-white/8 bg-white/[0.015]">
                <span>Asset</span>
                <span className="text-center">Type</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Price</span>
                <span className="text-right">Total · Date</span>
              </div>
              {trades.slice(0, 10).map((t, idx) => (
                <div
                  key={t.id}
                  onClick={() => router.push(`/explore/${t.display_symbol.replace("/", "-")}`)}
                  className="grid grid-cols-[2fr_80px_1fr_1fr_1fr] gap-4 px-6 py-4 border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors items-center cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <AssetLogo symbol={t.symbol} logo={liveData.get(t.display_symbol)?.logo ?? ""} color={PALETTE[idx % PALETTE.length]} size={32} />
                    <div>
                      <p className="text-sm font-semibold">{t.name}</p>
                      <p className="text-xs text-white/30">{t.display_symbol}</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${t.trade_type === "buy" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                      {t.trade_type.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-right font-mono text-white/60">{fmtQty(t.quantity)}</p>
                  <p className="text-sm text-right font-mono text-white/60">{fmt(t.price)}</p>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{fmt(t.total)}</p>
                    <p className="text-xs text-white/30 mt-0.5">
                      {new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>

      {/* ── Fund wallet modal ─────────────────────────────────────────────── */}
      {depositOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          onClick={e => { if (e.target === e.currentTarget && depositStep !== "pending" && depositStep !== "creating") setDepositOpen(false); }}
        >
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0d0d0d] shadow-2xl overflow-hidden"
            style={{ animation: "modalIn 0.2s cubic-bezier(0.34,1.56,0.64,1)" }}>

            {/* ── Success screen ── */}
            {depositStep === "success" && (
              <div className="flex flex-col items-center text-center px-8 py-12 gap-6">
                <div className="relative flex items-center justify-center w-28 h-28">
                  <div className="absolute inset-0 rounded-full bg-emerald-500/10 animate-ping" style={{ animationDuration: "1.5s", animationIterationCount: 1 }} />
                  <div className="absolute inset-2 rounded-full bg-emerald-500/15" />
                  <div className="relative w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/40"
                    style={{ animation: "successPop 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}>
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <div style={{ animation: "fadeUp 0.4s 0.3s ease both" }}>
                  <h3 className="text-2xl font-bold mb-2">Wallet funded!</h3>
                  <p className="text-white/50 text-sm">
                    Your agent wallet received <span className="text-white font-semibold">{depositedXlm.toLocaleString()} XLM</span> on Stellar testnet. Balance will refresh shortly.
                  </p>
                </div>
                {agentWallet?.explorerUrl && (
                  <a href={agentWallet.explorerUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-emerald-400 hover:text-emerald-300 underline"
                    style={{ animation: "fadeUp 0.4s 0.5s ease both", opacity: 0 }}>
                    View on Stellar Expert ↗
                  </a>
                )}
                <button
                  onClick={() => setDepositOpen(false)}
                  className="w-full rounded-2xl bg-white text-black py-3.5 text-sm font-semibold hover:bg-white/90 transition-all mt-2"
                  style={{ animation: "fadeUp 0.4s 0.6s ease both", opacity: 0 }}
                >
                  Done
                </button>
              </div>
            )}

            {/* ── Error screen ── */}
            {depositStep === "error" && (
              <div className="px-6 py-8 flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-2xl">✕</div>
                <div>
                  <h3 className="text-lg font-bold mb-1">Funding failed</h3>
                  <p className="text-sm text-white/40">{depositError}</p>
                </div>
                <button onClick={() => setDepositStep("form")} className="w-full rounded-2xl border border-white/10 py-3 text-sm text-white/70 hover:bg-white/5 transition-all">Try again</button>
              </div>
            )}

            {/* ── Loading screens ── */}
            {(depositStep === "pending" || depositStep === "creating") && (
              <div className="px-6 py-12 flex flex-col items-center text-center gap-5">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-400 animate-spin" />
                  <div className="absolute inset-3 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 text-lg">
                    {depositStep === "creating" ? "🔑" : "⚡"}
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-1">
                    {depositStep === "creating" ? "Creating agent wallet…" : "Requesting XLM from Friendbot…"}
                  </h3>
                  <p className="text-sm text-white/35">
                    {depositStep === "creating" ? "Generating your secure Stellar keypair" : "Stellar testnet · usually takes 1–3 seconds"}
                  </p>
                </div>
              </div>
            )}

            {/* ── Form screen ── */}
            {depositStep === "form" && (
              <>
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/6">
                  <div>
                    <h3 className="text-lg font-bold">Fund Agent Wallet</h3>
                    <p className="text-xs text-white/35 mt-0.5">Stellar testnet · XLM only</p>
                  </div>
                  <button onClick={() => setDepositOpen(false)} className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:border-white/25 transition-all text-sm">✕</button>
                </div>

                <div className="px-6 py-5 space-y-4">
                  {/* Agent wallet address */}
                  {agentWallet ? (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                      <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5">Agent Wallet Address</p>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-xs text-white/70 flex-1 break-all leading-relaxed">{agentWallet.address}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => navigator.clipboard.writeText(agentWallet.address)}
                          className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-white/8 text-white/50 hover:text-white hover:bg-white/12 transition-all"
                        >
                          Copy address
                        </button>
                        <a href={agentWallet.explorerUrl} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-white/8 text-white/50 hover:text-white hover:bg-white/12 transition-all">
                          View on Explorer ↗
                        </a>
                        <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Testnet</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-300">
                      A new agent wallet will be created automatically when you fund.
                    </div>
                  )}

                  {/* Option 1: Friendbot */}
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <span className="text-2xl leading-none">⚡</span>
                      <div>
                        <p className="text-sm font-semibold text-emerald-300">Fund via Friendbot</p>
                        <p className="text-xs text-white/40 mt-0.5">Get 10 000 XLM instantly — Stellar testnet only</p>
                      </div>
                    </div>
                    {depositError && (
                      <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2 mb-3">{depositError}</p>
                    )}
                    <button
                      onClick={handleDeposit}
                      className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black py-2.5 text-sm font-semibold transition-all flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Fund via Friendbot (free)
                    </button>
                  </div>

                  {/* Option 2: Manual send */}
                  <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-xl leading-none">🔑</span>
                      <div>
                        <p className="text-sm font-semibold">Send from Freighter</p>
                        <p className="text-xs text-white/40 mt-0.5">
                          Open Freighter → send XLM to the address above. Balance updates automatically within a few seconds.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── CSS animations ─────────────────────────────────────────────────── */}
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.92) translateY(12px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        @keyframes successPop {
          from { opacity: 0; transform: scale(0.5); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes drawCheck {
          from { stroke-dashoffset: 30; }
          to   { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
}
