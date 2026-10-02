# TappyAI V3 — Design System

**Status:** DONE (specification; adoption is P4-01…P4-07)
**Scope:** Web · Android · iOS

This is the **values** specification that `docs/MASTER_UX_UI_SPECIFICATION.md` (MUXS) deliberately
defers to. MUXS §4 defines colour, type, spacing, elevation and shape as *roles and meaning*, and
states values "belong to the design-system specification". That document did not exist. This is it.

**Relationship to existing documents — this supersedes nothing:**

| Document | Relationship |
|---|---|
| `MASTER_UX_UI_SPECIFICATION.md` | **Authority.** Philosophy and meaning. This document may never contradict it. |
| `UI_GUIDELINES.md` | **Absorbed and extended.** Its web values (§3 breakpoints, §5 type, §6 spacing, §7 radius, §8 elevation, §14 chat) are adopted verbatim as the cross-platform baseline. |
| `design-system/WCAG_AA_TOKEN_AUDIT.md` | **Absorbed.** Its semantic colour layer is the canonical colour model. |
| `ios/DesignSystem/Tokens/*` | **Reference implementation.** Already correct; web and Android align to it. |

**Governing principle (MUXS):** *usability first, then visual consistency, then numerical
consistency.* Where a token would make a screen harder to use, the screen wins and the exception is
documented — do not chase numerical uniformity.

---

## 1. Token naming

One semantic name per role, spelled per-platform idiom. **The name is the contract; the syntax is not.**

| Role | Web (Tailwind/CSS var) | Android (Kotlin) | iOS (Swift) |
|---|---|---|---|
| Brand primary | `primary-500` / `--primary` | `TappyColor.primary` | `TappyColor.primary` |
| Interactive fill | `bg-interactive` | `TappyColor.interactive` | `TappyColor.interactive` |
| Body text | `text-content` | `TappyColor.textPrimary` | `TappyColor.textPrimary` |
| Space step 4 | `p-4` (16px) | `Spacing.md` | `Spacing.md` |

Never introduce a raw value at a call site when a token exists. Never invent a token for a
one-off; use the nearest step.

---

## 2. Colour

### 2.1 Brand (fixed, all platforms)

| Token | Value | Meaning (MUXS §4.1) |
|---|---|---|
| `primary` | `#007AFF` | The brand and the trusted assistant |
| `accent` | `#FF9500` | Energy, action, delight |
| `on-primary` | `#FFFFFF` | On-colour for primary fills |
| `on-accent` | `#000000` | **Dark on orange** — deliberate, for contrast |

`primary` scale (50→900) is defined in `tailwind.config.ts` and mirrored on mobile:
`#E5F1FF · #CCE3FF · #99C8FF · #66ACFF · #3391FF · #007AFF · #0062CC · #004999 · #003166 · #001833`

> **Brand hue vs text contrast.** `#007AFF` is the brand mark and is used for borders, rings and
> large/decorative marks. It is **not** used for text-sized interactive elements — `#0062CC`
> (`primary-600`) is, because it clears AA. This split is the whole point of the semantic layer.

### 2.2 Semantic layer (WCAG 2.1 AA — authoritative)

Adopted verbatim from `WCAG_AA_TOKEN_AUDIT.md`. Ratios are measured against the surface each role
sits on. These auto-flip in dark mode, so call sites must **not** hand-wire `dark:` variants.

| Role | Light | Dark | Contrast |
|---|---|---|---|
| `interactive` | `#0062CC` | `#0062CC` | white text 5.80:1 |
| `interactive-hover` | `#004999` | `#004999` | 8.70:1 |
| `interactive-active` | `#003166` | `#003166` | 12.87:1 |
| `on-interactive` | `#FFFFFF` | `#FFFFFF` | — |
| `link` | `#0062CC` | `#3391FF` | 5.80:1 / 6.36:1 on gray-950 |
| `content` | `#111827` | `#F3F4F6` | 17.9:1 / 18.0:1 |
| `content-secondary` | `#6B7280` | `#9CA3AF` | 4.63:1 / 7.93:1 |
| `content-muted` | `#9CA3AF` | `#6B7280` | **2.43:1 — LARGE or non-essential text only** |

**`content-muted` is below AA for normal text by design.** It may only be used at ≥18.66px bold or
≥24px regular, or for genuinely non-essential decoration. Using it for body copy is a defect.

### 2.3 Surfaces

| Role | Light | Dark | Use |
|---|---|---|---|
| `background` | `#FFFFFF` | `#000000` | Page ground |
| `surface` | `#F2F2F7` | `#1C1C1E` | Recessed / grouped areas |
| `surface-elevated` | `#FFFFFF` | `#2C2C2E` | Cards, sheets |
| `separator` | `#E5E7EB` | `#2C2C2E` | Hairlines |
| `border` | `#E5E7EB` | `#374151` | Component borders |

### 2.4 Functional state

| Role | Value | Meaning |
|---|---|---|
| `success` | `#34C759` | Completed, confirmed, positive |
| `danger` | `#FF3B30` | Error, destructive, blocked |
| `warning` | `#F59E0B` | **Needs attention without asserting fault** |

> The `warning` definition is carried over verbatim from iOS `Colors.swift` and is worth keeping
> for its reasoning: *"Deliberately neither `success` nor `danger`: it marks a state that needs
> attention without asserting fault — the safety gate holding a post is not an accusation, and
> green or red would both say something untrue about it."* This is exactly the tone V3's trust &
> safety UX requires.

**Colour is never the only carrier of meaning** (MUXS §4.1 + accessibility). Every state pairs
colour with an icon or text label. A match badge is `✓ Khớp`, not a green dot.

### 2.5 Fixed-theme surfaces (do not "unify")

Two surfaces are intentionally not theme-adaptive. Leave them:
- **Reviews / social feed** — locked dark (`docs/ios/06`; iOS `feedBackground`). MUXS §1's
  "immersive social experience" mode.
- **Controller / back office** — fixed dark enterprise surface (Owner Decision D10, 2026-08-23),
  scoped to `.admin-theme` with its own shadcn neutral tokens.

---

## 3. Typography

**Font:** Inter (400/500/600/700), with system fallback. Brand-only faces — Orbitron (hero
wordmark), Cinzel (fortune/explore tags) — are **never** used for UI chrome.
On mobile, the platform system face is an acceptable substitute where Inter is not bundled;
hierarchy and scale matter more than the exact face.

### 3.1 Scale

Adopted from `UI_GUIDELINES.md §5`. Web uses `clamp()` so type grows gently on large screens
without breaking mobile; mobile maps to platform dynamic-type styles.

| Role | Web (`clamp`) | Weight | Android | iOS | Use |
|---|---|---|---|---|---|
| Display | `clamp(1.75rem, 4vw, 2.75rem)` | 700–900 | `displaySmall` | `.largeTitle` | Home hero only |
| H1 | `clamp(1.5rem, 3vw, 2rem)` | 700 | `headlineMedium` | `.title` | One per page |
| H2 | `clamp(1.25rem, 2.2vw, 1.5rem)` | 600 | `titleLarge` | `.title2` | Section |
| H3 | `clamp(1.05rem, 1.6vw, 1.25rem)` | 600 | `titleMedium` | `.title3` | Card title |
| Body-lg | `clamp(1rem, 1.2vw, 1.125rem)` | 400–500 | `bodyLarge` | `.body` | **Chat messages**, article body |
| Body | `1rem` (16px) | 400 | `bodyMedium` | `.body` | Default |
| Small | `0.875rem` | 400–500 | `bodySmall` | `.subheadline` | Metadata, helper |
| Caption | `0.75rem` | 500 | `labelSmall` | `.caption` | Labels, timestamps |

**Hard rules**
- Inputs are **never** below 16px on web — smaller triggers iOS Safari zoom on focus.
- Body line-height 1.5–1.65 (`.message-content` is 1.6 — keep). Large headings 1.2–1.3.
- Restraint: if a screen needs a size not in this table, the screen is wrong, not the table.

---

## 4. Spacing

Base unit **4px**. Steps: `{2, 4, 8, 12, 16, 20, 24, 32, 40, 48}`.

> ### 🔴 OD-5 — HOLD. Token **names** are not unified; **values** are the contract.
>
> The v1 table here proposed the iOS scale as canonical. **That proposal is withdrawn.**
> `V3_SPACING_TOKEN_AUDIT.md` established that this is a **semantic naming offset, not a value
> conflict**: both platforms use substantially the same ladder, and Android's reproduces
> `UI_GUIDELINES.md §6` *exactly* (all ten Tailwind steps). Adopting the iOS names would have
> **doubled spacing at ~770 Android call sites** for no user benefit.
>
> **Until OD-5 is decided, specifications state VALUES. Each platform resolves the value through
> the mapping table below. No specification may say "use `md`".**

### 4.1 Canonical value ladder and platform mapping (Option C)

| Value | Tailwind / Web | Android | iOS |
|---:|---|---|---|
| 4 | `1` | `TappySpacing.xs` | `Spacing.xxs` |
| 6 | `1.5` | `TappySpacing.sm` | *(none — use 8)* |
| 8 | `2` | `TappySpacing.md` | `Spacing.xs` |
| 12 | `3` | `TappySpacing.lg` | `Spacing.sm` |
| 16 | `4` | `TappySpacing.xl` | `Spacing.md` |
| 20 | `5` | `TappySpacing.xxl` | *(none — use 24)* |
| 24 | `6` | `TappySpacing.xxxl` | `Spacing.lg` |
| 32 | `8` | `TappySpacing.huge` | `Spacing.xl` |
| 48 | `12` | `TappySpacing.giant` | `Spacing.xxl` |

**This table describes shipping code.** It is a mapping, not a migration — **no call site
changes.**

**Applied rules** (from `UI_GUIDELINES.md §6`, now cross-platform):
- Page gutter: `16px` → `24px` (sm) → `32px` (lg)
- Section rhythm: `24px` → `32px` (md)
- Card padding: `16px` → `20px` (md); gap between cards `12px` → `16px`
- Related controls `8px`; label→control `6px`; icon→text `8px`
- **Chat:** message group gap `16px`; bubble padding `12px 16px`; composer padding `12px`

Never use an arbitrary margin. Pick the nearest step.

---

## 5. Radius

De-facto standard is **16px** on cards and buttons — keep it.

| Token | px | Use |
|---|---|---|
| `sm` | 8 | Chips, tags, small badges, inline code |
| `md` | 12 | **Inputs**, dropdowns, small buttons |
| `lg` | 16 | **Buttons, cards** (standard) |
| `xl` | 24 | Large feature cards, hero panels, **sheet top corners** |
| `pill` | 999 | Avatars, icon buttons, pill nav/chips |

A card and the buttons inside it must not mix 8px and 16px arbitrarily. Message bubbles use `lg`
with one corner tightened to `4px` on the sender side (the existing `rounded-br-md` treatment).

---

## 6. Elevation

Restrained and layered by intent (MUXS §4.7 — depth must be honest).

| Level | Web | Mobile | Use |
|---|---|---|---|
| Flat | `border` only | none | Default surfaces, list rows |
| Low | `shadow-sm` | `Elevation.low` (y2, r6, 8%) | Cards |
| Medium | `shadow-md` | `Elevation.medium` (y6, r14, 12%) | Hover-raised cards, dropdowns |
| High | `shadow-lg` | — | Modals, sheets |
| Peak | `shadow-xl` | — | Rare; top-most overlay only |

Dark mode prefers borders + background elevation over heavy shadows. **Never stack two shadow
levels on one element.**

---

## 7. Motion

Purposeful only (MUXS §5). Motion explains change; it does not decorate.

| Token | Duration | Curve | Use |
|---|---|---|---|
| `instant` | 100ms | ease-out | Press feedback |
| `fast` | 200ms | ease-in-out | Fades, colour transitions |
| `base` | 300ms | ease-out | Slide-up, sheet present |
| `slow` | 400ms+ | ease-in-out | Rare; celebratory only |

Existing `fade-in` (200ms), `slide-up` (300ms), `pulse-dot` (1.4s loop) already conform — keep.

**`prefers-reduced-motion` / Reduce Motion is mandatory on all three platforms.** Under it:
looping and transform animations are disabled; the streaming cursor becomes static; content still
appears, it simply does not move. Opacity-only transitions ≤200ms may remain.

---

## 8. Components

The V3 primitive set. **Behaviour and meaning are shared; implementation is native per platform.**

### 8.1 Foundation

| Component | Notes |
|---|---|
| **Button** | Variants: `primary`, `secondary`, `ghost`, `destructive`. Sizes `sm`(32) / `md`(40) / `lg`(48). Radius `lg`. Min touch target 44×44 regardless of visual size. |
| **IconButton** | Square, radius `pill`. **Always** carries an accessible label. Min 44×44. |
| **Input** | Radius `md`, ≥16px text, visible focus ring, label always present (placeholder is never the label). |
| **Composer** | §8.3 |
| **Card** | Radius `lg`, padding `md`→`lg`, `surface-elevated`, elevation `low`. |
| **Message** | User: right, filled, `max-w-[85%]`/`75%`. Assistant: left, full column, no bubble. |
| **Avatar** | Radius `pill`. Sizes 24/32/40/48. The Tappy avatar carries `idle`/`active`/`searching`/`error` states. |
| **Badge** | Radius `pill`, caption type. Colour **plus** label — never colour alone. |
| **Chip** | Radius `pill`, tappable, min height 32 with 44 touch target. Follow-ups and quick prompts. |
| **Sheet** | Bottom sheet. Top corners `xl`. Drag handle. Dismissible by swipe (mobile) / overlay tap + Esc (web). |
| **Modal** | Web-centred dialog; **mobile prefers Sheet.** Focus-trapped, Esc closes, returns focus on close. |
| **Toast** | Transient, non-blocking, bottom (mobile) / bottom-right (web). Never for errors that need action. |
| **Tooltip** | Desktop pointer only. **Never the sole carrier of information** — it is unreachable on touch. |
| **Skeleton** | Matches final content geometry to prevent layout shift. Respects reduced motion. |
| **EmptyState** | Illustration + one-line explanation + one primary action. |
| **ErrorState** | Plain-language cause + recovery action + preserved user input. |
| **LoadingState** | Typing dots + rotating hint (chat) or skeletons (cards). |

### 8.2 Structured AI primitives (new in V3)

These are the reusable vocabulary for consultative output. Full behavioural specs are in
`V3_UX_SPEC.md §5`.

| Component | Anatomy |
|---|---|
| **EntityCard** *(V3 FOUNDATION)* | The entity-agnostic base shape: image? · title · summary · metadata · price? · badge? · primary action · secondary action?. Variants `place` (V3), `product` / `merchant` (FUTURE, shape reserved only). Exists so a future commerce entity does not force a card rewrite (DD-008 / DD-013). **No commerce surface is built in V3.** |
| **RecommendationCard** | The `place` variant of `EntityCard` as used in a consultative reply: image? · title · summary · metadata row · price? · match badge? · primary action · secondary action? |
| **ComparisonBlock** | 2–4 entities × shared attribute rows; differences emphasised; horizontal scroll on mobile |
| **PlanCard** | title · ordered steps with status · completion · optional per-step action |
| **DecisionBlock** | one leading recommendation + compact alternative rows (generalised from `ShoppingDecision.tsx`) |
| **OfferRow** | seller · condition · price · view action |
| **MatchBadge** | `khop` / `khac` / `chua_ro` → exact / different / unknown |
| **ConfirmationPrompt** | what will happen · what changes · confirm · cancel |
| **FollowUpChips** | ≤3 suggestions, latest message only, post-stream |

**Honesty rule (inherited from `ShoppingDecision.tsx`, non-negotiable):** a missing value renders
as an explicit "unknown" — never as a fabricated, inferred, or omitted number. These components
group nothing and infer nothing the backend did not state.

### 8.3 Composer

Must stay simple (MUXS §2.4). Anatomy: attachment · text field (auto-grow to max, then scroll) ·
voice · send.

| State | Behaviour |
|---|---|
| Empty | Send disabled; placeholder is a hint, not a label |
| Typing | Send enabled; auto-grow |
| Sending | Input retained; send → stop control |
| Streaming | Stop available; input remains editable |
| Error | Input **preserved**; error above composer, never inside it |
| Attachment | Thumbnail above input with a remove control |
| Voice active | Clear listening indicator; tap to stop |

---

## 9. Semantic states

Every interactive component defines all nine. A component missing `focused` or `disabled` is
incomplete.

| State | Requirement |
|---|---|
| `default` | Base token appearance |
| `hover` | Pointer only. `interactive-hover`. Never the sole affordance. |
| `pressed` | `interactive-active` + ≤100ms feedback |
| `focused` | **Visible ring, ≥3:1 against adjacent colours, never `outline: none` without replacement** |
| `disabled` | Reduced emphasis + `aria-disabled`/`isEnabled=false`. **Explain why** where non-obvious. |
| `loading` | Busy indicator + control disabled + accessible busy state |
| `success` | `success` + icon + text |
| `warning` | `warning` + icon + text |
| `error` | `danger` + icon + text + recovery path |

---

## 10. Accessibility rules

Accessibility is a starting condition (MUXS §2.6), enforced per component — not a QA pass.

1. **Touch targets ≥44×44** (iOS HIG / Android 48dp). Visual size may be smaller; the hit area may
   not. iOS already has `minimumTapTarget()`; web and Android need the equivalent.
2. **Contrast**: normal text ≥4.5:1, large text and UI components ≥3:1. `content-muted` is large/
   non-essential only.
3. **Colour is never the only signal.** Pair with icon or text.
4. **Focus** is always visible and follows a logical order. Modals and sheets trap focus and
   restore it on close.
5. **Keyboard (web)**: every action reachable; `Enter` sends, `Shift+Enter` newlines; `Esc` closes
   overlays. No keyboard traps.
6. **Screen readers**: every control has a label; icon-only buttons have accessible names;
   images have alt text or are marked decorative.
7. **Streaming** announces politely (`aria-live="polite"`), never assertively — an assertive live
   region on a token stream is unusable. The existing `role="status" aria-live="polite"` usage is
   correct; extend it.
8. **Dynamic type**: layouts reflow to the largest supported size without clipping or truncating
   essential text.
9. **Reduced motion** is honoured (§7).
10. **Errors** are announced, describe cause in plain language, and offer recovery.

---

## 11. Responsive (web)

| Breakpoint | Width | Layout |
|---|---|---|
| `xs` | 480 | Single column, full-bleed minus gutter |
| `sm` | 640 | Single column, wider gutter |
| `md` | 768 | Two-column grids appear |
| `lg` | 1024 | Side panels available |
| `xl` | 1280 | Max content width reached |
| `2xl`–`4xl` | 1536–2560 | **Centre and cap — never stretch text lines** |

Containers: `compact` 448 · `content` 768 · `wide` 1024 · `feed` 1280 · `full` 1536.

**Chat** uses `content` (768px) centred at every width above it — already correct in
`ChatInterface.tsx`. Do not go full-bleed on desktop; long measure destroys readability.
Mobile is designed first and is never a scaled-down desktop (MUXS §2.3).

---

## 12. Platform conformance

**MUST MATCH** — token *values* (colour, type scale, spacing, radius), component *meaning* and
*states*, accessibility minimums, and the honesty rule (§8.2).

**MAY DIFFER** — implementation language, navigation model, gesture and keyboard handling, sheet
vs modal presentation, motion curves within the duration budget, and platform-idiomatic controls.

A Compose `Button` and a SwiftUI `Button` must not share code. They must share **meaning, colour,
size, radius, states and label**.

---

## 13. Adoption

This document specifies the target. Adoption is staged in `V3_PHASE4_IMPLEMENTATION.md`:

- **Web** — tokens exist; adoption is uneven (14 fluid-type uses vs 960 raw utility uses).
  Migrate *chat and Home surfaces first*, then opportunistically. Do **not** attempt a 101-file
  sweep.
- **Android** — ~~tokens must be created~~ **Corrected (DD-014): `:core:designsystem` already
  exists** with 21 components and 9 theme files, and is consumed by `:app`. The work is
  **adoption** (123 raw colours, 442 raw `.dp` in the app module), chat first — plus the `md`
  re-mapping if DD-009 is approved.
- **iOS** — already conformant. Add only the missing V3 primitives (§8.2).

**Blocking prerequisite:** OD-5 / DD-009 is **HOLD**. No spacing-token migration is approved on
any platform. Until it is decided, use the **value mapping table (§4.1)** — it requires no code
change. See `V3_SPACING_TOKEN_AUDIT.md`.

**No screen is rewritten to adopt a token.** Tokens land as components are touched for V3 reasons.
