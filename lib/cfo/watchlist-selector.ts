// Dynamic watchlist selector — the CFO chooses which assets to analyse each run.
// Selection is driven by live market data + the user's risk profile.
// Covers the full Pyth crypto universe + equities — not limited to Stellar native assets.

import { fetchAssets } from "@/lib/market";
import type { AssetData } from "@/lib/market";
import { fetchTopCMCTokens } from "@/lib/cmc";

export interface SelectedAsset {
  displaySymbol: string;
  name: string;
  score: number;
  reason: string;
}

export interface WatchlistSelection {
  assets: SelectedAsset[];
  strategy: string;
  selectedAt: string;
}

const POOL_SIZE: Record<string, number> = {
  conservative: 6,
  balanced:     8,
  aggressive:   10,
};

function normalise(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return values.map(() => 0.5);
  return values.map(v => (v - min) / range);
}

function rankScore(values: number[], highIsBetter = true): number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => highIsBetter ? b.v - a.v : a.v - b.v);
  const scores = new Array<number>(values.length);
  indexed.forEach(({ i }, rank) => {
    scores[i] = 1 - rank / Math.max(values.length - 1, 1);
  });
  return scores;
}

export async function selectWatchlist(
  riskTolerance: string,
): Promise<WatchlistSelection> {
  const now = new Date().toISOString();
  const poolSize = POOL_SIZE[riskTolerance] ?? 8;

  let all: AssetData[];
  try {
    all = await fetchAssets();

    // Enrich with CMC volume/market-cap data where available (symbol-matched)
    const cmcTokens = await fetchTopCMCTokens(100).catch(() => []);
    const cmcBySymbol = new Map(cmcTokens.map(t => [t.symbol, t]));
    for (const asset of all) {
      const cmc = cmcBySymbol.get(asset.symbol);
      if (cmc && cmc.priceUsd > 0) {
        asset.volume24h = cmc.volume24hUsd;
        asset.marketCap = cmc.marketCapUsd;
        if (!asset.change24h) asset.change24h = cmc.change24h;
      }
    }
  } catch {
    return { assets: [], strategy: "fetch-failed", selectedAt: now };
  }

  const liquid = all.filter(a => a.priceUsd > 0 && a.volume24h > 0);
  if (liquid.length === 0) {
    return { assets: [], strategy: "no liquid assets found", selectedAt: now };
  }

  const abs24h  = liquid.map(a => Math.abs(a.change24h));
  const volumes = liquid.map(a => a.volume24h);
  const mcaps   = liquid.map(a => a.marketCap > 0 ? a.marketCap : 1);

  const volRank    = rankScore(volumes, true);
  const mcapRank   = rankScore(mcaps,   true);
  const momoRank   = rankScore(abs24h,  true);
  const stabilRank = rankScore(abs24h,  false);

  let scored: { asset: AssetData; score: number; reason: string }[];
  let strategy: string;

  if (riskTolerance === "conservative") {
    scored = liquid.map((a, i) => ({
      asset:  a,
      score:  mcapRank[i] * 0.45 + volRank[i] * 0.35 + stabilRank[i] * 0.20,
      reason: "large-cap · high liquidity · low volatility",
    }));
    strategy = "conservative · large-cap, liquid, low-volatility assets";
  } else if (riskTolerance === "aggressive") {
    scored = liquid.map((a, i) => ({
      asset:  a,
      score:  momoRank[i] * 0.50 + volRank[i] * 0.50,
      reason: "high momentum · high volume",
    }));
    strategy = "aggressive · high-momentum, high-volume assets";
  } else {
    scored = liquid.map((a, i) => ({
      asset:  a,
      score:  mcapRank[i] * 0.30 + volRank[i] * 0.30 + momoRank[i] * 0.40,
      reason: "balanced · momentum + liquidity + market cap",
    }));
    strategy = "balanced · momentum, liquidity, and market-cap blend";
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, poolSize);

  const rawScores  = top.map(t => t.score);
  const normScores = normalise(rawScores);

  return {
    assets: top.map((t, i) => ({
      displaySymbol: t.asset.displaySymbol,
      name:          t.asset.name,
      score:         Math.round(normScores[i] * 100) / 100,
      reason:        t.reason,
    })),
    strategy,
    selectedAt: now,
  };
}
