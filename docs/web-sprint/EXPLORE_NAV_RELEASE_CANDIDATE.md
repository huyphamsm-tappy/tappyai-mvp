# Explore Navigation — Final Audit Report & Release Candidate

**Date:** 2026-07-28 · **RC commit:** `0378fce` (worktree `cool-vaughan-b3c7ff`, branch `main`, **local only**)
**Production:** unchanged at `1184bd5`. Nothing pushed, merged, or deployed.
**Gate status: NOT GREEN — awaiting owner approval.** This document is the stop point.

---

## Part A — Independent Final Audit (adversarial pass)

Conducted against the code as committed, deliberately hunting for defects. Method: fresh grep probes (deep links bypassing `handleSetTab`, `_blank`/modifier clicks, programmatic `router.push` departures, TODOs), line-by-line re-read of the session core and every wiring block, doc-contradiction sweep.

### Findings that were REAL (fixed in `0378fce`)
| # | Severity | Finding | Fix |
|---|---|---|---|
| A1 | Medium | **New-tab clicks stranded the session FROZEN.** Ctrl/Cmd/Shift/middle-click or `_blank` on an internal link froze via the click capture although this tab never left; later real departures idempotently returned the stale snapshot (I7 working as designed against a wrong input). | Guard: skip `defaultPrevented`, non-primary button, modifier keys, `target="_blank"` |
| A2 | Low | **`hydrate()` accepted a v1 envelope without a numeric `frozenAt`.** Staleness became `now − NaN > threshold` (always false): an unbounded-age snapshot would restore, silently bypassing F9. Empty `sessionId` also accepted. | Reject both; regression test added (381/381) |

### Findings that were review NOTES (documented, no code change)
| # | Note | Disposition |
|---|---|---|
| N1 | Unmount-cleanup `leaveExplore('route-change')` as the App-Router conversion for programmatic navigations (SoundSheet `router.push` login/compose paths are real in-repo consumers). Idempotent behind intent signals; reads no UI values. | **Owner to accept or request per-departure instrumentation.** Mobile ports use native lifecycle instead (baseline §6.4) |
| N2 | `searchParams` effect sets `tab` without session signals. Probe A found **no in-repo trigger** that changes tabs this way while mounted (`/reviews/new` push arrives as a fresh mount); latent hazard only. | Documented; revisit if a same-route `?tab=` push is ever added |
| N3 | Render-phase `enterExplore()` is an intentional purity exception (lazy initializers must see adopted state before first fetch); ref-guarded, StrictMode-healed by the frozen→re-enter path. | Documented |
| N4 | `__exploreSession` exposed in production builds (read-copy inspectability, P3). Callable methods reachable from console; no wider surface than any XSS already has. | Accepted per M1 design comment |
| N5 | `restore()` outside RESTORING returns `'none'` without emitting — read as contract §3.9(4) no-op; keeps BT-16 "no restore attempt" clean. | Interpretation recorded (baseline §6.3) |
| N6 | Cross-tab auth change undetected until next mount (F10 scope). | Known limitation (baseline §6.1) |
| N7 | `query` invalidates the feed snapshot though the feed fetch ignores `query` (F3 letter). Spec is frozen; not changed. | Owner decision — candidate v1.1 |

### Re-verified clean (nothing found)
Spec/ADR compliance of contract semantics · state ownership single-writer (grep: page.tsx is the only UI writer) · invariants I1–I12 (audit doc) · business-test traceability · legacy removal (all greps zero code hits) · dead code (tsc + lint; one pre-existing unrelated warning) · memory lifecycle (all listeners removed in cleanups; no timers; bounded retries; one singleton by design) · no TODO/FIXME in touched files · edge probes (no `_blank` in reviews, no in-repo `?tab=` same-route pushes).

**Honest scope limit:** this audit was performed by the same agent that wrote M2–M6. It was run adversarially and found two real defects, but it is not a substitute for a human reviewer; the owner's UAT and review remain the actual independence gate.

## Part B — Repository cleanup performed
- Archived `web-sprint/archive/WEB_EXPLORE_E2E_PLAN.md` (pre-freeze sprint plan; stale environment claims).
- `NAVIGATION_SESSION_ARCHITECTURE.md` header: proposal → subordinate implementation notes (retired name noted).
- `ADR-001` status: Proposed → ACCEPTED + IMPLEMENTED; stale "No code" footer replaced.
- Canonical spec §10 status table + footer brought current (administrative fields only — normative content untouched).
- `Architecture_Blueprint_Index.md`: canonical spec row added.
- Legacy tokens de-literalized from prose comments earlier (`1d7db39`); zero TODO/FIXME in touched files; no doc now claims the legacy mechanism exists.

## Part C — Documentation refresh
- `WEB_SPRINT_BOARD.md` (new): feature status, closed list, remaining list, release status.
- `WEB_REFERENCE_BASELINE_EXPLORE_NAV.md` (new): the official mobile reference (RC-status until owner approval).
- Migration plan checklists updated with evidence (`0ae3cb2`).
- Android `FEATURE_STATUS.md` untouched (Android track PAUSED; not a Web doc).

## Part D — Release Candidate

### Commit list (`db52586..HEAD`, one step per commit, newest last)
```
ffa7e79 docs: Design Freeze — spec, ADR, migration plan, business tests
63dc74c feat: M1 ExploreSession core (UI-agnostic)
2d44f1a feat: M2 atomic Explore switchover
a9ac82c feat: M3 profile paths uniform, tab side-channel removed
8ad62de docs: M4 ClipViewer ownership contract
be41eae refactor: M5 dead-code sweep (L13–L15 evidence)
0178fa1 test: M6 L16 replacement + NAV-004 regression
1d7db39 docs: Phase 3+4 audit reports + transport justifications
c1f9308 fix: E2E finding — tab set after enterExplore
0ae3cb2 docs: Phase 5 E2E evidence + plan checklist
0378fce fix: audit findings — new-tab clicks + hydrate hardening
(+ this docs commit)
```

### Changed files (source, `db52586..HEAD`)
```
src/lib/explore/exploreTypes.ts           +79      (new)
src/lib/explore/ExploreSession.ts         +244     (new)
src/lib/explore/webExploreSession.ts      +67      (new)
src/lib/explore/ExploreSession.test.ts    +302     (new)
src/app/reviews/page.tsx                  +276/−?  (switchover)
src/app/reviews/ProfileTab.tsx            ±19      (L11 removal + M4 contract)
src/app/reviews/SoundSheet.tsx            ±4       (I1 justification comment)
src/app/reviews/[id]/ReviewBackButton.tsx +3       (I1 justification comment)
src/app/reviews/feedBackRestore.test.tsx  −163     (replaced, mapping recorded)
Total: 16 files, +1945/−258 (incl. docs)
```

### Verification gates at RC
`tsc --noEmit` clean · vitest **381/381** · `next build` exit 0 · DoD greps zero · E2E run #1: 15 cells PASS (state-level evidence), blocked cells itemized · local prod server for owner UAT: `http://localhost:3300/reviews`.
**A1 fix runtime-verified on the final build:** synthetic Ctrl-click on an author link → phase stayed `active`, snapshot version unchanged (no stranded freeze); a normal click still freezes with trigger `route-change` and Back restores the exact clip.

### Remaining risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Authenticated flows (My-Profile BT-02/03/05, sign-out BT-20) unverified at runtime | Medium — this is NAV-004's home turf; unit + anon-mechanics evidence exists, not authenticated-browser evidence | **Owner UAT before approval** |
| Untested-at-runtime stress cells (S2 full depth, S3×20, S11–S13, races S4/S5/S10) | Low — unit analogues + structural guards | Next E2E run / UAT |
| Unmount catch-all (N1) reads as an I3 deviation under a strict reading | Low | Owner ruling; alternative implementation offered |
| Query-invalidation UX cost (N7) | Low, product-level | Owner decision, spec v1.1 candidate |
| Restore semantics change vs legacy: push-visits now restore (BT-03, deliberate spec inversion) — users may notice Explore "remembering" more | By design | Called out for UAT attention |

### Rollback plan
| Level | Trigger | Action |
|---|---|---|
| L1 | One step regresses | `git revert <that commit>` — every step is a single commit |
| L2 | Switchover itself unsound | `git revert 0378fce c1f9308 a9ac82c 2d44f1a` → legacy restoration returns wholesale (M1 core may stay, unwired) |
| L3 | Whole migration rejected | Revert `ffa7e79..HEAD` as a contiguous range → tree behaviour returns to `db52586` |
| L4 | Post-deploy regression | **Cannot occur** — nothing deployed; production is at `1184bd5` |

---

## STOP
**Do not merge. Do not push. Do not deploy.** Owner actions requested, in order: (1) rule on N1 and N7, (2) run Owner UAT (server at `localhost:3300`, or request a deploy-preview after approval to push), (3) approve or reject the RC.
**Product UAT: WAITING FOR PRODUCT OWNER.**
