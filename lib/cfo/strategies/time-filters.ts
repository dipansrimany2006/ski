// Time-based filters — ported from Python time_filters.py
// Uses new Date() instead of deprecated datetime.utcnow()

import type { GateResult } from "../types";

export type Session = "us" | "eu" | "asia" | "always";

// Trading sessions in UTC hours
const SESSIONS: Record<string, [number, number]> = {
  us:   [13, 20],   // 9am–4pm ET
  eu:   [7,  15],   // 9am–5pm CET
  asia: [0,   8],   // Tokyo + Sydney overlap
};

export function sessionFilter(session: Session = "always"): GateResult {
  if (session === "always") return { pass: true, reason: "session=always" };
  const now = new Date();
  const hour = now.getUTCHours();
  const [start, end] = SESSIONS[session] ?? [0, 24];
  const pass = hour >= start && hour < end;
  return {
    pass,
    reason: pass
      ? `session=${session} active (utc_hour=${hour})`
      : `session=${session} closed (utc_hour=${hour}, window=${start}-${end})`,
  };
}

// day 0=Sun, 1=Mon, ..., 6=Sat
export function dayOfWeekFilter(allowedDays: number[] = [1, 2, 3, 4, 5]): GateResult {
  const day = new Date().getUTCDay();
  const pass = allowedDays.includes(day);
  return {
    pass,
    reason: pass
      ? `day_of_week=${day} allowed`
      : `day_of_week=${day} blocked (allowed=${allowedDays.join(",")})`,
  };
}
