"use client";

// ── Code Playground ─────────────────────────────────────────────────────────
// The "Try it live" section under the developer explanation. An AI-generated
// JS snippet runs in-browser via Sandpack; a custom toolbar layered on top
// exposes the snippet's tweakable consts as one-click preset chips (in
// addition to free typing in the editor itself) so a reader — or a judge —
// can see the console output change without hand-editing anything.
//
// Component tree:
//   CodePlayground   owns the Sandpack session (files/theme), lays out the
//                     toolbar + split editor/console
//   └── Toolbar       reads/writes the live file via useSandpack; must live
//                     inside SandpackProvider to reach that context

import { useMemo, useState } from "react";
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackConsole,
  useSandpack,
} from "@codesandbox/sandpack-react";
import type { SandpackTheme } from "@codesandbox/sandpack-react";

export type CodeVariable = { name: string; options: string[] };

const baseTheme: SandpackTheme = {
  colors: {
    surface1: "#12151C",
    surface2: "#171B24",
    surface3: "#232936",
    clickable: "#8a8f98",
    base: "#e4e4e7",
    disabled: "#4b5563",
    hover: "#ffffff",
    accent: "#22D3C5",
    error: "#f87171",
    errorSurface: "#2a1215",
  },
  syntax: {
    plain: "#e4e4e7",
    comment: { color: "#6b7280", fontStyle: "italic" },
    keyword: "#c084fc",
    tag: "#5eead4",
    punctuation: "#9ca3af",
    definition: "#f5a524",
    property: "#60a5fa",
    static: "#f472b6",
    string: "#a3e635",
  },
  font: {
    body: "var(--font-body), sans-serif",
    mono: "'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace",
    size: "13px",
    lineHeight: "20px",
  },
};

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function CodePlayground({
  code,
  variables,
  accent,
}: {
  code: string;
  variables: CodeVariable[];
  accent: string;
}) {
  const files = useMemo(() => ({ "/index.js": { code, active: true } }), [code]);
  const theme = useMemo<SandpackTheme>(
    () => ({ ...baseTheme, colors: { ...baseTheme.colors, accent } }),
    [accent]
  );

  return (
    <div
      className="overflow-hidden rounded-2xl border shadow-2xl"
      style={{ borderColor: `${accent}40`, boxShadow: `0 0 40px -12px ${accent}30` }}
    >
      <SandpackProvider
        key={code}
        template="vanilla"
        theme={theme}
        files={files}
        customSetup={{ entry: "/index.js" }}
        options={{ autorun: true, recompileDelay: 300 }}
      >
        <Toolbar originalCode={code} variables={variables} accent={accent} />
        <SandpackLayout style={{ borderRadius: 0, border: "none" }}>
          <SandpackCodeEditor showLineNumbers showTabs={false} style={{ height: 360 }} />
          <SandpackConsole standalone style={{ height: 360 }} resetOnPreviewRestart />
        </SandpackLayout>
      </SandpackProvider>
    </div>
  );
}

function Toolbar({
  originalCode,
  variables,
  accent,
}: {
  originalCode: string;
  variables: CodeVariable[];
  accent: string;
}) {
  const { sandpack } = useSandpack();
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Free-typed value per variable, for devs who want something other than
  // the 2-3 canned presets — keyed by variable name so each row keeps its
  // own draft independently.
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const dirty = activeChip !== null;

  /** Swaps a variable's value in the live file via regex replace, then re-runs (autorun) to show the new console output. */
  function applyPreset(name: string, value: string) {
    const current = sandpack.files["/index.js"]?.code ?? originalCode;
    const re = new RegExp(`(\\bconst\\s+${escapeRegExp(name)}\\s*=\\s*)[^;]+;`);
    if (!re.test(current)) return;
    sandpack.updateFile("/index.js", current.replace(re, `$1${value};`));
    setActiveChip(`${name}:${value}`);
  }

  function applyCustom(name: string) {
    const value = customValues[name]?.trim();
    if (!value) return;
    applyPreset(name, value);
  }

  function reset() {
    sandpack.updateFile("/index.js", originalCode);
    setActiveChip(null);
    setCustomValues({});
  }

  function copy() {
    navigator.clipboard.writeText(sandpack.files["/index.js"]?.code ?? originalCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="border-b border-edge bg-black/25 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
              style={{ backgroundColor: accent }}
            />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
          </span>
          <span className="text-xs font-medium text-white/70">index.js</span>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/35">
            live
          </span>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/35">
            AI generated
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {dirty && (
            <button
              onClick={reset}
              className="rounded-lg border border-edge px-2.5 py-1 text-[11px] text-white/55 transition hover:border-white/25 hover:text-white"
            >
              Reset
            </button>
          )}
          <button
            onClick={copy}
            className="rounded-lg border border-edge px-2.5 py-1 text-[11px] text-white/55 transition hover:border-white/25 hover:text-white"
            style={copied ? { color: accent, borderColor: accent } : undefined}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {variables.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {variables.map((v) => (
            <div key={v.name} className="flex items-center gap-1.5">
              <span className="font-mono text-[11px] text-white/35">{v.name}</span>
              {v.options.map((opt) => {
                const key = `${v.name}:${opt}`;
                const isActive = activeChip === key;
                return (
                  <button
                    key={key}
                    onClick={() => applyPreset(v.name, opt)}
                    className="max-w-[140px] truncate rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition"
                    style={
                      isActive
                        ? { borderColor: accent, color: accent, backgroundColor: `${accent}1a` }
                        : { borderColor: "#1E232D", color: "rgba(255,255,255,0.55)" }
                    }
                    title={`Try ${v.name} = ${opt}`}
                  >
                    {opt}
                  </button>
                );
              })}
              <input
                type="text"
                value={customValues[v.name] ?? ""}
                onChange={(e) =>
                  setCustomValues((c) => ({ ...c, [v.name]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyCustom(v.name);
                  }
                }}
                placeholder="custom…"
                title={`Type any value for ${v.name}, then press Enter`}
                className="w-20 rounded-full border border-dashed bg-transparent px-2.5 py-0.5 font-mono text-[11px] text-white/70 placeholder:text-white/25 focus:outline-none"
                style={{ borderColor: "#1E232D" }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
