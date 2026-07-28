# RCA #2 — Instrumented Reproduction on localhost:3300 (owner-confirmed surface)

**Date:** 2026-07-28 15:0x–15:1x · build RC (`page-586b3d523944c679.js`, contains ExploreSession, zero legacy markers) · anonymous session · **no code changed, nothing committed**.
**Method:** the live singleton's `enterExplore/leaveExplore/restore` were wrapped with a pass-through logger (`window.__probe`) capturing timestamp, URL, `history.length`, phase, snapshot id/index/version, and freeze/restore events for every step. sessionStorage cleared at start; history seeded as `/ → /reviews` so Back has a known landing.

---

## Scenario B — Explore → My Profile → Back: **OWNER'S FAILURE REPRODUCED**

| Step | t (UTC+7 15:xx) | URL | hist | phase | Session state | Event |
|---|---|---|---|---|---|---|
| B0 (carried from A4) | 09:45 | `/reviews` | 11 | active | id `2fd1deeb…` idx 2 | — |
| B1 CLICK "Hồ sơ & Bài của tôi" | 10:03.761 | `/reviews` | 11 | active→frozen | — | **FREEZE trigger=`tab-switch`, snapId `2fd1deeb…`, snapIdx 2, v2** |
| B2 profile tab shown | 10:03.763 | `/reviews` | **11 (unchanged)** | frozen | snapshot held | no history entry created (router.replace) |
| B3 URL echo settles | 10:11.325 | `/reviews?tab=profile` | **11 (unchanged)** | frozen | — | — |
| **B4 browser BACK** | 10:30.242 | **`/` (home)** | 11 | — (**document unloaded; session gone with it**) | — | **DIVERGENCE** |

**Divergence point = B4.**
- **Owner-expected:** Back returns to the Explore feed showing clip `2fd1deeb…`.
- **Observed:** Back leaves `/reviews` entirely and lands on the previous history entry (`/`). The feed, the clip, and the ExploreSession document all go with it. The clip *would* restore on the next re-entry into Explore (proven in A4 and in earlier BT-03 evidence) — but the Back press itself never shows it.

**Why (mechanism, not speculation):** the tab switch runs `router.replace('/reviews?tab=profile')` — **no history entry** (B2/B3: `hist` stays 11). So Back traverses to whatever preceded `/reviews`. This is not an implementation error against the spec — it is the **frozen spec's own text**:
- BT-02 *Expected:* "URL `?tab=` changes only (**replace — no new entry**; transport choice)."
- BT-03 *Expected:* "**Back follows transport (may leave `/reviews` — allowed, P2)**. *Then* user re-enters Explore… `activeReviewId=X` restored."

And the original defect report (ADR Context) itself recorded: *"My Profile → `router.replace`, `history.length` 11→11 … **Back → left Explore** ❌"*. The migration fixed the **state-loss** half (state now survives, restores on re-entry) and froze the **transport** half (Back still exits) as *intended* behavior. **The owner's acceptance criterion is evidently "Back from My Profile returns to my clip" — the frozen spec explicitly chose otherwise.** Implementation and spec agree with each other and disagree with the owner. That is a Design-Freeze-level product decision only the owner can change (e.g., push instead of replace for the profile tab — the ADR's rejected Alternative A territory — or an in-app back interception). Per instructions, no fix is proposed here.

## Scenario A — Explore → Other Profile → Back (anonymous): works, fully instrumented

| Step | t | URL | hist | phase | Session | Event |
|---|---|---|---|---|---|---|
| 0 mount (storage cleared) | 09:11.293 | `/reviews` | 10 | active | idx 0, id `546d5c77…`, snap null | initial |
| A1 scroll to clip 2 | 09:24 | `/reviews` | 10 | active | id `2fd1deeb…` idx 2 | reportActiveItem |
| A2 CLICK author | 09:24.421 | `/reviews` | 10 | →frozen | — | **FREEZE trigger=`route-change`, snapId `2fd1deeb…`, snapIdx 2, v1** |
| A3 on profile | 09:31.865 | `/users/d2883fba…` | **11 (+1 push)** | frozen | snapshot held v1 | — |
| A4 browser BACK | 09:37.759 / .782 | `/reviews` | 11 | restoring→active | — | **enterExplore → RESTORE outcome=`exact`, target `2fd1deeb…`, resolvedIdx 2** |
| A4′ verify | 09:45.119 | `/reviews` | 11 | active | id `2fd1deeb…` idx 2, scrollTop 1440, `visibleClipIsX: true` | — |

## Scenario A — the owner's environmental difference: **authenticated session**

The owner was signed in; every E2E run here is anonymous (sign-in is not something I can perform). The signed-in path contains a **second, restore-breaking feed fetch that anonymous sessions never execute**:

- `src/app/reviews/page.tsx:500–507` — when `me` resolves (signed-in only), after two personalization queries settle: `fetchRef.current(0, false, 'for-you', signal)` — a **second** feed fetch.
- `:560–566` — its rows are **re-sorted** by the user's top hashtags (the whole point of the refetch).
- `:568` — `setReviews(prev => append ? … : rows)` with `append=false` → **the visible rows are replaced wholesale**.

**Predicted failure sequence (signed in):** mount → restore runs against fetch #1 and lands clip X (exactly as in A4) → ~0.5–2 s later the personalization refetch **replaces and re-orders the rows under the unchanged scroll position** → the slide at index 2 is now a different clip → the user sees the wrong clip (or a visible jump), i.e. "the bug is still there." If the refetch happens to win the race *before* restore, restore resolves id-first against the personalized rows and the return is correct — a timing race, which also explains intermittent perception.
**Anonymous evidence:** resource timing on a fresh anon mount shows **exactly 1** `/api/reviews/feed` call (`{"anonFeedFetchCount":1}`), because the `me` effect exits at `if (!me) return`. Signed-in mounts execute 2 by code.
**Note:** this personalization refetch predates the migration (it exists in the legacy build too) — the migration neither introduced nor fixed it, and anonymous E2E structurally cannot see it. This is precisely the audit's "another code path bypassing ExploreSession" (owner question 6): **a second writer of the feed rows that the restore path does not participate in.**

**One-command confirmation for the owner (signed in, on 3300, after reproducing Scenario A):**
```js
({feedFetches: performance.getEntriesByType('resource').filter(r=>r.name.includes('/api/reviews/feed')).length,
  session: __exploreSession.getState()})
```
Expected if this mechanism is the cause: `feedFetches: 2` (vs 1 anon) and `session.activeReviewId` naming a clip that is **not** the one on screen (or on screen only after a visible jump).

## Reconciliation status
| Scenario | Owner observation | My observation | Reconciled? |
|---|---|---|---|
| B (My Profile → Back) | Bug reproduces | **Reproduced identically, anonymous, instrumented (B4)** | **YES — mechanism proven: frozen-spec BT-02/BT-03 transport semantics conflict with the owner's acceptance criterion. Owner ruling required at spec level.** |
| A (Other Profile → Back) | Bug reproduces (signed in) | Passes anonymous (A0–A4′); signed-in divergence mechanism identified at `page.tsx:500–507/560–568` with anon-vs-auth fetch-count evidence | **PARTIAL — needs the one-command signed-in confirmation above (or an owner-authorized session) to close** |

**No PASS is claimed for either scenario.** Screenshots remain uncapturable (Browser pane not displayed / not compositing). NAV-003 / NAV-004: OPEN. Awaiting owner: (1) ruling on Scenario B's spec semantics, (2) the Scenario A signed-in confirmation output.
