# TappyAI V3 — Platform Parity

**Status:** DONE (specification)
**Platforms:** Web (Next.js/React) · Android (Jetpack Compose) · iOS (SwiftUI)

Defines what **must be identical** across platforms and what **may legitimately differ**. The goal
is visual and behavioural consistency — *not* identical native code.

---

## 1. The parity contract

### MUST MATCH — a difference here is a defect

| Dimension | Meaning |
|---|---|
| **Meaning** | The same element means the same thing everywhere |
| **State** | The same states exist and are reachable |
| **Data** | The same information is present — nothing silently dropped |
| **Action** | The same actions are available with the same consequence |
| **Expectation** | A user moving between platforms is never surprised |
| **Tokens** | Colour, type scale, spacing, radius **values** |
| **Accessibility** | Touch targets, contrast, labels, focus, reduced motion |
| **Honesty** | Unknown values shown as unknown, everywhere |

### MAY DIFFER — a difference here is correct

Navigation model · gestures · sheet vs modal · keyboard and inset handling · motion curves (within
the shared duration budget) · platform controls (pickers, switches, date entry) · haptics ·
share/permission dialogs · implementation language and architecture.

> **The test:** if a user would be *surprised* or *lose information* moving between platforms, it
> is a parity defect. If they would merely notice the platform's own conventions, it is correct.

---

## 2. Current parity matrix

Legend: ✅ at parity · ⚠️ present with defects · ❌ absent · 🎯 V3 target

| Feature | Web | Android | iOS | Shared behaviour (MUST MATCH) | Platform-specific (MAY DIFFER) |
|---|---|---|---|---|---|
| **Chat** | ✅ | ✅ | ✅ | Turn order, streaming, stop, persistence, scroll-to-latest | Nav container, scroll physics, keyboard inset |
| **Composer** | ✅ | ✅ | ✅ | Attach/text/voice/send; auto-grow; input preserved on error | Keyboard handling, IME, safe-area, voice UI |
| **Message render** | ✅ | ✅ | ✅ | Markdown subset, image galleries, bubble alignment/width | Text engine, selection, link handling |
| **Marker parsing** | ✅ | ⚠️ | ⚠️ | **Identical decode + identical strip for every marker** | Regex/parser implementation |
| **CTA buttons** | ✅ | ⚠️ | ⚠️ | Same buttons, same labels, same order, post-stream only | Button rendering, external-app launch |
| **Plan** | ✅ | ✅ | ✅ | Same steps, order, status, actions | Card layout, expand/collapse gesture |
| **Shopping decision** | ✅ | ❌ | ❌ | **Same recommendation, prices, verdicts, alternatives** | Card layout, scroll model |
| **Follow-ups** | ✅ | ✅ | ✅ | ≤3, latest message, post-stream, same text | Chip layout, horizontal scroll |
| **Images** | ✅ | ✅ | ✅ | Same images, same order, zoomable | Carousel vs strip, zoom gesture |
| **Message actions** | ✅ | ✅ | ✅ | Copy, share, speak, like/dislike, regenerate | Share sheet, TTS engine |
| **Voice input** | ✅ | ✅ | ✅ | Start/stop, listening state, error copy | `SpeechRecognition` vs platform STT |
| **Attachments** | ✅ | ✅ | ✅ | Image attach, preview, remove | Picker, permissions, camera |
| **Loading** | ✅ | ✅ | ✅ | Typing dots + rotating hint + tool hint | Animation implementation |
| **Error** | ✅ | ✅ | ✅ | Same taxonomy, same recovery, input preserved | Banner vs inline vs snackbar |
| **Empty state** | ✅ | ✅ | ✅ | Greeting + 3 contextual prompts | Illustration, layout |
| **Onboarding** | ✅ | ✅ | ✅ | Same steps, skippable, contextual prefs | Sheet vs page |
| **Comparison** | ❌ | ❌ | ❌ | 🎯 Same entities, attributes, recommendation + reason | Scroll model, column pinning |
| **Confirmation** | ⚠️ | ⚠️ | ⚠️ | 🎯 Same consequence copy, same confirm/cancel semantics | Modal (web) vs Sheet (mobile) |
| **Design tokens** | ⚠️ | ⚠️ | ✅ | 🎯 Identical values — **conflicting today** (D5) | Native token syntax |
| **Primary navigation** | ✅ | ✅ | ✅ | Same 5 tabs, same order | Tab bar vs `NavigationBar` vs `TabView` |
| **Home / entry** | ⚠️ | ⚠️ | ⚠️ | 🎯 AI-first entry (DD-002) | Fast starts are App-only |
| **Notifications** | ⚠️ | ✅ | ✅ | 🎯 Deep-link to the specific object | Push presentation |
| **Offline** | ⚠️ | ⚠️ | ⚠️ | 🎯 Composer disabled, draft preserved | Connectivity API |

---

## 3. Parity defects (ranked)

### D1 — Shopping decision missing on mobile · **P0 · data loss**
Web renders `[TAPPY_SHOPPING]` via `ShoppingDecision.tsx`. Android (`ChatResponse.kt:141-145`)
and iOS (`ContentParser.swift:125`) strip it and render nothing.

*Violates:* **Data** and **Expectation**. A mobile user silently loses the entire decision —
recommendation, price ranges, match verdicts, alternatives.
*Fix:* P4-06 / P4-07 (`DecisionBlock` on both mobile platforms).

### D2 — CTA parsing diverges · **P0 · correctness**
Web parses the bare `[CTA_BUTTONS]{…}` form by brace-matching (`findMarkerJson`). Android and iOS
keep the end-anchored regex web abandoned, so when `[FOLLOWUPS]` trails the CTA block:

- **Android:** buttons lost **and raw JSON rendered as message text** (no unterminated-CTA
  pattern — only a tag strip at `ChatResponse.kt:133`).
- **iOS:** buttons lost, and `stripMarkerResidue`'s `\[CTA_BUTTONS\][\s\S]*$` **deletes all prose
  after the block**.

*Violates:* **Action**, **Data**, and the "technology stays invisible" rule.
*Fix:* P4-03 (unify the parser contract + shared conformance fixtures).

### D3 — Comparison absent everywhere · **P1 · V3 gap**
Not a divergence; a shared gap. Build to spec simultaneously so it never diverges.

### D4 — Confirmation is ad-hoc on all three · **P1 · trust**
No shared primitive; each call site improvises. Consequence copy and cancel semantics differ.
*Violates:* **Meaning** and **Expectation** — and it is the surface where Phase 3's boundaries
become user-facing.

### D5 — Token values conflict; adoption uneven everywhere · **P2** *(corrected in Phase 4A)*
~~iOS has full tokens + components; Android has none.~~ **Withdrawn — factually wrong (DD-014).**

Corrected: **all three platforms have a design system.** iOS `DesignSystem/*`, Android
`:core:designsystem` (21 components, 9 theme files, consumed by `:app`), Web
`tailwind.config.ts` + `globals.css`. The two real defects are:

1. **A token-value conflict.** Android `TappySpacing.md` = **8dp**; iOS `Spacing.md` = **16pt**.
   The same token name carries different values, which makes the "Tokens MUST MATCH" row of §1
   currently **unsatisfiable**. Resolution required before migration — DD-009 / OD-5.
2. **Uneven adoption.** Web: 14 fluid-type uses vs 960 raw utilities. Android: 123 raw colours,
   442 raw `.dp` in the app module.

*Violates:* **Tokens**.

### D6 — Chat decomposition diverges · **P2 · maintainability**
Web `ChatInterface.tsx` 1714 L and Android `ChatScreen.kt` 1124 L are monoliths; iOS is properly
decomposed (`ChatView` 121 · `ChatMessageList` 561 · `ChatInputBar` 240 · `ChatEmptyState` 161).
Not user-visible, but it is the *mechanism* by which D1 and D2 arose and will recur.

---

## 4. The structured-content contract

The root cause of D1 and D2 is that **one protocol has three hand-maintained implementations**.
V3 fixes the process, not just the instances.

### 4.1 Canonical marker registry

One list, one source of truth. iOS already models this correctly
(`ContentParser.swift:125` — *"ONE list, so 'which markers exist' is a single fact rather than a
property spread across four parse functions that each learned about markers at a different time.
That drift is what produced this bug."*). Web and Android must adopt the same shape.

| Marker | Decoded to | Web | Android | iOS |
|---|---|---|---|---|
| `[TAPPY_PLAN]` | `PlanCard` | ✅ | ✅ | ✅ |
| `[CTA_BUTTONS]` | CTA row | ⚠️ | ⚠️ | ⚠️ |
| `[FOLLOWUPS]` | Chips | ✅ | ✅ | ✅ |
| `[TAPPY_SHOPPING]` | `DecisionBlock` | ✅ | ❌ | ❌ |

### 4.2 Mandatory parser rules (all platforms)

1. **Strip is unconditional and independent of decode.** A block that cannot be decoded is still a
   block the user must never read. Web's `parsePlan` documents exactly this; all three must follow.
2. **Four shapes per marker** must be handled: closed · bare · unterminated · orphan tag.
3. **Never end-anchor a bare block.** Another marker may follow it. Use brace matching (web's
   `findMarkerJson`) or an equivalent.
4. **Never use greedy `\{[\s\S]*\}`** — it swallows trailing prose to the last brace in the message.
5. **Strip must not delete unrelated content.** iOS's current `[\s\S]*$` residue pattern violates
   this for CTA and must be narrowed once decode is correct.
6. **Adding a marker server-side requires all three clients updated in the same change**, or the
   marker leaks. This is the lesson `[TAPPY_SHOPPING]` taught twice.

### 4.3 Shared conformance fixtures

A single JSON fixture set of assistant payloads — one file, consumed by all three test suites:

| Fixture | Asserts |
|---|---|
| `cta-closed` | Buttons decoded, no residue |
| `cta-bare-then-followups` | **Buttons decoded, no JSON leak, prose intact** (D2) |
| `cta-unterminated` | No leak, no prose loss |
| `plan-truncated` | No leak; truncation stated |
| `shopping-full` | Decision rendered on **all three** (D1) |
| `all-markers` | Correct order, no residue |
| `orphan-tags` | Nothing visible |
| `unknown-marker` | Unknown block stripped, not rendered |

This turns "keep three parsers in sync by hand" into a test that fails when they drift. It extends
the existing `chatCtaMarkerLeak.test.tsx` and `ContentParserMarkerLeakTests.swift` rather than
replacing them.

---

## 5. Navigation (MAY DIFFER — do not unify)

| | Web | Android | iOS |
|---|---|---|---|
| Model | Routes + `BottomNav` | Compose navigation | `NavigationStack` |
| Back | Browser back | System back / gesture | Swipe-back |
| Modal | Radix dialog | Bottom sheet | `.sheet` |
| Deep link | URL | Intent | Universal link |

Each is idiomatic. **Do not force a shared navigation model** — it would violate MUXS's
platform-respect principle and break user expectation on every platform at once.

---

## 6. Presentation equivalences

| Concept | Web | Android | iOS |
|---|---|---|---|
| Transient message | Toast (bottom-right) | Snackbar | Toast overlay |
| Lightweight choice | Popover / inline | Bottom sheet | `.confirmationDialog` |
| Consequential confirm | Modal | Bottom sheet | `.sheet` / alert |
| Long content | Scroll in column | Scroll | Scroll |
| Secondary detail | Side panel (lg+) | New screen | Push |

**Rule:** mobile prefers **sheets** over modals. Web uses modals only when a sheet has no
equivalent. The *decision* the user makes is identical; only the container differs.

---

## 7. Accessibility parity (MUST MATCH)

| Requirement | Web | Android | iOS |
|---|---|---|---|
| Touch target ≥44×44 | 🎯 audit needed | 🎯 48dp audit needed | ✅ `minimumTapTarget()` |
| Contrast AA | ✅ token layer | 🎯 no tokens yet | ✅ |
| Screen reader labels | ⚠️ partial | 🎯 audit needed | ✅ `Accessibility.swift` |
| Focus visible | 🎯 audit needed | n/a (touch) | n/a |
| Keyboard nav | 🎯 audit needed | n/a | n/a |
| Dynamic type | ⚠️ fluid scale unadopted | 🎯 | ✅ |
| Reduced motion | 🎯 | 🎯 | ✅ |
| Polite streaming announce | ✅ `role="status"` | 🎯 | 🎯 |

iOS is the reference. **Accessibility minimums are MUST MATCH** — a control that is reachable on
iOS and unreachable on Android is a parity defect, not a platform difference.

---

## 8. Verification

For each MUST MATCH row, the same scenario is run on all three platforms and compared:

1. **Data parity** — same information present; nothing silently dropped (catches D1).
2. **Marker conformance** — shared fixtures pass identically (catches D2).
3. **Token parity** — sampled colour/type/spacing/radius values match the design system.
4. **State parity** — every state reachable and correctly presented.
5. **Accessibility parity** — targets, labels, contrast, motion.
6. **Action parity** — same actions, same consequences, same confirmation.

A MUST MATCH failure blocks Phase 4 completion. A MAY DIFFER difference is recorded, not fixed.
