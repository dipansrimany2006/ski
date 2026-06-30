"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Step = "profile" | "compliance" | "persona";

const COUNTRIES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia",
  "Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus",
  "Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil",
  "Brunei","Bulgaria","Burkina Faso","Burundi","Cabo Verde","Cambodia","Cameroon","Canada",
  "Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo","Costa Rica",
  "Croatia","Cuba","Cyprus","Czech Republic","Denmark","Djibouti","Dominica","Dominican Republic",
  "Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia",
  "Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada",
  "Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti","Honduras","Hungary","Iceland","India",
  "Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan",
  "Kenya","Kiribati","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia",
  "Libya","Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives",
  "Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova",
  "Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal",
  "Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia",
  "Norway","Oman","Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay","Peru",
  "Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saint Kitts and Nevis",
  "Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino","Saudi Arabia","Senegal",
  "Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands",
  "Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname",
  "Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste",
  "Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda",
  "Ukraine","United Arab Emirates","United Kingdom","Uruguay","Uzbekistan","Vanuatu","Venezuela",
  "Vietnam","Yemen","Zambia","Zimbabwe",
];


export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("profile");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefillEmail, setPrefillEmail] = useState<string | null>(null);

  // Profile
  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState("");
  const [experience, setExperience] = useState<"beginner" | "intermediate" | "advanced">("beginner");

  useEffect(() => {
    fetch("/api/user")
      .then((r) => r.json())
      .then((raw) => {
        const d = raw as { user?: { display_name?: string; email?: string } };
        if (d.user?.display_name) setDisplayName(d.user.display_name);
        if (d.user?.email) setPrefillEmail(d.user.email);
      })
      .catch(() => {});
  }, []);

  // Compliance
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedRisk, setAgreedRisk] = useState(false);
  const [isNotUs, setIsNotUs] = useState(false);

  // Persona
  const [risk, setRisk] = useState<"conservative" | "balanced" | "aggressive">("balanced");
  const [goal, setGoal] = useState<"preservation" | "growth" | "income">("growth");
  const [horizon, setHorizon] = useState<"short" | "medium" | "long">("medium");
  const [cfoName, setCfoName] = useState("Ski");

  async function saveProfile() {
    setSaving(true);
    setError(null);
    const now = new Date().toISOString();
    const body = {
      display_name: displayName.trim() || null,
      country: country || null,
      experience,
      risk_tolerance: risk,
      goal,
      horizon,
      cfo_name: cfoName.trim() || "Ski",
      agreed_terms_at: agreedTerms ? now : null,
      agreed_risk_at: agreedRisk ? now : null,
      is_not_us_person: isNotUs ? 1 : 0,
    };
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save profile.");
      router.push("/explore");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const stepNum = { profile: 1, compliance: 2, persona: 3 }[step];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-lg">

        {/* Progress */}
        <div className="mb-8 flex items-center gap-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex items-center gap-2">
                <div
                  className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${
                    n <= stepNum ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {n}
                </div>
                {n < 3 && (
                  <div className={`h-px flex-1 w-16 ${n < stepNum ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
            ))}
            <span className="ml-2 text-sm text-muted-foreground">
              {step === "profile"    && "Your profile"}
              {step === "compliance" && "Compliance"}
              {step === "persona"    && "Your CFO"}
            </span>
          </div>

        {/* Step 1: Profile */}
        {step === "profile" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold">Create your profile</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Required for regulatory compliance on a financial platform.
              </p>
            </div>
            <div className="space-y-4">
              {prefillEmail && (
                <div className="flex items-center gap-2.5 rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Signed in with Google</p>
                    <p className="truncate text-sm font-medium">{prefillEmail}</p>
                  </div>
                </div>
              )}
              <label className="block">
                <span className="text-sm text-muted-foreground">Display name (optional)</span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="mt-1.5 w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm outline-none focus:border-ring"
                />
              </label>
              <label className="block">
                <span className="text-sm text-muted-foreground">Country of residence</span>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm outline-none focus:border-ring"
                >
                  <option value="">Select country…</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <div>
                <span className="text-sm text-muted-foreground">Investment experience</span>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {(["beginner", "intermediate", "advanced"] as const).map((e) => (
                    <button
                      key={e}
                      onClick={() => setExperience(e)}
                      className={`rounded-lg border px-3 py-2 text-sm capitalize transition-colors ${
                        experience === e
                          ? "border-ring bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-border/80"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => setStep("compliance")}
              disabled={!country}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2: Compliance */}
        {step === "compliance" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold">Legal disclosures</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Required before accessing financial guidance tools.
              </p>
            </div>

            <div className="space-y-4 rounded-xl border border-border bg-card p-5 text-sm">
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <h3 className="font-semibold text-foreground">Risk Disclosure</h3>
                <p>
                  Cryptocurrency and digital asset investments are highly speculative and involve
                  significant risk of loss. The value of digital assets can fluctuate dramatically
                  and you may lose some or all of your invested capital.
                </p>
                <p>
                  Ski provides AI-generated financial analysis and recommendations for
                  <strong className="text-foreground"> educational and informational purposes only</strong>.
                  Nothing on this platform constitutes financial advice, investment advice, or a
                  recommendation to buy or sell any asset.
                </p>
                <p>
                  The autonomous agent feature involves real on-chain transactions. You are solely
                  responsible for any funds deposited into the agent wallet.
                </p>
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <h3 className="font-semibold text-foreground">Terms of Service</h3>
                <p className="text-muted-foreground">
                  By using Ski you agree that: (a) you are accessing this platform in a jurisdiction
                  where doing so is lawful; (b) you are at least 18 years old; (c) you will not use
                  this platform for unlawful purposes including market manipulation or money
                  laundering; (d) Ski&apos;s liability is limited to the maximum extent permitted by law.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { checked: agreedTerms, set: setAgreedTerms, label: <>I have read and accept the <strong>Terms of Service</strong>.</> },
                { checked: agreedRisk,  set: setAgreedRisk,  label: <>I understand that cryptocurrency investments carry <strong>significant risk of loss</strong> and that Ski does not provide financial advice.</> },
                { checked: isNotUs,     set: setIsNotUs,     label: <>I confirm I am <strong>not a US person</strong> and am not accessing this platform from the United States or any restricted jurisdiction.</> },
              ].map((item, i) => (
                <label key={i} className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) => item.set(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="text-sm">{item.label}</span>
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("profile")}
                className="flex-1 rounded-xl border border-border py-3 text-sm text-muted-foreground hover:bg-secondary/50"
              >
                Back
              </button>
              <button
                onClick={() => setStep("persona")}
                disabled={!agreedTerms || !agreedRisk || !isNotUs}
                className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                Agree and continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3: CFO Persona */}
        {step === "persona" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold">Configure your CFO</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                This shapes every decision Ski makes. You can change it any time.
              </p>
            </div>

            <div className="space-y-5">
              <label className="block">
                <span className="text-sm text-muted-foreground">Name your CFO</span>
                <input
                  value={cfoName}
                  onChange={(e) => setCfoName(e.target.value)}
                  placeholder="Ski"
                  className="mt-1.5 w-full max-w-xs rounded-lg border border-border bg-input px-3 py-2.5 text-sm outline-none focus:border-ring"
                />
              </label>

              {(
                [
                  {
                    label: "Risk tolerance",
                    key: "risk" as const,
                    value: risk,
                    set: setRisk,
                    opts: [
                      { v: "conservative" as const, l: "Conservative", d: "Capital preservation first." },
                      { v: "balanced" as const,     l: "Balanced",     d: "Measured growth." },
                      { v: "aggressive" as const,   l: "Aggressive",   d: "Growth-seeking." },
                    ],
                  },
                  {
                    label: "Primary goal",
                    key: "goal" as const,
                    value: goal,
                    set: setGoal,
                    opts: [
                      { v: "preservation" as const, l: "Preserve wealth",  d: "Beat inflation." },
                      { v: "growth" as const,       l: "Grow portfolio",   d: "Compound over time." },
                      { v: "income" as const,       l: "Generate income",  d: "Realise gains." },
                    ],
                  },
                  {
                    label: "Investment horizon",
                    key: "horizon" as const,
                    value: horizon,
                    set: setHorizon,
                    opts: [
                      { v: "short" as const,  l: "Short term",  d: "Under 6 months." },
                      { v: "medium" as const, l: "Medium term", d: "6–24 months." },
                      { v: "long" as const,   l: "Long term",   d: "2+ years." },
                    ],
                  },
                ] as const
              ).map((field) => (
                <div key={field.key}>
                  <span className="text-sm text-muted-foreground">{field.label}</span>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    {field.opts.map((o) => (
                      <button
                        key={o.v}
                        onClick={() => (field.set as (v: typeof o.v) => void)(o.v)}
                        className={`rounded-xl border p-3 text-left text-xs transition-colors ${
                          field.value === o.v
                            ? "border-ring bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-border/80"
                        }`}
                      >
                        <div className="font-medium text-sm">{o.l}</div>
                        <div className="mt-0.5 text-muted-foreground">{o.d}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-rose-300">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep("compliance")}
                className="flex-1 rounded-xl border border-border py-3 text-sm text-muted-foreground hover:bg-secondary/50"
              >
                Back
              </button>
              <button
                onClick={saveProfile}
                disabled={saving}
                className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Saving…" : "Launch your CFO"}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
