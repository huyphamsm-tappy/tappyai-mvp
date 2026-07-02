# TappyAI — Responsive Design Guidelines

> **Status:** Single source of truth for all TappyAI UI development. Every future UI commit MUST follow this document.
> **Scope:** Guidelines only — no code, no UI, no config changes are made by this document.
> **Grounding:** Reflects the CURRENT product (mobile-first PWA, bottom-tab navigation, `#007AFF`/`#FF9500` palette, Inter font, `rounded-2xl` cards/buttons). Where the current codebase has no system yet (e.g. containers, type scale), this doc defines the **target** to converge on — it does **not** redesign the product, introduce a sidebar, or add desktop-only layouts.
> **Convention:** 🟢 = already in the codebase · 🎯 = target to adopt in future commits.

---

## 1. Design Philosophy

- **Mobile-first.** Base styles target the smallest phone (320px). Larger screens are progressive enhancements via `min-width` breakpoints — never the reverse.
- **Responsive, not fixed.** Prefer `flex`, `grid`, `max-width`, `min()`, `max()`, `clamp()` over fixed pixel widths. The layout scales naturally; avoid pixel-perfect designs that only look right at one width.
- **Premium & clean.** Generous whitespace, one consistent radius language, restrained shadows, a single accent color for primary actions. No visual clutter.
- **Consistent hierarchy.** Type scale, spacing, and color communicate importance — not ad-hoc font sizes or one-off margins.
- **Content-appropriate width.** Content is never stretched edge-to-edge on large screens nor trapped in a phone-width column on desktop. Each surface uses the right container (§4).
- **Do no harm to mobile.** Mobile is the working, primary experience. New responsive rules add behavior at `md+`; the base (mobile) rendering stays equivalent.

---

## 2. Supported Screen Sizes

| Width | Class of device | Orientation notes |
|---|---|---|
| 320px | Small phone (iPhone SE 1st gen) | Portrait baseline — must never overflow |
| 375px | iPhone SE/mini | Portrait |
| 390px | iPhone 12–15 | Portrait |
| 430px | iPhone Pro Max | Portrait |
| 480px | Large phone | Portrait / small landscape |
| 768px | Tablet portrait (iPad) | Portrait — dedicated multi-column where sensible |
| 1024px | Tablet landscape / small laptop | Landscape |
| 1280px | Laptop | Landscape |
| 1440px | Desktop | Landscape |
| 1920px | Large desktop / 2K-ish | Landscape |
| 2560px | 2K / Ultra-wide / entry 4K | Content must stop widening (use `full` container cap) |

**Landscape:** every phone/tablet size must also work in landscape — watch vertical space for the chat input, modals, and sticky chrome (Header/BottomNav). Content areas scroll; chrome stays fixed with safe-area insets.

---

## 3. Responsive Breakpoints

Use **standard Tailwind breakpoints** (already the project default):

| Token | min-width | Primary use |
|---|---|---|
| `sm` | 640px | large phone → start 2-column grids |
| `md` | 768px | tablet portrait → dedicated tablet layout, wider containers |
| `lg` | 1024px | laptop → 3-column feed, desktop chat column |
| `xl` | 1280px | desktop refinements |
| `2xl` | 1536px | large desktop cap |

🎯 **Recommended additions (do NOT implement in this sprint — document only):**
- **`xs` (480px):** the 375–430px phone band vs. 480px "large phone" is a real design boundary (e.g. 2-up chip rows, larger touch targets). Justified because several components change between small and large phones.
- **`3xl` (1920px)** and **`4xl` (2560px):** to *stop* content widening and rebalance whitespace on 2K/4K, not to add new columns. Justified only for the `full` container cap and ultra-wide gutters.

Rationale for keeping the set small: more breakpoints = more states to QA. Add `xs`/`3xl`/`4xl` only when a component demonstrably needs them.

---

## 4. Container Strategy

🟢 Current: almost everything is `max-w-2xl` (672px) + `mx-auto` — including Header and BottomNav. This is the root cause of "desktop feels too small."

🎯 Target — semantic containers (centered with `mx-auto`, horizontal gutter `px-4 sm:px-6 lg:px-8`):

| Name | max-width | Use for |
|---|---|---|
| **Compact** | 448px (`max-w-md`) | Auth (login/register), single-focus dialogs, narrow forms |
| **Content** | 768px (`max-w-3xl`) | Reading/detail/settings/profile pages, most forms, **chat conversation** |
| **Wide** | 1024px (`max-w-5xl`) | Dashboards-style multi-section pages, group/service detail |
| **Feed** | 1280px (`max-w-7xl`) | Explore feed grid (2–4 columns) |
| **Full** | 1536px (`max-w-screen-2xl`) | Full-bleed sections, hero, media galleries; hard cap so 2K/4K don't over-stretch |

Rules:
- Never let a text column exceed ~75ch for readability (Content ≈ this at comfortable font size).
- Chrome (Header/BottomNav inner content) should align to the same container as the page it sits above.
- Below each container's max-width, width is fluid to 100% minus gutter.

---

## 5. Typography Scale

Font: **Inter** (400/500/600/700) 🟢. Brand-only: Orbitron (hero wordmark), Cinzel (fortune/explore tags) — do not use for UI chrome.

🎯 Responsive scale using `clamp(min, preferred, max)` so text grows gently on large screens without breaking mobile:

| Role | clamp() | Weight | Notes |
|---|---|---|---|
| Display (hero) | `clamp(1.75rem, 4vw, 2.75rem)` | 700–900 | Home hero only |
| H1 / page title | `clamp(1.5rem, 3vw, 2rem)` | 700 | one per page |
| H2 / section | `clamp(1.25rem, 2.2vw, 1.5rem)` | 600 | |
| H3 / card title | `clamp(1.05rem, 1.6vw, 1.25rem)` | 600 | |
| Body-lg | `clamp(1rem, 1.2vw, 1.125rem)` | 400–500 | chat messages, article body |
| Body (default) | `1rem` (16px) | 400 | never below 16px for inputs (prevents iOS zoom) |
| Small | `0.875rem` | 400–500 | metadata, helper text |
| Caption | `0.75rem` | 500 | labels, timestamps |

Readability first: line-height 1.5–1.65 for body (🟢 `.message-content` uses 1.6); tighter (1.2–1.3) for large headings.

---

## 6. Spacing System

Base unit **4px** (Tailwind default scale). Use the scale — never arbitrary values.

- **Page gutter (horizontal):** `px-4` (mobile) → `sm:px-6` → `lg:px-8`.
- **Page vertical rhythm:** top/bottom `py-4 md:py-6`; account for fixed Header (top) and BottomNav (bottom) with matching padding so content isn't clipped.
- **Section spacing:** `space-y-6 md:space-y-8` between major sections.
- **Card spacing:** internal padding `p-4 md:p-5`; gap between cards in a list/grid `gap-3 md:gap-4`.
- **Component spacing:** related controls `gap-2`; label→control `gap-1.5`; icon→text `gap-2`.
- Consistency rule: pick from `{1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12}` — avoid one-off margins.

---

## 7. Radius System

🟢 De-facto standard is `rounded-2xl` (16px) on cards and buttons.

| Token | value | Use |
|---|---|---|
| `rounded-lg` | 8px | chips, tags, small badges, inline code |
| `rounded-xl` | 12px | **inputs**, dropdowns, small buttons |
| `rounded-2xl` | 16px | **buttons, cards** (standard) |
| `rounded-3xl` | 24px | large feature cards, hero panels, bottom-sheet top corners |
| `rounded-full` | pill | avatars, icon buttons, pill nav/chips |

Keep it consistent: a card and the buttons inside it should not mix 8px and 16px arbitrarily.

---

## 8. Elevation

Restrained, layered by intent:

| Level | Tailwind | Use |
|---|---|---|
| Flat | `border` only | default surfaces, list rows |
| Low | `shadow-sm` 🟢 | cards (current `.card` standard) |
| Medium | `shadow-md` | hover-raised cards, dropdowns, popovers |
| High | `shadow-lg` | modals, sheets, floating action surfaces |
| Peak | `shadow-xl` | rare — only the top-most overlay |

Dark mode: prefer borders + subtle background elevation over heavy shadows (shadows read poorly on dark). Never stack two shadow levels on one element.

---

## 9. Buttons

🟢 Current `.btn-primary`/`.btn-secondary`: `py-3 px-6 rounded-2xl`, `disabled:opacity-50`, `transition-all duration-150`.

| Size | Height | Padding | Use |
|---|---|---|---|
| sm | 36px | `py-2 px-4` | inline / dense |
| **base** | **44px** | `py-3 px-6` 🟢 | default (meets 44px touch target) |
| lg | 52px | `py-3.5 px-8` | primary CTA, hero |

- **Radius:** `rounded-2xl` (or `rounded-full` for pill/icon buttons).
- **Icon spacing:** `gap-2` between icon and label; icon size 16–18px.
- **Loading state:** replace label with a spinner (or spinner + text), keep width stable, set `disabled` + `opacity` (🟢 pattern exists). Never let the button resize on load.
- **Variants:** primary (accent fill), secondary (neutral fill), ghost (text only), destructive (red) — one primary action per view.

---

## 10. Inputs

| Property | Standard |
|---|---|
| Height | 44px (`py-2.5`/`py-3` + 16px text) — **font ≥16px** to prevent iOS auto-zoom |
| Radius | `rounded-xl` (12px) |
| Border | `border border-gray-200 dark:border-gray-700` |
| Focus | `focus:outline-none focus:ring-2 focus:ring-primary-400` 🟢 (used in preferences) |
| Error | `border-red-400 ring-red-300` + helper text below in `text-red-500 text-sm` |
| Disabled | `opacity-50 cursor-not-allowed` |
| Placeholder | `placeholder-gray-400 dark:placeholder-gray-600` |

Textareas: same radius/border/focus, `resize-none`, min 3 rows. Always pair inputs with a visible or `aria-label`.

---

## 11. Cards

- **Padding:** `p-4 md:p-5` (feature cards `p-6`).
- **Radius:** `rounded-2xl` 🟢.
- **Surface:** `bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm` 🟢 (`.card`).
- **Spacing between cards:** `gap-3 md:gap-4`.
- **Image ratios (use `aspect-*`, object-cover):**
  - Explore video card: **9:16** (vertical) — contain within card.
  - Place photo (chat gallery): ~**5:4** (🟢 current 200×160 strip).
  - Thumbnails / avatars-in-card: **1:1** or **4:3**.
  - Wide banners/deals: **16:9**.
- Never hardcode image px width on responsive cards — let the grid cell + `aspect-ratio` drive size.

---

## 12. Icons

Library: **lucide-react** 🟢. Standard sizes:

| Size | Use |
|---|---|
| 14–16px | inline with text, metadata, small chips |
| 18–20px | buttons, Bottom Navigation, Header actions |
| 24px | section headers, empty-state accents |
| 32px+ | feature illustrations / empty states only |

Keep stroke width default; align icon optical size to adjacent text (16px icon with 14–16px text).

---

## 13. Avatar Sizes

| Size | Use |
|---|---|
| 24px | inline (comment author, dense lists) |
| 32px | list rows, feed card author |
| 40px | Header user, profile list row |
| 64px | profile card |
| 96px | profile page hero |

Always `rounded-full`, `object-cover`, with a fallback (initials or placeholder) and `alt`.

---

## 14. Chat Layout Rules

🟢 Current: conversation column `max-w-2xl` with `max-w-md` bubbles; horizontal image gallery; sticky input.

🎯 Target (feels like ChatGPT / Claude / Perplexity on desktop, unchanged on mobile):

- **Conversation width:** center the thread in **Content (max-w-3xl)**. Do not go full-bleed on desktop.
- **Message bubbles:**
  - User: right-aligned, `max-w-[85%]` mobile / `max-w-[75%]` desktop, filled bubble, `rounded-2xl`.
  - Assistant: left-aligned, may use full column width (no bubble or subtle surface), for readable long-form + galleries.
- **Image gallery:** horizontal scroll-snap strip (🟢 keep) — items ~200×160, `gap-2`, scrollbar hidden; on desktop the strip lives inside the max-w-3xl column.
- **Cards / CTA buttons / suggestions:** wrap within the column; CTA buttons full-width on mobile, inline-wrap on desktop; suggestion chips scroll horizontally on mobile.
- **Input area:** sticky bottom, same **max-w-3xl** centered, `px-4`, safe-area bottom padding; grows with content (textarea auto-resize) up to a max height then scrolls.
- **Streaming:** append into the same layout with no width/reflow jump; keep the auto-scroll anchor at the bottom.
- **Loading states:** typing dots (🟢 `.typing-dot`) for assistant; skeletons for tool cards.
- **Mobile:** full width minus gutter; input pinned above BottomNav (or replacing it on the chat route as currently done); respect keyboard inset.

---

## 15. Explore Feed Rules

- **Container:** **Feed (max-w-7xl)**.
- **Grid behavior:**
  - phone `<640`: **1 column**
  - `sm` (≥640): **2 columns**
  - `lg` (≥1024): **3 columns**
  - `2xl` (≥1536): **4 columns**
  - gap `gap-3 md:gap-4`.
- **Card width:** driven by grid cell (fluid) — never fixed px.
- **Video ratio:** **9:16** vertical, `object-cover`, contained in the card; thumbnail with play affordance.
- **Tablet:** 2 columns, comfortable — must NOT look like a stretched single-column phone feed.
- **Desktop:** 3–4 columns balanced; card hover elevation `shadow-md`.
- **Loading skeleton:** same grid + `aspect-[9/16]` placeholders; no layout shift when real content replaces skeletons.

---

## 16. Navigation

**No sidebar. Do not introduce one.** The product uses top Header + bottom tab bar at all sizes.

- **Header** 🟢: sticky top, inner content aligned to the page container, `h-14`-ish, back/title/actions; safe-area top inset on mobile.
- **Bottom Navigation** 🟢: fixed bottom, 5 tabs (Home / Chat / Explore / Deals / Profile), icon 18–20px + caption, active = `primary`, safe-area bottom inset (`env(safe-area-inset-bottom)`).
- **Desktop behavior:** bottom nav **persists** (product direction) but its inner content is centered/max-width so it doesn't stretch awkwardly on wide screens; content column widens per §4. Do not convert to a sidebar.
- Bottom nav hides only where a route intentionally replaces it (e.g. chat input on the chat route) — keep that behavior.

---

## 17. Modal Rules

- **Width:** `min(92vw, <container>)` — dialogs use Compact (max-w-md) / large use Content (max-w-2xl).
- **Padding:** `p-5 md:p-6`.
- **Radius:** `rounded-2xl` (desktop centered) / `rounded-t-3xl` (mobile bottom-sheet).
- **Backdrop:** `bg-black/50`, click-outside to close + explicit close (X) button.
- **Animation:** mobile = slide-up sheet (🟢 `slide-up` 300ms); desktop = fade + subtle scale (200ms). Respect `prefers-reduced-motion`.
- **Responsive behavior:** bottom-sheet on phones, centered dialog on `md+`; content scrolls inside if it exceeds viewport; respect safe-area; lock body scroll while open.
- **Lightbox (image zoom)** 🟢: full-screen dark backdrop, close on X / backdrop, single image centered with `object-contain`.

---

## 18. Animation

🟢 Existing tokens: `fade-in` 200ms, `slide-up` 300ms, `pulse-dot` 1.4s, micro-interactions `transition-all duration-150`.

| Duration | Use |
|---|---|
| 100–150ms | buttons, hovers, presses, toggles (micro) |
| 200ms | fades, tooltips, dropdown open |
| 300ms | sheets/modals entrance, page section reveal |
| ≥1s | looping indicators only (typing dots, spinners) |

Use animation for **feedback and entrance**, not decoration. Never animate layout-affecting properties on large lists (jank). Always honor `prefers-reduced-motion: reduce` (disable non-essential motion). Avoid animation that causes layout shift.

---

## 19. Accessibility

- **Touch targets:** minimum **44×44px** for all interactive elements (buttons, nav items, icon buttons). Add padding to small icons to reach it.
- **Contrast:** meet WCAG **AA** — body text ≥4.5:1, large text ≥3:1. Verify `primary #007AFF` and `accent #FF9500` on their backgrounds; on `#FF9500` use dark text, not white.
- **Keyboard:** everything actionable is focusable and operable by keyboard; logical tab order; `Esc` closes modals; `Enter` submits.
- **Focus:** visible focus ring (`ring-2 ring-primary-400`) — never remove outlines without a replacement.
- **Semantics:** real `<button>`/`<a>`, `aria-label` on icon-only controls, `alt` on images, labels on inputs.
- **Zoom note:** current viewport sets `maximumScale:1` (pinch-zoom disabled). This is an accessibility trade-off; consider allowing user zoom in a future revision (not changed here).
- **Reduced motion:** respect the OS setting (§18).

---

## 20. Visual QA Checklist (run for EVERY future UI commit)

**Widths:** ☐ 320 ☐ 375 ☐ 390 ☐ 430 ☐ 480 ☐ 768 ☐ 1024 ☐ 1280 ☐ 1440 ☐ 1920 ☐ 2560

**Devices/roles:** ☐ Small phone ☐ Large phone ☐ Tablet ☐ Laptop ☐ Desktop ☐ 2K ☐ 4K

**Orientation:** ☐ Portrait ☐ Landscape

**Theme:** ☐ Light mode ☐ Dark mode

**Integrity:** ☐ No horizontal scroll ☐ No overflow ☐ No clipped content ☐ No layout shift (CLS) on load/stream ☐ Touch targets ≥44px ☐ Safe-area respected (notch + home indicator) ☐ Keyboard doesn't cover the active input ☐ Focus states visible ☐ Images use aspect-ratio (no jump) ☐ `tsc --noEmit` clean ☐ Production build passes

---

*This document reflects the current TappyAI product direction: mobile-first PWA, bottom-tab navigation, `#007AFF`/`#FF9500` palette, Inter typography, `rounded-2xl` surfaces. It defines the responsive system to converge on; it does not redesign the app, introduce a sidebar, or add desktop-only layouts.*
