import { NextRequest } from "next/server";

export const runtime = "edge";

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

function jsonError(message: string, status: number, detail?: string) {
  return new Response(JSON.stringify({ error: message, detail }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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

  let upstream: Response;
  try {
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
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch {
    return jsonError("Could not reach the model service.", 502);
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return jsonError("The model service returned an error.", 502, detail);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
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
          if (txt) controller.enqueue(encoder.encode(txt));
        } catch {
          /* partial json across chunks — ignore */
        }
      }
    },
    cancel() {
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