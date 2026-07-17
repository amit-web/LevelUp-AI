"use client";

// ── Glossary Tooltips ───────────────────────────────────────────────────────
// A static, client-side dictionary of "complex" words. Any of these words
// found in explanation text get wrapped with a soft glow and a hover/focus
// popover showing a one-line plain-language definition — no extra API call,
// no round-trip, works instantly on whatever text is already on screen.
//
// Exports:
//   GLOSSARY            the term -> definition dictionary
//   renderWithGlossary  splits a string into React nodes, swapping in
//                        <GlossaryTerm> for every recognized word

import { Fragment, type ReactNode } from "react";
import { motion } from "framer-motion";

/**
 * Deliberately general-purpose: this app explains arbitrary topics (DNS,
 * physics, databases, ...), so the list spans everyday-technical and
 * cross-domain jargon rather than one field. Keep definitions to <= ~8 words
 * so they fit a small popover without wrapping awkwardly.
 */
export const GLOSSARY: Record<string, string> = {
  // networking / web
  protocol: "an agreed set of rules for communicating",
  latency: "the delay before data starts arriving",
  bandwidth: "how much data can flow at once",
  packet: "a small chunk of data sent over a network",
  handshake: "a setup exchange before two systems talk",
  encryption: "scrambling data so only the right party can read it",
  certificate: "a digital ID that proves a server is who it claims",
  authentication: "proving you are who you say you are",

  // software / cs
  algorithm: "a step-by-step recipe for solving a problem",
  asynchronous: "happening independently, not one-after-another",
  synchronous: "happening in lockstep, one step at a time",
  abstraction: "hiding complex details behind a simple interface",
  recursive: "defined in terms of a smaller version of itself",
  hierarchical: "organized in ranked levels, like a tree",
  concurrency: "multiple things making progress at the same time",
  dependency: "something a piece of code relies on to work",
  compiler: "a program that translates code into something a machine can run",
  runtime: "the environment where a program actually executes",
  cache: "a small, fast storage layer that remembers recent results",
  kernel: "the core of an operating system managing hardware access",
  middleware: "software that sits between two systems, passing data along",
  namespace: "a named container that keeps identically-named things apart",
  serialization: "converting data into a storable/transmittable format",
  idempotent: "safe to repeat, since repeating it changes nothing further",
  heuristic: "a practical shortcut that's usually good enough",
  paradigm: "a general model or way of thinking about something",
  topology: "the shape of how things are connected",
  token: "a small unit of data standing in for something bigger",

  // physics / science
  photon: "a single particle of light",
  wavelength: "the distance between two peaks of a wave",
  frequency: "how many times something repeats per second",
  amplitude: "the size, or strength, of a wave",
  diffraction: "waves bending as they pass an edge or opening",
  refraction: "light bending as it moves between materials",
  molecule: "a group of atoms bonded together",
  particle: "a tiny piece of matter",
  velocity: "speed in a specific direction",
  momentum: "a measure of mass in motion",
  vacuum: "a space with essentially nothing in it",
  atmosphere: "the layer of gas surrounding a planet",
  radiation: "energy that travels outward as waves or particles",
  entropy: "a measure of disorder or randomness in a system",

  // general vocabulary
  ubiquitous: "found absolutely everywhere",
  empirical: "based on observation or experiment, not theory alone",
  inherent: "built into something's basic nature",
  redundant: "duplicated as a backup, in case one part fails",
  iterative: "improved through repeated small steps",
  arbitrary: "chosen without a specific reason or rule",
  analogous: "similar in a useful, comparable way",
  asymmetric: "not the same on both sides",
  symmetric: "the same on both sides",
};

/** Precompiled regex: longest terms first so e.g. "asynchronous" wins over any shorter overlapping match. */
const MATCHER = new RegExp(
  `\\b(${Object.keys(GLOSSARY)
    .sort((a, b) => b.length - a.length)
    .join("|")})\\b`,
  "gi"
);

/**
 * Splits `text` on glossary terms and returns an array of plain strings and
 * <GlossaryTerm> elements, ready to drop straight into JSX.
 */
export function renderWithGlossary(text: string, accent: string): ReactNode[] {
  const parts = text.split(MATCHER);
  return parts.map((part, i) => {
    const definition = GLOSSARY[part?.toLowerCase()];
    // Every odd index from String.split-with-capture-group is a captured match.
    if (i % 2 === 1 && definition) {
      return (
        <GlossaryTerm key={i} word={part} definition={definition} accent={accent} />
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** A single glowing, hoverable/focusable word with a definition popover. */
function GlossaryTerm({
  word,
  definition,
  accent,
}: {
  word: string;
  definition: string;
  accent: string;
}) {
  return (
    // relative + z-10 + pointer-events-auto: lets this word sit above any
    // absolutely-positioned overlay (e.g. StoryReader's tap zones) so hover
    // still reaches it even when the surrounding paragraph is click-through.
    <span className="group relative z-10 inline-block pointer-events-auto">
      <motion.span
        tabIndex={0}
        className="cursor-help rounded-sm border-b border-dotted outline-none"
        style={{ borderColor: accent }}
        whileHover={{ textShadow: `0 0 12px ${accent}` }}
        whileFocus={{ textShadow: `0 0 12px ${accent}` }}
      >
        {word}
      </motion.span>

      {/* Popover: pure CSS group-hover/focus-within so it works for both mouse and keyboard, with no per-word JS state. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-[200px] -translate-x-1/2 translate-y-1 rounded-lg border border-edge bg-panel px-2.5 py-1.5 text-xs leading-snug text-white/85 opacity-0 shadow-xl transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
        style={{ boxShadow: `0 0 18px -4px ${accent}66` }}
      >
        {definition}
      </span>
    </span>
  );
}
