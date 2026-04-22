# Nexus v2 — Design System

> **Source of truth.** Every token in the codebase points back to this document. If it's not here, it doesn't exist. If you want to add something, add it here first, then propagate.

**Brand name for this system:** Graphite & Signal
**Spiritual reference:** OpenAI-adjacent restraint. We do not copy their palette, wordmark, or specific component language. We share a philosophy: typographic, spacious, near-monochromatic with one confident accent.

---

## 1. Design Philosophy

Nexus is an AI sales orchestration platform. The product speaks before the seller does — and every pixel has to earn that right. The visual language is therefore **calm, typographic, and deliberate**. We use near-black as the workhorse and reserve a single deep-indigo accent ("Signal") for moments where the AI is actually doing work: voice headers, active states, focus rings, inline agent output. Everything else is neutral, warm-leaning, and quiet.

The system is monochromatic-by-default. Color is not a decoration — it's a signal that something is happening. Type carries the hierarchy; shadows and radii are soft; motion is brief. The product should feel like a well-made tool, not a marketing page.

**Three principles that govern every decision:**

1. **Restraint before expression.** If a token can be neutral, it is. Accent color appears only where meaning requires it.
2. **Type is the hierarchy.** Size, weight, and rhythm do the work that color and boxes do in lesser systems.
3. **Nothing is flat.** Surfaces have the faintest shadow, buttons lift on hover, focus rings glow. The product breathes.

---

## 2. Color Tokens

All colors are defined as CSS custom properties on `:root` and consumed through Tailwind. Hex values below are authoritative.

### 2.1 Neutrals (warm-leaning gray scale, 11 steps)

The neutral scale is the backbone. Backgrounds, text, borders, surfaces — all start here.

```css
--color-neutral-0:   #FFFFFF; /* Pure white. Used only for crisp card surfaces over subtle bg. */
--color-neutral-50:  #FAFAF7; /* Base background. Off-white, warm. Never use pure white as page bg. */
--color-neutral-100: #F4F4F0;
--color-neutral-200: #E8E8E2;
--color-neutral-300: #D1D1C9;
--color-neutral-400: #A3A39B;
--color-neutral-500: #737370;
--color-neutral-600: #52524F;
--color-neutral-700: #3F3F3D;
--color-neutral-800: #27272A;
--color-neutral-900: #18181B;
--color-neutral-950: #0A0A0C;
```

### 2.2 Primary — Graphite

The workhorse. Primary buttons, primary text, UI anchors, logos. This is "our black."

```css
--color-graphite-50:  #F5F6F7;
--color-graphite-100: #E9EBEE;
--color-graphite-200: #CED2D8;
--color-graphite-300: #A8AEB8;
--color-graphite-400: #6E7683;
--color-graphite-500: #475060;
--color-graphite-600: #2F3844;
--color-graphite-700: #1F2631;
--color-graphite-800: #151A22;
--color-graphite-900: #0F1319; /* Default primary. */
--color-graphite-950: #080A0E;
```

**Rule:** `--color-graphite-900` (`#0F1319`) is the default "primary" swatch. Never use pure `#000000` anywhere.

### 2.3 Accent — Signal (deep indigo)

The only accent in the system. It means "AI is here" or "focus is here." Used with extreme restraint.

```css
--color-signal-50:  #EEF0FF;
--color-signal-100: #DDE1FE;
--color-signal-200: #BCC3FD;
--color-signal-300: #94A0F9;
--color-signal-400: #6D7DF0;
--color-signal-500: #4F5FE0;
--color-signal-600: #3D48C7; /* Default accent. */
--color-signal-700: #3037A3;
--color-signal-800: #272C82;
--color-signal-900: #1F2368;
--color-signal-950: #141848;
```

**Rule:** `--color-signal-600` (`#3D48C7`) is the default "accent" swatch. Use it for: sparkle icons in the Nexus Intelligence header, focus rings, numbered chip hints, the top strip on give-back cards, links in AI output, active nav items. **Never** use it for decoration, section dividers, or "making things pop."

### 2.4 Secondary — Slate (cool gray-blue)

A quiet second voice. Used for informational elements, secondary badges, metadata chips. Never for CTAs.

```css
--color-slate-50:  #F1F4F8;
--color-slate-100: #E1E7EF;
--color-slate-200: #C4CEDA;
--color-slate-300: #94A1B4;
--color-slate-400: #64738B;
--color-slate-500: #475569;
--color-slate-600: #364152;
--color-slate-700: #2A3342;
--color-slate-800: #1E2530;
--color-slate-900: #141A22;
```

### 2.5 Semantic

Paired light / default / dark for each state. Light is for backgrounds of alert surfaces; default is for icons and text; dark is for pressed states and high-contrast borders.

```css
/* Success — forest green, explicitly distinct from the OpenAI #10A37F. */
--color-success-light:   #DCFCE7;
--color-success-default: #15803D;
--color-success-dark:    #14532D;

/* Warning — amber. */
--color-warning-light:   #FEF3C7;
--color-warning-default: #D97706;
--color-warning-dark:    #92400E;

/* Error — red. */
--color-error-light:   #FEE2E2;
--color-error-default: #DC2626;
--color-error-dark:    #991B1B;

/* Info — a cooler, greener blue than Signal, so they never compete. */
--color-info-light:   #E0F2FE;
--color-info-default: #0369A1;
--color-info-dark:    #0C4A6E;
```

**Rule:** Semantic colors are for meaning, never for brand. If something is "just blue," it's Signal or Graphite, never Info.

### 2.6 Background Layers

Four elevation layers. Think of them as a stack, lowest to highest.

```css
--bg-base:    var(--color-neutral-50);   /* Page background. */
--bg-muted:   var(--color-neutral-100);  /* Panel / sidebar / secondary surface. */
--bg-surface: var(--color-neutral-0);    /* Cards, modals, inputs. Pure white over warm bg. */
--bg-inverse: var(--color-graphite-900); /* Dark surfaces, inverted UI. */
```

### 2.7 Text Colors

```css
--text-primary:   var(--color-graphite-900);  /* Headlines, body. */
--text-secondary: var(--color-neutral-600);   /* Supporting copy, descriptions. */
--text-tertiary:  var(--color-neutral-500);   /* Timestamps, metadata, hints. */
--text-disabled:  var(--color-neutral-400);   /* Disabled states only. */
--text-inverse:   var(--color-neutral-50);    /* Text on dark backgrounds. */
--text-accent:    var(--color-signal-700);    /* Links in AI output. */
```

### 2.8 Border Colors

```css
--border-subtle:  var(--color-neutral-200);  /* Default card and input borders. */
--border-default: var(--color-neutral-300);  /* Dividers, stronger separators. */
--border-strong:  var(--color-neutral-400);  /* Pressed states, emphasis. */
--border-accent:  var(--color-signal-500);   /* Focus rings, active chips. */
```

---

## 3. Typography Tokens

### 3.1 Font Families

**Body / UI:** [Geist Sans](https://fonts.google.com/specimen/Geist) — geometric, slightly grotesque, neutral but not sterile. Installed via `next/font/google`.

**Display:** [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif) — used for hero moments, marketing surfaces, and occasionally for key AI claims where we want the agent's voice to feel editorial. Installed via `next/font/google`.

**Mono:** [Geist Mono](https://fonts.google.com/specimen/Geist+Mono) — for code, IDs, timestamps in data-dense views.

```css
--font-sans:    'Geist Sans', ui-sans-serif, system-ui, sans-serif;
--font-display: 'Instrument Serif', ui-serif, Georgia, serif;
--font-mono:    'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
```

**Rule:** Default body text is `--font-sans`. `--font-display` appears only in: hero headlines, the lead sentence of an AI give-back card when the claim is central, and marketing site headers. Never in dense UI.

### 3.2 Type Scale (9 steps, semi-modular)

```css
--text-xs:   0.75rem;   /* 12px — badges, timestamps, keyboard hints */
--text-sm:   0.875rem;  /* 14px — secondary body, labels, table cells */
--text-base: 1rem;      /* 16px — default body */
--text-lg:   1.125rem;  /* 18px — emphasized body, card leads */
--text-xl:   1.25rem;   /* 20px — subheadings, card titles */
--text-2xl:  1.5rem;    /* 24px — section headings */
--text-3xl:  1.875rem;  /* 30px — page titles */
--text-4xl:  2.25rem;   /* 36px — hero display (secondary) */
--text-5xl:  3rem;      /* 48px — hero display (primary) */
```

### 3.3 Font Weights

Three weights only. Bold is forbidden in UI chrome — `semibold` is the heaviest we go.

```css
--font-weight-regular:  400;
--font-weight-medium:   500;
--font-weight-semibold: 600;
```

**Rule:**
- `400` — body, descriptions, most paragraph text
- `500` — labels, nav items, button text, UI chrome
- `600` — headings, emphasized metadata, active states

### 3.4 Line Heights

```css
--leading-tight:   1.1;    /* Display headlines (4xl, 5xl) */
--leading-snug:    1.25;   /* Headings (2xl, 3xl) */
--leading-normal:  1.5;    /* Body text */
--leading-relaxed: 1.625;  /* Longform content (AI give-back cards) */
```

### 3.5 Letter Spacing

```css
--tracking-tight:  -0.02em; /* Display headlines, only at 3xl+ */
--tracking-normal: 0;       /* Default */
--tracking-wide:   0.05em;  /* Uppercase labels, eyebrows */
```

---

## 4. Spacing Scale

4px base unit. Tailwind-aligned. Use these and only these.

```css
--space-0:  0;
--space-1:  0.25rem;   /* 4px  */
--space-2:  0.5rem;    /* 8px  */
--space-3:  0.75rem;   /* 12px */
--space-4:  1rem;      /* 16px */
--space-5:  1.25rem;   /* 20px */
--space-6:  1.5rem;    /* 24px */
--space-8:  2rem;      /* 32px */
--space-10: 2.5rem;    /* 40px */
--space-12: 3rem;      /* 48px */
--space-16: 4rem;      /* 64px */
--space-20: 5rem;      /* 80px */
--space-24: 6rem;      /* 96px */
```

**Rule:** Component padding is `--space-4` to `--space-6`. Section spacing is `--space-12` to `--space-24`. Tight UI groupings (icon + label) use `--space-2`. Never use `--space-1` for padding (only for hairline gaps).

---

## 5. Border Radii

```css
--radius-none: 0;
--radius-sm:   4px;     /* Input fields, small badges, keyboard hints */
--radius-md:   8px;     /* Buttons, chips, most interactive elements */
--radius-lg:   12px;    /* Cards, modals, give-back cards */
--radius-full: 9999px;  /* Pills, avatars, status dots */
```

**Rule:** When in doubt, use `--radius-md`. The system leans soft but not pill-y. We do not use `radius-xl` or anything larger than 12px except for `radius-full`.

---

## 6. Shadow Tokens

Soft, layered, warm-tinted shadows. Never hard black drops.

```css
--shadow-sm: 0 1px 2px 0 rgba(15, 19, 25, 0.04);

--shadow-md:
  0 2px 8px -2px rgba(15, 19, 25, 0.06),
  0 1px 2px 0 rgba(15, 19, 25, 0.04);

--shadow-lg:
  0 8px 24px -4px rgba(15, 19, 25, 0.08),
  0 2px 6px -1px rgba(15, 19, 25, 0.04);

--shadow-xl:
  0 16px 48px -8px rgba(15, 19, 25, 0.12),
  0 4px 12px -2px rgba(15, 19, 25, 0.06);
```

**Rule:** Resting cards use `--shadow-sm`. Hovered interactive elements use `--shadow-md`. Dropdowns and popovers use `--shadow-lg`. Modals use `--shadow-xl`. That is the entire vocabulary.

---

## 7. Motion Tokens

Short, confident, never bouncy in dense UI.

```css
--duration-fast:   150ms;  /* Hover state changes, focus rings */
--duration-normal: 250ms;  /* Most transitions: expands, opens, appears */
--duration-slow:   400ms;  /* Modal enters, page transitions, AI response reveals */

--ease-out:     cubic-bezier(0.16, 1, 0.3, 1);      /* Default. Smooth landings. */
--ease-in-out:  cubic-bezier(0.4, 0, 0.2, 1);        /* Symmetrical transitions. */
--ease-spring:  cubic-bezier(0.34, 1.56, 0.64, 1);   /* RARE. Only for celebration moments (e.g., deal closed). */
```

**Rule:** `--ease-out` with `--duration-normal` is the default for every transition in the product. Reach for anything else only with a reason.

---

## 8. Component Primitive Principles

These are guiding principles, not specs. Specs live in `/components`.

### Buttons
- Primary uses `--color-graphite-900` background with `--text-inverse`, `--radius-md`, `--font-weight-medium`, `--text-sm`.
- Resting: `--shadow-sm`. Hover: lifts to `--shadow-md` and translates `-1px` on Y axis over `--duration-fast`.
- Secondary uses `--bg-surface` with 1px `--border-default` border.
- Ghost button has no background or border — only text in `--text-primary`, hover adds `--bg-muted`.
- **Never pure flat.** A button must either have a subtle shadow, a border, or a background change on hover.
- Accent buttons (Signal) exist only for AI-initiated actions. Use `--color-signal-600` sparingly.

### Cards
- Default: `--bg-surface`, 1px `--border-subtle`, `--radius-lg`, `--shadow-sm`, `--space-6` internal padding.
- No drop shadows layered on top of borders — pick one or the other per card variant.
- Interactive cards add `--shadow-md` and `--border-default` on hover over `--duration-fast`.

### Inputs
- `--radius-md`, 1px `--border-subtle`, `--bg-surface`.
- Focus: border becomes `--border-accent`, plus a `0 0 0 3px rgba(61, 72, 199, 0.15)` ring. Ring is always `--color-signal-600` at 15% opacity.
- Disabled: `--bg-muted`, `--text-disabled`.
- Labels are `--text-sm`, `--font-weight-medium`, `--text-primary`, placed above the input with `--space-2` gap.

### Modals
- `--bg-surface`, `--radius-lg`, `--shadow-xl`.
- Max width 640px for dialogs, 800px for content-heavy.
- Internal padding `--space-8`.
- Backdrop: `rgba(15, 19, 25, 0.4)` with `backdrop-filter: blur(4px)`.
- Enter: `--duration-slow` with `--ease-out`, scale from 0.96 to 1, opacity 0 to 1.

### Toasts (system only — never for AI output)
- Reserved strictly for system notifications: save confirmations, connection errors, permission prompts.
- AI responses never appear in toasts. They appear inline in the flow (see Framework 21 below).
- `--bg-surface`, `--radius-md`, `--shadow-lg`, `--space-4` padding, bottom-center positioning.

---

## 9. Framework 21 — Re-skinned

Framework 21 is the Nexus interaction pattern: inline AI responses, chip cards with numbered keyboard hints, Nexus Intelligence voice header, give-back cards. The voice, sequencing, and structure do not change. Only the visual treatment is redefined below using the new tokens.

### 9.1 Nexus Intelligence voice header

Appears at the top of every AI response block. Signals that the following content is agent-authored, not user-authored.

- **Sparkle icon:** 16px, stroke 1.5, color `--color-signal-600`. Sits on the far left.
- **Label text:** "Nexus Intelligence" in `--font-sans`, `--text-sm`, `--font-weight-medium`, `--text-primary`, letter-spacing `-0.01em`.
- **Spacing:** `--space-2` gap between icon and text. `--space-3` padding below the header.
- **Divider:** 1px solid `--border-subtle`, full width of the parent container, sits immediately under the header with `--space-2` vertical margin above the content block.

### 9.2 Inline AI responses

The container for any AI output that appears in the conversation flow. **Never a toast. Never a modal.** A card that lives in the stream.

- **Surface:** `--bg-surface`, 1px `--border-subtle`, `--radius-lg`, `--shadow-sm`.
- **Padding:** `--space-5` on mobile, `--space-6` on desktop.
- **Top strip:** 2px solid `--color-signal-600` running the full width of the top edge. Visually signs the card as AI-authored. This is the single most important identifier of AI authorship in the product — do not remove it.
- **Hero line (optional):** If the response opens with a central claim (e.g., "This deal is at risk"), render it in `--font-display` (Instrument Serif), `--text-xl`, `--font-weight-regular`, `--leading-snug`, with `--tracking-tight`.
- **Body:** `--font-sans`, `--text-base`, `--leading-relaxed`, `--text-primary`.
- **Reveal animation:** Fade + 8px slide-up over `--duration-slow` with `--ease-out`.

### 9.3 Chip cards for choices

The clickable / keyboard-navigable options Nexus offers after a response.

- **Layout:** Horizontal row on desktop, stacked on mobile. `--space-3` gap between chips.
- **Shape:** `--radius-md`, `--space-3` vertical and `--space-4` horizontal padding.
- **Surface:** `--bg-surface` resting, 1px `--border-subtle`.
- **Typography:** `--font-sans`, `--text-sm`, `--font-weight-medium`, `--text-primary`.
- **Numbered keyboard hint:** Positioned in top-left of each chip, inside a `--radius-sm`, 20×20px square with `--bg-muted` background and `--color-signal-600` text in `--text-xs`, `--font-weight-semibold`. Numbers 1–9 only.
- **States:**
  - **Hover:** border becomes `--color-signal-400`, `--shadow-sm` appears. Transition `--duration-fast` with `--ease-out`.
  - **Focus (keyboard or pressed number):** border becomes 1.5px `--color-signal-600`, `--shadow-md`, and the numbered hint square switches to `--color-signal-600` background with `--text-inverse` text.
  - **Selected / confirmed:** border `--color-signal-600`, background `--color-signal-50`.

### 9.4 Give-back cards (AI output)

The deliverable — Nexus returning work: a drafted email, a deal brief, a call summary, a prioritized list.

- **Surface:** `--bg-surface`, `--radius-lg`, `--shadow-md` (slightly more elevated than inline responses — this is a deliverable, not a reaction).
- **Top strip:** Same 2px `--color-signal-600` bar as inline responses, full width.
- **Header row:** Contains the Nexus Intelligence label on the left and a copy icon button on the right. 16px icon, `--color-neutral-500` resting, `--color-graphite-900` hover.
- **Timestamp:** `--font-mono`, `--text-xs`, `--color-neutral-500`, placed in the header row right-aligned before the copy button. Separator: a 4×4px dot in `--color-neutral-300` with `--space-2` horizontal margin.
- **Body:** `--space-6` internal padding. Content uses `--font-sans`, `--text-base`, `--leading-relaxed`. If the output contains a title (e.g., "Subject: …" for a drafted email), render it as `--font-display`, `--text-lg`, `--font-weight-regular`.
- **Metadata footer (optional):** Thin 1px `--border-subtle` separator, then a row of `--text-xs` `--color-neutral-500` metadata (model, latency, token count) in `--font-mono`. Used in power-user / debug views.

---

## 10. Exports

### 10.1 `tailwind.config.ts`

Drop this into the repo root. Tailwind 3 compatible; Tailwind 4 will still honor it via CSS config interop, but the preferred Tailwind 4 path is the `@theme` block in `globals.css` below.

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        neutral: {
          0:   '#FFFFFF',
          50:  '#FAFAF7',
          100: '#F4F4F0',
          200: '#E8E8E2',
          300: '#D1D1C9',
          400: '#A3A39B',
          500: '#737370',
          600: '#52524F',
          700: '#3F3F3D',
          800: '#27272A',
          900: '#18181B',
          950: '#0A0A0C',
        },
        graphite: {
          50:  '#F5F6F7',
          100: '#E9EBEE',
          200: '#CED2D8',
          300: '#A8AEB8',
          400: '#6E7683',
          500: '#475060',
          600: '#2F3844',
          700: '#1F2631',
          800: '#151A22',
          900: '#0F1319',
          950: '#080A0E',
        },
        signal: {
          50:  '#EEF0FF',
          100: '#DDE1FE',
          200: '#BCC3FD',
          300: '#94A0F9',
          400: '#6D7DF0',
          500: '#4F5FE0',
          600: '#3D48C7',
          700: '#3037A3',
          800: '#272C82',
          900: '#1F2368',
          950: '#141848',
        },
        slate: {
          50:  '#F1F4F8',
          100: '#E1E7EF',
          200: '#C4CEDA',
          300: '#94A1B4',
          400: '#64738B',
          500: '#475569',
          600: '#364152',
          700: '#2A3342',
          800: '#1E2530',
          900: '#141A22',
        },
        success: { light: '#DCFCE7', DEFAULT: '#15803D', dark: '#14532D' },
        warning: { light: '#FEF3C7', DEFAULT: '#D97706', dark: '#92400E' },
        error:   { light: '#FEE2E2', DEFAULT: '#DC2626', dark: '#991B1B' },
        info:    { light: '#E0F2FE', DEFAULT: '#0369A1', dark: '#0C4A6E' },
      },
      fontFamily: {
        sans:    ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-instrument-serif)', 'ui-serif', 'Georgia', 'serif'],
        mono:    ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        xs:   ['0.75rem',  { lineHeight: '1.5' }],
        sm:   ['0.875rem', { lineHeight: '1.5' }],
        base: ['1rem',     { lineHeight: '1.5' }],
        lg:   ['1.125rem', { lineHeight: '1.5' }],
        xl:   ['1.25rem',  { lineHeight: '1.25' }],
        '2xl':['1.5rem',   { lineHeight: '1.25' }],
        '3xl':['1.875rem', { lineHeight: '1.25' }],
        '4xl':['2.25rem',  { lineHeight: '1.1'  }],
        '5xl':['3rem',     { lineHeight: '1.1'  }],
      },
      letterSpacing: {
        tight:  '-0.02em',
        normal: '0',
        wide:   '0.05em',
      },
      borderRadius: {
        none: '0',
        sm:   '4px',
        md:   '8px',
        lg:   '12px',
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(15, 19, 25, 0.04)',
        md: '0 2px 8px -2px rgba(15, 19, 25, 0.06), 0 1px 2px 0 rgba(15, 19, 25, 0.04)',
        lg: '0 8px 24px -4px rgba(15, 19, 25, 0.08), 0 2px 6px -1px rgba(15, 19, 25, 0.04)',
        xl: '0 16px 48px -8px rgba(15, 19, 25, 0.12), 0 4px 12px -2px rgba(15, 19, 25, 0.06)',
      },
      transitionDuration: {
        fast:   '150ms',
        normal: '250ms',
        slow:   '400ms',
      },
      transitionTimingFunction: {
        'out-soft':    'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-soft': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'spring':      'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
```

### 10.2 `globals.css` with `@theme` (Tailwind 4 path)

This is the preferred Tailwind 4 syntax. Import this at the top of your Next.js app (`app/globals.css`).

```css
@import "tailwindcss";

@theme {
  /* === Neutrals === */
  --color-neutral-0:   #FFFFFF;
  --color-neutral-50:  #FAFAF7;
  --color-neutral-100: #F4F4F0;
  --color-neutral-200: #E8E8E2;
  --color-neutral-300: #D1D1C9;
  --color-neutral-400: #A3A39B;
  --color-neutral-500: #737370;
  --color-neutral-600: #52524F;
  --color-neutral-700: #3F3F3D;
  --color-neutral-800: #27272A;
  --color-neutral-900: #18181B;
  --color-neutral-950: #0A0A0C;

  /* === Graphite (Primary) === */
  --color-graphite-50:  #F5F6F7;
  --color-graphite-100: #E9EBEE;
  --color-graphite-200: #CED2D8;
  --color-graphite-300: #A8AEB8;
  --color-graphite-400: #6E7683;
  --color-graphite-500: #475060;
  --color-graphite-600: #2F3844;
  --color-graphite-700: #1F2631;
  --color-graphite-800: #151A22;
  --color-graphite-900: #0F1319;
  --color-graphite-950: #080A0E;

  /* === Signal (Accent) === */
  --color-signal-50:  #EEF0FF;
  --color-signal-100: #DDE1FE;
  --color-signal-200: #BCC3FD;
  --color-signal-300: #94A0F9;
  --color-signal-400: #6D7DF0;
  --color-signal-500: #4F5FE0;
  --color-signal-600: #3D48C7;
  --color-signal-700: #3037A3;
  --color-signal-800: #272C82;
  --color-signal-900: #1F2368;
  --color-signal-950: #141848;

  /* === Slate (Secondary) === */
  --color-slate-50:  #F1F4F8;
  --color-slate-100: #E1E7EF;
  --color-slate-200: #C4CEDA;
  --color-slate-300: #94A1B4;
  --color-slate-400: #64738B;
  --color-slate-500: #475569;
  --color-slate-600: #364152;
  --color-slate-700: #2A3342;
  --color-slate-800: #1E2530;
  --color-slate-900: #141A22;

  /* === Semantic === */
  --color-success-light:   #DCFCE7;
  --color-success:         #15803D;
  --color-success-dark:    #14532D;
  --color-warning-light:   #FEF3C7;
  --color-warning:         #D97706;
  --color-warning-dark:    #92400E;
  --color-error-light:     #FEE2E2;
  --color-error:           #DC2626;
  --color-error-dark:      #991B1B;
  --color-info-light:      #E0F2FE;
  --color-info:            #0369A1;
  --color-info-dark:       #0C4A6E;

  /* === Typography === */
  --font-sans:    'Geist Sans', ui-sans-serif, system-ui, sans-serif;
  --font-display: 'Instrument Serif', ui-serif, Georgia, serif;
  --font-mono:    'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace;

  --text-xs:   0.75rem;
  --text-sm:   0.875rem;
  --text-base: 1rem;
  --text-lg:   1.125rem;
  --text-xl:   1.25rem;
  --text-2xl:  1.5rem;
  --text-3xl:  1.875rem;
  --text-4xl:  2.25rem;
  --text-5xl:  3rem;

  --font-weight-regular:  400;
  --font-weight-medium:   500;
  --font-weight-semibold: 600;

  --tracking-tight:  -0.02em;
  --tracking-normal: 0;
  --tracking-wide:   0.05em;

  /* === Radii === */
  --radius-none: 0;
  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-full: 9999px;

  /* === Shadows === */
  --shadow-sm: 0 1px 2px 0 rgba(15, 19, 25, 0.04);
  --shadow-md: 0 2px 8px -2px rgba(15, 19, 25, 0.06), 0 1px 2px 0 rgba(15, 19, 25, 0.04);
  --shadow-lg: 0 8px 24px -4px rgba(15, 19, 25, 0.08), 0 2px 6px -1px rgba(15, 19, 25, 0.04);
  --shadow-xl: 0 16px 48px -8px rgba(15, 19, 25, 0.12), 0 4px 12px -2px rgba(15, 19, 25, 0.06);

  /* === Motion === */
  --duration-fast:   150ms;
  --duration-normal: 250ms;
  --duration-slow:   400ms;
  --ease-out:        cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out:     cubic-bezier(0.4, 0, 0.2, 1);
  --ease-spring:     cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* === Semantic role aliases — reference these in components, not the raw tokens === */
:root {
  --bg-base:    var(--color-neutral-50);
  --bg-muted:   var(--color-neutral-100);
  --bg-surface: var(--color-neutral-0);
  --bg-inverse: var(--color-graphite-900);

  --text-primary:   var(--color-graphite-900);
  --text-secondary: var(--color-neutral-600);
  --text-tertiary:  var(--color-neutral-500);
  --text-disabled:  var(--color-neutral-400);
  --text-inverse:   var(--color-neutral-50);
  --text-accent:    var(--color-signal-700);

  --border-subtle:  var(--color-neutral-200);
  --border-default: var(--color-neutral-300);
  --border-strong:  var(--color-neutral-400);
  --border-accent:  var(--color-signal-500);
}

/* === Base === */
html {
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  background: var(--bg-base);
  color: var(--text-primary);
}

/* === Focus ring (accessibility default) === */
*:focus-visible {
  outline: 2px solid var(--color-signal-600);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
```

### 10.3 Fonts setup (`app/layout.tsx`)

```ts
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-instrument-serif',
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
```

---

## Appendix — Quick Reference

**When you reach for a color, ask first:** is this meaning, or is this decoration?
- If **meaning** → use the semantic or role token (`--text-accent`, `--color-error`, etc.)
- If **decoration** → use neutrals. Never reach for Signal to "make it pop."

**When you reach for a font size, ask first:** what's the hierarchy here?
- Body is `--text-base`. Anything else needs a reason.
- `--font-display` appears where the AI is making a statement. Rare.

**When you reach for a shadow, ask first:** what elevation is this?
- Resting card → `sm`. Hovered → `md`. Popover → `lg`. Modal → `xl`. That's it.

**When a designer asks "can we add a new color / font / radius," the answer is no unless:**
1. It serves a new semantic meaning the system doesn't cover.
2. It is added to this document first.
3. It replaces an existing token, not adds alongside it.

---

*Last updated: v2.0 — Graphite & Signal rebuild.*
