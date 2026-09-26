# TappyAI V3 — Phase 4 UX/UI Audit

**Status:** DONE (design-first; no product code changed)
**Branch:** `design/v3-phase4`  ·  **Base:** `0e9a31e` (V3 Phase 0 line = `main` + 56 commits)
**Date:** 2026-09-03

This document records what the product **is today**, measured from the code — not what it was
intended to be. Every claim below is anchored to a file and, where useful, a line. It is the
factual basis for `V3_DESIGN_SYSTEM.md`, `V3_UX_SPEC.md`, `V3_PLATFORM_PARITY.md` and
`V3_PHASE4_IMPLEMENTATION.md`.

---

## 0. Repository and phase topology (read this first)

Phase 4 cannot be planned without knowing where Phases 0–3 actually live. They are **not** all on
one branch, and one of them is not committed anywhere.

| Phase | Where it lives | State |
|---|---|---|
| **Phase 0 — hardening** | `fix/phase0-production-hardening` @ `0e9a31e` | **Committed.** `main` + 56 commits. Contains all of `main`. |
| **Phase 1 — AI consultative** | worktree `.worktrees/v3-phase1-ai-consultative`, branch `feat/v3-ai-consultative` | **Uncommitted working-tree changes** on top of `0e9a31e` (`src/app/api/chat/route.ts`, `src/lib/ai/consultative/*`). |
| **Phase 2 — cost optimization** | **Not on the V3 line.** The perf work (`B4`, `B6`, `B7-A/B`, `docs/perf/PHASE_B_*`) sits on the stale branch `feat/consultative-d1-d2-r1-r2-d3` (@ `abd11b6`, 2026-08-19), which is **227 commits behind `main`**. | **Divergent / at risk.** |
| **Phase 3 — security** | worktree `.worktrees/v3-phase3-security`, branch `security/v3-phase3` | **Uncommitted working-tree changes** on top of `0e9a31e` (`src/lib/ai/security/fence.ts`, `streamEnrichment.ts`, `security/addressPolicy.ts`). |

**Consequences for Phase 4:**

1. `0e9a31e` is the only correct base — it is the common ancestor Phases 1 and 3 both branched
   from, and it is the newest commit that contains `main`. Phase 4 is based there.
2. Phases 1 and 3 are **uncommitted**. Phase 4 must not touch `src/lib/ai/consultative/**`,
   `src/lib/ai/security/**`, `src/lib/ai/streamEnrichment.ts`, or `src/app/api/chat/route.ts`,
   or those working trees will conflict on merge. This constraint shapes the whole
   implementation plan (see §15 of the implementation doc).
3. **Phase 2's cost work is stranded on a 227-commit-stale branch.** This is a project risk that
   is not Phase 4's to fix, but Phase 4 must be told about it: any Phase 4 work that assumes the
   B4/B6/B7 streaming behaviour is present on the V3 line is assuming something false today.

---

## 1. What the product is

TappyAI is a conversational assistant whose answer is often **structured**: a plan, a set of
recommended places or products, a row of actions, a set of follow-up questions. The conversation
is the product; the structured content is how the conversation becomes useful.

The three clients (Next.js web, Jetpack Compose Android, SwiftUI iOS) all consume **one streaming
text endpoint** and each independently reconstructs that structure from the text.

---

## 2. The central architectural finding: structure travels as in-band text markers

The server does not send structured data in a structured channel. It embeds it in the assistant's
prose as bracketed markers, and every client must find, decode, and **erase** them before showing
the text.

The markers (canonical list, from `ios/.../ContentParser.swift:125`):

| Marker | Shape | Carries |
|---|---|---|
| `[TAPPY_PLAN]…[/TAPPY_PLAN]` | JSON | Multi-day / evening plan |
| `[CTA_BUTTONS]{…}[/CTA_BUTTONS]` | JSON | Action buttons (maps, call, zalo, booking…) |
| `[FOLLOWUPS]a\|b\|c[/FOLLOWUPS]` | pipe-delimited, single line | Follow-up suggestion chips |
| `[TAPPY_SHOPPING]…[/TAPPY_SHOPPING]` | JSON | Shopping decision / synthesis view |

This design has a documented failure history written into the code itself. From
`src/components/ChatInterface.tsx:82-92`:

> the bare form used to be anchored to end-of-content … which is how the raw block reached users:
> the model emits `[FOLLOWUPS]` after the CTA block … the anchor failed, and nothing was stripped
> — leaving the JSON orphaned in the visible text.

And from `android/.../ChatResponse.kt:110` and `ios/.../ContentParser.swift:9`, independently:

> `[TAPPY_SHOPPING]` shipped web-only and did exactly that (P0-1), the same way `[CTA_BUTTONS]`
> did before it.

**This is the single most important fact in the audit.** The same class of P0 defect — internal
implementation detail rendered as message body — has now occurred at least three times, on
different platforms, because *the contract is a string convention that three codebases must each
re-implement correctly and keep in sync by hand.*

### 2.1 The three parsers have already diverged — and the divergence is live

| | Web (`ChatInterface.tsx`) | Android (`ChatResponse.kt`) | iOS (`ContentParser.swift`) |
|---|---|---|---|
| CTA, closed form `[CTA_BUTTONS]{…}[/CTA_BUTTONS]` | ✅ parsed | ✅ parsed | ✅ parsed |
| CTA, **bare form followed by `[FOLLOWUPS]`** | ✅ **brace-matching** (`findMarkerJson`, line 94) | ❌ **fails** | ❌ **fails** |
| Result of that failure | — | **Buttons lost AND raw `{"buttons":[…]}` JSON rendered as message text** | **Buttons lost; trailing prose destroyed**; no JSON leak |
| Unterminated-CTA safety net | ✅ `\[CTA_BUTTONS\][\s\S]*$` (line 145) | ❌ **absent** — only `\[/?CTA_BUTTONS\]` tag strip (line 133) | ✅ present in `stripMarkerResidue` |

**Why Android and iOS still fail:** both keep the end-anchored regex
`\[CTA_BUTTONS\](\{[\s\S]*\})\s*$` (Android line 129, iOS line 29) that the web **deliberately
abandoned**. Both strip CTA *before* follow-ups (Android step 2 vs step 3, lines 171 & 181), so
when `[FOLLOWUPS]` trails the CTA block the `\s*$` anchor cannot match.

- **Android** then falls to a safety net that removes only the *tags*, not the JSON body — so the
  user reads `{"buttons":[{"label":"📍 Xem trên Maps",…}]}`. This is the exact leak web fixed.
- **iOS** falls to `stripMarkerResidue` pattern `\[CTA_BUTTONS\][\s\S]*$`, which deletes the
  marker **and everything after it to the end of the message**. No JSON leaks, but any prose the
  model wrote after the CTA block is silently destroyed, and the buttons are lost.

Additionally, both mobile regexes use greedy `\{[\s\S]*\}`, which — as the web comment at line 88
warns — "runs greedily to the LAST brace in the message and swallows trailing prose."

The server prompt *does* ask for the closed form (`promptBuilder.ts:304`, `:333`), which is why
this is intermittent rather than constant. But the web code documents that the bare form reached
production users, so the model does not always comply. **These are live defects, not theoretical.**

### 2.2 Shopping decisions do not exist on mobile

`[TAPPY_SHOPPING]` is decoded and rendered only on web, by
`src/components/chat/ShoppingDecision.tsx` (164 lines) reading `SynthesisView`.

Android (`ChatResponse.kt:141-145`) and iOS (`ContentParser.swift:125`) **strip the block and
render nothing**. iOS says so explicitly at line 136: *"which iOS decodes into nothing: the
decision CARD is V3 UX/UI work."*

So on a shopping turn, an Android or iOS user gets the prose and **silently loses the entire
decision** — the recommended configuration, the price ranges, the match verdicts, the alternatives.
This is the largest functional parity gap in the product and the clearest Phase 4 mandate.

Notably, `ShoppingDecision.tsx` is *already* the V3 consultative pattern done right — its own
header says "render the DECISION, not the catalogue", it reads the backend's own recommendation
and "groups NOTHING and infers NOTHING", and it renders missing values as an honest "chưa rõ"
rather than a fabricated number. **Phase 4 should generalise this component, not redesign it.**

---

## 3. Current-state UX inventory

Legend: ✅ implemented · ⚠️ implemented with defects · ❌ absent

| Surface | Web | Android | iOS | Existing component | V3 status |
|---|---|---|---|---|---|
| **Chat shell** | ✅ | ✅ | ✅ | `ChatInterface.tsx` (1714 L, monolith) · `ChatScreen.kt` (1124 L, monolith) · `ChatView.swift` + `ChatMessageList.swift` (decomposed) | **Refactor** — web & Android are monoliths; iOS is the reference decomposition |
| **Composer** | ✅ | ✅ | ✅ | inline in `ChatInterface.tsx` · inline in `ChatScreen.kt` · `ChatInputBar.swift` (240 L) | **Extract** on web/Android |
| **AI response text** | ✅ | ✅ | ✅ | `formatMessage` + `dangerouslySetInnerHTML` (web) | Keep; tighten typography |
| **Marker parsing** | ✅ | ⚠️ | ⚠️ | `parseCTA/parsePlan/parseFollowups` · `ChatResponse.kt` · `ContentParser.swift` | **Unify — highest priority** (§2.1) |
| **Plan** | ✅ | ✅ | ✅ | `TripPlanCard.tsx` · `TripPlanCard.kt` (341 L) · inline in `ChatMessageList.swift` | Restyle to tokens; extract on iOS |
| **Shopping decision** | ✅ | ❌ | ❌ | `ShoppingDecision.tsx` only | **Build on mobile — largest gap** (§2.2) |
| **CTA buttons** | ✅ | ⚠️ | ⚠️ | `ChatCtaButtons.kt` (220 L) | **Fix parsing**, then restyle |
| **Follow-ups** | ✅ | ✅ | ✅ | chips, last message only, post-stream | Keep; promote to a first-class primitive |
| **Images / gallery** | ✅ | ✅ | ✅ | inline HTML strip (web) · `ChatImageCarousel.kt` · iOS | Keep |
| **Message actions** | ✅ | ✅ | ✅ | `MessageActionBar` on all three (324/256/226 L) | Good parity — leave alone |
| **Loading / streaming** | ✅ | ✅ | ✅ | typing dots + rotating `THINK_HINTS` + tool hints; Android mirrors at `ChatScreen.kt:1026` | Keep behaviour; tokenise |
| **Error** | ✅ | ✅ | ✅ | typed branches (auth / anon-limit / generic) · `ChatErrorBanner` (iOS) | Good; one i18n bug (§5.3) |
| **Empty state** | ✅ | ✅ | ✅ | quick prompts (web) · `ChatScreen.kt:167` · `ChatEmptyState.swift` (161 L) | Keep; tokenise |
| **Onboarding** | ✅ | ✅ | ✅ | inline (web) · `OnboardingSheet.swift` | Keep |
| **Comparison** | ❌ | ❌ | ❌ | — | **New in V3** |
| **Confirmation** | ⚠️ | ⚠️ | ⚠️ | ad-hoc per call site; no shared pattern | **New shared primitive in V3** |

---

## 4. Design-system state: three different maturity levels

> ### ⚠️ CORRECTION (Phase 4A) — this section contained a factual error
>
> The original v1 row for Android ("**None.** No token file") was **wrong**. It was produced by
> searching only `android/app/src/main/java` and missing an entire Gradle module.
>
> **Android has a mature design system:** `:core:designsystem` (declared in
> `android/settings.gradle.kts`, consumed at `android/app/build.gradle.kts:365`) with **21
> components** (`TappyButton`, `TappyCard`, `TappyBottomSheet`, `TappyEmptyState`,
> `TappyErrorState`, `TappySkeleton`, `TappyChatBubble`, `TappyNavRail`, …) and **9 theme files**
> (`Color`, `Type`, `Spacing`, `Shape`, `Elevation`, `Motion`, `CategoryColor`, `WindowSize`,
> `Theme`). `TappySpacing` is referenced in **60** app-module files, and **every** chat file
> imports the design system.
>
> The table below is corrected. See DD-014 for the full correction and its consequences.

| | Tokens defined? | Tokens adopted? | Components? |
|---|---|---|---|
| **iOS** | ✅ `DesignSystem/Tokens/{Colors,Metrics,Typography}.swift` — brand + adaptive semantic colours, `Spacing` (4→48), `Radius` (8→pill), `Elevation`, `minimumTapTarget()` = 44pt | Broadly | ✅ `TappyContainers`, `TappyControls`, `TappyStateViews`, `Accessibility`, `Icons`, `Previews` |
| **Android** | ✅ `:core:designsystem/theme/*` — palette derived 1:1 from `UI_GUIDELINES.md`, `TappySpacing`, `Shape`, `Elevation`, `Motion`, `WindowSize` | ⚠️ **Uneven** — 60 files use `TappySpacing`, but 123 raw `Color(0xFF…)` and 442 raw `.dp` literals remain | ✅ 21 components |
| **Web** | ⚠️ **Partial.** `tailwind.config.ts` + `globals.css`: WCAG-AA semantic colour layer, fluid `clamp()` type scale, container max-widths, 8 breakpoints | ⚠️ **Uneven** (§4.1) | ⚠️ 9 primitives in `src/components/ui/` (shadcn), used mostly by the back office |

**Corrected picture:** all three platforms have a design system. The real problem is **uneven
adoption on every platform, plus a token-value conflict between Android and iOS** (DD-009) — not
an absent system on Android.

### 4.1 Web token adoption is real but partial — measured

| Token layer | Usage | Verdict |
|---|---|---|
| `max-w-container-*` | 19 uses / 11 files (incl. `ChatInterface.tsx` ×3) | Adopted on newer surfaces |
| `text-fluid-*` | **14 uses / 5 files** (landing + legal only) | Essentially unadopted |
| Raw `text-gray-*` / `bg-gray-*` / `*-blue-*` | **960 uses / 101 files** | The de-facto system |

The pattern is consistent: **surfaces built recently (landing, legal, reviews, the chat shell) use
tokens; the ~100 older surfaces use raw Tailwind utilities.** The token layer is not wrong — it is
simply unfinished, and its own config comments admit it ("Additive; nothing uses them yet").

### 4.2 Android adoption gap (corrected)

`Color(0xFF……)` literals appear **123 times across 24 files** and raw `.dp` literals **442 times**,
including chat surfaces (`TripPlanCard.kt` ×7, `MessageActionBar.kt` ×2, `HomeScreen.kt` ×20).

**These now have somewhere to go:** `:core:designsystem/theme/Color.kt` and `Spacing.kt` already
define the tokens. Android's task is **adoption**, not creation — the same shape as Web's. The v1
claim that "Android is where the design system has to be *created*" is withdrawn (DD-014).

### 4.3 The real cross-platform token problem: a value conflict

Android and iOS use the **same token names with different values**:

| Token | Android `TappySpacing` | iOS `Spacing` |
|---|---|---|
| `xs` | 4dp | 8pt |
| `sm` | 6dp | 12pt |
| `md` | **8dp** | **16pt** |
| `lg` | 12dp | 24pt |
| `xl` | 16dp | 32pt |

`md` means half as much on Android as on iOS. `V3_DESIGN_SYSTEM.md` v1 specified the iOS scale as
canonical without noticing Android's. **A canonical scale must be chosen before any token
migration** — see DD-009 / OD-5.

---

## 5. Problems, in priority order

### 5.1 P0 — CTA parsing diverges; Android leaks JSON to users
See §2.1. Android renders raw `{"buttons":…}`; iOS destroys trailing prose. Both lose the buttons.
*This is a user-visible correctness defect, not a design preference.*

### 5.2 P0 — Shopping decisions are invisible on Android and iOS
See §2.2. The consultative shopping outcome — the core of the V3 direction — reaches only web users.

### 5.3 P2 — Untranslated string in the web error state
`ChatInterface.tsx:1468` hard-codes `Đăng nhập để tiếp tục` on the login button while the
surrounding copy correctly uses `t('chat.loginPrompt')`. An English session sees Vietnamese.

### 5.4 P1 — Two 1000+ line chat monoliths
`ChatInterface.tsx` (1714 L) and `ChatScreen.kt` (1124 L) each hold parsing, state, streaming,
voice, image handling, and every piece of presentation. They are the highest-conflict files in the
repo and the reason marker logic drifted. iOS already demonstrates the fix.

### 5.5 P1 — No shared vocabulary for structured AI content
There is no `RecommendationCard`, no `ComparisonBlock`, no `ConfirmationPrompt` on any platform.
Each structured block is a bespoke component. V3's consultative direction needs these as
primitives or every new AI capability will cost three bespoke implementations again.

### 5.6 P2 — Design-system adoption is uneven, and one token conflicts *(corrected)*
~~The platform with the best design system (iOS) is generally the smallest surface; Android has
none at all.~~ **Withdrawn — factually wrong (DD-014).**

All three platforms have a design system. The real defects are:
(a) **uneven adoption** on Web (14 fluid-type uses vs 960 raw utilities) and Android (123 raw
colours, 442 raw `.dp`), and
(b) **a token-value conflict** between Android and iOS (§4.3) that makes a single cross-platform
token specification impossible until it is resolved (DD-009).

### 5.7 P2 — `MASTER_UX_UI_SPECIFICATION.md` deliberately has no values
MUXS §4 states values "belong to the design-system specification". That specification **does not
exist** — only `docs/design-system/WCAG_AA_TOKEN_AUDIT.md` (colour only). `docs/UI_GUIDELINES.md`
fills the gap for web responsive/type/spacing/radius but is web-only and marks much of itself as
🎯 target rather than 🟢 current. **Filling this gap is Phase 4's core deliverable.**

---

## 6. What is already good (do not "fix" these)

Phase 4 must not churn work that is already correct:

- **`ShoppingDecision.tsx`** — the right consultative pattern already. Generalise, don't rewrite.
- **Message action bars** — genuine three-platform parity, deliberately built that way.
- **Loading identity** — typing dots + rotating think-hints + tool-specific hints, mirrored on
  Android with explicit web-parity comments. This is good perceived-performance work.
- **Error taxonomy** — auth / anon-limit / generic branches with recovery affordances that
  preserve the user's message (`MUXS §8`).
- **The web chat layout already matches its documented target** — `max-w-container-content`
  (768px) column, `max-w-[85%] md:max-w-[75%]` user bubbles, per `UI_GUIDELINES.md §14`.
- **The WCAG-AA semantic colour layer** — correctly reasoned, with measured contrast ratios and an
  honest note that `content-muted` is below AA for normal text by design.
- **The marker-leak regression tests** — `chatCtaMarkerLeak.test.tsx`,
  `ContentParserMarkerLeakTests.swift`. Extend these; they are the safety net for §5.1.

---

## 7. Opportunities for V3

1. **Make the structured contract explicit and shared.** One versioned schema, one parser per
   platform generated from it, one conformance test suite. Removes an entire class of P0.
2. **Ship the decision card everywhere.** Closing §2.2 is the highest user-visible V3 win.
3. **Create the Android design system** using iOS tokens as the proven reference.
4. **Introduce comparison and confirmation as primitives**, unlocking the consultative flows.
5. **Extract the composer and message list** on web and Android, following iOS's decomposition.
6. **Commerce-ready primitives** — `EntityCard`, `OfferRow`, `MatchBadge` already exist inside
   `ShoppingDecision.tsx`. Promoting them to shared primitives prepares merchant/product
   discovery without building the commerce platform.

---

## 8. Platform differences summary

**Must match (meaning, state, data, action) — currently violated:**
- CTA button availability and message text integrity (§2.1)
- Shopping decision presence (§2.2)

**Legitimately differs (and should stay different):**
- Navigation: web routes + `BottomNav`; Android Compose nav; iOS `NavigationStack`
- Sheets/dialogs: Radix on web, Compose bottom sheets, SwiftUI `.sheet`
- Voice: `SpeechRecognition` (web), platform STT on mobile
- Keyboard/inset handling, gesture affordances, motion curves

---

## 9. Audit method

Static analysis of the `0e9a31e` tree: structural mapping, cross-platform grep of the marker
protocol, side-by-side reading of the three parsers, and quantitative token-adoption counts.

**Not covered — and therefore not claimed:** no app was built or run, so no runtime screenshots,
no device testing, no measured contrast on rendered screens, and no verification that the CTA
defects in §2.1 reproduce on a physical device. The defects are derived from reading the regexes
and their execution order, which is strong evidence but not a runtime reproduction. §2 of the
implementation plan makes reproducing them the first task, precisely so the fix is test-driven.
