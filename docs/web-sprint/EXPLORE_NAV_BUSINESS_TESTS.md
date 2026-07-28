# Explore Navigation — Business Test Specification

**Status:** PRODUCT ACCEPTANCE CRITERIA (Phase 1 of the post-freeze plan)
**Source of Truth:** `docs/CANONICAL_EXPLORE_NAVIGATION_SPEC.md` (Design Freeze approved 2026-07-28)
**Frozen defaults recorded at freeze:** staleness = **30 min** · scope = Explore only · **one** ExploreSession · active clip NOT in URL · durability = in-memory + `sessionStorage` mirror.

**Conventions:** "Clip N" = the feed's Nth slide (0-based). Every scenario implicitly requires: clean console · exactly one restore attempt · `restore_result` emitted (I6). "ExploreState restored" means `activeReviewId` matches AND the visible clip is that review.

**Pass criteria template (applies to all):** the *Expected* columns all hold, with browser evidence (screenshot + `ExploreState` dump + router state). A scenario with any unmet expectation = FAIL. A scenario that cannot be executed in the available environment = BLOCKED (never inferred).

---

## A. Core restoration paths

**BT-01 — Other user's profile → Back**
Init: Explore For-You, scrolled to Clip 2 (id X). Actions: tap author avatar → profile opens → browser Back.
Expected ExploreState: `activeReviewId=X`, `activeIndex=2`, feedType unchanged. Browser: `/users/{id}` pushed; Back returns `/reviews`. Visible: exact Clip X playing.
Pass: `restore_result=exact`, clip X on screen.

**BT-02 — My Profile (tab) → return to feed tab** *(revised v1.1/DFR-001)*
Init: Explore For-You, Clip 2 (id X), signed in. Actions: tap "Hồ sơ" (bottom nav) → My Profile tab → tap "Khám phá"/feed tab.
Expected ExploreState: `activeReviewId=X` restored. Browser: feed→profile is a **push** (DFR-001); the tap-return updates the URL without further stack growth. Visible: exact Clip X.
Pass: identical outcome to BT-01 (**I9**).

**BT-02b — My Profile → browser Back** *(new in v1.1/DFR-001 — the owner-defined behavior)*
Init: Explore For-You, Clip 2 (id X), signed in. Actions: tap "Hồ sơ" → browser/system **Back**.
Expected: Back pops the pushed profile entry → **feed tab visible, `activeReviewId=X` restored, `restore_result=exact`**. The traversal emits the same enter/leave signals as a direct tab tap.
Pass: exact Clip X on screen after one Back; a second Back (from the feed tab) follows transport out of Explore.

**BT-03 — leaving Explore entirely → re-entry** *(narrowed v1.1: applies to real exits, not the My-Profile tab — that is BT-02b)*
Init: as BT-02, user arrived at Explore from Home `/`. Actions: leave `/reviews` by a real route exit (external nav, deep link, second Back from the feed tab) → later re-enter Explore (nav/bottom bar).
Expected ExploreState on re-entry: `activeReviewId=X` restored.
Pass: no state loss regardless of where the exit landed; re-entry shows Clip X.

**BT-04 — Other profile → open a clip in profile grid → Back**
Init: Explore Clip 2 (id X). Actions: avatar → profile → open grid clip (viewer) → close/Back → browser Back to Explore.
Expected: profile's ClipViewer never touches ExploreState (ownership §4). On return: Clip X.
Pass: `restore_result=exact`; viewer open/close created no history entries and no session writes.

**BT-05 — My Profile → open own clip → return**
Init: signed in, Explore Clip 3 (id Y). Actions: Hồ sơ → grid clip → close viewer → feed tab.
Expected: Clip Y restored; viewer state isolated.
Pass: same as BT-04 via the tab path.

**BT-06 — Review detail → Back**
Init: Explore Clip 1 (id Z). Actions: open the clip's detail page (`/reviews/{id}`) → Back.
Expected: push + Back; Clip Z restored by id.
Pass: `restore_result=exact`.

## B. Feed shape & re-ordering

**BT-07 — Trending re-order between freeze and restore**
Init: For-You (trending) Clip 4 (id W). Actions: profile → Back; meanwhile trending order changed (W now at index 7).
Expected ExploreState: `activeReviewId=W` restored **by id**; `activeIndex` updated to 7.
Pass: visible clip is W at its new position; `restore_result=exact` (I5).

**BT-08 — Saved clip no longer in page (beyond window)**
Init: Clip 5 (id V). Actions: leave/return; V absent from first fetched page.
Expected: fallback to saved index if in range, else top. Telemetry `fallback_index`/`fallback_top`.
Pass: no blank slide; outcome reported (F1).

**BT-09 — Saved clip deleted while away**
Init: Clip 2 (id U). Actions: U deleted by author; return to Explore.
Expected: same as BT-08 (F2). Never renders a dead/blank clip.
Pass: graceful fallback + report.

**BT-10 — Feed-type switch invalidates**
Init: For-You Clip 3 frozen. Actions: return, switch to "Mới nhất".
Expected: `invalidated: filters-changed`; Latest starts clean at top; switching back to For-You does NOT resurrect the stale snapshot.
Pass: F3 exact behaviour; no ghost restore.

**BT-11 — Search query shape**
Init: enter Search tab, query "phở", results shown, select nothing. Actions: leave Explore (profile) → return.
Expected: search tab + query restored (query is part of ExploreState; tab via URL echo).
Pass: query text and results state visible again.

**BT-12 — Following tab restoration**
Init: Following tab, Clip 1. Actions: profile → Back.
Expected: Following (not For-You) is the restored feedType **before** fetch, so the clip exists in the loaded feed.
Pass: `feedType=following` + exact clip.

## C. Browser semantics

**BT-13 — Browser Forward after Back**
Init: BT-01 completed (back on Explore, Clip X). Actions: browser Forward (to profile) → browser Back again.
Expected: each traversal lands correctly; second Back still restores X; no double-restore, no stale overlay.
Pass: `restore_attempt` count equals entries into Explore; state correct each time.

**BT-14 — Refresh on Explore**
Init: Clip 2 (id X) active. Actions: F5 / pull-to-refresh reload.
Expected (frozen default): restore from `sessionStorage` mirror → Clip X (F5 durability), if < 30 min old.
Pass: after full reload, Clip X restored; `restore_result=exact`.

**BT-15 — Refresh after restore, then Back**
Init: complete BT-01, then F5. Actions: after reload+restore, press Back.
Expected: Back follows real history (previous entry), no phantom entries created by restoration.
Pass: defined, reproducible landing; no loop.

**BT-16 — Cold start (new tab, direct URL)**
Init: new tab → `/reviews` directly, no prior session.
Expected: clean top, `restore_result=none`. No error, no restore attempt against empty storage.
Pass: feed starts at Clip 0.

**BT-17 — Two tabs isolation**
Init: Explore open in Tab-A (Clip 2) and Tab-B (Clip 5). Actions: leave/return in each.
Expected: `sessionStorage` is per-tab; each restores its own clip; no cross-contamination (S13).
Pass: A→2, B→5.

## D. Lifecycle & staleness

**BT-18 — Backgrounding the app/tab**
Init: Clip 3 active. Actions: switch OS/browser tab away → return within 30 min.
Expected: `trigger=background` freeze; on return, same clip (restore or simply still-mounted state).
Pass: no state loss; no duplicate session.

**BT-19 — Stale snapshot (>30 min)**
Init: freeze via profile visit; wait past staleness. Actions: return.
Expected: `invalidated: stale`; clean top; reported.
Pass: F9 exact behaviour, no ancient clip resurrected.

**BT-20 — Sign-out / sign-in transition**
Init: signed in, Following tab Clip 1 frozen. Actions: sign out → return to Explore.
Expected: `invalidated: auth-changed` (feed contents identity-dependent); clean start.
Pass: F10; no attempt to restore a Following clip while anonymous.

**BT-21 — Storage blocked (private mode)**
Init: storage denied. Actions: BT-01 flow within one SPA session; then a full reload.
Expected: SPA restore works (in-memory); reload starts clean; `durability_unavailable` emitted once; **no exception**.
Pass: F4 behaviour.

## E. Stress & robustness

**BT-22 — Rapid Back/Forward ×10**
Init: BT-01 setup. Actions: alternate Back/Forward rapidly ten times.
Expected: terminal state correct for final position; one restore per entry; no queue buildup, no console errors (S1).
Pass: final clip correct; events balanced.

**BT-23 — Deep chain**
Explore → profile → clip → back → another profile → back → detail → back.
Expected: every return lands on the then-current frozen clip; chain never corrupts the session (S2).
Pass: correct at each of the 3 returns.

**BT-24 — Leave during in-flight page-2 fetch**
Init: scrolling triggers page-2 load; immediately tap profile. Actions: return after load settles.
Expected: coherent snapshot (the clip the user was on), late response does not corrupt restore (S4).
Pass: exact restore; no index drift.

**BT-25 — Restore races user scroll**
Init: return to Explore; immediately swipe before restore completes.
Expected: user input wins; `restore_result=aborted_user_input`; no fight-back scroll (F7).
Pass: feed stays where the user swiped.

**BT-26 — Enter/leave ×20**
Actions: alternate Explore ↔ profile twenty times.
Expected: one live session; listener count flat; memory flat (S3).
Pass: no growth in sessions/listeners/timers.

## F. Platform matrix

**BT-27 — Mobile viewport (375×812)** — run BT-01, BT-02, BT-07, BT-14 at mobile size.
Pass: all pass criteria hold.

**BT-28 — Desktop viewport (1280×800)** — same set at desktop; desktop prev/next arrows also restore correctly after profile round-trip.
Pass: all hold; arrow navigation consistent with restored index.

---

**Traceability:** BT-01↔E1 · BT-02/03↔E2 · BT-04/05↔E3 · BT-14/15↔E4 · BT-11↔E5 · BT-07↔E6 · BT-13↔E7/E8 · BT-27↔E9 · BT-28↔E10 · BT-22..26↔S1–S14 · F-scenarios per ADR §3.

**28 scenarios. This document is the Product acceptance bar: no ticket closes while any applicable scenario is FAIL, and no scenario may be marked PASS without browser evidence.**
