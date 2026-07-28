# TappyAI — Canonical Explore Navigation Specification

**Status:** CANONICAL SPECIFICATION · **Design Freeze APPROVED 2026-07-28** (owner) — Source of Truth
**Version:** **1.1** — DFR-001 "My Profile Back Navigation Semantics" applied with owner sign-off (see `web-sprint/DFR-001-myprofile-back-semantics.md`) · **Date:** 2026-07-28
**Scope:** **Cross-platform** — Web, Android, iOS. This document is the single source of truth for Explore navigation state on every client.
**Promoted from:** `docs/web-sprint/NAVIGATION_SESSION_ARCHITECTURE.md` (Web architecture) — that document and `docs/web-sprint/ADR-001-explore-session.md` become **Web implementation notes** subordinate to this spec.
**Complements:** `docs/Navigation_Architecture.md` (route tree / auth gating). That document describes *where routes are*; this one describes *how Explore state survives navigation*. No overlap.

---

## 0. Purpose

Returning to Explore must restore **exactly** what the user left, on **every** platform and **every** path. Today (Web) it works only on paths that happen to produce a history push plus a component unmount; other paths silently lose state. This specification removes that dependency permanently and defines behaviour precisely enough that Web, Android and iOS can implement it independently and be verified against the same criteria.

---

## 1. Principles (normative)

### P1 — Navigation history must never determine business state
History is a record of *transport*, not a source of truth. No business decision may read `popstate`, `history.length`, navigation type, back-stack depth, or any platform equivalent.

### P2 — The router is transport only
The router/navigator moves the user between destinations. It decides nothing about Explore state. Push-vs-replace (Web), fragment/activity transactions (Android), and navigation-stack operations (iOS) are **presentation choices with zero correctness impact**.

### P3 — No Hidden State
> **Every business state must be observable, serializable, inspectable, and replayable.**

| Property | Requirement |
|---|---|
| **Observable** | Every state transition emits a defined event (§7). Nothing changes silently |
| **Serializable** | All of `ExploreState` is plain data — no closures, no element handles, no framework objects. It must round-trip through JSON with no loss |
| **Inspectable** | The current state and recent transitions can be dumped at any moment for diagnosis |
| **Replayable** | Applying the same ordered inputs to a fresh session yields an identical state. Restoration is a pure function of `Snapshot` + loaded feed |

**Consequence:** any state that cannot be serialized is not allowed to be business state. If a value can't appear in a `Snapshot`, it belongs to the UI layer, not to `ExploreSession`.

### P4 — `ExploreSession` is UI-agnostic
`ExploreSession` **must not depend on** React, the DOM, a router implementation, Android `Fragment`/`Activity`/`Navigation`, or SwiftUI/UIKit. It depends **only** on `ExploreState` and `Snapshot`.

- Platform code **calls into** the session and **feeds it plain data**; the session never reaches outward.
- Reading the scroll position is a platform concern; the *number* it produces is session state.
- This is an architectural **port**, permanent by design — not a migration adapter (those are forbidden by the Definition of Done).

**Test of compliance:** the session must be unit-testable with **zero** UI framework, no DOM, and no router.

### P5 — Single owner
Exactly one component owns each piece of state (§4). Two writers of one fact is a defect, not a trade-off.

---

## 2. Data model

### 2.1 `ExploreState` **v1**

```
ExploreState.v1 {
  schemaVersion : 1            // literal, required

  // — restoration target —
  activeReviewId : string|null // PRIMARY restore key
  activeIndex    : int         // fallback only; >= 0
  scrollOffset   : number      // platform-normalized (see note), >= 0

  // — query shape (must be restored BEFORE fetching) —
  feedType : "for-you" | "following" | "latest"
  sort     : string|null
  query    : string|null
  filters  : { [key:string]: string|number|boolean|null }   // flat, serializable
}
```

**`scrollOffset` note:** platform-normalized to *logical pixels from the top of the feed container*. It is a **refinement** of `activeIndex`, never a substitute — restoration correctness must never depend on it (densities and viewports differ across devices).

### 2.2 `Snapshot` **v1**

The serializable envelope produced by `freeze()` and consumed by `hydrate()`.

```
Snapshot.v1 {
  schemaVersion : 1          // literal, required
  sessionId     : string     // identity of one Explore visit
  version       : int        // increments on every freeze, >= 1
  frozenAt      : int        // epoch ms, UTC
  trigger       : "route-change" | "tab-switch" | "viewer-open" | "background" | "explicit"
  state         : ExploreState.v1
}
```

**Guarantee:** `Snapshot` is pure JSON. `JSON.parse(JSON.stringify(s))` (or platform equivalent) is lossless.

### 2.3 Versioning & forward compatibility

| Rule | Statement |
|---|---|
| **V1** | `schemaVersion` is **required** on both `ExploreState` and `Snapshot`. A snapshot without it is invalid |
| **V2** | **Additive-only within a major version.** New optional fields may be added in 1.x; existing fields never change meaning or type |
| **V3** | **Unknown fields are preserved, not dropped** — a client reading a newer 1.x snapshot keeps unrecognised fields intact when re-serializing, so a newer client is not degraded by an older one round-tripping it |
| **V4** | **Missing optional fields fall back to defaults**; a newer client reading an older 1.x snapshot must not fail |
| **V5** | **Unsupported major version → `INVALIDATED`, never a crash.** Reading `schemaVersion: 2` on a v1-only client yields `invalidated: reason=schema-unsupported` and a clean Explore at top |
| **V6** | Breaking changes require a **new major version + written migration**. v1 readers must never silently misinterpret v2 data |
| **V7** | **Cross-platform parity:** all three clients implement the *same* `schemaVersion` semantics. Snapshots are not shared between devices today, but the schema is shared so behaviour is identical |

---

## 3. `ExploreSession` Contract

Platform-neutral. Types are conceptual; each platform expresses them idiomatically. All operations are **synchronous and non-blocking** unless stated.

### 3.1 `enterExplore(context) → void`
- **Input:** `context { feedType?, sort?, query?, filters? }` — the shape Explore is being opened with (optional; absent = keep/derive current).
- **Output:** none. Session moves `IDLE|FROZEN → ACTIVE` (via `RESTORING` when a compatible snapshot exists).
- **Guarantees:** exactly one restore attempt per transition into ACTIVE; restore is triggered **here**, never by a history event; if `context` conflicts with the snapshot's query shape → `INVALIDATED` and a clean start.
- **Failure cases:** no snapshot → start at top (`restore_result: none`); snapshot stale (§5 F9) → `INVALIDATED`; unsupported schema (V5) → `INVALIDATED`.
- **Invariants:** I1, I4, I7.

### 3.2 `leaveExplore(trigger) → Snapshot`
- **Input:** `trigger ∈ {route-change, tab-switch, viewer-open, background, explicit}`.
- **Output:** the `Snapshot` just produced (also retained internally).
- **Guarantees:** captures state **synchronously** at call time; increments `version`; stamps `frozenAt`; **idempotent** — calling again with no intervening `enterExplore` returns the same snapshot without bumping `version`.
- **Failure cases:** durable storage unavailable → in-memory snapshot still returned, `durability_unavailable` emitted, **never throws** (F4).
- **Invariants:** I3 (must be callable from a path that does **not** unmount any UI), I7.

### 3.3 `reportActiveItem({ reviewId, index, scrollOffset }) → void`
- **Input:** plain data from the UI as the user scrolls/settles.
- **Output:** none.
- **Guarantees:** updates the live `ExploreState`; the session never reads the UI to obtain these values (P4). Safe to call frequently; implementations should coalesce.
- **Failure cases:** unknown `reviewId` accepted as-is (the session does not validate against feed contents); `index < 0` rejected as a no-op.
- **Invariants:** P4, P5 (this is the **only** write path for these three fields).

### 3.4 `setQueryShape({ feedType?, sort?, query?, filters? }) → void`
- **Input:** any subset of the query shape.
- **Output:** none.
- **Guarantees:** if the shape changes while a snapshot exists, the session **invalidates** it (a saved clip may not exist under a new query) and emits `invalidated: reason=filters-changed`.
- **Failure cases:** identical values → no-op, no event.
- **Invariants:** I5 is unaffected (id-first restore only applies within a matching shape).

### 3.5 `restore(feed) → RestoreResult`
- **Input:** `feed` — the loaded, ordered list of review ids currently available.
- **Output:** `RestoreResult { outcome, targetReviewId|null, resolvedIndex|null, scrollOffset|null }`, `outcome ∈ {exact, fallback_index, fallback_top, invalidated, aborted_user_input, none}`.
- **Guarantees:** **resolution order is id → index → top** (I5); pure function of `Snapshot` + `feed` (P3 replayable); runs **at most once** per RESTORING transition; **always returns an outcome — never silently does nothing**.
- **Failure cases:** id absent → `fallback_index`; index out of range → `fallback_top`; user input during restore → `aborted_user_input` (user wins, F7); feed empty/not ready → caller retries per F11 with bounded attempts, then `fallback_top`.
- **Invariants:** I5, I6, I7.

### 3.6 `invalidate(reason) → void`
- **Input:** `reason ∈ {filters-changed, stale, auth-changed, schema-unsupported, explicit}`.
- **Output:** none. State → `INVALIDATED`; snapshot discarded.
- **Guarantees:** next `enterExplore` starts clean at top; emits `invalidated`.
- **Invariants:** I6 (never a silent discard).

### 3.7 `snapshot() → Snapshot|null` · `hydrate(Snapshot) → boolean`
- **`snapshot()`** — returns the current retained snapshot (or `null`). Pure read, no side effects. Used for inspection/telemetry/tests (P3 inspectable).
- **`hydrate(s)`** — loads an externally-held snapshot (e.g. from durable storage after a cold start). **Returns `false`** (does not throw) on: missing/invalid `schemaVersion`, unsupported major (V5), or malformed payload. Returns `true` on success. Unknown 1.x fields are preserved (V3).
- **Invariants:** V1–V5, P3.

### 3.8 `getState() → ExploreState` · `dispose() → void`
- **`getState()`** — current live state; synchronous; a defensive copy (callers cannot mutate session state — P5).
- **`dispose()`** — releases the session. Idempotent. After dispose, all operations are no-ops and emit nothing.

### 3.9 Contract-wide guarantees
1. **No operation throws** on malformed input or unavailable storage — failures are returned/reported (P3 observable).
2. **No operation reads history, the DOM, or the router** (P1, P2, P4).
3. **Every state transition emits exactly one event** (§7).
4. All operations are safe to call in any order; illegal sequences are no-ops, not errors.

---

## 4. State Ownership

| State | Owner (writes) | Readers | Never touched by |
|---|---|---|---|
| `activeReviewId`, `activeIndex`, `scrollOffset` | **ExploreSession** (via `reportActiveItem`) | Feed UI, telemetry | Router, Profile, Clip Viewer |
| `feedType`, `sort`, `query`, `filters` | **ExploreSession** (via `setQueryShape`) | Feed UI, fetch layer | Router, Profile |
| `sessionId`, `version`, `frozenAt` | **ExploreSession** | telemetry | everyone else |
| Feed contents (ordered ids) | **Feed / fetch layer** | ExploreSession (as `restore` input) | Router |
| Live scroll position (platform) | **UI layer** | reported *into* the session | — |
| URL / back-stack | **Router** | telemetry only | **ExploreSession must not read it** |
| Profile view state | **Profile** | — | ExploreSession |
| Clip viewer index | **Clip Viewer** | — | ExploreSession, Router |
| Playback state | **PlaybackSession** (separate spec) | — | ExploreSession |

---

## 5. Lifecycle & failure scenarios

**States:** `IDLE → ACTIVE ⇄ FROZEN → RESTORING → ACTIVE`, plus `INVALIDATED`.
**Transitions:** `ACTIVE → FROZEN` on **any** departure (`leaveExplore`); `FROZEN → RESTORING` on **Explore becoming visible** (`enterExplore`) — never on a history event.

Failure scenarios **F1–F11** are specified in `docs/web-sprint/ADR-001-explore-session.md` §3 and are **normative for all platforms**: F1 id-missing, F2 clip deleted, F3 filters changed, F4 storage unavailable, F5 cold start/bfcache, F6 double freeze, F7 restore-vs-user-input, F8 two surfaces, F9 stale, F10 auth change, F11 container not measured.

---

## 6. Invariants (normative, all platforms)

**I1–I10** as defined in ADR-001 §2, restated cross-platform:
I1 no history-derived business logic · I2 one writer per state · I3 freeze ≠ unmount/teardown · I4 restore ≠ history event · I5 id-first restore · I6 every outcome reported · I7 freeze idempotent, restore once-per-transition · I8 UI layer persists no navigation state · I9 **all profile paths behave identically** · I10 no temporary adapters survive.

Plus:
- **I11** — `ExploreSession` compiles and unit-tests with **no UI framework, no DOM, no router** (P4).
- **I12** — `Snapshot` round-trips losslessly through JSON (P3).

---

## 7. Telemetry (normative)

Events `explore_session.{freeze, restore_attempt, restore_result, invalidated, durability_unavailable}` with payloads as defined in ADR-001 §4. Health metric: **`restore_result.exact / restore_attempt`**.

**Telemetry is observation only** — it must never influence behaviour, or it becomes a second owner and violates I2/P5. Ids only, no PII. Identical event names and payload keys on all three platforms.

---

## 8. Platform binding (informative)

The session is identical everywhere; only the **edges** differ.

| Concern | Web | Android | iOS |
|---|---|---|---|
| Departure signal | route change / tab switch / viewer open | Fragment/Activity transition, tab change | `viewWillDisappear`, tab change |
| Arrival signal | Explore becomes visible | `onResume` / fragment visible | `viewDidAppear` |
| Scroll offset source | scroll container | RecyclerView/LazyColumn state | UICollectionView/SwiftUI offset |
| Durable mirror | `sessionStorage` | in-memory + `SavedStateHandle` | in-memory + state restoration |

**In all cases the platform converts its native signal into a plain call** (`enterExplore` / `leaveExplore` / `reportActiveItem`). No platform type crosses the boundary.

**DFR-001 (v1.1, normative):** the **feed → My Profile** tab transition creates a back-stack entry (Web: history push; Android: back-stack transaction; iOS: navigation entry), so **Back from My Profile returns to the feed tab and restores the exact clip** (BT-02b). URL/back-stack-driven tab traversals MUST emit the same `enterExplore`/`leaveExplore` signals as direct tab taps — a traversal is transport; the tab transition is the business signal. Invariants I1–I12 are unaffected: restoration still never *depends* on history; v1.1 only constrains where Back *lands* (a product transport choice, P2).

---

## 9. Conformance

A platform conforms when: the contract (§3) is implemented in full · invariants I1–I12 hold · failure scenarios F1–F11 behave as specified · telemetry (§7) is emitted with identical names · the E2E matrix (E1–E10) and stress matrix (S1–S14) in `NAVIGATION_MIGRATION_PLAN.md` pass **with browser/device evidence** · owner UAT is complete.

**No platform may claim conformance from reasoning alone.**

---

## 10. Document status

| Item | State |
|---|---|
| Specification | **Design Freeze APPROVED 2026-07-28** |
| Web implementation | **COMPLETE (M1–M6 + audit + E2E run #1)** — commits in `web-sprint/NAVIGATION_MIGRATION_PLAN.md`; release gated on Owner UAT |
| Android implementation | Not started — Android track PAUSED |
| iOS implementation | Not started |
| NAV-003 / NAV-004 | OPEN, **separate** — each closes only on its own post-migration re-test evidence |

**Decisions settled at freeze (recorded in `web-sprint/EXPLORE_NAV_BUSINESS_TESTS.md`):** staleness **30 min** · scope = Explore only · **one** ExploreSession per tab · active clip **not** in URL · durability = in-memory + sessionStorage mirror.

**No change to this specification without a new version and owner sign-off.**

---

**Web reference implementation for mobile:** `docs/WEB_REFERENCE_BASELINE_EXPLORE_NAV.md`. **Not pushed, not merged, not deployed** pending owner release approval.
