# TappyAI — Architecture Blueprint Index

> **Purpose:** the single entry point into every architecture document produced for TappyAI. Read this first to know which document answers which question, then follow the reading order below.
> **Status:** this index itself makes no new technical claims — it organizes and cross-references documents already produced and individually verified against the codebase.

---

## 1. Document List

| Document | Produced | Covers |
|---|---|---|
| [`FINAL_ARCHITECTURE.md`](FINAL_ARCHITECTURE.md) | Pre-Architecture-Week | Whole-system snapshot: chat/AI pipeline, database, API ownership, cron jobs, security boundary, deployment. The foundational reference every other document assumes. |
| [`UI_GUIDELINES.md`](UI_GUIDELINES.md) | Pre-Architecture-Week | Responsive design tokens, container strategy, chat/Explore layout rules — frontend/visual, not backend architecture. Orthogonal to the documents below. |
| [`AI_Personalization_Architecture.md`](AI_Personalization_Architecture.md) | Architecture Week — Phase 1 | Memory Engine, Preference Engine, Context Engine, Recommendation Engine, Learning Engine — what's live, what's dormant, why, and how to wire them. |
| [`Explore_AI_Platform_Architecture.md`](Explore_AI_Platform_Architecture.md) | Architecture Week — Phase 2 | Video upload pipeline, AI metadata, content generator, Smart Info Card, Recommendation Layer for Explore, Ask Tappy, Trip Planner, Search Index. |
| [`Final_Architecture_Review.md`](Final_Architecture_Review.md) | Architecture Week — Phase 3 (+ Final Completion Addendum §18–20) | Cross-cutting review: coupling, duplication, reuse opportunities, AI Metadata Ownership, Android/Dashboard/iOS readiness, prioritized action list. **The Addendum (§18–20) resolves the Recommendation Engine's three-module question and designs the Unified Context API (`GET /api/context`).** |
| [`Authentication_Architecture.md`](Authentication_Architecture.md) | Architecture Week — Part 2 | Login providers (current: Google+Zalo; proposed: +Apple, +Email OTP), Guest Mode boundary, session/token design, roles, Just-in-Time permission strategy. **Contains the TWA (`assetlinks.json`) finding.** |
| [`Localization_Architecture.md`](Localization_Architecture.md) | Architecture Week — Part 3 | UI language vs. AI response language (kept separate), device-locale default, minimal schema proposal, explicit recommendation to *not* translate the UI for MVP. |
| [`Navigation_Architecture.md`](Navigation_Architecture.md) | Architecture Week — Part 4 | Full route tree, Guest-vs-login boundary per screen, deep linking, back stack, the two-bottom-nav pattern (`BottomNav` vs `TikNav`), modal flow, upload flow, chat flow. **Contains the modal/hardware-back-button gap finding.** |
| `Architecture_Blueprint_Index.md` (this document) | Architecture Week — Final | Index, relationships, reading order, Android Readiness checklist. |

---

## 2. Relationships Between Documents

```
FINAL_ARCHITECTURE.md  (whole-system foundation)
      │
      ├── AI_Personalization_Architecture.md  ──┐
      │                                          ├── both synthesized + extended by:
      ├── Explore_AI_Platform_Architecture.md  ──┘         │
      │                                                      ▼
      │                                        Final_Architecture_Review.md
      │                                        (+ Addendum §18–20: resolves
      │                                         Recommendation Engine, designs
      │                                         GET /api/context)
      │
      ├── Authentication_Architecture.md   ─┐
      ├── Localization_Architecture.md      ├── independent cross-cutting concerns,
      └── Navigation_Architecture.md       ─┘   each citing shared facts (e.g. the TWA
                                                  finding appears in both Auth and Navigation)

UI_GUIDELINES.md — orthogonal (visual design system), referenced by Navigation_Architecture.md
                   for the BottomNav/TikNav layout facts, not architecturally dependent on the others.
```

**Key cross-references, so they aren't missed reading any single document in isolation:**
- The **TWA discovery** (`public/.well-known/assetlinks.json` already configured for `com.tappyai.twa`) appears in `Authentication_Architecture.md` §1/§8 and `Navigation_Architecture.md` §3 — it is the single most consequential fact for Android planning found anywhere in this series, and changes the shape of "Android work" in both documents.
- The **three-recommendation-module finding** (`recommendationEngine`, `contextBuilder.buildAIContext`, `explore/recommendation.getRecommendationContext`) is introduced in `Final_Architecture_Review.md` §1/§5/§6 and **resolved** in its own §18 — read both, not just one.
- `GET /api/context` is **proposed** in `AI_Personalization_Architecture.md` §3.5, **referenced** in `Explore_AI_Platform_Architecture.md` §6, and **fully designed** in `Final_Architecture_Review.md` §19 — the last is the authoritative version.

---

## 3. Recommended Reading Order

1. **`FINAL_ARCHITECTURE.md`** — orient on the whole system first. Everything else assumes this context.
2. **`UI_GUIDELINES.md`** — only if the work ahead touches frontend/visual implementation; skip if the focus is backend/Android-contract work.
3. **`AI_Personalization_Architecture.md`** → **`Explore_AI_Platform_Architecture.md`** — read in this order; Explore's document assumes Personalization's Learning/Recommendation Engine concepts.
4. **`Final_Architecture_Review.md`**, in full including the Addendum — this is where the open questions from 3 get resolved and the Unified Context API gets its final design.
5. **`Authentication_Architecture.md`** → **`Navigation_Architecture.md`** → **`Localization_Architecture.md`** — Auth before Navigation (Navigation's Guest/Login boundary table restates Auth's rules per-screen), Localization last (smallest, most self-contained, least dependent on the others).
6. **This index** — return here as the checklist before starting Android implementation work.

---

## 4. Android Readiness Checklist

Every item below is drawn directly from a specific section of a specific document — this checklist does not introduce new findings, it consolidates existing ones into an actionable pre-Android list.

### Must resolve before Android work starts
- [ ] **Confirm TWA vs. native/cross-platform** (`Authentication_Architecture.md` §8) — `assetlinks.json` is already configured for a TWA (`com.tappyai.twa`), but this document cannot confirm from the codebase alone whether that's the actual plan. The auth-integration workload differs meaningfully between the two paths.
- [ ] **Design and ship `GET /api/context`** (`Final_Architecture_Review.md` §19) — the one concrete API-contract gap for any Android path that isn't a pure TWA; even for a TWA, this is the recommended contract for any future client-rendered personalization surface.
- [ ] **Fix the modal / hardware-back-button gap** (`Navigation_Architecture.md` §4) — modals (lightbox, emoji panel, comment sheet, etc.) don't currently participate in browser history; on Android, pressing Back while one is open will navigate the page instead of closing the modal. Flagged as Medium priority, specifically because it's a day-one UX issue on the platform this work is preparing for.

### Should resolve before Android work starts (low cost, meaningful value)
- [ ] **Reconcile the three Recommendation modules** (`Final_Architecture_Review.md` §18) — deprecate `explore/recommendation.getRecommendationContext`, treat `buildAIContext` + `rankCandidates` as the Core pair. Near-zero cost, prevents a fourth variant being built by accident.
- [ ] **Extend the in-app-browser OAuth guard to Apple**, if Apple Sign-In is added (`Authentication_Architecture.md` §2.1/§7) — reuses existing detection logic, doesn't require new code patterns.

### Safe to defer past Android (explicitly, with reasoning already documented)
- [ ] Wiring Learning Engine → Chat prompt (`AI_Personalization_Architecture.md` §3.1) — high value, not Android-blocking.
- [ ] Persisting full `ai_metadata`, Smart Info Card, Ask Tappy context-seeding (`Explore_AI_Platform_Architecture.md` §3.1–3.4) — Explore-quality improvements, not Android data-contract concerns.
- [ ] UI translation (`Localization_Architecture.md` §2.1/§8) — explicitly recommended *not* to build for MVP at all, not merely deferred.
- [ ] `profiles.language` field, per-user timezone (`Localization_Architecture.md` §3/§7) — low priority, no confirmed need yet.
- [ ] Admin dashboard hardening, unbounded-query fix (`Final_Architecture_Review.md` §9/§12) — no Android relevance.

### Already correct — no action needed, listed so they aren't second-guessed during Android planning
- Guest Mode boundary (`Authentication_Architecture.md` §2.2, `Navigation_Architecture.md` §2) — already matches the target design exactly.
- Session management (`Authentication_Architecture.md` §2.3) — fully Supabase-delegated, works unmodified for a TWA.
- Notification/Camera/Gallery permission timing (`Authentication_Architecture.md` §1) — already correctly Just-in-Time.
- AI response language detection (`Localization_Architecture.md` §2.3) — already stateless, correct, needs no schema.
- Deep linking for Explore tabs and Chat seeding (`Navigation_Architecture.md` §3) — already implemented, TWA-compatible for free.

---

## 5. Final Statement

After this index, **no further architecture-scale decision should be required before Android implementation begins**, with the single explicit exception noted above (TWA vs. native), which is a product/infra decision this document set cannot resolve from the codebase alone and must be confirmed by the team before Android week starts. Every other finding across all eight documents is either already resolved, explicitly and deliberately deferred with stated reasoning, or captured as a small, bounded, pre-Android action item.

---

*This document closes Architecture Week. No code changes were made across any document in this series.*
