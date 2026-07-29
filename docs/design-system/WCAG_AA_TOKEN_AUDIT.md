# Design System — WCAG AA Semantic Color Layer

**Status:** Implemented, verified — awaiting Product Owner UAT.
**Date:** 2026-07-29
**Scope:** Design System only. No landing-page, Android, iOS, backend, API, or business-logic changes.

---

## 1. Background

During the `/startup` landing-page task, contrast failures were measured on rendered pages. The Product Owner ruled (2026-07-29) that contrast must **not** be patched per-page. Instead it is fixed **once in the design system** and applied product-wide. This work does **not** block Product UAT of the landing page (that task is closed).

The product's color tokens live in `tailwind.config.ts` (`primary`, `accent`) plus the **Tailwind 3.4.7 default `gray` scale**, which the product consumes directly via `gray-*` utilities (the gray scale is not declared in the config).

---

## 2. Problem statement

Two failures were measured from computed styles on a real rendered page (headless Edge; WCAG AA requires 4.5:1 for normal text, 3:1 for large):

1. **`text-gray-500` (#6b7280) on `bg-gray-950` (#030712) = 4.16:1 — FAIL.** Seen on the `/startup` footer copyright line.
2. **White text on `bg-primary-500` (#007AFF) at 14px = 4.02:1 — FAIL.** The product-wide primary-button pairing (login screen, CTAs, headers/hero buttons).

The token audit additionally surfaced that **`#007AFF` as link/icon text on white is also 4.02:1** (fails), and a widespread **tertiary hint pattern** that fails in both themes (see §10).

---

## 3. WCAG measurements

Computed via WCAG 2.1 relative-luminance math on the hex token values. Validated against the two rendered measurements above (computed 4.16 and 4.02 match exactly), so the math is authoritative for solid-color pairings.

### Interactive blue (`primary`)

| Shade | Hex | White text | On white (as text) |
|-------|-----|-----------|--------------------|
| primary-400 | #3391FF | 3.17 ✗ | 3.17 ✗ (large ✓) |
| **primary-500 / DEFAULT** | **#007AFF** | **4.02 ✗** (large ✓) | **4.02 ✗** (large ✓) |
| **primary-600** | **#0062CC** | **5.80 ✓** | **5.80 ✓** |
| primary-700 | #004999 | 8.70 ✓ | 8.70 ✓ |

The brand blue is symmetric: `primary-500` fails AA-normal as both a white-text fill **and** as text on white. `primary-600` clears both.

### Accent (`accent`)

`accent-500` (#FF9500) as a white-text fill = **2.20:1** (hard fail). A repo sweep confirms **accent is never used as a solid white-text fill** — every `bg-accent-*` usage is a light tint with dark `accent-600` text, or a decorative blur. The accent failure is therefore theoretical, not shipped. No accent token was changed.

### Gray secondary text

| Text | on gray-950 | on white / gray-50 |
|------|------------|--------------------|
| gray-400 (#9ca3af) | **7.93 ✓** | 2.43 ✗ |
| gray-500 (#6b7280) | **4.16 ✗** (large ✓) | 4.83 / 4.63 ✓ |
| gray-600 (#4b5563) | 2.66 ✗ | 7.23 ✓ |

`gray-500` is the correct **light-mode** secondary; `gray-400` the correct **dark-mode** secondary. The paired pattern `text-gray-500 dark:text-gray-400` is AA-safe on both ends.

---

## 4. Root cause analysis

Two structurally distinct problems requiring different fixes:

- **A — the interactive blue is a token/role defect.** `#007AFF` (`primary` DEFAULT / `primary-500`) is a mid-tone that fails AA-normal at text size from both directions. It is only AA-safe for large text or large brand areas. This requires a **design decision** on the interactive shade.
- **B — `text-gray-500` on dark is NOT a token defect.** `gray-500` is fine on white/`gray-50`; the footer failure is a **missing `dark:` variant** (bare `text-gray-500` over a dark surface). The correct pattern `text-gray-500 dark:text-gray-400` already existed 118× across 46 files.

Owner-approved direction: build a **semantic color layer** (keep `#007AFF` as the brand hue), and fix violations through the layer rather than per-page.

---

## 5. Semantic color architecture

Semantic roles are declared as **CSS variables** in `src/app/globals.css` under `:root` and `.dark`, and mapped in `tailwind.config.ts` via `rgb(var(--x) / <alpha-value>)` (RGB triplets → opacity-utility support). Because the variables flip under `.dark`, call sites no longer hand-wire `dark:` variants for these roles.

This mirrors the pre-existing house style (the shadcn/admin tokens already use `hsl(var(--…))` with a `.dark {}` block).

**The brand `primary` scale (`#007AFF`) is unchanged** and remains the source for brand-identity uses: `border-primary-*`, `ring-primary-*`, `from/to/via-primary-*`, `shadow-primary-*`, and large/decorative `text-primary-*`.

---

## 6. Token mapping

CSS variables (`src/app/globals.css`):

| Variable | Light (`:root`) | Dark (`.dark`) | Notes |
|----------|-----------------|----------------|-------|
| `--interactive` | `0 98 204` (#0062CC) | `0 98 204` | fill; white text 5.80:1 (bg-independent) |
| `--interactive-hover` | `0 73 153` (#004999) | `0 73 153` | white 8.70:1 |
| `--interactive-active` | `0 49 102` (#003166) | `0 49 102` | white 12.87:1 |
| `--on-interactive` | `255 255 255` | `255 255 255` | on-color for fills |
| `--link` | `0 98 204` (#0062CC) | `51 145 255` (#3391FF) | 5.80 on white / 6.36 gray-950, 5.60 gray-900, 4.64 gray-800 |
| `--content` | `17 24 39` (gray-900) | `243 244 246` (gray-100) | body text |
| `--content-secondary` | `107 114 128` (gray-500) | `156 163 175` (gray-400) | 4.83 / 7.93 |
| `--content-muted` | `156 163 175` (gray-400) | `107 114 128` (gray-500) | **LARGE / non-essential only** — 2.54 on white, sub-AA by design |

Tailwind mapping (`tailwind.config.ts`) generates: `bg-interactive`, `bg-interactive-hover`, `bg-interactive-active`, `text-on-interactive`, `text-link`, `text-content`, `text-content-secondary`, `text-content-muted` (and their `border-`/`hover:` forms).

The dark `--link` uses `primary-400` (#3391FF) to (a) match the product's existing `dark:text-primary-400` link convention and (b) clear AA on elevated dark surfaces (`gray-900`/`gray-800`), where `#007AFF` measured 4.42:1.

---

## 7. Blast radius (grounded in repo grep)

| Anchor | Count | Disposition |
|--------|-------|-------------|
| `.btn-primary` (globals.css) | 8 sites | → interactive tokens |
| inline `bg-primary` / `bg-primary-500` + white text (buttons/chips) | ~45 sites | → `bg-interactive` |
| admin `button.tsx`, `badge.tsx`, `AdminShell.tsx` | 3 files | → `bg-interactive` / `text-link` |
| `text-primary` / `text-primary-500` (fails on white) | migrated | → `text-link` |
| `text-primary-600 dark:text-primary-400` (already compliant) | left as-is | untouched |
| `text-gray-500 dark:text-gray-400` (already compliant) | 118 sites | → `text-content-secondary` (visually identical) |
| `bg-accent` solid + white text | 0 | no change needed |

Total applied: **63 files, 251 class-token replacements** + `tailwind.config.ts`.

---

## 8. Migration strategy

A scripted codemod applied **ordered class-token renames** (not per-page hex edits). Longer/more-specific patterns first so bare rules do not corrupt them:

1. `hover:bg-primary-600` → `hover:bg-interactive-hover`; `active:bg-primary-700` → `active:bg-interactive-active`; `hover:bg-primary-700` → `hover:bg-interactive-hover`
2. `bg-primary-600` / `bg-primary-500` → `bg-interactive`; bare DEFAULT `bg-primary` → `bg-interactive`
3. `text-primary-500` and bare DEFAULT `text-primary` → `text-link`
4. `text-gray-500 dark:text-gray-400` → `text-content-secondary`

**Intentionally left untouched:** `border-primary-*`, `ring-primary-*`, gradient `from/to/via-primary-*`, `shadow-primary-*`, tint backgrounds (`bg-primary-50/100/900`), decorative/large `text-primary-*`, and the already-compliant `text-primary-600 dark:text-primary-400` link pattern.

---

## 9. Verification results

| Gate | Result |
|------|--------|
| TypeScript (`tsc --noEmit`) | ✅ exit 0 |
| Lint (`next lint`) | ✅ exit 0 (pre-existing warnings only) |
| Tests (`vitest run src`) | ✅ 381/381, 44 files |
| WCAG — token math | ✅ all roles pass on designed surfaces |
| WCAG — rendered `getComputedStyle`, both themes | ✅ fill 5.80 · link 5.80 (light) / 6.36 (dark) · secondary 4.83 (light) / 6.99 (dark) |
| CSS compilation (standalone `tailwindcss`) | ✅ utilities + `:root`/`.dark` vars generate correctly |

**Notes / limitations, stated honestly:**
- The repository has **no visual-regression tooling** (no Playwright/Percy/Storybook). Color correctness was verified via rendered computed-styles and compiled CSS, not pixel diffs.
- Intended visual delta: primary button fills `#007AFF → #0062CC` (one rung deeper); light-mode links `#007AFF → #0062CC`; dark-mode links `#007AFF → #3391FF` (brighter). Body text, secondary text values, and all brand-identity uses are unchanged.
- Rendering the app locally required a dummy, git-ignored `.env.local` (the worktree had none; the Supabase client 500s every route without keys). This is not part of the deliverable.

---

## 10. Remaining Product Owner decision — tertiary `content-muted`

A third violation class was found but **deliberately not applied**: the tertiary hint pattern `text-gray-400 dark:text-gray-500` (~50+ sites — timestamps, descriptions, eyebrow labels). It fails AA-normal in **both** themes (gray-400 on white = 2.43; gray-500 on gray-950 = 4.16).

Making it compliant is a genuine design trade-off, not a mechanical fix: on a white background you cannot have two distinct *more-muted* grays both ≥4.5:1, so compliance **darkens light-mode hints and collapses one level of the text hierarchy**.

Two one-line options are ready via the new tokens:
- **Compliant:** migrate → `text-content-secondary` (fully AA; hierarchy flattens to a single secondary level).
- **Decorative:** treat as non-essential → `text-content-muted` (documented as below AA-normal by design; hierarchy preserved).

`content-muted` currently ships **as-is** (unused as a migration target). This decision is deferred to Product UAT.

---

## 11. Future recommendations

- **Adopt `text-link` and `text-content-secondary` as canonical going forward.** Some already-compliant sites still use `text-primary-600 dark:text-primary-400` and `text-gray-500 dark:text-gray-400`; unifying them onto the semantic tokens (when convenient, outside a freeze) would remove hand-wired `dark:` pairings entirely.
- **Add a lint rule** flagging bare `text-gray-400/500/600` without a `dark:` sibling, to prevent future footer-class regressions.
- **Consider a lightweight visual-regression harness** (Playwright screenshot diffs on a few key screens) so future token changes have an automated baseline.
- **Resolve the tertiary decision (§10)** and apply the chosen one-liner.
- **Accent** needs no change today, but if accent is ever used as body-size text on light backgrounds it requires `accent-700+` (accent-500/600 fail AA-normal on white).
