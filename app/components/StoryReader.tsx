"use client";

// ── Story Reader (Progressive Disclosure) ───────────────────────────────────
// Breaks a finished explanation into short "slides" (a sentence or two each)
// and lets the user step through them at their own pace, Instagram-story
// style: segmented progress bar up top, tap the left/right half of the slide
// (or use arrow keys / the on-screen arrows) to move. Nothing auto-advances —
// the user fully controls the pace, per the design brief.
//
// Component tree:
//   StoryReader        splits text into slides, owns the current index
//   └── SegmentedBar    the row of progress segments at the top

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { renderWithGlossary } from "./GlossaryTooltip";

/** Roughly how many characters a single slide should hold before wrapping to the next one. */
const MAX_SLIDE_CHARS = 130;

/**
 * Groups sentences into bite-sized slides. Keeps whole sentences together —
 * a slide only grows past MAX_SLIDE_CHARS if a single sentence is already
 * longer than that on its own.
 */
function splitIntoSlides(text: string): string[] {
  const sentences: string[] = text.match(/[^.!?]+[.!?]+(\s+|$)/g) ?? [];

  // BUG FIX: the regex above requires terminal punctuation (.!?), so any
  // trailing fragment without one — e.g. a response cut off by max_tokens,
  // or a model that just doesn't end on punctuation — is invisible to
  // `match` and used to vanish from the slides entirely. Recover it by
  // comparing how much of `text` the regex actually consumed and treating
  // whatever's left over as one final "sentence".
  const matchedLength = sentences.reduce((sum, s) => sum + s.length, 0);
  const remainder = text.slice(matchedLength).trim();
  if (remainder) sentences.push(remainder);

  const slides: string[] = [];
  let current = "";

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (current && candidate.length > MAX_SLIDE_CHARS) {
      slides.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) slides.push(current);
  return slides.length > 0 ? slides : [text];
}

export function StoryReader({ text, accent }: { text: string; accent: string }) {
  const slides = useMemo(() => splitIntoSlides(text), [text]);
  const [index, setIndex] = useState(0);

  // A fresh explanation (new topic, or "Simpler"/"Deeper"/"Example") should
  // always start back at the first slide rather than an out-of-range index.
  useEffect(() => setIndex(0), [text]);

  const goNext = () => setIndex((i) => Math.min(i + 1, slides.length - 1));
  const goPrev = () => setIndex((i) => Math.max(i - 1, 0));

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") goNext();
    if (e.key === "ArrowLeft") goPrev();
  }

  // Nothing to page through — just render the text plainly (still with glossary glow).
  if (slides.length <= 1) {
    return <p className="text-[15px] leading-relaxed text-white/85">{renderWithGlossary(text, accent)}</p>;
  }

  return (
    <div
      className="flex h-full flex-col outline-none"
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="Bite-sized explanation, use arrow keys or tap to navigate"
    >
      <SegmentedBar total={slides.length} current={index} accent={accent} />

      <div className="relative mt-3 flex-1">
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            // pointer-events-none passes hover/click through to the tap
            // zones below everywhere EXCEPT glossary words, which opt back
            // in via pointer-events-auto (see GlossaryTooltip) so tooltips
            // still work without blocking navigation on the rest of the text.
            className="pointer-events-none text-[15px] leading-relaxed text-white/85"
          >
            {renderWithGlossary(slides[index], accent)}
          </motion.p>
        </AnimatePresence>

        {/* Tap zones behind the text: left third = previous, right two-thirds = next — the same split Instagram stories use. z-0 keeps them under glossary words but the pass-through paragraph above still lets clicks land here. */}
        <button
          type="button"
          aria-label="Previous slide"
          onClick={goPrev}
          disabled={index === 0}
          className="absolute inset-y-0 left-0 z-0 w-1/3 cursor-w-resize disabled:cursor-default"
        />
        <button
          type="button"
          aria-label="Next slide"
          onClick={goNext}
          disabled={index === slides.length - 1}
          className="absolute inset-y-0 right-0 z-0 w-2/3 cursor-e-resize disabled:cursor-default"
        />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-edge pt-2.5">
        <button
          type="button"
          onClick={goPrev}
          disabled={index === 0}
          className="rounded-lg px-2 py-1 text-xs text-white/50 transition hover:text-white disabled:opacity-30"
        >
          ‹ Back
        </button>
        <span className="text-[11px] text-white/35">
          {index + 1} / {slides.length}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={index === slides.length - 1}
          className="rounded-lg px-2 py-1 text-xs text-white/50 transition hover:text-white disabled:opacity-30"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}

/** The row of pill segments across the top, like Instagram story progress. Fully lit = seen, dim = upcoming. */
function SegmentedBar({ total, current, accent }: { total: number; current: number; accent: string }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: accent }}
            initial={false}
            animate={{ width: i <= current ? "100%" : "0%" }}
            transition={{ duration: 0.25 }}
          />
        </div>
      ))}
    </div>
  );
}
