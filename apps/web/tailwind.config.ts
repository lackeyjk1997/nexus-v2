import type { Config } from "tailwindcss";

/**
 * Tailwind 3 config — DESIGN-SYSTEM.md §10.1 palette baked in as hex, plus
 * semantic-alias extensions that resolve through CSS custom properties in
 * globals.css (§10.2).
 *
 * Three-layer consumption (pre-kickoff thought, Phase 2 Day 1):
 *   Layer 1 — hex scales here (bg-graphite-900, text-signal-600).
 *   Layer 2 — CSS vars in globals.css :root (semantic aliases).
 *   Layer 3 — backgroundColor/textColor/borderColor extensions below that
 *             expose Layer 2 as first-class Tailwind utilities
 *             (bg-surface, text-primary, border-subtle).
 *
 * Guardrail 34: no inline hex in components. Use these classes or
 * semantic aliases. Hex belongs in this file and globals.css ONLY.
 *
 * Tailwind 3 limitation: hex-valued utilities do NOT support opacity suffixes
 * (bg-graphite-600/40 won't work). If an alpha case surfaces (scrim, overlay),
 * add it as a new semantic token in DESIGN-SYSTEM.md first — never inline.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/shared/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        neutral: {
          0: "#FFFFFF",
          50: "#FAFAF7",
          100: "#F4F4F0",
          200: "#E8E8E2",
          300: "#D1D1C9",
          400: "#A3A39B",
          500: "#737370",
          600: "#52524F",
          700: "#3F3F3D",
          800: "#27272A",
          900: "#18181B",
          950: "#0A0A0C",
        },
        graphite: {
          50: "#F5F6F7",
          100: "#E9EBEE",
          200: "#CED2D8",
          300: "#A8AEB8",
          400: "#6E7683",
          500: "#475060",
          600: "#2F3844",
          700: "#1F2631",
          800: "#151A22",
          900: "#0F1319",
          950: "#080A0E",
        },
        signal: {
          50: "#EEF0FF",
          100: "#DDE1FE",
          200: "#BCC3FD",
          300: "#94A0F9",
          400: "#6D7DF0",
          500: "#4F5FE0",
          600: "#3D48C7",
          700: "#3037A3",
          800: "#272C82",
          900: "#1F2368",
          950: "#141848",
        },
        slate: {
          50: "#F1F4F8",
          100: "#E1E7EF",
          200: "#C4CEDA",
          300: "#94A1B4",
          400: "#64738B",
          500: "#475569",
          600: "#364152",
          700: "#2A3342",
          800: "#1E2530",
          900: "#141A22",
        },
        success: { light: "#DCFCE7", DEFAULT: "#15803D", dark: "#14532D" },
        warning: { light: "#FEF3C7", DEFAULT: "#D97706", dark: "#92400E" },
        error: { light: "#FEE2E2", DEFAULT: "#DC2626", dark: "#991B1B" },
        info: { light: "#E0F2FE", DEFAULT: "#0369A1", dark: "#0C4A6E" },
      },
      backgroundColor: {
        base: "var(--bg-base)",
        surface: "var(--bg-surface)",
        muted: "var(--bg-muted)",
        inverse: "var(--bg-inverse)",
      },
      textColor: {
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        tertiary: "var(--text-tertiary)",
        disabled: "var(--text-disabled)",
        inverse: "var(--text-inverse)",
        accent: "var(--text-accent)",
      },
      borderColor: {
        subtle: "var(--border-subtle)",
        default: "var(--border-default)",
        strong: "var(--border-strong)",
        accent: "var(--border-accent)",
      },
      fontFamily: {
        sans: [
          "var(--font-geist-sans)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        display: [
          "var(--font-instrument-serif)",
          "ui-serif",
          "Georgia",
          "serif",
        ],
        mono: [
          "var(--font-geist-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1.5" }],
        sm: ["0.875rem", { lineHeight: "1.5" }],
        base: ["1rem", { lineHeight: "1.5" }],
        lg: ["1.125rem", { lineHeight: "1.5" }],
        xl: ["1.25rem", { lineHeight: "1.25" }],
        "2xl": ["1.5rem", { lineHeight: "1.25" }],
        "3xl": ["1.875rem", { lineHeight: "1.25" }],
        "4xl": ["2.25rem", { lineHeight: "1.1" }],
        "5xl": ["3rem", { lineHeight: "1.1" }],
      },
      fontWeight: {
        regular: "400",
        medium: "500",
        semibold: "600",
      },
      letterSpacing: {
        tight: "-0.02em",
        normal: "0",
        wide: "0.05em",
      },
      borderRadius: {
        none: "0",
        sm: "4px",
        md: "8px",
        lg: "12px",
        full: "9999px",
      },
      boxShadow: {
        sm: "0 1px 2px 0 rgba(15, 19, 25, 0.04)",
        md: "0 2px 8px -2px rgba(15, 19, 25, 0.06), 0 1px 2px 0 rgba(15, 19, 25, 0.04)",
        lg: "0 8px 24px -4px rgba(15, 19, 25, 0.08), 0 2px 6px -1px rgba(15, 19, 25, 0.04)",
        xl: "0 16px 48px -8px rgba(15, 19, 25, 0.12), 0 4px 12px -2px rgba(15, 19, 25, 0.06)",
      },
      transitionDuration: {
        fast: "150ms",
        normal: "250ms",
        slow: "400ms",
      },
      transitionTimingFunction: {
        "out-soft": "cubic-bezier(0.16, 1, 0.3, 1)",
        "in-out-soft": "cubic-bezier(0.4, 0, 0.2, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
