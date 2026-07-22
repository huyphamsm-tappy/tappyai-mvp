# TappyAI — Parity Governance

> Part of the `docs/ios/` design dossier. How Web, Android, and iOS stay the **same product** over the life of the project. This is the anti-drift constitution.

## 1. Source-of-truth hierarchy

1. **Production Web + Backend** — the single authoritative definition of the product. Every behavior, rule, API, and flow is defined here.
   - Within this tier, **`docs/architecture/AI_PLATFORM.md` is frozen law for everything AI**: all LLM calls go through the backend AI capability layer (`AI.generate`/`AI.stream`/`AI.vision` → provider adapters), enforced in CI by the Architecture Guard. No client (or dossier doc) may name or pin an AI provider/model.
2. **This dossier (`docs/ios/`)** — the derived, human-readable contract. When code and dossier disagree, **code wins** and the dossier is corrected in the same change.
3. **Android** — a platform implementation moving toward parity. **Never** a source of truth. Where Android differs from Web because it is incomplete, follow Web. Android's gaps never define iOS scope.
4. **Old documents / memories** — historical context only. If they contradict current code, they are stale; follow code.

Rule: **iOS matches the final product specification (Web + Backend), not any temporary implementation gap on Android.**

## 2. Development workflow (per feature)

Follow the owner's proven cycle (same as Android):

```
Spec the feature from Web + Backend (docs 02/03/04/05/06)
   → Build the full native UI (no partial screens)
   → Runtime-verify against the LIVE backend (real API, real data)
   → Polish immediately, in the same cycle (no deferred polish phase)
   → Cross-check parity vs Web behavior
   → Close → next feature
```

No feature is "in progress" across many cycles; each is built whole, verified, polished, and closed.

## 3. Feature lifecycle (cross-platform)

A feature is only "shipped" when it exists and behaves identically on all target platforms that are live.

```
PROPOSED  → defined only on Web + Backend (source of truth updated)
BUILDING  → implemented on a platform (Web first, then Android/iOS)
PARITY    → present + behaviorally identical on all live platforms
LOCKED    → covered by the parity checklist; changes require the change-workflow below
```

New product behavior **must land on Web + Backend first** (or at least be defined there), then propagate. A platform must never introduce product behavior the others don't have.

## 4. Change / new-feature workflow

Any change that alters product behavior, a business rule, an API, or the data model:

1. Land it on **Backend + Web** first (or define the contract there).
2. Update the affected dossier docs (**02, 03, 04, 05, 06** as relevant) **in the same PR**.
3. File parity tasks for **Android** and **iOS**.
4. Do not consider the change "done" until all live platforms reach PARITY or the tasks are explicitly scheduled.

## 5. Bug-fix workflow

- **Backend/shared bug** → fix once server-side; all clients inherit. Update docs if the contract changed.
- **Behavior bug present on Web** → fix Web (source of truth) → propagate the fix to Android + iOS via parity tasks. Record the fix so other platforms don't re-introduce it (e.g. the feed-player and counter-trigger bug classes — see 05, 06).
- **Platform-only bug** (e.g. AVPlayer glitch) → fix on that platform; verify the shared behavior contract (06) still holds.
- Every non-trivial fix that encodes a rule gets a one-line note in the relevant doc so the other platforms replicate it.

## 6. Documentation update workflow

- Docs are **versioned with code** in the same repo (`docs/ios/`).
- The doc set is **normative**: a PR that changes behavior/rules/API/schema **must** update the matching doc or it fails review.
- `05_DATABASE_CONTRACT.md` and `04_API_CONTRACT.md` are the highest-sensitivity docs — schema/endpoint changes require updating them plus a parity task.
- ADRs are append-only: decisions are superseded by new ADRs, never edited away.

## 7. Release checklist (per platform release)

- [ ] Feature set matches `02_FEATURE_INVENTORY.md` (no missing, no extra).
- [ ] Business rules match `03_BUSINESS_RULES.md` (quotas, gating, moderation, AI safety) — verified server-authoritative.
- [ ] API usage matches `04_API_CONTRACT.md`; no client duplicates server logic (`14`).
- [ ] Data access respects RLS boundary in `05_DATABASE_CONTRACT.md`.
- [ ] UX behavior matches `06_UI_UX_SPEC.md` (states, overlays, theme, nav).
- [ ] Entitlements verified server-side (`09 §6`); iOS uses StoreKit, not Stripe.
- [ ] Permissions/privacy strings present (camera/mic/photos/location/notifications).
- [ ] Known-copy reconciliations applied ("7 games", Pro OFF) — see `11`. (15/day copy: ✅ RESOLVED 2026-07-11 — `/subscription` copy + remaining counter updated to 15/day on web.)
- [ ] Cross-platform QA (§8) passed.
- [ ] Risk register (`16`) has no open blockers.

## 8. Cross-platform QA workflow

For every parity-locked feature, QA runs the **same scenario script** on Web, Android, iOS and compares:

- Same inputs → same outputs (AI answers, rankings, prices "tham khảo").
- Same gating (anon/free/Pro limits, login walls) → same failure responses.
- Same permissions prompts and same fallbacks when denied.
- Same navigation destinations and deep links.
- Same subscription entitlement effects.

Divergence = a bug against the source of truth (Web). File and fix.

## 9. Definition of Done (a feature on iOS)

A feature is DONE only when **all** hold:

1. **Feature parity** — present and complete vs Web (`02`).
2. **Business-rule parity** — every limit/gate/quota/moderation/safety rule enforced identically and server-authoritatively (`03`).
3. **Workflow parity** — the user flow matches Web step-for-step (`01 §4`, `06`).
4. **API parity** — uses the documented endpoints/contracts; no re-implemented server logic (`04`, `14`).
5. **Permission parity** — same permissions, same gating, same fallbacks.
6. **Subscription parity** — entitlement effects identical; StoreKit path via the abstraction layer (`09`).
7. **AI-behavior parity** — same backend AI contract/behavior: prompts, scope-lock, safety, and structured-output rendering (provider/model are backend-owned and abstracted; clients never pin a model) (`03 §AI Safety`, `04 §chat`, `docs/architecture/AI_PLATFORM.md`).
8. **Native feel** — built with idiomatic SwiftUI/HIG components (see Native Design Principle in `09` + `06`), **without** changing product behavior.
9. **Verified on device** and covered by the QA script (§8).
10. **Docs updated** if anything about the contract changed.

> Parity is about **behavior, rules, and contracts** — not pixels. iOS should look and feel like an iPhone app while behaving exactly like the Web product.
