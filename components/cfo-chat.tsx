"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: { tool: string; result: string }[];
  pending?: boolean;
}

const SUGGESTED = [
  "What's the Fear & Greed index?",
  "Set strategy: DCA into XLM when Fear & Greed < 30",
  "Run CFO analysis on Stellar",
  "Show my Stellar wallet",
  "Buy $200 of XLM/USD",
];

const TOOL_ICON: Record<string, string> = {
  execute_buy:          "📈",
  execute_sell:         "📉",
  run_cfo_analysis:     "⚡",
  get_portfolio:        "💼",
  get_recent_decisions: "📋",
  update_risk_profile:  "🎯",
  set_trading_strategy: "🧠",
  get_market_sentiment: "🌡",
  get_stellar_wallet:   "🔑",
};

function ToolBadge({ tool, result }: { tool: string; result: string }) {
  let preview = "";
  try {
    const parsed = JSON.parse(result) as Record<string, unknown>;
    preview = String(parsed.message ?? parsed.error ?? "");
  } catch { preview = result.slice(0, 80); }
  return (
    <div className="flex items-start gap-1.5 text-[11px] text-white/35 mt-1 pl-1">
      <span className="shrink-0">{TOOL_ICON[tool] ?? "🔧"}</span>
      <span className="line-clamp-2 leading-relaxed">{preview || tool}</span>
    </div>
  );
}

export function CFOChat({ cfoName = "Ski" }: { cfoName?: string }) {
  const [open,    setOpen]    = useState(false);
  const [msgs,    setMsgs]    = useState<ChatMessage[]>([]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded,  setLoaded]  = useState(false);
  const [unread,  setUnread]  = useState(0);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  // Load history when first opened
  const loadHistory = useCallback(async () => {
    if (loaded) return;
    setLoaded(true);
    try {
      const r = await fetch("/api/cfo/chat");
      if (!r.ok) return;
      const d = await r.json() as { messages?: ChatMessage[] };
      if (d.messages?.length) setMsgs(d.messages);
    } catch { /* ignore */ }
  }, [loaded]);

  useEffect(() => {
    if (open) {
      loadHistory();
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open, loadHistory]);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [msgs, open]);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && open) setOpen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    setLoading(true);

    const userMsg: ChatMessage   = { role: "user",      content: msg };
    const pendingMsg: ChatMessage = { role: "assistant", content: "", pending: true };
    setMsgs(h => [...h, userMsg, pendingMsg]);

    try {
      const r = await fetch("/api/cfo/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: msg }),
      });
      const d = await r.json() as { reply?: string; error?: string; toolCalls?: { tool: string; result: string }[] };
      const reply: ChatMessage = {
        role:      "assistant",
        content:   d.reply ?? d.error ?? "Something went wrong.",
        toolCalls: d.toolCalls,
      };
      setMsgs(h => [...h.slice(0, -1), reply]);
      if (!open) setUnread(n => n + 1);
    } catch {
      setMsgs(h => [...h.slice(0, -1), { role: "assistant", content: "Connection error — please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* ── Floating button ──────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-all duration-200 ${
          open
            ? "bg-white/10 border border-white/20 rotate-45 scale-95"
            : "bg-foreground text-background hover:scale-105 active:scale-95"
        }`}
        aria-label={open ? "Close chat" : `Chat with ${cfoName}`}
      >
        {open ? (
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                {unread}
              </span>
            )}
          </>
        )}
      </button>

      {/* ── Chat panel ───────────────────────────────────────────────── */}
      <div className={`fixed bottom-24 right-6 z-40 flex flex-col w-[360px] max-h-[520px] rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-2xl transition-all duration-200 origin-bottom-right ${
        open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"
      }`}>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/8 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/8 border border-white/10 text-sm shrink-0">
            🤖
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">{cfoName}</p>
            <p className="text-[11px] text-white/30">Stellar Trading Agent · CMC-powered</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] text-white/30">Online</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scroll-smooth min-h-0">
          {msgs.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-6 text-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-xl">🤖</div>
              <div>
                <p className="text-sm font-medium mb-1">Hi, I&apos;m {cfoName}</p>
                <p className="text-xs text-white/35 leading-relaxed">Ask me anything about your portfolio or give me an instruction.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 mt-1">
                {SUGGESTED.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/45 hover:text-white/75 hover:border-white/20 transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {msgs.map((msg, i) => (
            <div key={msg.id ?? i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} gap-2`}>
              {msg.role === "assistant" && (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/8 text-xs mt-0.5">🤖</div>
              )}
              <div className={`max-w-[82%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-white text-black rounded-br-md"
                    : "bg-white/[0.06] border border-white/8 text-white/85 rounded-bl-md"
                }`}>
                  {msg.pending ? (
                    <span className="flex items-center gap-1 py-0.5">
                      {[0, 150, 300].map(d => (
                        <span
                          key={d}
                          className="w-1.5 h-1.5 rounded-full bg-white/35 animate-bounce"
                          style={{ animationDelay: `${d}ms` }}
                        />
                      ))}
                    </span>
                  ) : (
                    msg.content
                  )}
                </div>
                {msg.toolCalls?.map((tc, ti) => (
                  <ToolBadge key={ti} tool={tc.tool} result={tc.result} />
                ))}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-white/8 px-3 py-3 shrink-0">
          <form
            onSubmit={e => { e.preventDefault(); void send(); }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder={`Message ${cfoName}…`}
              disabled={loading}
              className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 disabled:opacity-40 transition-colors"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground text-background hover:bg-foreground/90 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <span className="w-3.5 h-3.5 border-2 border-background/20 border-t-background rounded-full animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
