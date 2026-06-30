// POST /api/skill/generate
// CMC Strategy Skill generator — Track 2 core endpoint.
// Takes a skill type + universe and returns a backtestable StrategySpec.

import { NextRequest, NextResponse } from "next/server";
import { generateStrategySpec } from "@/lib/skill/generator";
import type { SkillType } from "@/lib/skill/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SKILL_TYPES: SkillType[] = [
  "momentum",
  "sentiment_divergence",
  "regime_detection",
  "perps_divergence",
];

const VALID_RISK = ["conservative", "balanced", "aggressive"];

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const {
    skillType,
    universe,
    riskProfile = "balanced",
    customMandate,
  } = body as {
    skillType?: string;
    universe?: string[];
    riskProfile?: string;
    customMandate?: string;
  };

  if (!skillType || !VALID_SKILL_TYPES.includes(skillType as SkillType)) {
    return NextResponse.json(
      { error: `skillType must be one of: ${VALID_SKILL_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  if (!universe || !Array.isArray(universe) || universe.length === 0) {
    return NextResponse.json(
      { error: "universe must be a non-empty array of display symbols, e.g. [\"BTC/USD\", \"ETH/USD\"]" },
      { status: 400 },
    );
  }

  if (!VALID_RISK.includes(riskProfile)) {
    return NextResponse.json(
      { error: `riskProfile must be one of: ${VALID_RISK.join(", ")}` },
      { status: 400 },
    );
  }

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "GROQ_API_KEY not configured." }, { status: 500 });
  }

  try {
    const spec = await generateStrategySpec({
      skillType: skillType as SkillType,
      universe: universe.slice(0, 20),  // cap at 20 symbols
      riskProfile: riskProfile as "conservative" | "balanced" | "aggressive",
      customMandate: typeof customMandate === "string" ? customMandate : undefined,
    });

    return NextResponse.json({ spec });
  } catch (err) {
    console.error("[skill/generate]", err);
    return NextResponse.json({ error: "Strategy generation failed." }, { status: 500 });
  }
}

// GET — returns the four available skill types with descriptions
export async function GET() {
  return NextResponse.json({
    skills: [
      {
        type: "momentum",
        name: "Momentum Skill",
        description: "Blends RSI, MACD, dual-momentum, and CMC Fear & Greed into entry/exit rules. Best in trending markets.",
      },
      {
        type: "sentiment_divergence",
        name: "Sentiment Divergence Skill",
        description: "Fires when CMC Fear & Greed disagrees with technical momentum. High-conviction entries only.",
      },
      {
        type: "mean_reversion",
        name: "Mean Reversion Skill",
        description: "Buys oversold dips using Bollinger Bands and Z-score, exits when price reverts to the mean.",
      },
      {
        type: "volume_breakout",
        name: "Volume Breakout Skill",
        description: "Enters breakouts above resistance only when confirmed by volume surge and EMA crossover.",
      },
    ],
  });
}
