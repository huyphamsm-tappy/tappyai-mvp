# Explore Navigation — Pre-UAT Verification

**Date:** 2026-07-28 · **RC:** `8da316e` · RC review ACCEPTED by owner · gate still NOT green (Owner UAT pending)

---

## 1. Final disposition of audit notes N1–N7

| # | Description | Why it exists | Risk | Recommendation | **Classification** |
|---|---|---|---|---|---|
| **N1** | `leaveExplore('route-change')` in the page's unmount cleanup, behind the explicit intent signals | Next App Router exposes no pre-navigation hook for pushes the page doesn't own (real in-repo consumers: SoundSheet's `router.push` to login / compose). Without it those departures silently lose state — the legacy defect class | **Low** — idempotent (I7), reads no UI values, unit- and runtime-verified; strict-I3 reading is the only objection | Keep. Per-departure instrumentation would add N call sites to protect against the same set of paths with more surface for omission. Mobile ports use native lifecycle and skip this entirely (baseline §6.4) | **ACCEPTED** |
| **N2** | `searchParams` effect sets `tab` without session signals | `?tab=` is the URL transport echo; the effect keeps UI in sync when the URL changes underneath | **Low** — probe found zero in-repo triggers while mounted (`/reviews/new` push arrives as a fresh mount); latent only | Keep as transport echo; add a session signal only if a same-route `?tab=` push is ever introduced (watch condition recorded on the sprint board) | **ACCEPTED** |
| **N3** | `enterExplore()` called during render (ref-guarded), not in an effect | Lazy initializers (tab/feedType/query) must see the adopted snapshot BEFORE the first fetch (spec §3.1, BT-12) — an effect runs too late | **Low** — ref-guarded single call; StrictMode's simulated remount healed by the frozen→re-enter path (runtime-verified) | Keep; the alternative (state juggling after first render) re-introduces the fetch-before-shape race the spec §3.1 forbids | **ACCEPTED** |
| **N4** | `__exploreSession` exposed on `window` in production builds | Spec P3: state must be inspectable "at any moment for diagnosis"; production incidents were the original motivation for observability | **Low** — read-copies for state; methods callable only by code already running in-page (no wider surface than any XSS) | Keep. Dev-only `__exploreSessionEvents` remains dev-only | **ACCEPTED** |
| **N5** | `restore()` outside RESTORING returns `outcome:'none'` without emitting `restore_result` | Contract §3.9(4): illegal sequences are no-ops; emitting on every no-op call would flood telemetry and break BT-16's "no restore attempt" | **Low** — interpretation, not a defect; recorded in baseline §6.3 | Keep; mobile ports must copy this exact reading for event-count parity (BT-13 pass criterion) | **ACCEPTED** |
| **N6** | Cross-tab auth change (sign-out in another browser tab) not detected until the next Explore mount resolves auth | F10 binding compares identity at mount-resolve; no `onAuthStateChange` subscription exists in the binding | **Low-Medium** — worst case: a frozen snapshot from the old identity restores against the anon feed until the next full mount; fallback chain (F1/F2) prevents blank/broken UI | Backlog item: subscribe the web binding to Supabase `onAuthStateChange` → `reportAuthState`. Not a v1.0 blocker; needs its own test pass | **DEFERRED** (backlog, post-v1.0) |
| **N7** | Typing a search query invalidates a held feed snapshot (F3 letter) though the feed fetch ignores `query` — a search detour costs the feed position | Spec §2.1 puts `query` in the query shape; §3.4/F3 invalidates on any row-shaping change. The spec is frozen; the implementation follows it exactly | **Low** — UX cost only; no BT scenario violated; spec-compliant | Ship v1.0 as specified. Refine in spec **v1.1** (scope `query` per-surface or exclude it from feed-row-shaping) with owner sign-off and a migration note for mobile | **ACCEPTED for v1.0 · refinement DEFERRED to spec v1.1** |

**REJECTED: none.** Every note either survives scrutiny as designed (N1–N5, N7-current) or is a scoped backlog item (N6, N7-refinement). No ambiguity remains.

---

## 2. Production Readiness Checklist (PASS / FAIL / BLOCKED only)

| # | Item | Status |
|---|---|---|
| 1 | `tsc --noEmit` clean at RC | **PASS** |
| 2 | Unit suite (381/381, incl. I11 plain-Node proof, V1–V5, F-scenarios, NAV-004, audit hardening) | **PASS** |
| 3 | `next build` exit 0 at RC | **PASS** |
| 4 | Legacy removal L1–L16 (grep gates zero code hits) | **PASS** |
| 5 | Dead code resolved (L13–L15 per-use evidence; lint: no new warnings) | **PASS** |
| 6 | Single state owner (I2) verified by reference sweep | **PASS** |
| 7 | Invariants I1–I12 audited with per-item evidence | **PASS** |
| 8 | No temporary adapters / flags / dual paths (I10) | **PASS** |
| 9 | Memory lifecycle (listeners cleaned, no timers, bounded retries, one singleton) | **PASS** |
| 10 | E2E core matrix — 15 cells with state-level evidence, zero console errors | **PASS** |
| 11 | Independent-audit defects (A1, A2) fixed + runtime-verified on final build | **PASS** |
| 12 | Documentation consistent with Canonical Spec (no contradicting doc) | **PASS** |
| 13 | Rollback plan (L1–L4) prepared and revert-tested in structure (one commit per step) | **PASS** |
| 14 | Production untouched at `1184bd5`; no env/config/secret changes in this work | **PASS** |
| 15 | Telemetry emission (track POSTs 200 during freeze/restore activity) | **PASS** |
| 16 | Telemetry payload-level inspection in browser | **BLOCKED** — needs a dev-build run (`__exploreSessionEvents`); code-verified only |
| 17 | E2E screenshots | **BLOCKED** — Browser pane was not displayed (no compositing); owner UAT supplies the visual pass |
| 18 | Authenticated E2E (BT-02/03/05 My-Profile, BT-20 sign-out) | **BLOCKED** — requires a real signed-in session; OAuth clicking forbidden for Claude |
| 19 | Data-condition E2E (BT-07 natural re-order, BT-08 beyond-window, BT-09 deleted clip) | **BLOCKED** — needs uncontrolled prod-data conditions or owner-authorized data mutation; unit-proven |
| 20 | Full-length stress (S2 depth-4, S3/BT-26 ×20, S11 storage-denied, S12 explicit rotate, S13 two tabs) | **BLOCKED** — shorter equivalents PASS; full runs scheduled for next E2E pass |
| 21 | Owner UAT | **BLOCKED** — waiting on owner (this gate) |
| 22 | NAV-003 / NAV-004 closure on own re-test evidence | **BLOCKED** — depends on 18/21 |

**FAIL count: 0. BLOCKED items are all owner-gated or next-run-scheduled; none is a code defect.**
