# TappyAI V3 — Phase 4 Implementation Plan

**Status:** UPDATED in Phase 4A · Implementation **NOT STARTED** — by design
**Branch:** `design/v3-phase4` · **Base:** `0e9a31e`
**Depends on:** `V3_PHASE4_UX_AUDIT.md` · `V3_DESIGN_SYSTEM.md` · `V3_UX_SPEC.md` ·
`V3_PLATFORM_PARITY.md` · `V3_PRODUCT_STRUCTURE.md` · `V3_INFORMATION_ARCHITECTURE.md` ·
`V3_WEB_DESIGN_PROPOSAL.md` · `V3_APP_DESIGN_PROPOSAL.md` · `V3_SCREEN_SPECIFICATION.md` ·
`V3_DESIGN_DECISIONS.md`

---

## 0. Phase 4A / 4B split and the approval gate

| | Phase 4A | Phase 4B |
|---|---|---|
| **Content** | Audit · product structure · IA · Web & App proposals · screen spec · decision log | Implementation of approved decisions |
| **Status** | **COMPLETE** | **NOT STARTED — blocked** |
| **Output** | Documentation only | Code |
| **Gate** | — | **Human approval of `V3_DESIGN_DECISIONS.md` required** |

**Nothing in §2 onward may begin until the full design package is approved.**

### Status after Phase 4A Revision V2

| Work | Decision status | Note |
|---|---|---|
| Home restructure (P4-11) | ✅ Design approved (DD-002/OD-1) | **Home ≠ Chat**; no tool removed |
| Loop entry points (P4-12) | ✅ Design approved (DD-004) | Prefer existing APIs |
| Comparison (P4-03) | ✅ Design approved (DD-005) | No dedicated route |
| Confirmation (P4-04) | ✅ Design approved (DD-006) | Web modal / App sheet |
| Structured contract (P4-02) | ✅ Design approved (DD-007) | **Wire format unchanged** |
| Shopping decision on mobile (P4-06/07) | ✅ Design approved (DD-008) | Extract → Generalise → Improve |
| Device context (P4-13) | ✅ Design approved (DD-011) | Visible + revocable |
| Notifications (P4-14) | ✅ Design approved (DD-012) | **Presentation/destination only** |
| Primitives (P4-16) | ✅ Design approved (DD-013) | Entity-agnostic only |
| **Any spacing-token migration** | 🔴 **BLOCKED — OD-5 HOLD** | Audit recommends **Option C** (no code change). **iOS scale NOT approved.** |
| **Inbox placement / relocation** | 🔴 **BLOCKED — OD-4 HOLD** | No new top-level navigation |
| **Web desktop shell / sidebar** | 🟡 **PROVISIONAL — OD-6** | Responsive only; **sidebar must not be built** |
| Explore beyond the bridge | ✅ Closed by OD-2 | Identity unchanged; no IA rewrite |

**Design approval of these decisions is still not implementation approval.** Phase 4B begins only
on an explicit instruction.

### 0.1 Corrections to this plan made in Phase 4A

1. **"No changes to navigation or information architecture" is withdrawn** (DD-015). Navigation
   and IA are explicitly in `V3-Design.md` scope. The correct rule: *not changed by implementation
   before approval.*
2. **"Android design tokens must be created" is withdrawn** (DD-014). `:core:designsystem` already
   exists; the work is adoption, not creation.
3. **Commerce scope narrowed** (DD-001/DD-013) to match the V3 master scope: commerce is FUTURE.
4. **Deployment rule added** (§12).

---

## 1. Strategy

**Incremental replacement, never a mass refactor.** Two 1000+ line chat files are the highest-
conflict files in the repository and are being modified right now by uncommitted Phase 1 and
Phase 3 work. A sweeping rewrite would destroy that work or be destroyed by it.

Four sequenced principles:

1. **Correctness before beauty.** D1 (shopping missing on mobile) and D2 (CTA parsing) are
   user-visible defects. They ship first, independent of any visual work.
2. **Contract before components.** Unify the structured-content contract before building
   components on top of it, or the new components inherit the drift.
3. **Tokens land as surfaces are touched.** No screen is rewritten to adopt a token. Zero
   token-only sweeps across the 101 files using raw utilities.
4. **Extract, don't rewrite.** Pull cohesive pieces out of the monoliths behind unchanged
   behaviour, verified by existing tests.

---

## 2. Work packages

### P4-01 · Design foundation
**Goal:** tokens exist and agree on all three platforms.

**🔴 SPACING MIGRATION IS BLOCKED — OD-5 remains HOLD.** The token audit
(`V3_SPACING_TOKEN_AUDIT.md`) recommends **Option C: document a platform mapping table and change
no code.** The v1 recommendation to adopt the iOS scale is **withdrawn** — it would have doubled
spacing at ~770 Android call sites for no user benefit.

| Platform | Work *(revised V2)* |
|---|---|
| Web | Keep `tailwind.config.ts` + `globals.css`. Add missing motion/elevation tokens. **No call-site migration.** |
| Android | **`:core:designsystem` already exists** (DD-014). **No `TappySpacing` re-mapping** — blocked by OD-5. Colour-token adoption in **chat + Home only** may proceed once approved; leave the other raw literals. |
| iOS | Already conformant. Add only missing tokens. |

**Specification rule (from the audit):** every design spec states a **value** (px/dp/pt); each
platform resolves it through the mapping table. **No spec may say "use `md`".**

**Classification: A (UI only).** No backend. **Risk: low.** Additive; nothing existing changes.
**Exit:** the same colour/type/spacing/radius values resolve on all three platforms.

---

### P4-02 · Structured content contract  ← **the keystone**
**Goal:** one marker registry, one set of parser rules, shared conformance fixtures.

1. Author `docs/design/STRUCTURED_CONTENT_CONTRACT.md` — the canonical marker list, the four
   shapes per marker, and the six mandatory parser rules (parity §4.2).
2. Author the shared fixture set (parity §4.3) as one JSON file consumed by all three suites.
3. Wire the fixtures into `chatCtaMarkerLeak.test.tsx`, a new Android `ChatResponseTest`, and
   `ContentParserMarkerLeakTests.swift`. **They must fail first** — that reproduces D2 and turns
   the audit's static reasoning into a runtime proof.
4. Fix the parsers:
   - **Android** — replace `CTA_NOTAG_RE` with brace matching; add the missing unterminated-CTA
     pattern.
   - **iOS** — same brace matching; then narrow `stripMarkerResidue`'s CTA pattern so it stops
     deleting trailing prose.
   - **Web** — no change; it is already correct and becomes the reference.

**Classification: A (UI only)** — client parsers only; the wire format is unchanged.
**Files:** `android/.../chat/ChatResponse.kt` · `ios/.../Model/ContentParser.swift` · the three
test suites · new fixture file.
**Risk: medium** — touches the code path every assistant message flows through. Mitigated by
fixtures landing before fixes.
**Exit:** identical fixture results on all three platforms; D2 closed.

---

### P4-03 · AI response system
**Goal:** the structured primitives of `V3_UX_SPEC.md §5` exist as real components.

Build order: `RecommendationCard` → `DecisionBlock` (generalised from `ShoppingDecision.tsx`) →
`ComparisonBlock` → `PlanCard` (restyle existing) → `CTARow` → `FollowUpChips`.

**Web first** — `ShoppingDecision.tsx` already embeds `MatchBadge` and `OfferRow`; promote them to
`src/components/chat/structured/` with **no behaviour change**, then build `ComparisonBlock` new.

**Classification: A**, except `ComparisonBlock`, which is **C (small contract adjustment)** — the
backend must expose a comparable attribute set. Prefer deriving it from the existing
`SynthesisView` before requesting any new field.
**Risk: low–medium.** `ShoppingDecision.tsx` has tests (`ShoppingDecision.test.tsx`) that must
keep passing unchanged through the move.

---

### P4-04 · Interaction states
**Goal:** loading, streaming, error, empty and confirmation behave to spec.

- Keep the existing loading identity (typing dots, rotating hints, tool hints) — restyle only.
- Add `ConfirmationPrompt` as a shared primitive (closes D4). Modal on web, Sheet on mobile.
- Add skeletons for structured blocks so streaming causes no layout shift.
- Fix the untranslated `Đăng nhập để tiếp tục` at `ChatInterface.tsx:1468` (audit §5.3).

**Classification: A.** **Risk: low.**

---

### P4-05 · Web implementation
**Goal:** adopt primitives in chat; begin decomposing the monolith.

Extract from `ChatInterface.tsx` (1714 L), in this order, each behind unchanged behaviour:
`chat/markers.ts` (the parse functions — already exported and tested) → `chat/Composer.tsx` →
`chat/MessageList.tsx` → `chat/ChatEmptyState.tsx`, following iOS's decomposition.

**Classification: A.** **Risk: HIGH — conflict, not correctness.** `ChatInterface.tsx` is a
high-conflict file. See §5.

---

### P4-06 · Android implementation
**Goal:** close D1 and adopt tokens in chat.

1. **Build `ShoppingDecisionCard.kt`** — the largest user-visible V3 win.
2. Adopt P4-01 tokens across `chat/*.kt`.
3. Extract `ChatComposer.kt` and `ChatMessageList.kt` from `ChatScreen.kt` (1124 L).
4. Restyle `TripPlanCard.kt` and `ChatCtaButtons.kt` to tokens.

**Classification: A** — the `[TAPPY_SHOPPING]` payload already reaches the client; it is being
discarded. **No backend change is required to close D1.**
**Risk: medium.**

---

### P4-07 · iOS implementation
**Goal:** close D1; add missing primitives.

1. **Build `ShoppingDecisionView.swift`.**
2. Add `ComparisonView` and `ConfirmationPrompt`.
3. Extract the plan card out of `ChatMessageList.swift` (561 L) into its own view.

**Classification: A.** **Risk: low** — the cleanest codebase of the three.

---

### P4-08 · Cross-platform parity
Run the parity §8 verification. Every MUST MATCH row is exercised with the same scenario on all
three platforms. **Classification: A.**

---

### P4-09 · Accessibility
Audit and fix against design-system §10: touch targets (web + Android), screen-reader labels
(web + Android), focus visibility and keyboard order (web), dynamic type, reduced motion, polite
streaming announcements on mobile. **Classification: A. Risk: low.**

---

### P4-10 · Visual QA
Typography, spacing, component and responsive consistency across `xs`→`4xl`; light and dark; both
locales. Confirm no layout regressions. **Classification: A.**

---

## 3. Change classification summary

| Design change | Class | Files likely affected | Backend change? | Risk |
|---|---|---|---|---|
| Android/iOS CTA parser fix (D2) | **A** | `ChatResponse.kt`, `ContentParser.swift`, 3 test suites | **No** | Medium |
| Shopping decision on mobile (D1) | **A** | new `ShoppingDecisionCard.kt`, `ShoppingDecisionView.swift` | **No** — payload already sent | Medium |
| Android design tokens | **A** | new `ui/theme/*.kt`, `chat/*.kt` | **No** | Low |
| Web token adoption (chat only) | **A** | `ChatInterface.tsx`, `chat/*` | **No** | Low |
| Structured primitives | **A** | `src/components/chat/structured/*` + mobile equivalents | **No** | Low |
| `ConfirmationPrompt` | **A** | all three | **No** | Low |
| Skeletons / no layout shift | **A** | chat surfaces | **No** | Low |
| i18n fix (login button) | **A** | `ChatInterface.tsx:1468`, locale files | **No** | Low |
| Chat decomposition | **A** | `ChatInterface.tsx`, `ChatScreen.kt` | **No** | **High (conflict)** |
| **ComparisonBlock** | **C** | structured components + a synthesis view field | **Possibly** — derive from `SynthesisView` first | Medium |
| Commerce platform (cart/checkout) | **D** | — | **Yes** | **OUT OF SCOPE** |

**Result: Phase 4 is A-class throughout, with one possible C.** No **D** work is proposed.
Critically, **both P0 parity defects are class A** — the data already reaches the clients and is
being discarded or mis-parsed. Phase 4 requires **no backend change**.

---

## 4. Phase 0–3 boundaries — do not touch

These files are owned by earlier phases and carry security, cost or AI-behaviour invariants.
**Phase 4 must not modify them.**

| Path | Owner | Invariant |
|---|---|---|
| `src/lib/ai/security/fence.ts`, `fenceBoundary.test.ts` | **Phase 3 (uncommitted)** | AI action boundary |
| `src/lib/security/addressPolicy.ts` | **Phase 3 (uncommitted)** | SSRF / address policy |
| `src/lib/ai/streamEnrichment.ts` | **Phase 3 (uncommitted)** | AI output/image guards |
| `src/lib/explore/contentProcessor.ts` | **Phase 3 (uncommitted)** | Output guards |
| `src/lib/ai/consultative/**` | **Phase 1 (uncommitted)** | Consultative core, evidence boundary |
| `src/app/api/chat/route.ts` | **Phase 1 (uncommitted)** | Stream handling, identity |
| `src/lib/ai/moneyGuard.ts`, `specGuard.ts` | Phase 0/1 | Price-hallucination guards |
| `src/lib/ai/promptBuilder.ts` | Phase 0/1 | Marker emission contract |
| Rate limiting, identity, quota | Phase 0/3 | Security fence |

**Rules**
1. Phase 4 changes **render only** — never guards, fences, rate limits, identity or authorization.
2. **No client-controlled authorization.** New UI never sends a flag the server trusts for access.
3. **Output guards are never bypassed** to render something new. If a guard strips content, the UI
   shows less — it does not route around the guard.
4. `promptBuilder.ts` is not edited to make the UI easier. If a marker shape must change, that is a
   **C** change requiring explicit sign-off.
5. **Rendering the shopping decision on mobile does not weaken any boundary** — the payload is
   already delivered to the client and currently discarded.

---

## 5. Git, worktree and conflict strategy

**Current state (as required by §19 of the brief):**

| | |
|---|---|
| Worktree | `.claude/worktrees/v3-phase4-design` (isolated) |
| Branch | `design/v3-phase4` |
| Base commit | `0e9a31e` — `fix(v3): harden production AI and client protocol` |
| Changed files | 5, all new, all under `docs/design/` — **zero product files** |
| Other branches touched | **None** |

**Potential conflicts**

| File | Conflicts with | Mitigation |
|---|---|---|
| `src/components/ChatInterface.tsx` | Phase 1 (uncommitted) | Land P4-05 **after** Phase 1 commits; extract in small steps |
| `src/app/api/chat/route.ts` | Phase 1 (uncommitted) | **Do not touch** |
| `src/lib/ai/security/*`, `streamEnrichment.ts` | Phase 3 (uncommitted) | **Do not touch** |
| `ChatResponse.kt`, `ContentParser.swift` | None currently | Safe — **start here** |

**Sequencing consequence:** P4-01, P4-02, P4-06 and P4-07 touch files no other phase is editing,
so they can start immediately. P4-05 must wait for Phase 1 to commit. This is why the plan front-
loads the mobile parity fixes rather than the web refactor.

**Also unresolved (flagged, not owned by Phase 4):** Phase 2's cost work sits on
`feat/consultative-d1-d2-r1-r2-d3`, 227 commits behind `main` and not on the V3 line. Someone must
decide whether it is rebased onto `0e9a31e` or abandoned. Phase 4 does not depend on it, but the
project does.

---

## 6. Dependencies

```
P4-01 (tokens) ─┬─> P4-03 (primitives) ─┬─> P4-05 (web)      [BLOCKED on Phase 1 commit]
                │                        ├─> P4-06 (android)  [ready now]
P4-02 (contract)┘                        └─> P4-07 (ios)      [ready now]
                                                   │
                                    P4-04 (states) ┤
                                                   ↓
                              P4-08 parity → P4-09 a11y → P4-10 visual QA
```

**P4-02 is the keystone.** Building components on a drifting contract reproduces the defect class
it exists to eliminate.

---

## 7. Testing strategy

| Level | What | Where |
|---|---|---|
| **Contract** | Shared marker fixtures pass identically on all three | `chatCtaMarkerLeak.test.tsx`, new `ChatResponseTest.kt`, `ContentParserMarkerLeakTests.swift` |
| **Component** | Each primitive renders every state; unknown values render as unknown | Per-platform component tests |
| **Regression** | Existing suites pass unchanged — especially `ShoppingDecision.test.tsx` and both marker-leak suites | Existing |
| **Parity** | Same scenario, three platforms, compared per parity §8 | Manual matrix |
| **A11y** | Targets, contrast, labels, focus, dynamic type, reduced motion | axe (web), Accessibility Scanner (Android), Accessibility Inspector (iOS) |
| **Visual** | Typography, spacing, responsive, light/dark, both locales | Manual QA |

**Non-negotiable:** no existing test is weakened or deleted to make a Phase 4 change pass. The
marker-leak tests in particular are the safety net for the entire structured-content contract.

---

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **`ChatInterface.tsx` conflicts with uncommitted Phase 1** | High | Defer P4-05; extract incrementally; coordinate before starting |
| **Parser fix regresses a working path** | High | Fixtures land and fail first; web parser unchanged as reference |
| **Token migration scope-creeps into 101 files** | Medium | Hard rule: chat surfaces only; tokens land as files are touched |
| **`ComparisonBlock` needs a backend field** | Medium | Derive from `SynthesisView` first; only then request a **C** change |
| **Android design system is net-new work** | Medium | Copy iOS's proven token structure; migrate chat only |
| **Phase 2 cost work stranded 227 commits behind** | Medium | Flagged for owner decision; Phase 4 does not depend on it |
| **Redesign drifts into "different app"** | Medium | Every change checked against `V3_UX_SPEC.md §0`; no navigation changes |
| **Static-only audit** — no app was built or run | Medium | P4-02 step 3 converts the D2 reasoning into a failing test before any fix |

---

## 8b. Additional work packages from Phase 4A

These follow from the product-structure, IA and platform proposals. All are **blocked on approval**.

| # | Package | Scope | Impact | Blocked by |
|---|---|---|---|---|
| **P4-11** | **Home — AI-first entry** (Web + App): composer, contextual chips, Continue, **For You**, grouped tools; App fast starts (voice/camera/nearby) | CURRENT V3 | A/B | OD-1 / DD-002 / **ND-001** |
| **P4-12** | **Loop entry points**: "Ask Tappy about this" (Explore, Deals), "Continue in chat" (tool results) | CURRENT V3 | A→B (poss. C) | DD-004 |
| **P4-13** | **Context presentation** (App): removable location/photo context chip; reply states context that changed the answer | CURRENT V3 | A | DD-011 |
| **P4-14** | **Notifications** (App): deep-link to the specific object; plain copy. **No delivery/consent/identity changes** | CURRENT V3 | A | OD-4 / DD-012 |
| **P4-15** | **Offline states** (all platforms): composer disabled with explanation, draft preserved, thread readable | CURRENT V3 | A | — |
| **P4-16** | **Entity-agnostic primitives**: `EntityCard` variants, `OfferRow`, `MatchBadge` promoted to shared | V3 FOUNDATION | A | DD-008 / DD-013 |

**Sequencing note.** P4-12 through P4-16 are additive and low-risk. **P4-11 is the largest
user-visible change in Phase 4** and should land only after the parity defects (D1/D2) are closed,
so that a Home change is never blamed for a pre-existing chat defect.

> ### P4-11 constraint — "For You" (ND-001, binding)
>
> P4-11 implements the approved Home structure **including the For You surface**, using
> **existing V3-available data and capabilities only**. The exact content source is **to be
> validated during implementation** — no backend source is assumed by the design.
>
> **P4-11 must NOT create:** user profiling infrastructure · a recommendation or ranking engine ·
> behavioural scoring · a personalization backend · new AI ranking logic · new behavioural
> analytics · any new **D-class** backend logic.
>
> If no existing source can supply the section, **the section is hidden** — it is never filled
> with placeholder or invented content, and building a source is **not** within Phase 4. Any such
> capability would require separate explicit approval.

---

## 9. What Phase 4 explicitly will NOT do

- No backend or business-logic changes
- No API contract changes (unless `ComparisonBlock` or the loop entry points force one, with sign-off)
- No changes to security fences, rate limiting, identity, or output guards
- ~~No changes to navigation or information architecture~~ → **corrected (DD-015):** no changes to
  navigation or IA **by implementation before human design approval**. Phase 4A proposes; Phase 4B
  implements only what is approved.
- No changes to notification delivery, consent, or push identity (presentation only)
- No commerce platform (cart, checkout, payments, merchant onboarding)
- No Marketplace, Tappy Business, or CS-Cart integration UI
- No Controller / Back Office changes
- No Scam Shield redesign
- No CS-Cart UI patterns — the backend stays, its interface does not surface
- No mass token migration across the ~100 legacy surfaces
- No rewrite of `ChatInterface.tsx` or `ChatScreen.kt`
- No exposure of AI/model/cost terminology to ordinary users

---

## 10. Definition of done

**Functional** — existing flows work; structured output renders; CTAs, plans, shopping UI and
follow-ups work on **all three** platforms; confirmations work.
**Security** — no boundary bypassed; no client-controlled authorization; no output-guard
regression; Phase 0–3 files untouched.
**Cross-platform** — every MUST MATCH row verified; D1 and D2 closed.
**Visual** — consistent typography, spacing and components; responsive `xs`→`4xl`; no regressions.
**Accessibility** — targets, contrast, labels, focus, keyboard, dynamic type, reduced motion.

---

## 11. Deployment rule (binding)

**No partial V3 production rollout at any point during the phases.** Design approval is **not**
deployment approval. Phase 4B implementation approval is **not** deployment approval.

Production remains on the current release until **all** of the following have completed:

Phase 1 · Phase 2 · Phase 3 · Phase 4 · Phase 5 → all branches and worktrees integrated →
stale/divergent work resolved (notably the Phase 2 branch, 227 commits behind `main`) →
full regression → security QA → cost/performance QA → Web QA → Android QA → iOS QA →
cross-platform parity QA → UAT → **final human approval**

Only then: **one-time V3 production deployment.**

---

## 12. Recommended first step

**After design approval**, start with P4-02 on Android and iOS. It:

- closes a **P0 user-visible defect** (Android renders raw JSON to users),
- touches **no file any other phase is editing**, so it can begin immediately,
- requires **no backend change**,
- and establishes the contract every later package depends on.

Concretely: write the shared fixtures, wire them into all three test suites, **watch Android and
iOS fail**, then fix the two parsers. That single change converts this audit's static reasoning
into a regression-proofed guarantee — and it is the smallest possible first commit that makes the
product measurably more correct.
