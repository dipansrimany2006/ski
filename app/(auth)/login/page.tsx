"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginInner() {
  const from = useSearchParams().get("from") ?? "/explore";
  const error = useSearchParams().get("error");

  const [email, setEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  function handleEmailContinue(e: React.FormEvent) {
    e.preventDefault();
    setEmailMsg("Email sign-in coming soon — please use Google to continue.");
  }

  const errorMessages: Record<string, string> = {
    oauth_mismatch: "OAuth state mismatch. Please try again.",
    google_failed: "Google sign-in failed. Please try again.",
    config: "Authentication is not configured yet.",
  };

  return (
    <div className="flex min-h-screen">
      {/* Left — illustration */}
      <div className="relative hidden w-1/2 lg:block">
        <Image
          src="/signin-asset.png"
          alt="Ski — AI CFO trading platform"
          fill
          className="object-cover"
          priority
        />
      </div>

      {/* Right — form */}
      <div className="relative flex w-full flex-col justify-center bg-background px-8 py-12 lg:w-1/2 lg:px-16">
        {/* Close */}
        <Link
          href="/explore"
          className="absolute right-6 top-6 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Back to explore"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </Link>

        <div className="mx-auto w-full max-w-[380px]">
          {/* Logo (mobile only) */}
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <Image src="/ski-logo.png" alt="Ski" width={28} height={28} className="rounded-lg" />
            <span className="font-semibold">Ski</span>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight">Sign up or Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your email to sign in to your account. If you don&apos;t have an account yet,
            one will be created for you.
          </p>

          {error && errorMessages[error] && (
            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">
              {errorMessages[error]}
            </div>
          )}

          {/* Email form */}
          <form onSubmit={handleEmailContinue} className="mt-6 space-y-3">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-secondary px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/80"
            >
              Continue
            </button>
            {emailMsg && <p className="text-xs text-white/40">{emailMsg}</p>}
          </form>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">Or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Google */}
          <a
            href={`/api/auth/google?from=${encodeURIComponent(from)}`}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-foreground px-4 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </a>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By continuing you agree to Ski&apos;s{" "}
            <span className="underline underline-offset-2 cursor-pointer">Privacy Policy</span> and{" "}
            <span className="underline underline-offset-2 cursor-pointer">Terms of Service</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}
