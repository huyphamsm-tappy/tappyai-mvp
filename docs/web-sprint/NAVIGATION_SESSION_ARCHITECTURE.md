# Navigation Architecture — `NavigationSession` (historic proposal → implemented as `ExploreSession`)

**Tickets:** WEB-EXPLORE-NAV-003 / NAV-004 (OPEN until independently re-tested post-migration)
**Status:** SUBORDINATE IMPLEMENTATION NOTES. Promoted to `docs/CANONICAL_EXPLORE_NAVIGATION_SPEC.md` at Design Freeze 2026-07-28; the component shipped as **`ExploreSession`** (owner's name — `NavigationSession` is retired). Where this document and the canonical spec differ, the spec wins. Kept for design rationale/history.
**Companion pattern:** `PLAYBACK_CONTROLLER_ARCHITECTURE.md` v3 — same shape: a **Session owns policy + state**, the **transport is dumb**.

## 0. Evidence basis (what this is built on — and what it is NOT)

Built on **observed, reproduced facts**:
- Other user's profile → `<Link>` = **PUSH**; `history.length` 10→11; `returnKey` **written**; Back → correct clip ✅ (verified twice)
- My Profile → `handleSetTab` → **`router.replace`**; `history.length` 11→11; `returnKey` **NOT written**; Back → left Explore ❌
- Restore is gated on `isBackForwardMount()` (a recent `popstate` / `back_forward` nav-timing) **and** on a `returnKey` written by the page's **unmount** handler
- My Profile's `ClipViewer` is pure React state (`setViewerStart`) — zero history entries for the whole Case B sequence

**NOT built on:** any assumed root cause. The third link (`replace → missing state → *wrong clip*`) was never demonstrated. **This design does not need it**, because it eliminates the entire class: business state stops depending on history at all.

## 1. The core inversion

**Today (implicit):**
```
browser history  ──determines──▶  business state
   (popstate? back_forward? did the component unmount?)
```
Restoration only happens if the browser *happened* to traverse history in a recognised way and a component *happened* to unmount in time. Any navigation that doesn't produce those side effects — `router.replace`, a tab toggle, a state-only viewer — silently loses Explore state.

**Proposed (explicit):**
```
NavigationSession  ──owns──▶  business state
        │
        └── router: transport only (moves the URL, decides nothing)
```

> **Rule 1 — Navigation history must never determine business state.**
> **Rule 2 — The browser router is transport only.**
> **Rule 3 — Every departure from Explore is an explicit `freeze()`; every arrival is an explicit `restore()`. No exceptions, no path-specific behaviour.**

## 2. Layering

```
   Explore Feed        Profile (any)        ClipViewer
        │                    │                   │
        └──────── intent ────┴───────────────────┘
                             ▼
                     NavigationSession          ← owns ExploreState, freeze/restore
                             ▼
                        Router (URL)            ← transport only
```

## 3. Responsibilities & ownership

| Owner | Owns | Must NOT |
|---|---|---|
| **NavigationSession** | `ExploreState` (all 7 fields), freeze/restore, session identity + version, staleness policy | Read `popstate`, read `history.length`, care which UI opened a profile |
| **Router** | The URL. Push vs replace as a *cosmetic/shareability* choice | Be a source of truth. Gate restoration. Carry business state that isn't shareable |
| **Explore Feed** | Rendering the list; reporting the active clip / scroll to the Session | Persist its own state. Decide restoration. Read history |
| **Profile (any)** | Its own view state | Mutate Explore state. Behave differently depending on *whose* profile it is |
| **ClipViewer** | Only its own viewer index | Write Explore state. Push/replace history for internal state |

### `ExploreState` (the frozen unit)
```
activeReviewId : string        // PRIMARY restore key — survives re-ordering
activeIndex    : number        // fallback only
scrollTop      : number        // fine positioning
feedType       : 'for-you' | 'following' | 'latest'
filters        : …             // whatever the feed supports
sort           : string
query          : string
─────────────────────────────
sessionId      : string        // identity of this Explore visit
version        : number        // bumped on every freeze
frozenAt       : number        // for staleness policy
```

## 4. Lifecycle & state diagram

```
        ┌──────────────────────────────────────────────┐
        │                                              │
        ▼                                              │
     ┌──────┐   enterExplore()   ┌────────┐            │
     │ IDLE │ ─────────────────▶ │ ACTIVE │            │
     └──────┘                    └────────┘            │
                                   │    ▲              │
                    leaveExplore() │    │ restore ok   │
                     (ANY path)    │    │              │
                                   ▼    │              │
                              ┌────────┐│    ┌───────────┐
                              │ FROZEN ││    │ RESTORING │
                              └────────┘└────└───────────┘
                                   │            ▲
                     enterExplore()└────────────┘
                                   │
                    invalidate()   ▼
                             ┌─────────────┐
                             │ INVALIDATED │ → next enter starts fresh at top
                             └─────────────┘
```

**Transitions**
| From → To | Trigger |
|---|---|
| IDLE → ACTIVE | Explore becomes visible |
| ACTIVE → FROZEN | **any** departure: route push, tab switch (`replace`), overlay/viewer open, app background |
| FROZEN → RESTORING | Explore becomes visible again (**any** return path: Back, Forward, tab switch back, in-app link, fresh mount) |
| RESTORING → ACTIVE | Restore resolved (exact / fallback / top) |
| ACTIVE|FROZEN → INVALIDATED | User changes feedType, sort, filters, query; explicit refresh; sign-in/out |

**Critical:** `FROZEN → RESTORING` is triggered by **Explore becoming visible**, *never* by a history event. That single change makes Case A and Case B identical by construction.

## 5. Session freeze

**Triggered by an explicit "leaving Explore" intent — never by component unmount.** Unmount is unreliable: a tab toggle may not unmount, and unmount ordering is not guaranteed relative to navigation.

- Captures the full `ExploreState` synchronously at the moment of departure.
- Bumps `version`; stamps `frozenAt`.
- **Idempotent** — freezing twice without an intervening restore is a no-op (a departure may fire multiple signals).
- **Storage:** in-memory app-level store (survives SPA navigation) **mirrored** to `sessionStorage` (survives full document reload / bfcache eviction). In-memory is authoritative; the mirror is the fallback. *(Today's `sessionStorage`-only approach is retained as the durability layer, but it stops being the trigger mechanism.)*

## 6. Session restore

**Resolution order (deterministic, documented fallbacks):**
1. **By `activeReviewId`** — the primary key. Correct even when `trending` re-orders between fetches (the failure the current index-based approach has).
2. **By `activeIndex`** — only if the id is absent from the loaded page (e.g. it moved beyond the fetched window).
3. **Top of feed** — last resort, and an *explicitly reported* outcome, not a silent default.

**Rules**
- `feedType` / `sort` / `filters` / `query` are restored **before** the fetch, so the saved clip is actually present to scroll to.
- Restore runs **once per RESTORING transition**; it must be idempotent and must not fight user scrolling that begins mid-restore.
- Restore is **never** gated on `popstate` or navigation-timing type. `isBackForwardMount()` is **deprecated and removed** by this design.
- If restoration falls back or fails, the Session records the reason (observability), rather than silently landing at slide 0 — the current user-visible symptom.

## 7. Router responsibilities (transport only)

- Changes the URL. That is all.
- **Push vs replace becomes a pure URL/shareability decision** and must have **zero** effect on Explore state. Whether My Profile uses `replace` (URL hygiene) or `push` (back-navigable) is then a product choice, not a correctness one.
- The router must **not** be consulted to decide restoration.
- URL *may* carry shareable coordinates (e.g. `?tab=`), but the Session never depends on the URL being present or correct.

## 8. Profile responsibilities

- **Uniform contract:** other-user profile and My Profile expose the **same** enter/leave signals to the Session. Their internal implementations may still differ (a route vs a tab) — that difference must not be observable in Explore restoration.
- A profile never writes `ExploreState`.
- A profile's own internal state (tab, scroll, viewer) is its own concern and out of scope for `NavigationSession`.

## 9. ClipViewer responsibilities

- Owns **only** its own viewer index.
- Opening/closing a clip is **not** an Explore departure when the viewer belongs to a profile — the Explore freeze already happened on entering the profile.
- Must not push/replace history to represent internal open/closed state (today it correctly does not; this codifies it).
- On close, control returns to its parent; the Session is untouched.

## 10. Why this fixes both tickets by construction

| Failure today | Why it can't recur |
|---|---|
| My Profile uses `replace` → no history entry | Restoration no longer reads history |
| Page doesn't unmount → `returnKey` never written | Freeze is an explicit intent, not an unmount side effect |
| Restore gated on `popstate` | Gate removed; trigger is "Explore became visible" |
| `trending` re-orders → index restore lands elsewhere | Primary key is `activeReviewId`, not index |
| Behaviour differs per entry point | All entry points funnel through one Session API |

## 11. Risks & open questions (for owner decision)

| # | Question | Note |
|---|---|---|
| R1 | **Staleness policy** — how long is a freeze valid? (e.g. invalidate after N minutes or on refetch) | Restoring a very old clip could feel wrong |
| R2 | **Scope** — Explore only, or a general pattern for other lists (Search, Saved, Profile grids)? | Design generalises, but scope should be explicit |
| R3 | **Multiple Explore instances** (feed + profile clip viewer reuse `Post`) — one session or many? | Proposal: one Explore session, keyed by `sessionId` |
| R4 | **URL shareability** — should the active clip appear in the URL? | Would make state shareable, but reintroduces URL-as-truth; proposal says no |
| R5 | Migration: remove `isBackForwardMount()` + `RETURN_KEY` unmount write, or keep as a temporary durability fallback? | Affects blast radius |

## 12. Scope boundary

**In:** `NavigationSession` contract, `ExploreState`, freeze/restore, wiring Explore + both profile paths + clip viewer, removal of history-gated restoration.
**Out:** any playback concern (owned by `PlaybackSession`), profile-internal state, changing which URL a profile uses, redesigning the feed.

---

**No code. No patching. No commits. No push. No merge. No deployment.**
**NAV-003 and NAV-004 remain OPEN and separate.** Awaiting architecture approval (and decisions on §11) before any implementation.
