import type { Metadata, Viewport } from "next";
import "./globals.css";

const EMOJI_ICON =
  "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎓</text></svg>";

export const metadata: Metadata = {
  title: "Explain Any Level — one idea, three depths",
  description:
    "Type any topic and understand it at three levels at once: like you're a child, a developer, and an expert.",
  applicationName: "Explain Any Level",
  keywords: ["learning", "AI tutor", "explain", "education", "study"],
  icons: [{ rel: "icon", url: EMOJI_ICON }],
  openGraph: {
    title: "Explain Any Level",
    description: "One topic, explained live at three depths — child, developer, expert.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
  colorScheme: "dark",
};

const PARTICLES = [
  { glyph: "📘", left: "6%", duration: 22, delay: 0 },
  { glyph: "💡", left: "16%", duration: 26, delay: 4 },
  { glyph: "π", left: "27%", duration: 20, delay: 2 },
  { glyph: "🧠", left: "40%", duration: 28, delay: 6 },
  { glyph: "∑", left: "58%", duration: 24, delay: 1 },
  { glyph: "🔬", left: "71%", duration: 27, delay: 5 },
  { glyph: "✏️", left: "83%", duration: 21, delay: 3 },
  { glyph: "⚛", left: "93%", duration: 25, delay: 7 },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="bg-grid absolute inset-0" />
          <div className="orb orb-child animate-float-a -left-24 -top-24 h-80 w-80" />
          <div className="orb orb-expert animate-float-b -right-24 top-1/3 h-96 w-96" />
          <div className="orb orb-dev animate-float-c bottom-0 left-1/3 h-72 w-72" />
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className="particle absolute bottom-0 text-lg"
              style={{
                left: p.left,
                animationDuration: `${p.duration}s`,
                animationDelay: `${p.delay}s`,
              }}
            >
              {p.glyph}
            </span>
          ))}
        </div>
        <div className="learning-bar fixed inset-x-0 top-0 z-50 h-[2px]" />
        {children}
      </body>
    </html>
  );
}
