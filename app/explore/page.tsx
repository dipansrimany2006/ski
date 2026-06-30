"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppNav } from "@/components/app-nav";
import type { AssetData } from "@/lib/market";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, opts?: { compact?: boolean; digits?: number }): string {
  if (!Number.isFinite(n) || n === 0) return "$0";
  if (opts?.compact && Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (opts?.compact && Math.abs(n) >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (opts?.compact && Math.abs(n) >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    maximumFractionDigits: opts?.digits ?? (Math.abs(n) >= 1 ? 2 : 6),
  }).format(n);
}

// ── Straight line sparkline (no CoinGecko data — equity / unknown assets) ────

function SparklineStraight({ positive, inView }: { positive: boolean; inView: boolean }) {
  const stroke = positive ? "#10b981" : "#f43f5e";
  return (
    <div
      className="w-full h-full"
      style={{
        clipPath: inView ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)",
        transition: "clip-path 0.9s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <svg viewBox="0 0 400 100" preserveAspectRatio="none" className="w-full h-full">
        <line x1="0" y1="50" x2="400" y2="50" stroke={stroke} strokeWidth="1.5" strokeOpacity="0.35" />
      </svg>
    </div>
  );
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ data, positive, inView }: { data: number[]; positive: boolean; inView: boolean }) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const W = 400, H = 100;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 12) - 6;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const stroke = positive ? "#10b981" : "#f43f5e";
  const fill   = positive ? "rgba(16,185,129,0.08)" : "rgba(244,63,94,0.08)";
  const last   = pts[pts.length - 1].split(",")[0];
  return (
    // clip-path reveals the chart from left → right when inView becomes true
    <div
      className="w-full h-full"
      style={{
        clipPath: inView ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)",
        transition: "clip-path 0.9s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
        <path d={`M ${pts.join(" L ")} L ${last},${H} L 0,${H} Z`} fill={fill} />
        <path d={`M ${pts.join(" L ")}`} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ── Asset logo ────────────────────────────────────────────────────────────────

const COLORS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#14b8a6"];
function symbolColor(s: string) { return COLORS[s.charCodeAt(0) % COLORS.length]; }

function AssetLogo({ symbol, logo, size = 40 }: { symbol: string; logo: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (!logo || err) {
    return (
      <div className="rounded-full flex items-center justify-center shrink-0 font-bold text-white text-xs"
        style={{ width: size, height: size, background: symbolColor(symbol) }}>
        {symbol.slice(0, 2)}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={logo} alt={symbol} width={size} height={size} onError={() => setErr(true)} className="rounded-full shrink-0" />;
}

// ── Asset card ────────────────────────────────────────────────────────────────

function AssetCard({ asset }: { asset: AssetData }) {
  const pos     = asset.change24h >= 0;
  const cardRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect(); // animate once, never re-trigger
        }
      },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const slug = asset.displaySymbol.replace("/", "-");
  return (
    <Link href={`/explore/${slug}`}>
    <div ref={cardRef} className="rounded-2xl border border-white/8 bg-transparent p-6 hover:border-white/15 hover:bg-white/[0.03] transition-all cursor-pointer flex flex-col">
      {/* Header row */}
      <div className="flex items-center gap-3 mb-5">
        <AssetLogo symbol={asset.symbol} logo={asset.logo} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-semibold text-[15px] leading-tight truncate">{asset.name}</p>
            {asset.category === "equity" && (
              <span className="shrink-0 rounded px-1.5 py-px text-[9px] font-semibold bg-indigo-500/15 text-indigo-400 uppercase tracking-wide">EQ</span>
            )}
          </div>
          <p className="text-xs text-white/40 mt-0.5">{asset.displaySymbol}</p>
        </div>
      </div>

      {/* Price */}
      <p className="text-4xl font-bold tracking-tight leading-none mb-2">{fmt(asset.priceUsd)}</p>
      <p className={`text-sm font-medium ${pos ? "text-emerald-400" : "text-rose-400"}`}>
        {pos ? "▲" : "▼"}{" "}
        {asset.change24hUsd !== 0 ? fmt(Math.abs(asset.change24hUsd)) + " " : ""}
        ({Math.abs(asset.change24h).toFixed(2)}%) 24H
      </p>

      {/* Sparkline area */}
      <div className="mt-4 rounded-xl overflow-hidden bg-white/[0.03] h-32">
        {asset.sparkline.length > 1
          ? <Sparkline data={asset.sparkline} positive={pos} inView={inView} />
          : <SparklineStraight positive={pos} inView={inView} />
        }
      </div>
    </div>
    </Link>
  );
}

// ── Top 3 mini row ────────────────────────────────────────────────────────────

function MiniRow({ asset, extra }: { asset: AssetData; extra?: React.ReactNode }) {
  const pos  = asset.change24h >= 0;
  const slug = asset.displaySymbol.replace("/", "-");
  return (
    <Link href={`/explore/${slug}`} className="flex items-center justify-between py-3 hover:bg-white/[0.03] rounded-xl px-2 -mx-2 transition-colors group">
      <div className="flex items-center gap-3">
        <AssetLogo symbol={asset.symbol} logo={asset.logo} size={32} />
        <div>
          <p className="text-sm font-semibold leading-tight group-hover:text-white transition-colors">{asset.name}</p>
          <p className="text-xs text-white/40 mt-0.5">{asset.symbol}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold">{fmt(asset.priceUsd)}</p>
        {extra ?? <p className={`text-xs mt-0.5 ${pos ? "text-emerald-400" : "text-rose-400"}`}>{pos ? "▲" : "▼"} {Math.abs(asset.change24h).toFixed(2)}%</p>}
      </div>
    </Link>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

type FilterTab = "All" | "Majors" | "Stablecoins" | "Equity";
type SortKey   = "default" | "price" | "change24h" | "volume";
const PAGE_SIZE = 36;

export default function ExplorePage() {
  const [assets,  setAssets]  = useState<AssetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [tab,     setTab]     = useState<FilterTab>("All");
  const [sort,    setSort]    = useState<SortKey>("default");
  const [view,    setView]    = useState<"grid" | "list">("grid");
  const [page,    setPage]    = useState(1);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/explore")
      .then(r => r.json())
      .then(d => { const data = d as { assets?: AssetData[] }; setAssets(data.assets ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { setPage(1); }, [search, tab, sort]);

  const isStablecoin = (a: AssetData) =>
    /usd[ct]?|dai|busd|frax|tusd|usdd|stablecoin/i.test(a.symbol) && a.priceUsd < 2 && a.category === "crypto";

  const filtered = assets
    .filter(a => {
      if (tab === "Majors"      && !a.isMajor)              return false;
      if (tab === "Stablecoins" && !isStablecoin(a))        return false;
      if (tab === "Equity"      && a.category !== "equity") return false;
      const q = search.toLowerCase();
      return !q || a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.displaySymbol.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sort === "price")     return b.priceUsd  - a.priceUsd;
      if (sort === "change24h") return b.change24h  - a.change24h;
      if (sort === "volume")    return b.volume24h  - a.volume24h;
      return 0;
    });

  const gainers   = [...assets].filter(a => a.isMajor).sort((a, b) => b.change24h - a.change24h).slice(0, 3);
  const trending  = [...assets].filter(a => a.isMajor).sort((a, b) => b.volume24h  - a.volume24h).slice(0, 3);
  const topEquity = [...assets].filter(a => a.category === "equity").sort((a, b) => b.priceUsd - a.priceUsd).slice(0, 3);
  const shown     = filtered.slice(0, page * PAGE_SIZE);
  const hasMore   = shown.length < filtered.length;

  // Infinite scroll — placed after hasMore so it can use it as a dependency.
  // Disconnects immediately on fire to prevent cascade re-triggering.
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          obs.disconnect();
          setPage(p => p + 1);
        }
      },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, page]);

  return (
    <div className="min-h-screen bg-background text-foreground">

      <AppNav active="Explore" />

      <main className="mx-auto max-w-screen-2xl px-10 py-10">
        {loading ? (
          <div className="space-y-8">
            <div className="grid gap-6 lg:grid-cols-3">{[1,2,3].map(i => <div key={i} className="h-44 animate-pulse rounded-2xl bg-white/5" />)}</div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3,4,5,6].map(i => <div key={i} className="h-72 animate-pulse rounded-2xl bg-white/5" />)}</div>
          </div>
        ) : (
          <>
            {/* Top 3 panels */}
            <div className="grid gap-12 lg:grid-cols-3 mb-10">
              <div className="  py-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-2xl">Top Gainers</span>
                  <span className="rounded-md bg-white/8 px-2 py-0.5 text-[11px] text-white/50 font-medium">24H</span>
                </div>
                <div className="divide-y divide-white/20">{gainers.map(a => <MiniRow key={a.id} asset={a} />)}</div>
              </div>
              <div className="py-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-2xl">Trending</span>
                  <span className="rounded-md bg-white/8 px-2 py-0.5 text-[11px] text-white/50 font-medium">24H</span>
                </div>
                <div className="divide-y divide-white/20">{trending.map(a => <MiniRow key={a.id} asset={a} extra={<p className="text-xs text-white/40 mt-0.5">{fmt(a.volume24h, { compact: true })} vol</p>} />)}</div>
              </div>
              <div className="py-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-2xl">Top Equities</span>
                  <span className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-[11px] text-indigo-400 font-medium">US Stocks</span>
                </div>
                <div className="divide-y divide-white/20">
                  {topEquity.map(a => <MiniRow key={a.id} asset={a} extra={<p className="text-xs text-white/40 mt-0.5">{a.country ?? "US"}</p>} />)}
                </div>
              </div>
            </div>

            {/* Explore Assets header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                Explore Assets
                <span className="ml-2 text-base font-normal text-white/30">{filtered.length}</span>
              </h2>
            </div>

            {/* Search + tabs + controls row */}
            <div className="flex flex-wrap items-center gap-2.5 mb-6">
              {/* Search */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search asset name or ticker" className="rounded-lg  bg-white/5 py-2 pl-8 pr-4 text-sm text-white/80 placeholder:text-white/30 focus:outline-none focus:border-white/20 w-100" />
              </div>

              {/* Tabs */}
              <div className="flex gap-1.5">
                {(["All", "Majors", "Stablecoins", "Equity"] as FilterTab[]).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      tab === t
                        ? t === "Equity"
                          ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                          : "bg-white/12 text-white border border-white/10"
                        : "text-white/50 hover:text-white/80 hover:bg-white/5 border border-transparent"
                    }`}>
                    {t === "All" ? "All assets" : t}
                  </button>
                ))}
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Sort + view toggle */}
              <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 focus:outline-none cursor-pointer">
                <option value="default">Most Popular</option>
                <option value="price">Price</option>
                <option value="change24h">Top Gainers</option>
                <option value="volume">Volume</option>
              </select>
              <div className="flex rounded-lg border border-white/10 overflow-hidden">
                <button onClick={() => setView("grid")} className={`px-3 py-2 transition-colors ${view === "grid" ? "bg-white/10" : "hover:bg-white/5"}`}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className="text-white/60"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>
                </button>
                <button onClick={() => setView("list")} className={`px-3 py-2 transition-colors ${view === "list" ? "bg-white/10" : "hover:bg-white/5"}`}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/60"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                </button>
              </div>
            </div>

            {/* Grid or List */}
            {filtered.length === 0 ? (
              <div className="py-24 text-center text-sm text-white/30">No assets found</div>
            ) : view === "grid" ? (
              <>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {shown.map(a => <AssetCard key={a.id} asset={a} />)}
                </div>
                {hasMore && <div ref={sentinelRef} className="h-px" />}
              </>
            ) : (
              <div className="rounded-2xl border border-white/8 overflow-hidden">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-6 py-3.5 border-b border-white/8 text-xs text-white/40 font-medium uppercase tracking-wider">
                  <span>Asset</span><span className="text-right">Price</span><span className="text-right">24H</span><span className="text-right">Vol / Type</span>
                </div>
                {shown.map((a, i) => {
                  const pos  = a.change24h >= 0;
                  const slug = a.displaySymbol.replace("/", "-");
                  return (
                    <Link key={a.id} href={`/explore/${slug}`} className={`grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-6 py-4 items-center ${i % 2 === 0 ? "bg-white/[0.01]" : ""} hover:bg-white/[0.04] transition-colors cursor-pointer group`}>
                      <div className="flex items-center gap-3">
                        <AssetLogo symbol={a.symbol} logo={a.logo} size={32} />
                        <div>
                          <p className="text-sm font-semibold group-hover:text-white transition-colors">{a.name}</p>
                          <p className="text-xs text-white/40 mt-0.5">{a.displaySymbol}</p>
                        </div>
                      </div>
                      <p className="text-sm text-right font-semibold">{fmt(a.priceUsd)}</p>
                      <p className={`text-sm text-right font-medium ${pos ? "text-emerald-400" : "text-rose-400"}`}>{pos ? "+" : ""}{a.change24h.toFixed(2)}%</p>
                      <p className="text-sm text-right text-white/50">
                        {a.category === "equity"
                          ? <span className="inline-block rounded px-2 py-0.5 text-xs bg-indigo-500/10 text-indigo-400">{a.country ?? "US"}</span>
                          : a.volume24h > 0 ? fmt(a.volume24h, { compact: true }) : "—"}
                      </p>
                    </Link>
                  );
                })}
                {hasMore && <div ref={sentinelRef} className="h-px" />}
              </div>
            )}

            {/* CTA */}
            <div className="mt-14 rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-900/20 to-teal-900/10 p-10 text-center">
              <h3 className="text-2xl font-bold">Let an AI CFO trade these markets for you</h3>
              <p className="mt-2 text-sm text-white/50">Activate your CFO agent, set your mandate, and let it trade autonomously.</p>
              <Link href="/cfo" className="mt-6 inline-block rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 px-7 py-3 text-sm font-semibold text-[#04100c]">Activate CFO</Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
