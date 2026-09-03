# TappyAI V3 — Phase 4A Final Design Review

**Date:** 2026-09-03 · **Branch:** `design/v3-phase4` · **Base:** `0e9a31e`
**Implementation:** NOT STARTED · **Production:** UNCHANGED · **Phase 4B:** BLOCKED

**Verdict: READY FOR HUMAN APPROVAL.**

> **Updated at Design Closure.** The single blocking item (B-1) has been **resolved by human
> decision as ND-001**: "For You" is a **discovery/content preview** using existing V3-available
> data and capabilities — **not a personalization system**. The former non-blocking item **N-1**
> (abbreviated screen specs) has also been closed for S-03…S-06 as a documentation task.
> **No blocking issues remain.**

This is a validation pass, not a design pass. No product was redesigned, no feature added, no
scope expanded. Two editorial contradictions and one missing component definition were corrected;
one genuine unresolved product decision was found, recorded rather than decided, and has since
been resolved by the owner.

---

## 1. Executive summary

The Phase 4A package is **internally consistent and implementation-ready.**

| | Finding | Status |
|---|---|---|
| ~~🔴 Blocking (P4-11)~~ | ~~What populates "For You" on Home is never specified.~~ | ✅ **RESOLVED — ND-001 APPROVED.** Discovery/content preview on existing V3-available sources; **no personalization system, no new D-class backend.** Exact source to be validated during implementation. |
| ~~🟡 Non-blocking (N-1)~~ | ~~S-03…S-12 are abbreviated.~~ | ✅ **CLOSED for S-03…S-06** — expanded to the full field set (documentation only; no redesign, no new functionality). S-07…S-12 remain deliberately brief because their V3 change is one affordance or a restyle. |

Everything else checks out. The approved decisions are correctly and consistently propagated, the
scope boundary holds under an aggressive search, no D-class work is proposed, and the held
decisions (OD-4, OD-5) are honestly represented as held.

**Corrections made during this review** (all editorial, all consistent with already-approved
decisions, per §18 of the brief):

1. **DD-009's body still recommended the withdrawn Option A** and explicitly rejected "keep both
   and document the divergence" — which is precisely **Option C**, the post-audit recommendation.
   A reader going top-down would have read a withdrawn recommendation as current. Rewritten.
2. **`EntityCard` was referenced in 5 documents** (DD-013, P4-16, product structure, UX spec,
   audit) **but defined in none.** Added to `V3_DESIGN_SYSTEM.md §8.2` as the entity-agnostic base
   shape, with `product`/`merchant` variants explicitly marked FUTURE.
3. A stale changelog line describing all decisions as "PROPOSED" was corrected to the Revision V2
   statuses.

---

## 2. Design completeness

| Document | Complete? | Note |
|---|---|---|
| `V3_PRODUCT_STRUCTURE.md` | ✅ | Scope tiers clean; AI Consultative central |
| `V3_INFORMATION_ARCHITECTURE.md` | ✅ | Spine correct; does not force everything into Chat |
| `V3_WEB_DESIGN_PROPOSAL.md` | ✅ | All five surfaces have concrete structure |
| `V3_APP_DESIGN_PROPOSAL.md` | ✅ | Genuinely mobile-native, not a shrunk Web |
| `V3_SCREEN_SPECIFICATION.md` | ⚠️ | S-01/S-02 complete; S-03…S-12 abbreviated |
| `V3_DESIGN_DECISIONS.md` | ✅ | Statuses correct after this review's fix |
| `V3_UX_SPEC.md` | ✅ | Journeys mapped to screens |
| `V3_DESIGN_SYSTEM.md` | ✅ | Complete after `EntityCard` was added |
| `V3_PLATFORM_PARITY.md` | ✅ | MUST MATCH / MAY DIFFER holds |
| `V3_SPACING_TOKEN_AUDIT.md` | ✅ | Answers all eight questions; OD-5 correctly held |
| `V3_PHASE4_UX_AUDIT.md` | ✅ | Corrections carried; D1–D6 preserved |
| `V3_PHASE4_IMPLEMENTATION.md` | ✅ | 4A/4B split; blocked items marked |

---

## 3. Product structure review

| Check | Result |
|---|---|
| Hierarchy clear | ✅ Four areas (Assistant / Discovery / Tools / Account) |
| Current V3 not mixed with future | ✅ Four tiers used consistently |
| AI Consultative central | ✅ Area A is "the primary product experience" |
| Home AI-first | ✅ §6 approved resolution |
| **Home ≠ Chat** | ✅ Stated as a binding limit in §6, and in 5 documents total |
| Commerce FUTURE | ✅ §3, §4 |
| V3 FOUNDATION distinguished | ✅ Separate table with per-item justification |
| Future not presented as current | ✅ Verified — commerce terms appear only as exclusions (§11) |
| No invented product areas | ✅ Four areas are a re-description of what exists |

**No contradictions found.**

---

## 4. Information architecture review

Spine verified end to end:

```
Discover (S-07/S-08) → Ask (S-01→S-02) → Clarify (S-02) → Recommend (S-03)
→ Compare (S-04) → Decide (boundary) → Act (S-05) → Continue (S-02/S-01)
```

| Check | Result |
|---|---|
| Five tabs | ✅ No sixth tab anywhere; Inbox tab explicitly excluded |
| Home ≠ Chat | ✅ Home node annotated "NOT a chat screen"; submit navigates to Chat |
| Explore identity preserved | ✅ "IDENTITY AND BEHAVIOUR UNCHANGED (OD-2)" |
| Deals identity | ✅ Top-level, not merged, not a Marketplace |
| Profile | ✅ Unchanged role |
| Contextual Chat entry | ✅ Seven entry points enumerated |
| Notification behaviour | ✅ Deep-link to specific object; delivery untouched |
| **Does not force everything into Chat** | ✅ §2.1 principle 2 explicit; browsing/tools/settings stay navigational |
| Chat is core without being the whole product | ✅ Chat is one of five tabs; Home is a door, not a room |

**IA-3** (Explore carrying both feed and Inbox) is acknowledged and **deliberately unresolved** —
correctly, since OD-4 is on HOLD. It is recorded so it is not lost, not so it is fixed here.

---

## 5. Web review

**Home** — priority order matches the approved hierarchy exactly: greeting → composer →
contextual chips → Continue → For You → Tools. Explicitly does **not** render a thread, stream, or
show replies in place; submitting navigates to `/chat`. **No tool removed** — all ~12 preserved,
regrouped into three named groups with "see all".
✅ **"For You" is a discovery/content preview on existing V3-available sources (ND-001)** — not a
personalization system. Exact source to be validated during implementation.

**Chat** — conversation, structured responses, recommendations, comparison, confirmation, actions
and follow-ups are all present and coherent. Preserves the existing 768px column, bubble widths,
gallery, sticky composer, loading identity and error taxonomy.

**Explore** — identity preserved; wireframe shows feed mechanics, TikNav and always-dark treatment
unchanged. Exactly one addition: "Hỏi Tappy về chỗ này", carrying an **entity reference**, not a
fabricated question.

**Deals** — top-level retained, existing cards unchanged, one bridge affordance. Carries an
explicit "NOT added" list (cart, checkout, payment, order management, merchant onboarding,
catalogue-browse, CS-Cart terminology).

**Profile** — remains account/settings/context. Absorbs nothing. Notifications stay put (OD-4).

**Desktop without a sidebar** — ✅ coherent. The design is a centred 768px column at every width
with tabs moving into the header at `lg+`. Nothing in the Web proposal depends on a sidebar; the
sidebar is documented as FUTURE/deferred with "must not be built in Phase 4B".

---

## 6. App review

**Genuinely mobile-native, not Web × smaller viewport.** The strongest evidence: §1 argues from
session shape and device context, and the App Home leads with **voice / camera / nearby fast
starts** that do not exist on Web.

| Area | Covered |
|---|---|
| Home | ✅ AI-first, not Chat; fast starts; tools retained |
| Chat | ✅ Full-width cards, scrollable chips, keyboard-inset composer |
| Explore / Deals / Profile | ✅ Via shared IA + bridge affordance |
| Device context | ✅ Removable chip; reply states context that changed the answer (DD-011) |
| Notifications | ✅ Deep-link to specific object; delivery/consent/identity untouched (DD-012) |
| Comparison | ✅ Bottom sheet — with a stated reason (a 4-column table is unreadable at 360dp) |
| Confirmation | ✅ Sheet; swipe-dismiss = cancel, never confirm; fails closed |
| Keyboard / insets | ✅ Both platforms |
| Sheets / gestures / back | ✅ Split into Android and iOS tables |
| Five tabs | ✅ Unchanged |

**Android ≠ iOS pixel-identical** — correctly stated: *"They must be informationally identical."*

---

## 7. Screen specification review

**This is the one document with a real completeness gap.**

| Screen | Purpose | Intent | Entry | Hierarchy | CTA | Secondary | AI | Structured | States | A11y | Trust | Platform |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| S-01 Home | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 6 | ✅ | ✅ | ✅ |
| S-02 Chat | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 11 | ✅ | ✅ | ✅ |
| S-03 Recommendation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 10 | ✅ | ✅ | ✅ |
| S-04 Comparison | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 10 | ✅ | ✅ | ✅ |
| S-05 Confirmation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 10 | ✅ | ✅ | ✅ |
| S-06 Plan | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 10 | ✅ | ✅ | ✅ |
| S-07 Explore | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ 2 | ❌ | ✅ | ❌ |
| S-08 Deals | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| S-09 Tools | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| S-10 Profile | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ 1 | ❌ | ✅ | ❌ |
| S-11 Notifications | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ 3 | ❌ | ✅ | ❌ |
| S-12 Login | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |

**Assessment — non-blocking.** The gaps are **editorial, not decisional**:

- S-07…S-12 are screens whose V3 change is *additive and minimal* (one affordance, or restyle
  only). Their existing behaviour is the specification; the documents say so explicitly.
- The missing fields are derivable from the eight cross-screen invariants in §"Cross-screen
  invariants", which apply to every screen and do cover unknown-data, trust, targets, focus and
  no-layout-shift.
- No missing field hides a product decision.

**✅ Closed at Design Closure.** S-03, S-04, S-05 and S-06 — the screens Phase 4B builds first —
were expanded to the full field set, including all ten states each. This was **documentation
completion only**: no screen was redesigned and no product functionality was added.

S-07…S-12 remain deliberately brief. Their V3 change is a single affordance or a restyle, their
existing behaviour *is* the specification, and the eight cross-screen invariants cover
unknown-data handling, trust, touch targets, focus and layout stability for all of them.

---

## 8. Journey review

| Journey | Entry screen | Next screen | Interaction | Component | Destination | Follow-up | Status |
|---|---|---|---|---|---|---|---|
| **J1** Ask → Answer | S-01 ✅ | S-02 ✅ | composer ✅ | CTA row ✅ | — | FollowUpChips ✅ | ✅ |
| **J2** Ask → Clarify → Recommend | S-01 ✅ | S-02 → S-03 ✅ | chips ✅ | RecommendationCard, MatchBadge, OfferRow ✅ | — | ✅ | ✅ |
| **J3** Compare → Decide | S-03 ✅ | S-04 ✅ | expand / sheet ✅ | ComparisonBlock ✅ | S-05 ✅ | ✅ | ✅ |
| **J4** Plan | S-02 ✅ | S-06 ✅ | — | PlanCard ✅ | per-step action ✅ | ✅ | ✅ |
| **J5** Act | S-03/S-04 ✅ | S-05 ✅ | tap CTA ✅ | ConfirmationPrompt ✅ | Controller ✅ | result + next ✅ | ✅ |
| **J6** Continue | S-02 / S-01 ✅ | S-02 ✅ | chip / Continue ✅ | FollowUpChips ✅ | — | loops ✅ | ✅ |
| **J7** Discover | S-07/S-08 ✅ | S-02 ✅ | "Hỏi Tappy…" ✅ | EntityCard ✅ *(added this review)* | — | loops ✅ | ✅ |

**All seven journeys resolve to real screens and real components.** Every `S-nn` referenced in
`V3_UX_SPEC.md` exists in `V3_SCREEN_SPECIFICATION.md` (verified mechanically: 8 referenced,
12 defined, zero dangling).

**One narrative-only step, now fixed:** J7's entity card had no design-system definition
(`EntityCard` was referenced in five documents and defined in none). Corrected during this review.

---

## 9. Design system review

| Check | Result |
|---|---|
| Component names in screen specs exist in the design system | ✅ All 8 structured components verified present in both; `EntityCard` was the sole gap and has been added |
| Semantic states consistent | ✅ Nine states defined once, applied throughout |
| Accessibility rules consistent | ✅ Ten rules; parity doc marks accessibility MUST MATCH |
| Token language does not contradict itself | ✅ After the §4 rewrite: values are the contract, names are per-platform |
| **Spacing does not claim the conflict is resolved** | ✅ §4 carries "🔴 OD-5 — HOLD", the v1 proposal is marked withdrawn, and §4.1 is labelled a *mapping, not a migration* |
| No implementation requirement disguised as a design decision | ✅ Adoption guidance (§13) is explicitly gated on approval |

**OD-5 was not resolved by this review**, as instructed.

---

## 10. Platform parity review

MUST MATCH (meaning · data · action · state · expectation · tokens · accessibility · honesty) and
MAY DIFFER (navigation · gestures · sheets/modals · keyboard/insets · native controls · motion ·
haptics · system UI) are consistently applied:

- Web says comparison is inline; App says bottom sheet — **container differs, data/actions/reason
  identical.** Consistent with MAY DIFFER.
- Web says confirmation is a modal; App a sheet — same.
- Fast starts are App-only — a *capability* difference, correctly justified by device context, and
  it does not remove information from Web.
- D1 (shopping missing on mobile) and D2 (CTA divergence) remain open **defects**, correctly
  classified as MUST MATCH violations, not platform differences.

**No contradiction found between the Web, App and parity documents.**

⚠️ One parity row is **currently unsatisfiable and honestly marked as such**: "Design tokens —
identical values" is annotated *"conflicting today (D5)"*. That is correct reporting, not an
inconsistency.

---

## 11. Scope review

Aggressive search across all design documents for: Marketplace · Tappy Business · CS-Cart ·
checkout · cart · payment · order management · merchant onboarding · catalogue browse.

**Every occurrence is an explicit exclusion.** Sampled and verified — e.g.
`V3_WEB_DESIGN_PROPOSAL.md:301` *"Explicitly NOT added: cart · checkout · payment · order
management · merchant onboarding · catalogue-browse architecture · any CS-Cart terminology or
layout."*

| Item | Classification | Correctly classified? |
|---|---|---|
| Consultative conversation, recommendation, comparison, confirmation, plan, follow-ups | CURRENT V3 | ✅ |
| AI-first Home, loop entry points, device context, notifications, offline | CURRENT V3 | ✅ |
| D1/D2 parity fixes | CURRENT V3 | ✅ |
| `EntityCard`, `OfferRow`, `MatchBadge`, `ComparisonBlock`, structured contract | V3 FOUNDATION | ✅ |
| Commerce surfaces, Marketplace, Tappy Business, CS-Cart UI | FUTURE | ✅ |
| Typed structured-content channel | FUTURE (D-class) | ✅ |
| Persistent desktop sidebar | FUTURE / deferred | ✅ |
| Explore → discovery rewrite | FUTURE | ✅ |
| Controller / Back Office, Scam Shield redesign | OUT OF SCOPE | ✅ |

**No scope creep found. No unnecessary new navigation. No unnecessary new screens** — S-03…S-06
are components within S-02, not new destinations, and no new route is proposed anywhere.

---

## 12. Backend impact review

| Class | Count | Items |
|---|---|---|
| **A — UX/UI only** | Majority | Home restructure, structured components, confirmation, states, parity fixes (D1/D2), token adoption, i18n fix, decomposition |
| **B — existing API/data** | 2 | Loop entry points (reuse `/chat?q=` + existing context), `ComparisonBlock` (derive from existing `SynthesisView`) |
| **C — minor contract adaptation** | 0 required | Both B items *may* escalate to C; both are documented as "prefer B, escalate only if proven necessary, with sign-off" |
| **D — backend/business logic** | **0 proposed** | Only one D appears anywhere: "Commerce platform (cart/checkout)", marked **OUT OF SCOPE** |

**Verified mechanically:** exactly one D-class row exists across the entire package, and it is an
exclusion. **The A → B → C preference is respected. No D-class work is proposed or implemented.**

---

## 13. Remaining open decisions

| # | Status | Effect on Phase 4B |
|---|---|---|
| **OD-4 — Inbox** | 🔴 HOLD | **Not blocking.** Resolution is "keep current placement", so 4B simply must not touch it. Four alternatives recorded; none marked approved. ✅ correctly represented |
| **OD-5 — Spacing** | 🔴 HOLD | **Not blocking.** Option C needs no code change. 4B may not migrate tokens. ✅ correctly represented; iOS scale is **not** claimed canonical anywhere |
| **OD-6 / DD-010 — Desktop** | 🟡 PROVISIONAL | **Not blocking.** Responsive-only is fully specified and coherent; sidebar marked FUTURE and "must not be built" |
| **ND-001 — "For You" content** | ✅ **APPROVED** | Discovery/content preview on existing V3-available sources; **not a personalization system**. Impact **A/B**. P4-11 unblocked, with a binding no-personalization constraint. |

---

## 14. Blocking issues

**None remain.** B-1 below is retained as a record of how it was found and resolved.

### B-1 · "For You" on Home had no specified data source — ✅ **RESOLVED (ND-001)**

> **Resolution (human decision, Design Closure).** "For You" is a **discovery/content preview
> surface using existing V3-available data and capabilities.** It is **not** a personalization
> system. V3 must not introduce user profiling infrastructure, a recommendation/ranking engine,
> behavioural scoring, a personalization backend, new AI ranking logic, or any new D-class backend
> logic. **Impact class A/B using existing capability.** Exact content source is **to be validated
> during implementation**; if none exists, the section is hidden rather than filled.
> Recorded in full as **ND-001** in `V3_DESIGN_DECISIONS.md`. **P4-11 is no longer blocked.**

**What was found.** The approved DD-002 hierarchy names a "For You" section between Continue and
Tools. Its *content* was never specified, and the documents describing it disagreed:

*(Quotations below are the wording **as it stood at the time of the Final Review**. All four have
since been aligned to ND-001; line numbers have shifted.)*

| Document | Described it as |
|---|---|
| `V3_INFORMATION_ARCHITECTURE.md` | "For You (**personalised** / discovery preview)" |
| `V3_WEB_DESIGN_PROPOSAL.md` (wireframe) | "← DISCOVERY preview" |
| `V3_WEB_DESIGN_PROPOSAL.md` (change table) | Impact **A**, rationale "gives Explore/Deals a reason to exist on Home" |
| `V3_SCREEN_SPECIFICATION.md` | "For you (discovery preview) — Hidden on failure" |

**Why it blocked.** These were two different products with two different impact classes:

- *Discovery preview* — show existing Explore and Deals content. **Class A/B**, no new logic,
  consistent with "commerce is FUTURE". ← **the approved reading**
- *Personalised* — implies ranking or recommendation logic keyed to the user. Potentially
  **class C or D**, and would need a scope decision, since personalisation is not named in any V3
  scope document. ← **rejected**

An engineer starting P4-11 would have had to choose, and that choice was a **product decision**,
not an implementation detail. The Final Review therefore recorded it without deciding it; the
owner resolved it at Design Closure as **ND-001**.

**Outcome.** All documents now describe "For You" as a discovery/content preview on existing
V3-available sources. **P4-11 carries a binding constraint** in
`V3_PHASE4_IMPLEMENTATION.md §8b` forbidding profiling, ranking, scoring, personalization backend,
new AI ranking logic and new behavioural analytics.

---

## 15. Non-blocking issues

| # | Issue | Recommendation |
|---|---|---|
| **N-1** | ✅ **CLOSED.** S-03…S-06 expanded to the full field set at Design Closure (documentation only — no redesign, no new functionality). S-07…S-12 remain deliberately brief: their V3 change is one affordance or a restyle, and the cross-screen invariants cover the rest | None outstanding |
| **N-2** | DD-004's context-passing mechanism is B-or-C, undetermined | Correctly framed as "prefer B, escalate with documentation". Investigation, not a decision. |
| **N-3** | Parity row "tokens — identical values" is unsatisfiable while OD-5 is held | Already honestly annotated. Resolves with OD-5. |
| **N-4** | Spacing audit covered `Spacing` only; radius/elevation/typography not audited for the same naming offset | Audit them **before** Option B is ever attempted. Explicitly disclaimed in the audit. |
| **N-5** | Phase 2 cost work sits 227 commits behind `main`, off the V3 line | Not a Phase 4 issue; flagged for the integration gate. |
| **N-6** | The whole package remains **static analysis** — no app built or run; D2 is reasoned from regex execution order, not reproduced | P4-02 converts this to a failing test first. Already planned. |

---

## 16. Final recommendation

**PHASE 4A READY FOR HUMAN APPROVAL.**

**Readiness answer to §16 of the brief.** If Phase 4B started tomorrow, an engineer would have
enough design information to implement the approved V3 UX **without inventing a major product
decision.** Every surface, journey, component, state and platform behaviour is specified,
explicitly deferred, or explicitly held with a no-change resolution.

The one decision that previously prevented this — Home's "For You" content — is resolved as
**ND-001**, with a binding constraint that Phase 4 builds **no personalization, profiling, ranking
or recommendation backend**.

**Recommended sequencing, unchanged:** begin with **P4-02** (structured-content contract + shared
fixtures, then the Android/iOS parser fixes). It closes a P0 where Android renders raw JSON to
users, touches no file another phase is editing, and needs no backend change.

**This review does not approve Phase 4A.** That decision is the owner's.

---

## 17. No-code verification

```
git status --porcelain --untracked-files=no        → (empty)
git status --porcelain -- src android ios          → (empty)
git status --porcelain -- middleware.ts package.json next.config.mjs   → (empty)
```

`src/` · `android/` · `ios/` · backend · middleware · package configuration · production
configuration — **all unchanged.** Every modification in this branch is under `docs/`.

**Code changes: NONE.**
