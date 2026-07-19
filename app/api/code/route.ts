import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const MODEL = "llama-3.3-70b-versatile";
const URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM = `You write a short, self-contained JavaScript demo for a live, editable "code playground" that helps a developer understand a topic by tweaking values and watching the console output change.

Return ONLY a JSON object with:
- "code": a plain JavaScript snippet, runnable in a browser via a <script> tag (no imports, no Node-only APIs, no frameworks, no top-level await). 12-26 lines, formatted with a real newline between statements and 2-space indentation inside blocks — never a semicolon-joined single line. Demonstrate the actual mechanism of the topic, not just a fact about it. End with one or more console.log(...) calls whose output is visibly influenced by the variables below. No comments longer than one short line. No markdown fences.
- "variables": an array of 2-4 objects, each { "name": string, "options": [2-3 short literal JS value strings] }. Each "name" MUST exactly match the identifier of a top-level statement "const NAME = VALUE;" declared near the top of "code" (single line only — no destructuring, no let/var, no multi-line values). "options" are alternate literal values a reader could swap in to see a meaningfully different console result — never repeat the value already used in "code". Keep each literal short (a number, a short string, or a small array/object on one line).

Return ONLY the JSON object, nothing else — no prose before or after.`;

function extractJson(text: string) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    if (s !== -1 && e !== -1) return JSON.parse(cleaned.slice(s, e + 1));
    throw new Error("parse failed");
  }
}

export async function POST(req: NextRequest) {
  const key = process.env.GROQ_API_KEY;
  if (!key)
    return NextResponse.json({ error: "Server is missing GROQ_API_KEY." }, { status: 500 });

  let topic = "";
  try {
    const body = await req.json();
    topic = (body?.topic ?? "").toString().trim();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!topic) return NextResponse.json({ error: "Please enter a topic." }, { status: 400 });
  if (topic.length > 200) return NextResponse.json({ error: "Topic too long." }, { status: 400 });

  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.5,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Topic: ${topic}` },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ error: "Model error.", detail }, { status: 502 });
    }
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(text);

    const code = (parsed.code ?? "").toString().trim();
    if (!code) return NextResponse.json({ error: "No code generated." }, { status: 502 });

    // Only keep variables that actually name a top-level const in the
    // generated code — the model sometimes drifts, and a preset chip that
    // can't find its target line would silently do nothing when clicked.
    const variables = Array.isArray(parsed.variables)
      ? parsed.variables
          .filter((v: any) => v && typeof v.name === "string" && Array.isArray(v.options))
          .filter((v: any) => new RegExp(`\\bconst\\s+${v.name}\\s*=`).test(code))
          .slice(0, 4)
          .map((v: any) => ({
            name: String(v.name),
            options: v.options.slice(0, 3).map(String),
          }))
      : [];

    return NextResponse.json({ code, variables });
  } catch {
    return NextResponse.json({ error: "Could not generate code." }, { status: 500 });
  }
}
