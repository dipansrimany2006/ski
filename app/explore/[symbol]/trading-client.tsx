"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { AssetDetail } from "@/lib/market";
import { AppNav } from "@/components/app-nav";

// ── Types ──────────────────────────────────────────────────────────────────────

type Period = "1D" | "1W" | "1M" | "3M" | "1Y";

interface PaperPosition {
  asset_id: string; symbol: string; display_symbol: string;
  name: string; category: string;
  quantity: number; avg_buy_price: number;
}

interface Portfolio { balance: number; positions: PaperPosition[]; }

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function fmtNum(n: number, digits = 6): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 2 });
}

function formatAxisTime(ts: number, period: Period): string {
  const d = new Date(ts);
  if (period === "1D") return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  if (period === "1W") return d.toLocaleDateString("en-US", { weekday: "short" });
  if (period === "1M" || period === "3M") return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

const COLORS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#14b8a6"];
function symbolColor(s: string) { return COLORS[s.charCodeAt(0) % COLORS.length]; }

// ── Sub-components ─────────────────────────────────────────────────────────────

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

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/6 last:border-0">
      <span className="text-sm text-white/50">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

// ── Custom chart tooltip ───────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, period }: {
  active?: boolean; payload?: {value: number}[]; label?: number; period: Period;
}) {
  if (!active || !payload?.length) return null;
  const price = payload[0].value;
  const d = new Date(label ?? 0);
  const dateStr = period === "1D"
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return (
    <div className="rounded-lg border border-white/10 bg-[#111] px-3 py-2 shadow-xl text-sm">
      <p className="text-white/50 text-xs mb-0.5">{dateStr}</p>
      <p className="font-semibold">{fmt(price, { digits: price >= 1 ? 2 : 6 })}</p>
    </div>
  );
}

// ── Main trading client ────────────────────────────────────────────────────────

export default function TradingClient({ symbol }: { symbol: string }) {
  const displaySymbol = symbol.replace("-", "/");

  const [asset, setAsset]             = useState<AssetDetail | null>(null);
  const [assetLoading, setAssetLoading] = useState(true);

  const [period, setPeriod]           = useState<Period>("1D");
  const [chartData, setChartData]     = useState<{ time: number; price: number }[]>([]);
  const [chartLoading, setChartLoading] = useState(true);

  const [portfolio, setPortfolio]     = useState<Portfolio | null>(null);
  const [authed, setAuthed]           = useState(false);

  const [tradeType, setTradeType]     = useState<"buy" | "sell">("buy");
  const [buyAmount, setBuyAmount]     = useState("");  // USD to spend
  const [sellQty, setSellQty]         = useState(""); // units to sell
  const [trading, setTrading]         = useState(false);
  const [tradeMsg, setTradeMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  // ── Load asset ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/asset/${symbol}`)
      .then(r => r.json())
      .then((d: unknown) => { const r = d as { asset?: AssetDetail }; if (r.asset) setAsset(r.asset); })
      .catch(() => {})
      .finally(() => setAssetLoading(false));
  }, [symbol]);

  // ── Load chart ──────────────────────────────────────────────────────────────
  useEffect(() => {
    setChartLoading(true);
    fetch(`/api/asset/${symbol}/chart?period=${period}`)
      .then(r => r.json())
      .then((d: unknown) => {
        const r = d as { prices?: [number, number][] };
        const prices = r.prices ?? [];
        setChartData(prices.map(([time, p]) => ({ time, price: p })));
      })
      .catch(() => setChartData([]))
      .finally(() => setChartLoading(false));
  }, [symbol, period]);

  // ── Load paper portfolio ─────────────────────────────────────────────────────
  const loadPortfolio = useCallback(() => {
    fetch("/api/paper/portfolio")
      .then(r => {
        if (r.status === 401) { setAuthed(false); return null; }
        setAuthed(true);
        return r.json();
      })
      .then(d => { if (d) setPortfolio(d as Portfolio); })
      .catch(() => {});
  }, []);

  useEffect(() => { loadPortfolio(); }, [loadPortfolio]);

  // ── Trade execution ──────────────────────────────────────────────────────────
  async function executeTrade() {
    if (!asset) return;
    setTrading(true);
    setTradeMsg(null);
    try {
      const body = tradeType === "buy"
        ? { asset_id: asset.id, symbol: asset.symbol, display_symbol: asset.displaySymbol, name: asset.name, category: asset.category, trade_type: "buy", amount_usd: parseFloat(buyAmount), price: asset.priceUsd }
        : { asset_id: asset.id, symbol: asset.symbol, display_symbol: asset.displaySymbol, name: asset.name, category: asset.category, trade_type: "sell", quantity: parseFloat(sellQty), price: asset.priceUsd };

      const res  = await fetch("/api/paper/trade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json() as { balance?: number; position?: PaperPosition; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Trade failed");

      setPortfolio(prev => {
        if (!prev) return prev;
        const positions = prev.positions.filter(p => p.asset_id !== asset.id);
        if (data.position) positions.unshift(data.position);
        return { balance: data.balance ?? prev.balance, positions };
      });
      setTradeMsg({ ok: true, text: `${tradeType === "buy" ? "Bought" : "Sold"} successfully` });
      setBuyAmount(""); setSellQty("");
    } catch (e) {
      setTradeMsg({ ok: false, text: e instanceof Error ? e.message : "Trade failed" });
    } finally {
      setTrading(false);
    }
  }

  // ── Derived values ───────────────────────────────────────────────────────────
  const pos     = portfolio?.positions.find(p => p.asset_id === asset?.id) ?? null;
  const balance = portfolio?.balance ?? 0;
  const price   = asset?.priceUsd ?? 0;
  const pos24h  = asset ? asset.change24h >= 0 : true;

  const buyQtyPreview   = buyAmount && price > 0 ? parseFloat(buyAmount) / price : 0;
  const sellUsdPreview  = sellQty && price > 0 ? parseFloat(sellQty) * price : 0;

  const chartPositive = chartData.length >= 2
    ? chartData[chartData.length - 1].price >= chartData[0].price
    : pos24h;
  const lineColor = chartPositive ? "#10b981" : "#f43f5e";
  const fillId    = chartPositive ? "areaGreen" : "areaRed";

  // Quick percentage buttons
  function setQuickBuy(pct: number) {
    if (!portfolio) return;
    setBuyAmount(((portfolio.balance * pct) / 100).toFixed(2));
  }
  function setQuickSell(pct: number) {
    if (!pos) return;
    setSellQty(((pos.quantity * pct) / 100).toFixed(8).replace(/\.?0+$/, ""));
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (assetLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-white/30 text-sm">Loading…</div>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-white/50">Asset not found</p>
        <Link href="/explore" className="text-sm text-emerald-400 hover:underline">← Back to Explore</Link>
      </div>
    );
  }

  const pnl    = pos ? (price - pos.avg_buy_price) * pos.quantity : 0;
  const pnlPct = pos && pos.avg_buy_price > 0 ? ((price - pos.avg_buy_price) / pos.avg_buy_price) * 100 : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">

      <AppNav active="Explore" />

      <div className="mx-auto max-w-screen-2xl px-8 py-8">
        <div className="flex gap-8 items-start">

          {/* ── Left column ─────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0">

            {/* Asset header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <AssetLogo symbol={asset.symbol} logo={asset.logo} size={52} />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl font-bold">{asset.name}</h1>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      asset.category === "equity"
                        ? "bg-indigo-500/15 text-indigo-400"
                        : "bg-emerald-500/15 text-emerald-400"
                    }`}>
                      {asset.category === "equity" ? "Equity" : "Crypto"}
                      {asset.country ? ` · ${asset.country}` : ""}
                    </span>
                  </div>
                  <p className="text-sm text-white/40 mt-0.5">{asset.displaySymbol}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </div>
            </div>

            {/* Price */}
            <div className="mb-6">
              <p className="text-5xl font-bold tracking-tight">{fmt(asset.priceUsd)}</p>
              <p className={`mt-1.5 text-base font-medium ${pos24h ? "text-emerald-400" : "text-rose-400"}`}>
                {pos24h ? "▲" : "▼"} {fmt(Math.abs(asset.change24hUsd))} ({Math.abs(asset.change24h).toFixed(2)}%) 24H
              </p>
            </div>

            {/* Period tabs */}
            <div className="flex items-center gap-1 mb-4">
              {(["1D","1W","1M","3M","1Y"] as Period[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    period === p ? "bg-white/12 text-white" : "text-white/40 hover:text-white/70 hover:bg-white/5"
                  }`}>
                  {p}
                </button>
              ))}
            </div>

            {/* Chart */}
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 mb-8">
              {chartLoading ? (
                <div className="h-64 flex items-center justify-center">
                  <div className="text-white/20 text-sm">Loading chart…</div>
                </div>
              ) : chartData.length < 2 ? (
                <div className="h-64 flex items-center justify-center">
                  <div className="text-white/20 text-sm">No chart data available</div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="areaGreen" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="areaRed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="0" vertical={false} />
                    <XAxis
                      dataKey="time"
                      tickFormatter={ts => formatAxisTime(ts, period)}
                      tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
                      axisLine={false} tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={60}
                    />
                    <YAxis
                      domain={["auto", "auto"]}
                      tickFormatter={v => fmt(v, { digits: v >= 1 ? 0 : 4 })}
                      tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
                      axisLine={false} tickLine={false}
                      width={72}
                    />
                    <Tooltip content={<ChartTooltip period={period} />} />
                    <Area
                      type="monotone" dataKey="price"
                      stroke={lineColor} strokeWidth={1.5}
                      fill={`url(#${fillId})`}
                      dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Statistics */}
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 mb-6">
              <h2 className="text-base font-semibold mb-3">Statistics</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                <div>
                  <StatRow label="Current Price" value={fmt(asset.priceUsd)} />
                  <StatRow label="24H Change" value={`${pos24h ? "+" : ""}${asset.change24h.toFixed(2)}%`} />
                  <StatRow label="24H Change (USD)" value={fmt(asset.change24hUsd)} />
                </div>
                <div>
                  {asset.volume24h > 0 && <StatRow label="24H Volume" value={fmt(asset.volume24h, { compact: true })} />}
                  {asset.marketCap > 0 && <StatRow label="Market Cap" value={fmt(asset.marketCap, { compact: true })} />}
                  <StatRow label="Category" value={asset.category === "equity" ? `Equity${asset.country ? ` · ${asset.country}` : ""}` : "Crypto"} />
                  <StatRow label="Symbol" value={asset.displaySymbol} />
                </div>
              </div>
            </div>

            {/* Recent trades */}
            {portfolio && portfolio.positions.length > 0 && (
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6">
                <h2 className="text-base font-semibold mb-3">Your Portfolio</h2>
                {portfolio.positions.map(p => {
                  const v   = p.quantity * price;
                  const pl  = (price - p.avg_buy_price) * p.quantity;
                  const plp = p.avg_buy_price > 0 ? ((price - p.avg_buy_price) / p.avg_buy_price) * 100 : 0;
                  return (
                    <div key={p.asset_id} className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-medium">{p.display_symbol}</p>
                        <p className="text-xs text-white/40">{fmtNum(p.quantity, 6)} @ avg {fmt(p.avg_buy_price)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{fmt(v)}</p>
                        <p className={`text-xs ${pl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {pl >= 0 ? "+" : ""}{fmt(pl)} ({plp >= 0 ? "+" : ""}{plp.toFixed(2)}%)
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Right column — trading panel ─────────────────────────── */}
          <div className="w-80 shrink-0 sticky top-20">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">

              {/* Panel header */}
              <div className="px-5 pt-5 pb-4 border-b border-white/8">
                <h2 className="text-base font-semibold mb-3">Trade</h2>
                <div className="flex rounded-lg border border-white/10 overflow-hidden text-sm">
                  <button onClick={() => { setTradeType("buy"); setTradeMsg(null); }}
                    className={`flex-1 py-2 font-medium transition-colors ${tradeType === "buy" ? "bg-emerald-500/20 text-emerald-300" : "text-white/50 hover:bg-white/5"}`}>
                    Buy
                  </button>
                  <button onClick={() => { setTradeType("sell"); setTradeMsg(null); }}
                    className={`flex-1 py-2 font-medium transition-colors ${tradeType === "sell" ? "bg-rose-500/20 text-rose-300" : "text-white/50 hover:bg-white/5"}`}>
                    Sell
                  </button>
                </div>
              </div>

              <div className="px-5 py-4 space-y-4">

                {!authed ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-white/40 mb-4">Sign in to trade</p>
                    <Link href="/login" className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-black">
                      Sign In
                    </Link>
                  </div>
                ) : tradeType === "buy" ? (
                  <>
                    {/* Buy form */}
                    <div>
                      <label className="text-xs text-white/40 mb-1.5 block">Spend (USD)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
                        <input
                          type="number" min="0" placeholder="0.00"
                          value={buyAmount} onChange={e => setBuyAmount(e.target.value)}
                          className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-7 pr-3 text-sm focus:outline-none focus:border-white/20"
                        />
                      </div>
                      <div className="flex gap-1.5 mt-2">
                        {[25, 50, 75, 100].map(pct => (
                          <button key={pct} onClick={() => setQuickBuy(pct)}
                            className="flex-1 text-xs py-1 rounded border border-white/10 text-white/40 hover:bg-white/5 hover:text-white/70 transition-colors">
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex items-center justify-center">
                      <div className="rounded-full border border-white/10 bg-white/5 p-1.5">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                      </div>
                    </div>

                    {/* Receive preview */}
                    <div>
                      <label className="text-xs text-white/40 mb-1.5 block">You receive (est.)</label>
                      <div className="rounded-lg border border-white/10 bg-white/5 py-2.5 px-3 text-sm text-white/70">
                        {buyQtyPreview > 0 ? `${fmtNum(buyQtyPreview, 8)} ${asset.symbol}` : `0 ${asset.symbol}`}
                      </div>
                    </div>

                    {/* Balance info */}
                    <div className="flex items-center justify-between text-xs text-white/40">
                      <span>Balance</span>
                      <span className="text-white/70 font-medium">{fmt(balance)}</span>
                    </div>

                    <button
                      onClick={executeTrade} disabled={trading || !buyAmount || parseFloat(buyAmount) <= 0}
                      className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-black transition-opacity disabled:opacity-40 hover:bg-emerald-400">
                      {trading ? "Processing…" : `Buy ${asset.symbol}`}
                    </button>
                  </>
                ) : (
                  <>
                    {/* Sell form */}
                    <div>
                      <label className="text-xs text-white/40 mb-1.5 block">Quantity ({asset.symbol})</label>
                      <input
                        type="number" min="0" placeholder="0"
                        value={sellQty} onChange={e => setSellQty(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 px-3 text-sm focus:outline-none focus:border-white/20"
                      />
                      {pos && (
                        <div className="flex gap-1.5 mt-2">
                          {[25, 50, 75, 100].map(pct => (
                            <button key={pct} onClick={() => setQuickSell(pct)}
                              className="flex-1 text-xs py-1 rounded border border-white/10 text-white/40 hover:bg-white/5 hover:text-white/70 transition-colors">
                              {pct}%
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Arrow */}
                    <div className="flex items-center justify-center">
                      <div className="rounded-full border border-white/10 bg-white/5 p-1.5">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                      </div>
                    </div>

                    {/* Receive preview */}
                    <div>
                      <label className="text-xs text-white/40 mb-1.5 block">You receive (est.)</label>
                      <div className="rounded-lg border border-white/10 bg-white/5 py-2.5 px-3 text-sm text-white/70">
                        {sellUsdPreview > 0 ? fmt(sellUsdPreview) : "$0.00"}
                      </div>
                    </div>

                    {/* Position info */}
                    {pos ? (
                      <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3 text-xs space-y-1">
                        <div className="flex justify-between text-white/40">
                          <span>Available</span>
                          <span className="text-white/70">{fmtNum(pos.quantity, 6)} {asset.symbol}</span>
                        </div>
                        <div className="flex justify-between text-white/40">
                          <span>Avg. cost</span>
                          <span className="text-white/70">{fmt(pos.avg_buy_price)}</span>
                        </div>
                        <div className="flex justify-between text-white/40">
                          <span>Unrealised P&L</span>
                          <span className={pnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                            {pnl >= 0 ? "+" : ""}{fmt(pnl)} ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-white/30 text-center">No position in {asset.symbol}</p>
                    )}

                    <button
                      onClick={executeTrade}
                      disabled={trading || !sellQty || parseFloat(sellQty) <= 0 || !pos}
                      className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40 hover:bg-rose-400">
                      {trading ? "Processing…" : `Sell ${asset.symbol}`}
                    </button>
                  </>
                )}

                {/* Trade message */}
                {tradeMsg && (
                  <div className={`rounded-lg px-3 py-2 text-xs text-center ${
                    tradeMsg.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                  }`}>
                    {tradeMsg.text}
                  </div>
                )}

                {/* Disclaimer */}
                {authed && (
                  <p className="text-[10px] text-white/20 text-center leading-relaxed">
                    Prices are live from Pyth.
                  </p>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
