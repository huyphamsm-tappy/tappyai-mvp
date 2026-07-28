# ADR-001 (Web) — ExploreSession owns Explore state

**Status:** ACCEPTED (Design Freeze 2026-07-28) · IMPLEMENTED (M1–M6, see `NAVIGATION_MIGRATION_PLAN.md` header for commits) · **Scope:** Web · **Supersedes:** the history-gated restoration formerly in `src/app/reviews/page.tsx` (removed)
**Related:** `NAVIGATION_SESSION_ARCHITECTURE.md`, `NAVIGATION_MIGRATION_PLAN.md`, tickets WEB-EXPLORE-NAV-003 / NAV-004 (both OPEN, separate, no RCA concluded)

> **Naming:** this component is named **`ExploreSession`** (owner's term). It owns *Explore* state specifically — not all navigation. Earlier drafts called it `NavigationSession`; that name is retired.

## Context

Returning to Explore restores the user's clip **only on some paths**. Reproduced facts:

- Other user's profile → `<Link>` = **PUSH**, `history.length` 10→11, marker **written**, Back → correct clip ✅ (verified twice)
- My Profile → `handleSetTab` → **`router.replace`**, `history.length` 11→11, marker **NOT written**, Back → left Explore ❌

The cause of the *divergence* is structural: restoration is gated on `isBackForwardMount()` (a recent `popstate` or a `back_forward` navigation-timing entry) **and** on a marker written by the page's **unmount** handler. A navigation that produces neither side effect silently loses Explore state. Any path not using a route push is therefore unprotected — and there is no single place that owns the answer.

*(The full runtime chain `replace → missing state → wrong clip` was demonstrated only to its second link; this ADR does not depend on the third, because it removes the entire dependency.)*

## Decision

**`ExploreSession` owns Explore state. The browser router is transport only.**

1. `ExploreSession` is the single owner of `ExploreState` (`activeReviewId`, `activeIndex`, `scrollTop`, `feedType`, `filters`, `sort`, `query` + `sessionId`, `version`, `frozenAt`).
2. **Every departure from Explore is an explicit `freeze()`**; **every arrival is an explicit `restore()`**. Identical for all paths.
3. Restoration is triggered by **"Explore became visible"**, never by a history event. `isBackForwardMount()` is deleted.
4. `freeze()` is driven by explicit departure intent, **never** by component unmount.
5. Restore resolves **by `activeReviewId` first**, `activeIndex` second, top last — and any fallback is *reported*, not silent.
6. Push-vs-replace becomes a pure URL/shareability decision with **zero** correctness impact.

## Consequences

**Positive** — one owner; identical behaviour on every path; survives `trending` re-ordering (id-keyed); the defect class disappears rather than being patched; generalises to other lists.

**Negative / costs** — a migration, not an addition: `page.tsx` restoration logic is replaced wholesale; `feedBackRestore.test.tsx` must be re-expressed (not deleted); a new state owner is a new thing to reason about; in-memory + `sessionStorage` mirror adds a durability surface.

**Risk accepted:** M2 (Explore switchover) removes a *working* path (Case A) in the same commit that replaces it. Chosen deliberately over a dual-run to avoid two owners of one state — the failure mode already hit in the playback work (`ownsLifecycle`).

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| **A. Patch My Profile to use `push`** | Treats the symptom. Any future non-push path breaks again; history still decides business state |
| **B. Also write the marker on tab switch** | Adds a *second* writer of the same state — the exact dual-ownership problem this project already paid for |
| **C. Put active clip in the URL** | Makes URL the source of truth; reintroduces "transport decides business state" in a new form; leaks internal state into shareable links |
| **D. Do nothing / accept inconsistency** | Owner-reported defect; behaviour differs per entry point with no principled reason |

---

## 1. State Ownership Table

**Exactly one owner per fact.** "Reads" = may observe; "Writes" = may mutate.

| State | **Owner (writes)** | Readers | Never touched by |
|---|---|---|---|
| `activeReviewId` | **ExploreSession** | Feed (to scroll), telemetry | Router, Profile, ClipViewer |
| `activeIndex` | **ExploreSession** | Feed | Router, Profile, ClipViewer |
| `scrollTop` | **ExploreSession** | Feed | Router, Profile, ClipViewer |
| `feedType` | **ExploreSession** | Feed, fetch layer | Router, Profile |
| `filters` / `sort` / `query` | **ExploreSession** | Feed, fetch layer | Router, Profile |
| `sessionId` / `version` / `frozenAt` | **ExploreSession** | Telemetry | everyone else |
| Feed rows (`reviews[]`) | **Feed** (fetch result) | ExploreSession (to resolve id→index) | Router |
| Live scroll position (DOM) | **Feed / DOM** | ExploreSession (samples on freeze) | Router |
| URL / `history.length` | **Router** | telemetry only | **ExploreSession must not read it** |
| Current tab (`?tab=`) | **ExploreSession** (business) + Router (URL echo) | — | ProfileTab (no side channel) |
| Profile view state | **Profile** | — | ExploreSession |
| Clip viewer index | **ClipViewer** | — | ExploreSession, Router |
| Playback state | **PlaybackSession** (separate track) | — | ExploreSession |

## 2. Architecture Invariants

Violating any of these is a build/review failure, not a preference.

| # | Invariant | How it is checked |
|---|---|---|
| **I1** | No business decision reads `popstate`, `history.length`, or `navigation.type` | grep gate in DoD; code review |
| **I2** | Exactly **one** writer per row of the State Ownership Table | review + single-owner test |
| **I3** | `freeze()` is triggered by explicit departure intent, never by unmount | unit test: tab-switch (no unmount) still freezes |
| **I4** | `restore()` is triggered by Explore visibility, never by a history event | unit test: restore with zero popstate |
| **I5** | Restoration is **id-first**; index is fallback only | unit test with a re-ordered feed |
| **I6** | Every restore outcome (exact / index-fallback / top-fallback) is reported | telemetry assertion |
| **I7** | `freeze()` is idempotent; `restore()` runs at most once per RESTORING transition | unit test: double-freeze, double-restore |
| **I8** | The Feed never persists its own navigation state | grep: no `sessionStorage` in feed components |
| **I9** | Behaviour is identical for other-user profile and My Profile | E2E E1 ≡ E2 |
| **I10** | No temporary adapter, flag, or dual-path branch survives the migration | DoD grep |

## 3. Failure Scenarios

Each has a **defined**, testable behaviour — no silent degradation.

| # | Scenario | Defined behaviour |
|---|---|---|
| **F1** | Saved `activeReviewId` no longer in the loaded page (feed re-ordered / item beyond window) | Fall back to `activeIndex`; if that is out of range → top. **Report `fallback:index` / `fallback:top`** |
| **F2** | Saved clip **deleted / hidden** since freeze | Treated as F1; never render a blank slide |
| **F3** | `feedType` / `query` changed while frozen | Session **INVALIDATED** → fresh Explore at top. Report `invalidated:filters-changed` |
| **F4** | `sessionStorage` unavailable (private mode / quota) | In-memory session still works for SPA navigation; a full reload starts fresh. Report `durability:unavailable`. **Must not throw** |
| **F5** | Full document reload / bfcache eviction | Restore from the `sessionStorage` mirror if present and not stale; else top |
| **F6** | Freeze fires twice (multiple departure signals) | Idempotent (I7); `version` bumps once |
| **F7** | Restore races user scroll (user scrolls during RESTORING) | User input wins; restore aborts and reports `aborted:user-input` |
| **F8** | Two Explore surfaces alive (feed + profile clip viewer reuse `Post`) | One session keyed by `sessionId`; the secondary surface never freezes/restores |
| **F9** | Stale freeze (older than the staleness policy) | INVALIDATED → top. Report `invalidated:stale` |
| **F10** | Sign-in / sign-out while frozen | INVALIDATED (feed contents are identity-dependent) |
| **F11** | Restore target loads but scroll container not yet measured (`clientHeight === 0`) | Defer to next frame, bounded retries, then fallback + report |

## 4. Telemetry / Observability

**Purpose:** make restoration outcomes *provable in production*, since the whole defect class was invisible until a user reported it.

**Events** (namespace `explore_session.*`):

| Event | Payload | Why |
|---|---|---|
| `freeze` | `sessionId`, `version`, `activeReviewId`, `activeIndex`, `feedType`, `trigger` (`route-push` \| `tab-switch` \| `viewer-open` \| `background`) | Proves freeze fires on **every** path — the exact gap today |
| `restore_attempt` | `sessionId`, `version`, `age_ms`, `trigger` | Confirms restore is visibility-triggered |
| `restore_result` | `outcome`: `exact` \| `fallback_index` \| `fallback_top` \| `invalidated` \| `aborted_user_input`; `targetReviewId`, `resolvedIndex` | **The key metric.** `exact` rate is the health signal |
| `invalidated` | `reason`: `filters-changed` \| `stale` \| `auth-changed` | Explains legitimate non-restores |
| `durability_unavailable` | — | F4 visibility |

**Dev-only diagnostics:** a `__exploreSession` debug snapshot (state + last 20 transitions) for E2E capture — **dev/test builds only, never shipped to production**.

**Guardrails:** no PII; ids only; volume-capped; must not log on every scroll frame. Telemetry is **observation only** — it must never influence behaviour (else it becomes a second owner, violating I2).

**Health indicator:** `restore_result.exact / restore_attempt` — a drop signals regression before users report it.

---

Implemented after Design Freeze approval. **Not pushed, not merged, not deployed** — release gated on Owner UAT (see `EXPLORE_NAV_RELEASE_CANDIDATE.md`).
