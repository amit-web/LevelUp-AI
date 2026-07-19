# Explain Any Level — AI learning tutor

One topic, explained live at three depths — child, developer, expert — then go simpler, go deeper, branch into related ideas, and test yourself. All in one flow.

Built with Next.js 14, TypeScript, Tailwind CSS, Framer Motion, and Groq (streaming).

## What it does

- **Live streaming** explanations at three levels at once (child / developer / expert).
- **Follow-up actions** on every card: Simpler, Deeper, Example — re-streamed on demand.
- **Continue learning**: AI suggests related concepts as clickable branches (a knowledge tree).
- **Test yourself**: AI-generated quiz that grades you and explains each answer.
- **Recent history** kept locally in your browser.

## Run locally

```bash
npm install
# create .env.local with your key (see below)
npm run dev
```

Open http://localhost:3000

## API key

1. Get a free key at https://console.groq.com/keys
2. Create a file named `.env.local` in the project root with:
   ```
   GROQ_API_KEY=your_key_here
   ```
3. Restart the dev server after adding it.

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. Import it at https://vercel.com/new
3. Add an environment variable `GROQ_API_KEY` with your key.
4. Deploy → you get a live URL.

The key stays server-side in the API routes and is never exposed to the browser.

## Architecture

```
User types a topic
      │
      ├─► POST /api/stream  ×3 (child, developer, expert)  ── streaming text ──► three cards fill live
      │        (also used for Simpler / Deeper / Example follow-ups)
      │
      └─► POST /api/extras  ── JSON ──► related concepts + quiz
```

## Roadmap

- Concept diagrams (mermaid) generated per topic.
- Shareable permalink per explanation.
- Voice narration of each level.
- Spaced-repetition review of past topics.

## License

MIT
