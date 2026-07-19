"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NextStepsMap } from "./components/NextStepsMap";
import { StoryReader } from "./components/StoryReader";
import { CodePlayground, type CodeVariable } from "./components/CodePlayground";

type Audience = "child" | "developer" | "expert";
type Style = "base" | "simpler" | "deeper" | "example";

type Card = { text: string; streaming: boolean; style: Style };
type Quiz = { question: string; options: string[]; correct: number; why: string };

const LEVELS: { key: Audience; label: string; tag: string; accent: string; glyph: string; short: string }[] = [
  { key: "child", label: "Like I'm a child", tag: "no jargon", accent: "#F5A524", glyph: "01", short: "Child" },
  { key: "developer", label: "Like I'm a developer", tag: "how it works", accent: "#22D3C5", glyph: "02", short: "Developer" },
  { key: "expert", label: "Like I'm an expert", tag: "the deep end", accent: "#A78BFA", glyph: "03", short: "Expert" },
];

const EXAMPLES = ["JavaScript event loop", "How HTTPS works", "Database indexing", "Why the sky is blue"];

const ACTIONS: { style: Style; label: string }[] = [
  { style: "simpler", label: "Simpler" },
  { style: "deeper", label: "Deeper" },
  { style: "example", label: "Example" },
];

const empty = (): Record<Audience, Card> => ({
  child: { text: "", streaming: false, style: "base" },
  developer: { text: "", streaming: false, style: "base" },
  expert: { text: "", streaming: false, style: "base" },
});

export default function Home() {
  const [topic, setTopic] = useState("");
  const [current, setCurrent] = useState("");
  const [cards, setCards] = useState<Record<Audience, Card>>(empty());
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const [related, setRelated] = useState<string[]>([]);
  const [quiz, setQuiz] = useState<Quiz[]>([]);
  const [devCode, setDevCode] = useState("");
  const [devVariables, setDevVariables] = useState<CodeVariable[]>([]);
  const [codeStatus, setCodeStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [mobileLevel, setMobileLevel] = useState<Audience>("child");
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    try {
      const h = JSON.parse(localStorage.getItem("eli_history") || "[]");
      if (Array.isArray(h)) setHistory(h.slice(0, 6));
    } catch {}
  }, []);

  const pushHistory = useCallback((t: string) => {
    setHistory((prev) => {
      const next = [t, ...prev.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 6);
      try {
        localStorage.setItem("eli_history", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  async function streamCard(t: string, audience: Audience, style: Style) {
    setCards((c) => ({ ...c, [audience]: { text: "", streaming: true, style } }));
    try {
      const res = await fetch("/api/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: t, audience, style }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Stream failed.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setCards((c) => ({
          ...c,
          [audience]: { ...c[audience], text: c[audience].text + chunk },
        }));
      }
    } catch (e) {
      setCards((c) => ({
        ...c,
        [audience]: { ...c[audience], text: e instanceof Error ? e.message : "Failed." },
      }));
    } finally {
      setCards((c) => ({ ...c, [audience]: { ...c[audience], streaming: false } }));
    }
  }

  async function fetchCode(q: string) {
    setCodeStatus("loading");
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch("/api/code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: q }),
        });
        const data = await res.json();
        if (res.ok && data.code) {
          setDevCode(data.code);
          setDevVariables(Array.isArray(data.variables) ? data.variables : []);
          setCodeStatus("ready");
          return;
        }
        // BUG FIX: this used to retry identically on every failure, including
        // 4xx client errors (bad/too-long topic, missing key) that will
        // never succeed no matter how many times we resend the exact same
        // request — it just burned 2 more requests and ~2.4s before failing
        // anyway. Only 5xx/network failures are worth retrying.
        if (res.status >= 400 && res.status < 500) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 1200));
    }
    setCodeStatus("error");
  }

  async function explain(t?: string) {
    const q = (t ?? topic).trim();
    if (!q || active) return;
    setTopic(q);
    setCurrent(q);
    setActive(true);
    setError("");
    setCards(empty());
    setRelated([]);
    setQuiz([]);
    setDevCode("");
    setDevVariables([]);
    setCodeStatus("idle");
    pushHistory(q);
    window.scrollTo({ top: 260, behavior: "smooth" });

    // extras (related + quiz) ko cards ke saath parallel fire karo, retry ke saath
    (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch("/api/extras", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic: q }),
          });
          const data = await res.json();
          if (res.ok && (data.related?.length || data.quiz?.length)) {
            setRelated(data.related || []);
            setQuiz(data.quiz || []);
            return;
          }
          // BUG FIX: same blind-retry issue as fetchCode — a 4xx here (e.g.
          // an empty/invalid topic) is deterministic and retrying it 3x
          // just delays the eventual give-up with no chance of success.
          if (res.status >= 400 && res.status < 500) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 1500));
      }
    })();

    // "Try it live" code playground — independent of the explanation
    // stream so a slow/failed generation never blocks the text.
    fetchCode(q);

    await Promise.all(LEVELS.map((l) => streamCard(q, l.key, "base")));
    setActive(false);
  
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") explain();
  }

  const hasResult = current && (active || cards.child.text || cards.developer.text);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 pb-28 pt-12 sm:pt-16">
      <header className="mb-9 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-edge bg-panel/60 px-3 py-1 text-xs text-white/50">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-expert" />
          an AI tutor that meets you at your level
        </div>
        <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl">
          Understand anything, like I&apos;m
          <br />
          <span className="text-child">a kid</span>, <span className="text-dev">a dev</span>, and{" "}
          <span className="text-expert">an expert</span>.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-white/55 sm:text-base">
          One topic, explained live at three depths. Then go simpler, go deeper, branch into related
          ideas, and test yourself — all in one flow.
        </p>
      </header>

      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col gap-3 rounded-2xl border border-edge bg-panel/70 p-2 shadow-2xl sm:flex-row sm:items-center">
          <input
            ref={inputRef}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="e.g. how does DNS work?"
            className="w-full flex-1 bg-transparent px-4 py-3 text-base text-white placeholder:text-white/35 focus:outline-none"
          />
          <button
            onClick={() => explain()}
            disabled={active || !topic.trim()}
            className="shrink-0 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[128px]"
          >
            {active ? "Thinking…" : "Explain"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-white/35">Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => explain(ex)}
              disabled={active}
              className="rounded-full border border-edge bg-panel/40 px-3 py-1 text-xs text-white/60 transition hover:border-white/25 hover:text-white disabled:opacity-40"
            >
              {ex}
            </button>
          ))}
        </div>

        {history.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-white/25">Recent:</span>
            {history.map((h) => (
              <button
                key={h}
                onClick={() => explain(h)}
                disabled={active}
                className="rounded-full px-2 py-0.5 text-xs text-white/40 underline-offset-2 transition hover:text-white/80 hover:underline disabled:opacity-40"
              >
                {h}
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-auto mt-8 max-w-2xl rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {hasResult ? (
        <>
          <p className="mb-5 mt-12 text-center text-sm text-white/40">
            Explaining <span className="font-medium text-white/70">&ldquo;{current}&rdquo;</span>
          </p>

          {/* Desktop / tablet: all three levels visible at once, side by side. */}
          <div className="hidden gap-4 md:grid md:grid-cols-3">
            {LEVELS.map((lvl, i) => (
              <LevelCard
                key={lvl.key}
                lvl={lvl}
                card={cards[lvl.key]}
                onAction={(style) => streamCard(current, lvl.key, style)}
                motion={{
                  initial: { opacity: 0, y: 16 },
                  animate: { opacity: 1, y: 0 },
                  transition: { delay: i * 0.06 },
                }}
              />
            ))}
          </div>

          {/* Mobile: one level at a time behind a tab switcher — three full cards
              stacked vertically doesn't fit a small screen. The pill behind the
              active tab and the card below both use layout animation so switching
              feels like a morph, not a flash/jump cut. */}
          <div className="md:hidden">
            <div className="relative mb-4 flex rounded-full border border-edge bg-panel/60 p-1">
              {LEVELS.map((lvl) => {
                const isActive = mobileLevel === lvl.key;
                return (
                  <button
                    key={lvl.key}
                    onClick={() => setMobileLevel(lvl.key)}
                    className="relative flex-1 rounded-full px-2 py-2 text-xs font-semibold transition-colors"
                  >
                    {isActive && (
                      <motion.span
                        layoutId="mobileLevelPill"
                        className="absolute inset-0 rounded-full"
                        style={{ backgroundColor: lvl.accent }}
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    )}
                    <span className={`relative z-10 ${isActive ? "text-black" : "text-white/55"}`}>
                      {lvl.short}
                    </span>
                  </button>
                );
              })}
            </div>

            <motion.div layout transition={{ type: "spring", stiffness: 320, damping: 34 }}>
              <AnimatePresence mode="wait">
                {LEVELS.filter((lvl) => lvl.key === mobileLevel).map((lvl) => (
                  <LevelCard
                    key={lvl.key}
                    lvl={lvl}
                    card={cards[lvl.key]}
                    onAction={(style) => streamCard(current, lvl.key, style)}
                    motion={{
                      initial: { opacity: 0, x: 12 },
                      animate: { opacity: 1, x: 0 },
                      exit: { opacity: 0, x: -12 },
                      transition: { duration: 0.22 },
                    }}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          </div>

          <AnimatePresence>
            {codeStatus !== "idle" && !cards.developer.streaming && (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-14"
              >
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${codeStatus === "loading" ? "animate-pulse" : ""}`}
                    style={{ backgroundColor: "#22D3C5" }}
                  />
                  <h3 className="font-display text-lg font-semibold text-white">Try it live</h3>
                  <span className="text-xs text-white/30">
                    {codeStatus === "loading"
                      ? "— generating an editable example…"
                      : "— from the developer explanation, tweak the values and watch the console"}
                  </span>
                </div>

                {codeStatus === "loading" && <PlaygroundSkeleton accent="#22D3C5" />}

                {codeStatus === "error" && (
                  <div className="flex items-center justify-between rounded-2xl border border-edge bg-panel/60 px-5 py-4 text-sm text-white/50">
                    <span>Couldn&apos;t generate a live example this time.</span>
                    <button
                      onClick={() => fetchCode(current)}
                      className="rounded-lg border border-edge px-3 py-1.5 text-xs text-white/70 transition hover:border-white/25 hover:text-white"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {codeStatus === "ready" && (
                  <CodePlayground code={devCode} variables={devVariables} accent="#22D3C5" />
                )}
              </motion.section>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {related.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-14"
              >
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="font-display text-lg font-semibold text-white">Continue learning</h3>
                  <span className="text-xs text-white/30">— drag the map, click a node to branch</span>
                </div>
                <NextStepsMap current={current} related={related} disabled={active} onSelect={explain} />
              </motion.section>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {quiz.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-14"
              >
                <div className="mb-4 flex items-center gap-2">
                  <h3 className="font-display text-lg font-semibold text-white">Test yourself</h3>
                  <span className="text-xs text-white/30">— did it stick?</span>
                </div>
                <QuizBlock quiz={quiz} />
              </motion.section>
            )}
          </AnimatePresence>
        </>
      ) : (
        !error && (
          <div className="mt-16 text-center text-sm text-white/25">
            Type a topic to start a live, three-level explanation.
          </div>
        )
      )}

      <footer className="mt-24 text-center text-[11px] text-white/25">
        Live explanations · follow-ups · knowledge branches · self-testing
      </footer>
    </main>
  );
}

/** One audience-level card — header, streaming/story text, and the Simpler/Deeper/Example row. Shared by the desktop 3-up grid and the mobile tab view so both stay in sync. */
function LevelCard({
  lvl,
  card,
  onAction,
  motion: motionProps,
}: {
  lvl: { key: Audience; label: string; tag: string; accent: string; glyph: string; short: string };
  card: Card;
  onAction: (style: Style) => void;
  motion?: { initial?: any; animate?: any; exit?: any; transition?: any };
}) {
  return (
    <motion.article
      initial={motionProps?.initial ?? { opacity: 0, y: 16 }}
      animate={motionProps?.animate ?? { opacity: 1, y: 0 }}
      exit={motionProps?.exit}
      transition={motionProps?.transition}
      className="relative flex flex-col rounded-2xl border border-edge bg-panel/60 p-5"
    >
      <div
        className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl"
        style={{ backgroundColor: lvl.accent }}
      />
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-display text-lg font-semibold" style={{ color: lvl.accent }}>
            {lvl.glyph}
          </span>
          <div>
            <h2 className="text-sm font-semibold text-white">{lvl.label}</h2>
            <p className="text-[11px] text-white/40">
              {card.style === "base" ? lvl.tag : `${card.style} view`}
            </p>
          </div>
        </div>
        {card.text && !card.streaming && <CopyButton text={card.text} accent={lvl.accent} />}
      </div>

      <div className="min-h-[96px] flex-1">
        {card.text ? (
          card.streaming ? (
            // Still streaming: show the raw growing text with a
            // blinking cursor. Pagination only kicks in once the
            // full explanation has arrived — you can't page
            // through slides that don't exist yet.
            <p className="text-[15px] leading-relaxed text-white/85">
              {card.text}
              <span
                className="ml-0.5 inline-block h-[15px] w-[7px] translate-y-[2px] animate-pulse"
                style={{ backgroundColor: lvl.accent }}
              />
            </p>
          ) : (
            <StoryReader text={card.text} accent={lvl.accent} />
          )
        ) : (
          <Skeleton />
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-edge pt-3">
        {ACTIONS.map((a) => (
          <button
            key={a.style}
            onClick={() => onAction(a.style)}
            disabled={card.streaming}
            className="rounded-lg border border-edge px-2.5 py-1 text-[11px] text-white/55 transition hover:border-white/25 hover:text-white disabled:opacity-40"
            style={
              card.style === a.style && !card.streaming
                ? { color: lvl.accent, borderColor: lvl.accent }
                : undefined
            }
          >
            {a.label}
          </button>
        ))}
      </div>
    </motion.article>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2.5 pt-1">
      {[100, 92, 96, 60].map((w, i) => (
        <motion.div
          key={i}
          className="h-3 rounded bg-white/10"
          style={{ width: `${w}%` }}
          animate={{ opacity: [0.35, 0.7, 0.35] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.12 }}
        />
      ))}
    </div>
  );
}

/** Placeholder shaped like the finished playground — toolbar + split editor/console — while the snippet generates. */
function PlaygroundSkeleton({ accent }: { accent: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-edge" style={{ borderColor: `${accent}30` }}>
      <div className="flex items-center gap-2 border-b border-edge bg-black/25 px-4 py-3">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
        <div className="h-2.5 w-16 animate-pulse rounded bg-white/10" />
        <div className="h-2.5 w-10 animate-pulse rounded-full bg-white/5" />
      </div>
      <div className="grid grid-cols-2 gap-px bg-edge">
        {[0, 1].map((col) => (
          <div key={col} className="space-y-2.5 bg-panel/60 p-4" style={{ height: 360 }}>
            {[95, 80, 88, 60, 70, 40].map((w, i) => (
              <motion.div
                key={i}
                className="h-2.5 rounded bg-white/10"
                style={{ width: `${w}%` }}
                animate={{ opacity: [0.3, 0.65, 0.3] }}
                transition={{ duration: 1.3, repeat: Infinity, delay: (col * 6 + i) * 0.1 }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CopyButton({ text, accent }: { text: string; accent: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
      className="rounded-lg border border-edge px-2.5 py-1 text-[11px] text-white/50 transition hover:text-white"
      style={copied ? { color: accent, borderColor: accent } : undefined}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ── Gamified quiz ──────────────────────────────────────────────────────────
// Component tree:
//   QuizBlock            orchestrates state (which option was picked per question)
//   ├── QuizProgressBar  visual "N of M answered" bar, updates as questions are answered
//   ├── QuizQuestion[]   one card per question, renders its own option grid
//   │     └── QuizOption[]  a single answer button — owns the press / glow / shake feel
//   └── ScoreCard        final tally, shown once every question has been answered

/**
 * Top-level quiz container. Owns the only piece of state that matters here —
 * which option index the user picked for each question — and derives
 * progress/score from it so children stay dumb and presentational.
 */
function QuizBlock({ quiz }: { quiz: Quiz[] }) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  const answered = Object.keys(picked).length;
  const score = quiz.reduce((s, q, i) => s + (picked[i] === q.correct ? 1 : 0), 0);

  return (
    <div className="space-y-4">
      <QuizProgressBar answered={answered} total={quiz.length} />

      <div className="space-y-3">
        {quiz.map((q, qi) => (
          <QuizQuestion
            key={qi}
            index={qi}
            data={q}
            choice={picked[qi]}
            onPick={(oi) => setPicked((p) => ({ ...p, [qi]: oi }))}
          />
        ))}
      </div>

      <AnimatePresence>
        {answered === quiz.length && <ScoreCard score={score} total={quiz.length} />}
      </AnimatePresence>
    </div>
  );
}

/** Shows how many questions are left, as both a filled bar and a short label. */
function QuizProgressBar({ answered, total }: { answered: number; total: number }) {
  const pct = total === 0 ? 0 : (answered / total) * 100;
  const remaining = total - answered;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs text-white/45">
        <span>
          {answered} of {total} answered
        </span>
        <span>{remaining === 0 ? "Done" : `${remaining} left`}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-expert"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
        />
      </div>
    </div>
  );
}

/** One question card: the prompt, its option grid, and the reveal explanation. */
function QuizQuestion({
  index,
  data,
  choice,
  onPick,
}: {
  index: number;
  data: Quiz;
  choice: number | undefined;
  onPick: (optionIndex: number) => void;
}) {
  const done = choice !== undefined;

  return (
    <div className="rounded-2xl border border-edge bg-panel/50 p-5">
      <p className="mb-3 text-sm font-medium text-white/90">
        <span className="mr-2 text-white/30">Q{index + 1}</span>
        {data.question}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {data.options.map((opt, oi) => (
          <QuizOption
            key={oi}
            label={opt}
            isCorrect={oi === data.correct}
            isPicked={oi === choice}
            done={done}
            onClick={() => onPick(oi)}
          />
        ))}
      </div>
      <AnimatePresence>
        {done && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-3 text-xs text-white/50"
          >
            {choice === data.correct ? "Correct. " : "Not quite. "}
            {data.why}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * A single answer button. Handles all of the tactile feedback:
 * - always: a physical "press down" squash on tap (before the question is answered)
 * - once answered + this was the right pick: a soft green glow pulse
 * - once answered + this was picked but wrong: a quick horizontal shake
 */
function QuizOption({
  label,
  isCorrect,
  isPicked,
  done,
  onClick,
}: {
  label: string;
  isCorrect: boolean;
  isPicked: boolean;
  done: boolean;
  onClick: () => void;
}) {
  const revealCorrect = done && isCorrect; // always highlight the right answer once revealed
  const revealWrongPick = done && isPicked && !isCorrect; // only the user's own wrong pick shakes

  let cls = "border-edge text-white/70 hover:border-white/25";
  if (revealCorrect) cls = "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
  else if (revealWrongPick) cls = "border-red-500/50 bg-red-500/10 text-red-300";
  else if (done) cls = "border-edge text-white/30";

  return (
    <motion.button
      disabled={done}
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default ${cls}`}
      // Squash-and-settle press feedback — only meaningful before the answer locks in.
      whileTap={!done ? { scale: 0.96, y: 2 } : undefined}
      // Correct answers get a soft green glow that blooms in then settles.
      // Wrong picks get a short horizontal shake instead of a glow.
      animate={
        revealCorrect
          ? {
              boxShadow: [
                "0 0 0px rgba(16,185,129,0)",
                "0 0 22px rgba(16,185,129,0.55)",
                "0 0 10px rgba(16,185,129,0.25)",
              ],
            }
          : revealWrongPick
            ? { x: [0, -8, 8, -6, 6, -3, 0] }
            : { boxShadow: "0 0 0px rgba(16,185,129,0)", x: 0 }
      }
      transition={
        revealCorrect
          ? { duration: 0.7, ease: "easeOut" }
          : revealWrongPick
            ? { duration: 0.4, ease: "easeInOut" }
            : { duration: 0.15 }
      }
    >
      {label}
    </motion.button>
  );
}

/** Final score summary, shown once every question in the set has been answered. */
function ScoreCard({ score, total }: { score: number; total: number }) {
  const perfect = score === total;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative rounded-2xl border border-expert/40 bg-expert/10 px-5 py-4 text-center"
    >
      {perfect && <Confetti />}
      <span className="font-display text-2xl font-semibold text-white">
        {score}/{total}
      </span>
      <span className="ml-2 text-sm text-white/60">
        {perfect ? "Nailed it." : score === 0 ? "Worth another read." : "Getting there."}
      </span>
    </motion.div>
  );
}

const CONFETTI_COLORS = ["#F5A524", "#22D3C5", "#A78BFA", "#34D399", "#F472B6"];

/** A quick burst of colored particles fired once from the center of a perfect ScoreCard — no extra deps, just Framer Motion transforms + opacity. */
function Confetti() {
  const particles = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
        const distance = 60 + Math.random() * 50;
        return {
          id: i,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance - 20,
          delay: Math.random() * 0.15,
        };
      }),
    []
  );

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: p.color }}
          initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          animate={{ opacity: 0, x: p.dx, y: p.dy, scale: 0.4 }}
          transition={{ duration: 0.9, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
