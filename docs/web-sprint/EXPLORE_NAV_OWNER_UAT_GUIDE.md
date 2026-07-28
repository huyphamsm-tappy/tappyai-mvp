# Explore Navigation — Owner UAT Guide

**Build under test:** `http://localhost:3300/reviews` (local production build at RC `8da316e`; server already running).
**Global preconditions:** use a normal browser window (not incognito unless the scenario says so). For "signed in" scenarios use your own account via the normal login. Vietnamese labels assumed ("Khám phá" = feed tab, "Tìm Kiếm" = search, "Hồ sơ" = My Profile, "Đề xuất/Mới nhất/Đang follow" = feed types).
**Global pass criteria for EVERY scenario:** no blank slide, no console errors (F12 → Console), the feed never silently lands on the wrong clip.
**Optional state check** (any scenario): F12 Console → `__exploreSession.getState()` — `activeReviewId`/`activeIndex` should match the clip on screen.

| # | Scenario | Preconditions | Actions | Expected | Pass criteria |
|---|---|---|---|---|---|
| U1 | **Anonymous — Other Profile → Back** | Signed out, `/reviews`, feed loaded | Swipe/arrow to the 3rd clip → tap the author's avatar → profile opens → browser **Back** | Explore reopens on **exactly the same clip**, same position | Same clip visibly playing; no jump to top |
| U2 | **Anonymous — Refresh** | Continue from U1 | Press **F5** on the feed | After reload, the **same clip** is restored | Same clip after full reload |
| U3 | **Browser Forward** | Continue from U1 | **Forward** (to profile) → **Back** again | Each traversal lands correctly; the clip is still exact after the second Back | No wrong/stale clip, no double-jump |
| U4 | **Feed switching** | On feed, scrolled to any clip ≥ 2 | Switch "Đề xuất" → "Mới nhất" → back to "Đề xuất" | Each switch starts a **clean feed at the top** — the old position is deliberately forgotten (spec F3) | Clean top both times; no ghost restore to the old clip |
| U5 | **Search round-trip** | On "Tìm Kiếm" tab | Type a query with results (e.g. a place name) → tap a result's author → profile → **Back** | Search tab returns with the **query still in the box and results shown** | Query + results visible again without retyping |
| U6 | **Signed in — My Profile tab → feed return** (NAV-004, the original defect) | **Signed in**, feed scrolled to clip ≥ 2 | Tap "Hồ sơ" (bottom bar) → your profile shows → tap "Khám phá" | Feed returns to **exactly the clip you left** — identical to the U1 outcome despite no Back involved | Same clip; this MUST match U1 behaviour (invariant I9) |
| U7 | **Signed in — My Profile → view own post → Back** | Signed in, on "Hồ sơ" tab, you have ≥1 post | Open a post's action sheet → "Xem bài" (view post) → detail page → **Back** | Returns to **profile tab** (not the feed), your grid intact; the feed clip is still remembered if you then tap "Khám phá" | Profile tab restored; then feed clip exact |
| U8 | **Signed in — profile grid clip viewer** | Signed in or not, on any profile with posts | Tap a grid tile → swipe viewer opens → swipe a few → close (back arrow) → browser **Back** to Explore | Viewer opens/closes **without adding history entries**; Back returns to the exact feed clip | One Back = back to Explore; exact clip |
| U9 | **Sign-out invalidation** | Complete U6 first (clip remembered), then sign out | Return to `/reviews` | Feed starts **clean at the top** (identity changed — the old position must NOT restore) | Clean top; no restore of the signed-in clip |
| U10 | **Backgrounding** | Feed on clip ≥ 2 | Switch to another app/browser tab for ~1 min → return | Same clip still there (under 30 min away) | No state loss |
| U11 | **Staleness** (optional, long) | Feed on clip ≥ 2 → leave to a profile | Wait **> 30 min** → Back/return | Feed starts clean at top (snapshot expired by design) | Clean top, no ancient clip |
| U12 | **Mobile viewport** | DevTools device mode 375×812 (or a phone on the LAN) | Repeat U1, U2, U6 | Identical outcomes at mobile size | All three hold |
| U13 | **Rapid Back/Forward** | Complete U1 setup | Alternate Back/Forward quickly ~10× | Ends on a correct, stable page; no flicker into wrong clips, no errors | Final state correct; console clean |
| U14 | **New-tab click** (audit fix A1) | Feed on clip ≥ 2 | **Ctrl+click** (or middle-click) an author avatar → close the new tab → in the original tab, tap "Hồ sơ" then "Khám phá" | The original tab's position was **not disturbed** by the new-tab click — the feed clip restores exactly | Exact clip after the tab round-trip |

**Deliberate behaviour changes to be aware of (not bugs):**
1. Explore now restores on **any** re-entry — including plain nav-bar visits, not only Back (BT-03). Users will notice Explore "remembering" more than before.
2. Switching feed type or editing the search query **forgets** the held position on purpose (spec F3) — U4, and after a search detour the feed may restart at top.
3. Restores expire after **30 minutes** away (U11).

**Recording results:** each scenario is PASS / FAIL (+ note). Any FAIL: please note the scenario number, what you saw, and — if convenient — the output of `__exploreSession.getState()` and `__exploreSession.snapshot()` from the console at that moment.
