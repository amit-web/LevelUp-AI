import { NextRequest } from "next/server";

// HACKATHON-CRITICAL FIX: this route hung indefinitely (0 bytes, 30s+) on
// the deployed Vercel site even after adding a 20s server-side watchdog —
// the watchdog code was confirmed deployed, so the hang isn't in our logic,
// it's specific to the Edge Runtime sandbox (`next dev` doesn't fully
// emulate it, which is why this never reproduced locally). Node.js
// serverless is the well-trodden path for a fetch-and-relay streaming
// proxy on Vercel; switching off Edge removes that whole class of bug.
export const runtime = "nodejs";

const MODEL = "llama-3.3-70b-versatile";
const URL = "https://api.groq.com/openai/v1/chat/completions";

const AUDIENCE: Record<string, string> = {
  child:
    "a curious 8-year-old. Use one simple everyday analogy, no jargon at all. Keep it to 2-3 short warm sentences.",
  developer:
    "a working software developer who is new to this topic. Be practical and concrete, explain how it actually works. 3-4 sentences.",
  expert:
    "a domain expert. Be precise and technical, include the deeper mechanism and one trade-off or edge case. 3-4 sentences.",
};

const STYLE: Record<string, string> = {
  base: "",
  simpler: "Make it noticeably simpler and gentler than a normal explanation would be. ",
  deeper: "Go deeper and more advanced than a normal explanation would, adding precise detail. ",
  example: "Lead with one concrete, memorable real-world example, then a one-line takeaway. ",
};

// IMPROVEMENT: this request previously set no max_tokens at all, so a
// response's length was bounded only by prompt wording — "child" + "deeper"
// style could (correctly, but unpredictably) balloon into a long answer that
// took a while to finish streaming and read as "stuck" to someone watching
// the blinking cursor. Cap per audience so replies stay snappy regardless
// of which follow-up style was requested.
const MAX_TOKENS: Record<string, number> = {
  child: 350,
  developer: 450,
  expert: 500,
};

function jsonError(message: string, status: number, detail?: string) {
  return new Response(JSON.stringify({ error: message, detail }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// BUG FIX: this route had no timeout at all — a hung upstream connection (as
// seen on the deployed Vercel site, where /api/stream returned zero bytes
// for 45s+) meant the fetch (and later, each stream read) could wait
// forever. The client then sat on "Thinking…" indefinitely with no error.
// This watchdog aborts the request if either the initial connection or any
// individual chunk read stalls past STALL_TIMEOUT_MS, turning a silent
// infinite hang into a fast, visible error the UI can show/retry.
const STALL_TIMEOUT_MS = 20_000;

export async function POST(req: NextRequest) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return jsonError("Server is missing GROQ_API_KEY.", 500);

  let topic = "";
  let audience = "developer";
  let style = "base";
  try {
    const body = await req.json();
    topic = (body?.topic ?? "").toString().trim();
    audience = (body?.audience ?? "developer").toString();
    style = (body?.style ?? "base").toString();
  } catch {
    return jsonError("Invalid request.", 400);
  }

  if (!topic) return jsonError("Please enter a topic.", 400);
  if (topic.length > 200) return jsonError("Keep the topic under 200 characters.", 400);
  if (!AUDIENCE[audience]) audience = "developer";
  if (!STYLE[style]) style = "base";

  const prompt = `Explain the topic "${topic}" to ${AUDIENCE[audience]} ${STYLE[style]}Respond in plain text only — no markdown, no bullet points, no headings, no preamble like "Sure". Start directly with the explanation.`;

  // One AbortController for the whole request/stream lifetime. `armWatchdog`
  // is re-armed before every wait point (the initial fetch, then each
  // `reader.read()`) so it only fires if THAT specific wait stalls too long
  // — a slow-but-progressing stream never trips it.
  const controller = new AbortController();
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  function armWatchdog() {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => controller.abort(), STALL_TIMEOUT_MS);
  }

  let upstream: Response;
  try {
    armWatchdog();
    upstream = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        temperature: 0.6,
        max_tokens: MAX_TOKENS[audience],
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(watchdog);
    if (e instanceof Error && e.name === "AbortError") {
      return jsonError("The model service took too long to respond.", 504);
    }
    return jsonError("Could not reach the model service.", 502);
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(watchdog);
    const detail = await upstream.text().catch(() => "");
    return jsonError("The model service returned an error.", 502, detail);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const stream = new ReadableStream({
    async pull(streamController) {
      let done: boolean, value: Uint8Array | undefined;
      try {
        armWatchdog();
        ({ done, value } = await reader.read());
        clearTimeout(watchdog);
      } catch {
        // Either a real network error or our own watchdog abort — either way
        // the client needs to see this as a failure, not a silently closed
        // (and therefore "successful but empty") stream.
        streamController.error(new Error("The model service stalled mid-response."));
        return;
      }
      if (done) {
        streamController.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          const txt = j?.choices?.[0]?.delta?.content;
          if (txt) streamController.enqueue(encoder.encode(txt));
        } catch {
          /* partial json across chunks — ignore */
        }
      }
    },
    cancel() {
      clearTimeout(watchdog);
      reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}