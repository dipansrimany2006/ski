// Step 5: LLM Arbiter — pass/veto only. Uses Groq for speed.
// LLM cannot alter any signal or sizing number — it reasons and may veto.

import type { Signal, ArbitrationResult, LLMArbiterResult } from "./types";
import Groq from "groq-sdk";

const MODEL = "llama-3.3-70b-versatile";

export async function llmArbiter(
  displaySymbol: string,
  blendedSignal: number,
  signals: Signal[],
  arbitration: ArbitrationResult,
  priceUsd: number,
  userMandate?: string,
): Promise<LLMArbiterResult> {
  // Fast-path: if price is valid and signal direction matches action, skip LLM entirely
  if (priceUsd > 0 && Math.abs(blendedSignal) >= 0.15 && !userMandate) {
    const directionOk = (blendedSignal > 0 && signals.filter(s => s.value > 0).length > signals.length / 3);
    if (directionOk) return { pass: true, rationale: "signal_confident — fast-path bypass" };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { pass: true, rationale: "groq_api_key_missing — defaulting to pass" };

  const groq = new Groq({ apiKey });

  const direction = blendedSignal > 0 ? "BUY" : "SELL";

  // Count how many signals explicitly agree or disagree with the direction
  const agreeing    = signals.filter(s => (blendedSignal > 0 ? s.value > 0.05 : s.value < -0.05)).length;
  const disagreeing = signals.filter(s => (blendedSignal > 0 ? s.value < -0.3  : s.value > 0.3)).length;

  const mandateSection = userMandate
    ? `\nUSER'S NATURAL LANGUAGE STRATEGY MANDATE:\n"${userMandate}"\n\nAdditional veto condition: veto (pass: false) if the proposed trade CLEARLY violates the intent of the mandate above. Apply judgment — if the mandate says "only buy on dips" and the signal is a buy during a strong uptrend, veto. If the mandate says "avoid CAKE" and the asset is CAKE, veto. When uncertain whether the trade violates the mandate, default to pass: true.\n`
    : "";

  const prompt = `You are a last-line sanity check for an automated trading system. Signal strength and position sizing are already handled by other modules — your ONLY job is to catch CATASTROPHIC logical errors and mandate violations.

FACTS (do not question these):
- Asset: ${displaySymbol}
- Blended signal: ${blendedSignal.toFixed(4)} (POSITIVE = bullish, NEGATIVE = bearish)
- Proposed direction: ${direction}
- Signals agreeing: ${agreeing}/${signals.length}
- Signals strongly disagreeing: ${disagreeing}/${signals.length}
- Regime: ${arbitration.regime}, ADX=${arbitration.adxValue.toFixed(2)}
- Price: ${priceUsd.toFixed(6)}
${mandateSection}
VETO ONLY if ONE of these exact conditions is true:
1. The blended signal sign CONTRADICTS the direction (e.g., signal is positive but direction is SELL)
2. Price is exactly 0 or negative (data error)
3. More than 80% of signals strongly disagree with the direction
4. The trade CLEARLY violates the user's strategy mandate (if provided above)

For EVERYTHING ELSE — including "signal seems weak", "market looks uncertain", personal opinion — respond with pass: true.

IMPORTANT: Signal strength is already checked before you are called. Do not second-guess it.

Respond ONLY with JSON: {"pass": true, "rationale": "one sentence"}
Default when uncertain: {"pass": true, "rationale": "no catastrophic contradiction detected"}`;

  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 150,
      response_format: { type: "json_object" },
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(text) as { pass?: boolean; rationale?: string };
    return {
      pass: parsed.pass !== false,   // default to pass if missing
      rationale: parsed.rationale ?? "no rationale provided",
    };
  } catch {
    // Always default to pass on error — don't block trades due to LLM failure
    return { pass: true, rationale: "llm_arbiter_error — defaulting to pass" };
  }
}
