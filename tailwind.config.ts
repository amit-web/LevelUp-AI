import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        sans: ["var(--font-body)", "sans-serif"],
      },
      colors: {
        canvas: "#0B0D12",
        panel: "#12151C",
        edge: "#1E232D",
        child: "#F5A524",
        dev: "#22D3C5",
        expert: "#A78BFA",
      },
    },
  },
  plugins: [],
};
export default config;
