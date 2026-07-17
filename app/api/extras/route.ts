import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const MODEL = "llama-3.3-70b-versatile";
const URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM = `You help someone learn a topic more deeply. Given a topic, return a JSON object with:
- "related": an array of exactly 4 closely related concepts worth learning next. Each is a short label (1-4 words), specific, not generic.
- "quiz": an array of exactly 3 multiple-choice questions that test real understanding of the topic. Each item is { "question": string, "options": [4 strings], "correct": integer 0-3, "why": string (one short sentence explaining the correct answer) }.
Keep questions clear and unambiguous. Return ONLY the JSON object, nothing else.`;

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

    const related: string[] = Array.isArray(parsed.related)
      ? parsed.related.slice(0, 4).map((r: unknown) => String(r))
      : [];
    const quiz = Array.isArray(parsed.quiz)
      ? parsed.quiz.slice(0, 3).map((q: any) => ({
          question: String(q.question ?? ""),
          options: Array.isArray(q.options) ? q.options.slice(0, 4).map(String) : [],
          correct: Number.isInteger(q.correct) ? q.correct : 0,
          why: String(q.why ?? ""),
        }))
      : [];

    return NextResponse.json({ related, quiz });
  } catch {
    return NextResponse.json({ error: "Could not generate extras." }, { status: 500 });
  }
}