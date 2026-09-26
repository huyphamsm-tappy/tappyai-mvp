# TappyAI V3 — Design Decision Log

**Phase:** 4A — **Revision V2** (post human review) · **Implementation:** NOT STARTED
**Production:** UNCHANGED · **Phase 4B:** BLOCKED

Scope classification: `CURRENT V3` · `V3 FOUNDATION` · `FUTURE` · `OUT OF SCOPE`
Backend impact: **A** UX/UI only · **B** existing API reused · **C** minor contract adaptation ·
**D** backend/business logic change.

---

## Phase 4A Human Review — Revision V2

The owner reviewed the Revision V1 package. Recorded outcomes:

### ✅ HUMAN APPROVED

| # | Decision | Note from review |
|---|---|---|
| **DD-001** | V3 master scope is binding | Commerce / Marketplace / Tappy Business / CS-Cart UI = FUTURE. Do not expand scope. |
| **DD-002** | AI-first Home | **Qualified:** Home must NOT become Chat in disguise. AI-first = primary action + visual hierarchy centre on asking Tappy, while Home stays a broader entry surface. **Do not remove tools to achieve it.** |
| **DD-003** | Keep five tabs | No sixth tab. No removal or merging. Internal improvement only. |
| **DD-004** | Discovery / tool → Chat loop | Preserve entity/result context. Prefer existing APIs. No new backend logic unless documented. |
| **DD-005** | `ComparisonBlock` | ≤4 entities, ≤6 differing attributes, collapse identical rows, explicit reason. Web inline/expandable; App bottom sheet. **No dedicated comparison route.** |
| **DD-006** | `ConfirmationPrompt` | Web modal, App sheet. Boundary stays visible. AI is never the authority. |
| **DD-007** | Structured content contract | Registry + shared fixtures + fail-first + fix divergence + verify all three. **Wire format unchanged in 4A.** Typed channel remains FUTURE / D-class. |
| **DD-008** | Generalise `ShoppingDecision` | Extract → Generalise → Improve. Preserve behaviour and tests. |
| **DD-011** | Device context visible + revocable | Do not repeatedly re-ask when a visible/revocable chip suffices. |
| **DD-012** | Notifications | Presentation/destination only. **No changes to delivery, consent, push identity, or security.** |
| **DD-013** | Commerce = FUTURE | Entity-agnostic primitives only. No CS-Cart terminology in user-facing design. |
| **DD-014** | v1 audit correction stands | Android **does** have a design system. Do not reintroduce the v1 claim. |
| **DD-015** | Navigation/IA approval gate | May be proposed/revised in 4A; must not be implemented before approval. |
| **OD-1** | AI-first Home interpretation | **RESOLVED** — per DD-002. Home ≠ Chat. |
| **OD-2** | Explore identity | **RESOLVED** — keep existing identity. Add the conversational bridge only. **No large IA rewrite.** |
| **OD-3** | Deals | **RESOLVED** — keep top-level. Do not merge with Explore. Not a Marketplace. |
| **OD-7** | V3 scope documents | **APPROVED** — committed to `docs/v3-scope/`. Governance only; authorizes no implementation. |
| **ND-001** | "For You" on Home | **APPROVED** — a **discovery/content preview** surface using existing V3-available data/capabilities. **NOT a personalization system.** Raised by the Final Review; resolved at Design Closure. |

### 🟡 PROVISIONAL

| # | Decision | Status |
|---|---|---|
| **DD-010 / OD-6** | Desktop Web: responsive, no persistent sidebar | **PROVISIONAL — subject to final Web design approval.** Do not implement a sidebar or any desktop navigation change. Sidebar documented as FUTURE / deferred alternative only. |

### 🔴 ON HOLD

| # | Decision | Status |
|---|---|---|
| **OD-4** | Inbox placement | **HOLD — no new top-level navigation.** No new Inbox tab, no new Inbox architecture. Keep current location/behaviour unless a V3 scope document requires otherwise. Alternatives documented; **no final product decision taken.** |
| **OD-5 / DD-009** | Spacing tokens | **HOLD — HUMAN DECISION REQUIRED AFTER TOKEN SEMANTIC AUDIT.** The audit was performed — see `V3_SPACING_TOKEN_AUDIT.md`. The iOS/Web scale is **NOT** approved as canonical. Migration must not be implemented. |

**Note on DD-009.** The v1 recommendation (adopt the iOS scale) is **withdrawn**. The audit found
this is a **naming offset, not a value conflict**, and that Android's ladder is the more faithful
reproduction of `UI_GUIDELINES.md §6`. Revised recommendation: **Option C** (document a
platform mapping, change no code), with a value-preserving rename (Option B) deferred outside
Phase 4, and **Option A explicitly rejected**.

---

## DD-001 · Adopt the V3 master scope as the binding scope boundary

**Problem.** Phase 4 Design v1 was written without the four V3 scope documents (they live in
`~/Downloads/TappyAI-V3.zip`, not in the repository). It described commerce/discovery foundations
as in-scope, and did not reflect that Marketplace, Tappy Business, CS-Cart and the commerce
ecosystem are explicitly **future work**.

**Proposed solution.** Treat `00-MASTER-SCOPE/V3-Master-Scope.md` as binding. Current V3 = AI
Consultative, Cost Optimization, Security, V3 UX/UI Design. Reclassify commerce as FUTURE, keeping
only primitives that prevent future rework as V3 FOUNDATION.

**Alternatives.** (a) Keep v1's broader reading — rejected, contradicts the source. (b) Exclude
commerce primitives entirely — rejected, guarantees a later rewrite of `EntityCard`.

**Why.** The scope document is explicit and the audit rule says *"Do not expand the V3 scope
without an explicit decision."*

**Impact.** Web / Android / iOS: narrows scope. **Backend: none.**
**Scope:** CURRENT V3 (governance) · **Impact class:** A
**Status:** ✅ **HUMAN APPROVED** (Phase 4A Revision V2)

---

## DD-002 · Home leads with the assistant; tools are grouped, not removed

**Problem.** `V3-Design.md` requires an **AI-first entry point**. Today Home is a tool launcher: a
search bar, then ~12 tool tiles, with prompts and recent conversations below the fold
(`HomeView.tsx`). The assistant reads as one feature among many.

**Proposed solution.** Reorder Home to: greeting + **composer** → contextual chips → (App only)
voice/camera/nearby fast starts → Continue → For you → **Tools, grouped, with "see all"**.
No tool removed, no route changed, no tab changed.

> **Approved definition (Revision V2) — binding.**
> *AI-first means the primary action and visual hierarchy of Home are centred around asking Tappy,
> while Home remains a broader entry surface for continuation, personalised content, discovery and
> tools.*
>
> **Home MUST NOT become a Chat screen disguised as Home.** Specifically: Home does not render a
> message thread, does not stream, does not show assistant replies in place, and does not replace
> the Chat tab. Submitting from the Home composer **navigates to Chat**. Tools are **not** removed
> to make Home AI-first.
>
> *"Personalised content" in the definition above is scoped by **ND-001**: it means a
> discovery/content preview built on existing V3-available data and capabilities — **not** a
> personalization system, profiling infrastructure, or ranking engine.*

**Alternatives.**
- (a) Home *becomes* the chat thread — rejected for V3: discards discovery and tool entry, and is a
  larger behavioural change than the mandate requires.
- (b) Leave Home as-is and rely on the Chat tab — rejected: does not satisfy "AI-first entry point".
- (c) Move tools to a sixth tab — rejected: changes the tab model on three platforms.

**Why.** Satisfies the mandate through **emphasis**, preserving the commitment that V3 feels like a
better TappyAI rather than a different app. Fully reversible.

**Impact.** Web: `HomeView.tsx` restructure. Android: `HomeTabHost` equivalent. iOS: home view.
**Backend: none.**
**Scope:** CURRENT V3 · **Impact class:** A
**Open sub-question:** OD-1 (strength of "AI-first").
**Status:** ✅ **HUMAN APPROVED** (Phase 4A Revision V2)

---

## DD-003 · Keep the five-tab model unchanged

**Problem.** An IA change could be read as licence to restructure navigation.

**Proposed solution.** Keep Home · Chat · Explore · Deals · Profile on all three platforms.
Change what *leads* inside a tab, never the tab set, order, or routes.

**Alternatives.** (a) Merge Explore and Deals — rejected, no mandate, breaks behaviour.
(b) Add a Tools tab — rejected, adds a concept to learn. (c) Reduce to 3 tabs — rejected, hides
existing value.

**Why.** All three platforms already share this model (`BottomNav.tsx`, `HomeTab.kt`,
`AppTab.swift`) — rare, hard-won parity. Changing it breaks learned behaviour everywhere at once
for no scope-mandated benefit.

**Impact.** None — this decision is to *not* change. **Backend: none.**
**Scope:** CURRENT V3 · **Impact class:** A
**Status:** ✅ **HUMAN APPROVED** (Phase 4A Revision V2)

---

## DD-004 · Add loop entry points from discovery and tools

**Problem.** Discovery and tools dead-end (IA-5, IA-6). A user who finds something in Explore or
finishes a scan cannot carry it into the assistant.

**Proposed solution.** Add **"Hỏi Tappy về chỗ này"** on Explore and Deals items, and
**"Tiếp tục trong chat"** on tool results. Each carries an **entity/result reference** into the
existing chat route.

**Alternatives.** (a) Do nothing — rejected, leaves the product feeling like separate features.
(b) Embed a mini-assistant in each surface — rejected, duplicates the conversation surface and
multiplies cost. (c) Auto-generate a question — rejected, would fabricate user intent.

**Why.** One small affordance converts every discovery surface into a door to the core loop,
without new screens.

**Impact.** Web / Android / iOS: one affordance per surface.
**Backend:** prefer **B** — reuse `/chat?q=` plus existing context handling. Escalate to **C**
only if a structured context parameter proves necessary. **No D.**
**Scope:** CURRENT V3 · **Impact class:** A→B (possible C)
**Status:** ✅ **HUMAN APPROVED** (Phase 4A Revision V2)

---

## DD-005 · Comparison is in-thread on Web, a bottom sheet on App

**Problem.** Comparison is absent everywhere (D3), and a 4-column table is unreadable in a 360dp
thread.

**Proposed solution.** One `ComparisonBlock` contract — ≤4 entities × ≤6 differing attributes,
identical rows collapsed, recommendation marked **with a mandatory stated reason**. Web renders it
inline and expandable; App renders it in a bottom sheet. Same data, same actions, same reason.

**Alternatives.** (a) Inline on both — rejected, unreadable on mobile. (b) A dedicated comparison
route — rejected, comparison is a moment in a decision, not a destination. (c) Web modal —
rejected, breaks conversational flow.

**Why.** Container is exactly the kind of thing that MAY DIFFER; meaning and data MUST MATCH.

**Impact.** All three platforms: new component.
**Backend:** derive from the existing `SynthesisView` first (**B**); escalate to **C** only if the
attribute set genuinely cannot be derived.
**Scope:** CURRENT V3 · **Impact class:** A→B (possible C)
**Status:** ✅ **HUMAN APPROVED** (Phase 4A Revision V2)

---

## DD-006 · A single shared confirmation primitive

**Problem.** Confirmation is ad-hoc on all three platforms (D4), so the action boundary that
`AI-Consultative.md` and `Security.md` both define is **invisible** to the user.

**Proposed solution.** One `ConfirmationPrompt` contract: what will happen · what changes ·
confirm · cancel. Modal on Web, sheet on App. Cancel always safe and never default-focused for
destructive actions. Abandonment **fails closed**. The result is always reported.

**Alternatives.** (a) Per-action confirmations — rejected, that is today's inconsistency.
(b) Rely on backend validation alone — rejected, the user must *see* the boundary.
(c) Confirm everything — rejected, confirmation fatigue destroys the signal.

**Why.** This is the user-facing expression of *"the AI must not become the authority for
consequential backend actions."*

**Impact.** All three platforms: new primitive; existing call sites migrate incrementally.
**Backend: none** — it confirms actions that already exist.
**Scope:** CURRENT V3 · **Impact class:** A
**Status:** ✅ **HUMAN APPROVED** (Phase 4A Revision V2)

---

## DD-007 · Unify the structured-content contract before building components

**Problem.** One marker protocol has three hand-maintained parsers, which have already diverged.
Android renders raw `{"buttons":…}` JSON to users; iOS deletes prose after a CTA block; both lose
the buttons (D2). The shopping decision reaches only Web (D1).

**Proposed solution.** One canonical marker registry, six mandatory parser rules, and a **shared
fixture set** consumed by all three test suites. Fixtures land and **fail first**, then the parsers
are fixed. Web is already correct and becomes the reference.

**Alternatives.** (a) Fix each platform independently — rejected, that is how the drift arose.
(b) Move structure out of the text stream into a separate channel — **the correct long-term fix**,
but it is a **D**-class backend change and outside Phase 4. Recorded as FUTURE.

**Why.** The same P0 class has recurred at least three times. Without a shared conformance test,
building new components on this contract reproduces the defect.

**Impact.** Android `ChatResponse.kt`, iOS `ContentParser.swift`, three test suites.
**Backend: none** — the wire format is unchanged.
**Scope:** CURRENT V3 · **Impact class:** A
**Status:** ✅ **HUMAN APPROVED** (Phase 4A Revision V2)

---

## DD-008 · Generalise `ShoppingDecision` rather than redesign it

**Problem.** `ShoppingDecision.tsx` is already the correct consultative pattern — it renders the
decision, groups nothing, infers nothing, and shows "chưa rõ" for missing values. But it is
Web-only and its internals (`MatchBadge`, `OfferRow`) are private.

**Proposed solution.** **Extract → generalise → improve.** Promote `MatchBadge` and `OfferRow` to
shared primitives, generalise `RecommendationCard` to an entity-agnostic card (place / product /
merchant variants), and build the mobile equivalents from that contract. Behaviour unchanged; its
existing tests must keep passing.

**Alternatives.** (a) Redesign the decision UI — rejected, it is already right.
(b) Port it verbatim to mobile — rejected, misses the chance to make one shape serve future
entities.

**Why.** Preserves proven work and prevents a rewrite when commerce eventually arrives.

**Impact.** Web: refactor without behaviour change. Android/iOS: new components.
**Backend: none** — the payload already reaches every client.
**Scope:** CURRENT V3 (mobile parity) + V3 FOUNDATION (generalisation) · **Impact class:** A
**Status:** ✅ **HUMAN APPROVED** (Phase 4A Revision V2)

---

## DD-009 · Resolve the spacing-token conflict before any token migration

**Problem.** Android and iOS **already disagree** on the meaning of shared token names:

| Token | Android `TappySpacing` | iOS `Spacing` |
|---|---|---|
| `md` | **8dp** | **16pt** |
| `lg` | 12dp | 24pt |
| `xl` | 16dp | 32pt |

`V3_DESIGN_SYSTEM.md` v1 specified the iOS scale as canonical **without noticing Android's**.

**~~Original v1 proposal (WITHDRAWN — do not act on this).~~** *v1 recommended adopting the
iOS/web scale and re-mapping Android, on the reasoning that it matched `UI_GUIDELINES.md §6`. The
token audit disproved that reasoning: **Android's ladder is the one that matches §6 exactly.**
v1 also rejected "keep both and document the divergence" — which is precisely **Option C**, now
the recommended course.*

**Current proposed solution (post-audit).** **Option C — publish a value↔platform mapping table
and change no code.** Specifications state a **value** (px/dp/pt); each platform resolves it
through the table in `V3_DESIGN_SYSTEM.md §4.1`. No token is renamed, no call site moves.

**Alternatives.**
- **Option A** — one numerical scale everywhere (the v1 proposal): **rejected.** Would double
  spacing at ~770 Android call sites, for no user benefit, and moves Android away from
  `UI_GUIDELINES.md §6`.
- **Option B** — value-preserving rename to unify names: **correct but deferred.** Zero visual
  change by construction, but ~793 call sites and no user benefit; must not run inside a phase
  that is deliberately changing visuals.

**Why.** The audit established this is a **semantic naming offset, not a value conflict** — both
platforms share the ladder 4/8/12/16/24/32/48. A cross-platform design system *can* be specified
and verified through a mapping table; it does not require identical token names.

**Impact.** Under Option C: **none** — documentation only. (Under the withdrawn Option A it would
have been ~793 Android call sites and a full visual re-review.)
**Backend: none.**
**Scope:** CURRENT V3 · **Impact class:** A · **Open:** OD-5
**Status:** 🔴 **HOLD — HUMAN DECISION REQUIRED AFTER TOKEN SEMANTIC AUDIT**

> **Superseded by the audit.** `V3_SPACING_TOKEN_AUDIT.md` found this is a **naming offset, not a
> value conflict**, and that Android's ladder reproduces `UI_GUIDELINES.md §6` exactly (all ten
> steps), while iOS uses a coarser 7-step subset of the same values. Adopting the iOS scale under
> iOS names would **double the spacing at ~770 Android call sites** for no user benefit.
> **The recommendation above is withdrawn.** Revised recommendation: **Option C** — document a
> platform mapping table and change no code. Option B (value-preserving rename) is deferred
> outside Phase 4; **Option A is rejected.**

---

## DD-010 · Web desktop stays responsive; no persistent sidebar in V3

**Problem.** `V3-Design.md` asks for "responsive behavior" without specifying desktop ambition.

**Proposed solution.** Keep the centred 768px column at all widths; move tabs into the header at
`lg+`. **No persistent sidebar in V3.**

**Alternatives.** (a) Persistent left sidebar — deferred to FUTURE; changes the desktop navigation
model without a mandate. (b) Full-bleed desktop chat — rejected, destroys readable measure.

**Why.** Mobile-first is the product's stated reality (MUXS §2.3); the current chat layout already
meets `UI_GUIDELINES.md §14`.

**Impact.** Web only. **Backend: none.**
**Scope:** CURRENT V3 · **Impact class:** A · **Open:** OD-6
**Status:** 🟡 **PROVISIONAL — subject to final Web design approval**
Do not implement a sidebar or any desktop navigation change. The sidebar is recorded as a
**FUTURE / deferred alternative** only.

---

## DD-011 · Device context is visible and revocable (App)

**Problem.** The App's advantage is device context (location, camera, time), but silent context use
is a trust violation and can produce answers the user cannot explain.

**Proposed solution.** Show context as a removable chip above the composer before it is used
(`📍 Quận 1 ✕`). If context changed the answer, the reply says so in one short line.

**Alternatives.** (a) Use context silently — rejected, violates the honesty principle.
(b) Ask every time — rejected, interaction cost with no benefit.

**Why.** Makes the product feel intelligent *and* honest, and lets a user correct a wrong
assumption cheaply instead of re-prompting.

**Impact.** Android + iOS. Web: location chip only where already used.
**Backend: none** — context is already collected.
**Scope:** CURRENT V3 · **Impact class:** A
**Status:** ✅ **HUMAN APPROVED** (Phase 4A Revision V2)

---

## DD-012 · Notifications: change destination and copy, not delivery

**Problem.** `V3-Design.md` lists Notifications in App scope. Delivery, consent and push-identity
binding were hardened separately and are outside Phase 4.

**Proposed solution.** Every notification deep-links to the **specific object** (thread, plan,
item), uses plain language, and never implies an unconfirmed action was taken. **No changes to
delivery, consent, or push identity.**

**Alternatives.** (a) Redesign the notification system — rejected, out of scope and it was hardened
deliberately. (b) Leave entirely — rejected, `V3-Design.md` names it.

**Impact.** Android + iOS presentation. **Backend: none.**
**Scope:** CURRENT V3 · **Impact class:** A
**Status:** ✅ **HUMAN APPROVED** (Phase 4A Revision V2)

---

## DD-013 · Commerce: primitives only, no commerce surfaces

**Problem.** Commerce is a stated V3 *direction* but explicitly **future work** in the master scope.

**Proposed solution.** Build only entity-agnostic primitives (`EntityCard`, `OfferRow`,
`MatchBadge`, `ComparisonBlock`). Build **no** cart, checkout, payment, order management, merchant
onboarding, or catalogue browse. **No CS-Cart structure or terminology reaches the UI.**

**Alternatives.** (a) Build commerce foundations now — rejected, contradicts the master scope.
(b) Build nothing reusable — rejected, guarantees rework.

**Impact.** Component shape only. **Backend: none.**
**Scope:** V3 FOUNDATION (primitives) · FUTURE (commerce) · **Impact class:** A
**Status:** ✅ **HUMAN APPROVED** (Phase 4A Revision V2)

---

## DD-014 · Correct two errors in the Phase 4 v1 audit

**Problem.** The v1 audit made two claims that are **wrong**, both from searching only
`android/app/src/main/java` and missing a Gradle module.

| v1 claim | Corrected finding |
|---|---|
| "Android has **no** design system. Only `themes.xml` and `BrandLogo.kt`." | **False.** `:core:designsystem` exists and is a dependency of `:app` — 21 components (`TappyButton`, `TappyCard`, `TappyBottomSheet`, `TappyEmptyState`, `TappyErrorState`, `TappySkeleton`, `TappyChatBubble`, …) and 9 theme files (`Color`, `Type`, `Spacing`, `Shape`, `Elevation`, `Motion`, `CategoryColor`, `WindowSize`, `Theme`). `TappySpacing` is used in **60** files; all chat files import the design system. |
| "D5 — Android design-system maturity: **none**." | **Corrected:** Android has a **mature DS with partial adoption** — 123 raw `Color(0xFF…)` literals and 442 raw `.dp` literals remain in the app module. This is an **adoption gap, not an absence** — the same shape as Web's. |

**Consequence.** D5 is downgraded from "Android has nothing" to "all three platforms have design
systems with uneven adoption", and **DD-009 (the token conflict) replaces it as the real
cross-platform design-system problem.**

**Why this matters.** The v1 plan proposed *creating* an Android design system. That would have
duplicated an existing module.

**Impact:** planning correction. **Backend: none.**
**Scope:** CURRENT V3 (governance) · **Impact class:** A
**Status:** ✅ **HUMAN APPROVED** (Phase 4A Revision V2)

---

## ND-001 · "For You" is a discovery/content preview, not a new personalization system

**Problem.** The approved DD-002 hierarchy names a "For You" section on Home, but its **content
was never specified**, and the documents disagreed: the IA said "personalised / discovery
preview", while the Web proposal and screen specification said "discovery preview". Those describe
two different products at two different impact classes — a preview of existing content (A/B)
versus a ranking engine keyed to the user (C/D). The Phase 4A Final Review raised this as the one
genuine unresolved product decision (B-1) and deliberately did not decide it.

**Decision (human, at Design Closure).** For current V3, **"For You" is a discovery/content
preview surface built on existing V3-available data and capabilities.** It is **not** a
personalization system.

**Rationale.** It makes Home useful and discoverable — satisfying the AI-first Home intent and
giving Explore/Deals a reason to appear on Home (IA-5) — **without expanding V3 scope.**
Personalization is named in no V3 scope document, and the master scope's audit rule is explicit:
*"Do not expand the V3 scope without an explicit decision."*

**Implementation constraint — binding.** V3 must **NOT** introduce:

- new user profiling infrastructure
- a new recommendation or ranking engine
- behavioural scoring
- a personalization backend
- new AI ranking logic
- any new D-class backend logic

…unless that capability **already exists** and is **explicitly within the V3 master scope**.

**Data source.** Existing V3-available content sources only — **exact source to be validated
during implementation.** No backend source is invented by this design.

**Alternatives considered.** *(b) A personalised feed* — **rejected**: not named in any V3 scope
document, and would make a flagship Home section C- or D-class.

**Impact.** Web: a Home section. Android/iOS: the same section, mobile-native presentation
(horizontal scroll). **Backend: none new.**

**Scope:** CURRENT V3 · **Impact class:** **A/B using existing capability**
**No new personalization/ranking backend is part of Phase 4.**
**Status:** ✅ **APPROVED — HUMAN DECISION**

---

## DD-015 · Navigation and IA may be redesigned, but only implemented after approval

**Problem.** Phase 4 v1 stated "no changes to navigation or information architecture", which would
have blocked work `V3-Design.md` explicitly requires (Navigation, Home/entry experience,
mobile-first navigation).

**Proposed solution.** Replace that rule with: **navigation and IA must not be changed by
implementation before human design approval.** Phase 4A proposes; Phase 4B implements only what is
approved.

**Impact.** Governance. **Backend: none.**
**Scope:** CURRENT V3 · **Impact class:** A
**Status:** ✅ **HUMAN APPROVED** (Phase 4A Revision V2)

---

## Open decisions — status after Revision V2

| # | Decision | Status | Outcome |
|---|---|---|---|
| **OD-1** | Strength of "AI-first Home" | ✅ **RESOLVED** | AI is the primary action and visual hierarchy. **Home ≠ Chat.** Tools are not removed. |
| **OD-2** | Explore identity | ✅ **RESOLVED** | Keep existing identity. Add the conversational bridge only. No large IA rewrite. |
| **OD-3** | Deals as a top-level tab | ✅ **RESOLVED** | Keep top-level. Not merged. Not a Marketplace. |
| **OD-4** | Inbox placement | 🔴 **HOLD** | **No new top-level navigation.** No new Inbox tab or architecture. Keep current placement. Alternatives documented (§OD-4 below); no final product decision taken. |
| **OD-5** | Canonical spacing scale | 🔴 **HOLD — HUMAN DECISION REQUIRED** | Audit complete (`V3_SPACING_TOKEN_AUDIT.md`). Recommends **Option C**. iOS/Web scale is **NOT approved**. |
| **OD-6** | Desktop Web | 🟡 **PROVISIONAL** | Responsive, no sidebar — subject to final Web design approval. |
| **OD-7** | Commit V3 scope docs | ✅ **APPROVED — DONE** | Copied verbatim to `docs/v3-scope/` (5 files, byte-identical). Governance only. |

### OD-4 — Inbox placement alternatives (documented, not decided)

Per the review instruction, alternatives are recorded rather than resolved:

| Option | Description | Cost | Note |
|---|---|---|---|
| **A · Status quo** *(current)* | Unread badge on the Explore tab; inbox lives inside Explore | None | One tab carries two jobs (IA-3), but it works and is learned |
| **B · Profile** | Move inbox under Profile with a header entry | Medium | Changes a learned location; needs migration comms |
| **C · Header entry** | Bell icon in the global header, no tab change | Low | Adds a persistent affordance without a sixth tab |
| **D · New tab** | Dedicated Inbox tab | — | **EXCLUDED by the review** — no new top-level navigation |

**No option is selected.** Phase 4B must not change Inbox placement.

---

## Deferred to FUTURE (recorded, not proposed)

| Item | Why deferred |
|---|---|
| Move structured content out of the text stream into a typed channel | Correct long-term fix for the marker-drift class, but **impact class D** — backend contract change |
| Persistent desktop sidebar | No mandate in V3 scope |
| Explore as genuine discovery (Reviews nested) | Larger IA change, no mandate |
| Commerce surfaces (cart, checkout, orders, merchant onboarding) | Master scope: future work |
| Marketplace · Tappy Business · CS-Cart integration UI | Master scope: explicitly excluded |

---

## Appendix · Phase 4 Design v1 → v2 change log

### Preserved (unchanged and still valid)

- The whole **D1–D6 finding set** — **except D5, corrected below**.
- The **marker-protocol analysis** and the three-parser divergence evidence.
- `V3_DESIGN_SYSTEM.md` — colour, typography, radius, elevation, motion, components, semantic
  states, accessibility rules, responsive scale. **Only §4 spacing gained a conflict warning.**
- `V3_PLATFORM_PARITY.md` — the MUST MATCH / MAY DIFFER contract, the parser rules, and the shared
  conformance fixture set. **Only D5 corrected; five rows added.**
- `V3_UX_SPEC.md` §0 commitments and §2–§12 behaviour specs.
- "Preserve existing good work": `ShoppingDecision.tsx`, message action bars, the loading
  identity, the error taxonomy, the current Web chat layout, the WCAG semantic colour layer, and
  the marker-leak tests.
- The **A→B→C→D** impact discipline and the Phase 0–3 untouchable-file list.

### Changed

| Area | v1 | v2 | Why |
|---|---|---|---|
| **Navigation / IA rule** | "No changes to navigation or IA" | "Not changed **by implementation before approval**" | `V3-Design.md` names Navigation and Home/entry in scope (DD-015) |
| **Android design system** | "None — must be created" | **`:core:designsystem` exists**; work is adoption | Factual error; missed a Gradle module (DD-014) |
| **D5** | "Maturity inverted; Android has none" | "Token **values conflict**; adoption uneven on all three" | Follows from DD-014 |
| **Spacing tokens** | iOS scale stated as canonical | Marked as a **proposal with an unresolved conflict** | Android `md`=8dp vs iOS `md`=16pt (DD-009) |
| **Commerce scope** | "Foundations in scope now" | **FUTURE**; only entity-agnostic primitives are V3 FOUNDATION | Master scope: commerce is future work (DD-001) |
| **J7 Discover** | "V3 foundation" | **CURRENT V3** | Discovery surfaces already exist; V3 adds one affordance (DD-004) |
| **Phase structure** | One Phase 4 | **4A design / 4B implementation** with an approval gate | Required by the Phase 4A brief |

### Added

| Area | What |
|---|---|
| **Product structure** | `V3_PRODUCT_STRUCTURE.md` — four product areas, capability roles, full scope classification, the V3 spine, 7 open decisions |
| **Information architecture** | `V3_INFORMATION_ARCHITECTURE.md` — current-state audit (IA-1…IA-8), proposed hierarchy, old→new mapping, content-type classification, context preservation |
| **Web design** | `V3_WEB_DESIGN_PROPOSAL.md` — shell, AI-first Home, conversation, comparison, confirmation, screen inventory, responsive, accessibility |
| **App design** | `V3_APP_DESIGN_PROPOSAL.md` — why the App ≠ the Web, mobile Home with fast starts, sheets, **context presentation**, **notifications**, platform-native splits |
| **Screen spec** | `V3_SCREEN_SPECIFICATION.md` — S-01…S-12 with purpose, intent, entry, hierarchy, CTAs, AI behaviour, structured UI, 11 states, responsive, accessibility, trust |
| **Decision log** | This document — DD-001…DD-015. *(Statuses were updated in Revision V2: 13 APPROVED, 1 PROVISIONAL, 1 HOLD.)* |
| **Journey mapping** | `V3_UX_SPEC.md` §1.1 — J1–J7 mapped to screens with the full spine per journey |
| **New work packages** | P4-11…P4-16 (Home, loop entry points, context, notifications, offline, primitives) |
| **Deployment rule** | Implementation plan §11 — no partial rollout; one-time deployment after all gates |
| **Scope source** | The four V3 documents identified as the binding authority, with a recommendation to commit them (OD-7) |

### Removed

| Removed | Why |
|---|---|
| "Create an Android design system" | It already exists (DD-014) |
| "No changes to navigation or IA" (absolute form) | Contradicted the V3 design mandate (DD-015) |
| "Commerce/discovery foundations in scope now" | Contradicted the master scope (DD-001) |
| The claim that iOS is the sole design-system reference | Android's DS is comparably mature |

### Not changed, deliberately

The five-tab model · every route · every tool · the Controller/Back Office · Scam Shield ·
the Explore feed's behaviour · notification delivery, consent and push identity · all backend,
API, schema, auth and security logic.
