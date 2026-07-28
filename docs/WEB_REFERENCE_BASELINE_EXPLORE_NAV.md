# Web Reference Baseline — Explore Navigation (for Android & iOS)

**Version:** 1.0-RC · **Date:** 2026-07-28 · **Web commit:** `0378fce` (worktree `cool-vaughan-b3c7ff`, unpushed)
**Standing:** this is the official implementation reference for the mobile ExploreSession ports **once the owner approves the Web Release Candidate**. Until then it is RC-status. The normative order of authority: **Canonical Spec > ADR-001 > this baseline > code comments**.

## 1. Document set (read in this order)

| Doc | Role |
|---|---|
| `CANONICAL_EXPLORE_NAVIGATION_SPEC.md` | Source of Truth: contract §3, data model §2, ownership §4, invariants §6 (I1–I12), telemetry §7, platform bindings §8, conformance §9 |
| `web-sprint/ADR-001-explore-session.md` | Decision record, ownership table, invariants I1–I10 with checks, failure scenarios F1–F11, telemetry payloads |
| `web-sprint/EXPLORE_NAV_BUSINESS_TESTS.md` | Product acceptance criteria — 28 scenarios (BT-01…BT-28) + frozen defaults |
| `web-sprint/NAVIGATION_MIGRATION_PLAN.md` | Migration shape (mobile teams: replicate the ATOMIC switchover discipline, not the Web-specific legacy list) |
| `web-sprint/EXPLORE_NAV_MIGRATION_AUDIT.md` · `EXPLORE_NAV_E2E_EVIDENCE.md` | Verification record; the E2E matrix is the same one mobile must pass (§9 conformance) |
| `web-sprint/NAVIGATION_SESSION_ARCHITECTURE.md` | Historic design rationale (subordinate) |

## 2. Reference implementation (Web) — API surface

Platform-neutral core (port these files' SEMANTICS, not their syntax):

- `src/lib/explore/exploreTypes.ts` — `ExploreState.v1`, `Snapshot.v1`, `RestoreResult`, `FreezeTrigger`, `InvalidateReason`, event union, injected `DurableStore`/`EventEmitter`/clock/id-gen deps. `tab?` is an additive optional 1.x field (V2).
- `src/lib/explore/ExploreSession.ts` — the single state owner. Contract: `enterExplore(context?)` · `leaveExplore(trigger) → Snapshot` (idempotent while FROZEN) · `reportActiveItem({reviewId,index,scrollOffset})` (only write path for position; marks user input during RESTORING → F7) · `setQueryShape(shape)` (row-shaping change ⇒ invalidate F3; `tab` is a view switch, never invalidates) · `restore(feedIds) → RestoreResult` (id → index → top, once per RESTORING, every outcome emitted) · `invalidate(reason)` · `snapshot()/hydrate(raw)` (V1–V5; **reject non-numeric `frozenAt`/empty `sessionId`** — audit hardening) · `getState()` (defensive copy) · `dispose()`. No operation throws; no operation reads history/DOM/router.
- `src/lib/explore/webExploreSession.ts` — platform binding pattern: singleton per tab, durable mirror (Web: sessionStorage), telemetry adapter, **`reportAuthState(uid)`** for F10 (identity recorded in the binding, compared on resolve, `invalidate('auth-changed')` on change), inspectability (`__exploreSession`).
- `src/app/reviews/page.tsx` — UI binding reference (see §3).
- `src/lib/explore/ExploreSession.test.ts` — conformance tests. **I11 proof technique: the core test file runs with NO UI framework** (plain Node). Mobile equivalents: plain JUnit (no Robolectric), plain XCTest (no UIKit).

## 3. Final navigation flow (as shipped on Web)

**Arrival (`enterExplore`)** — fired on: page mount (render-phase init so the query shape is adopted BEFORE the first fetch — §3.1, BT-12), feed-tab return (`handleSetTab('home')`; **order: enterExplore FIRST, then record the entered tab** — adoption replaces live state wholesale), pageshow/bfcache return, tab-visible return (re-enter only when FROZEN, then resolve restore immediately against the loaded feed — BT-18).
**Departure (`leaveExplore`)** — fired on: tab-switch (before the tab state changes — I3, no unmount, no history), route-change via link-click capture at the page root (**skip modifier/non-primary/prevented/`_blank` clicks — new-tab clicks must not freeze**, audit finding), background (pagehide + visibilitychange hidden), and an idempotent route-change call at component teardown as the catch-all for programmatic navigations (audit note N1 — Android/iOS have real lifecycle signals (`onPause`/`viewWillDisappear`) and should NOT need this catch-all).
**Restore** — runs when: feed tab visible ∧ feed loaded ∧ session RESTORING ∧ **auth resolved** (F10 must invalidate before any scroll — BT-20). Apply by `resolvedIndex × slideHeight`; `scrollOffset` is a refinement, never the correctness source. F11: container unmeasured → bounded frame-deferred retries → reported top fallback.
**Continuous reporting** — the scroll handler reports `{reviewId,index,scrollOffset}` on every settle; a settled-slide echo also runs after plain loads so leaving clip 0 without scrolling still freezes an id (I5), guarded to never clobber a fresher session index.

## 4. State ownership & invariants
Normative tables live in spec §4/§6 and ADR §1/§2 — not duplicated here (single source). Mobile must satisfy I1–I12 verbatim; I9 (all profile paths identical) and I3 (freeze ≠ teardown side effect) are the two the legacy Web code violated — design reviews should probe those first.

## 5. E2E / conformance
Mobile conformance = the same matrix: business tests BT-01…BT-28, E1–E10, S1–S14 (`NAVIGATION_MIGRATION_PLAN.md` Part 4) with device evidence — **no platform may claim conformance from reasoning alone** (spec §9). Web evidence run #1: `web-sprint/EXPLORE_NAV_E2E_EVIDENCE.md` (15 cells PASS; blocked cells itemized).

## 6. Known limitations (Web 1.0-RC)
1. Cross-tab auth change (sign-out in another browser tab) is not detected until the next Explore mount resolves auth — F10 covers same-tab and reload paths only.
2. Typing a search query invalidates a held feed snapshot (F3 letter) although the feed fetch ignores `query`; a search detour therefore costs the feed position. Candidate spec v1.1 refinement — owner decision pending.
3. `restore()` called outside RESTORING returns `outcome:'none'` without emitting `restore_result` (interpreted as "illegal sequence = no-op", contract §3.9(4)); BT-16's "no restore attempt" relies on this reading.
4. Unmount catch-all freeze (N1) exists because the Web App Router lacks a pre-navigation hook for pushes the page doesn't own; it is idempotent behind the intent signals. Mobile ports should use their native lifecycle instead.
5. Telemetry payload-level capture was verified in code + by `/api/track` traffic, not by payload inspection in the prod-build E2E (dev-build `__exploreSessionEvents` provides it).

## 7. Release state
RC prepared at `0378fce`; **not pushed / merged / deployed**; owner UAT pending. Rollback and risk register: `web-sprint/EXPLORE_NAV_RELEASE_CANDIDATE.md`.
