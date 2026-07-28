# Web Sprint Board — Explore Navigation Migration

**Updated:** 2026-07-28 · **Branch:** worktree `cool-vaughan-b3c7ff` / `main` (local only) · **Production:** unchanged at `1184bd5`
**Release status:** RELEASE CANDIDATE PREPARED — gate NOT green. **Do not merge / push / deploy. Waiting for owner approval.** See `EXPLORE_NAV_RELEASE_CANDIDATE.md`.

## Feature status (Web)

| Feature | Status | Evidence |
|---|---|---|
| ExploreSession core (spec §3 contract) | Implemented + unit-proven (I11: plain-Node tests) | `63dc74c`, 381/381 vitest |
| Explore switchover (freeze/restore wiring, legacy removal) | Implemented | `2d44f1a`, DoD greps zero |
| Profile-path uniformity (I9) + tab side-channel removal | Implemented | `a9ac82c` |
| ClipViewer ownership contract (M4/F8) | Codified | `8ad62de` |
| Dead-code sweep (L13–L15) | Done with per-use evidence | `be41eae` |
| Test migration (L16 → session equivalents + NAV-004) | Done | `2d44f1a` + `0178fa1` |
| Runtime E2E | Core matrix PASS (15 cells); auth/data cells BLOCKED | `EXPLORE_NAV_E2E_EVIDENCE.md` |
| **Owner UAT** | **WAITING FOR PRODUCT OWNER** | — |

## Closed this sprint
- Legacy history-gated restoration (L1–L16) — removed/replaced, grep-verified.
- E2E finding: stale session tab on feed-tab return — fixed `c1f9308`.
- Independent-audit findings: new-tab modifier-click stranded FROZEN state; `hydrate()` accepted missing `frozenAt` (NaN staleness) — fixed `0378fce`.

## Remaining (open)
| Item | Owner/blocker |
|---|---|
| NAV-003 / NAV-004 tickets | OPEN — each closes only on its own post-migration re-test evidence (owner-run or owner-authorized authenticated session) |
| Authenticated E2E cells (BT-02/03/05/20), BT-07/08/09 data cells, BT-17, BT-21/S11, full-length S2/S3, S12, screenshots | Owner UAT / next E2E run with displayed Browser pane + owner session |
| Owner UAT + release approval | **Product owner** |
| Spec observation: `query` invalidates feed snapshot though feed rows ignore `query` (F3 letter) | Owner decision — candidate spec v1.1 |
| Audit note N1: unmount cleanup as route-change signal conversion | Owner review (accept or request per-departure instrumentation) |
| Cross-tab auth change not detected until next mount (known limitation) | Backlog |

## Superseded / archived
- `archive/WEB_EXPLORE_E2E_PLAN.md` (pre-freeze sprint plan, environment claims stale)
- `NAVIGATION_SESSION_ARCHITECTURE.md` demoted to subordinate implementation notes (header updated)
