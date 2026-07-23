import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        panel: "rgb(var(--color-panel) / <alpha-value>)",
        panel2: "rgb(var(--color-panel2) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        oak: "rgb(var(--color-oak) / <alpha-value>)",
        oakdim: "rgb(var(--color-oakdim) / <alpha-value>)",
        mint: "rgb(var(--color-mint) / <alpha-value>)",
        warn: "rgb(var(--color-warn) / <alpha-value>)",
        danger: "rgb(var(--color-danger) / <alpha-value>)",
        fg: "rgb(var(--color-fg) / <alpha-value>)",
        dim: "rgb(var(--color-dim) / <alpha-value>)"
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"]
      }
    }
  },
  plugins: []
};
export default config;
