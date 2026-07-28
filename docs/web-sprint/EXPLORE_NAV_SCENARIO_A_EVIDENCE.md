# Scenario A — Authenticated Second-Feed Replacement: HYPOTHESIS PROVEN

**Date:** 2026-07-28 15:16–15:18 · localhost:3300, RC build · **evidence only, no fixes, nothing committed**
**Method:** no source was modified. The page's own `fetch_` was invoked through its live `fetchRef` (located via React fiber; the sole async-function ref hook) with the **exact arguments of the signed-in personalization refetch** (`page.tsx:506`: `fetchRef.current(0, false, 'for-you', signal)`). A one-shot client-side `window.fetch` interceptor returned the *real* server response with rows rotated by 3 — a deterministic stand-in for the hashtag re-sort at `page.tsx:560–566`, whose entire purpose is to change row order. Anonymous sessions never make this second call (`if (!me) return`; measured: `anonFeedFetchCount: 1`).

## Timeline (times = UTC, local 15:xx)

| t | Event | Data |
|---|---|---|
| 08:16:02.832 | Mount, feed #1 loaded, scrolled to clip 2 | session: id `2fd1deeb…` idx 2 |
| — | **FIRST FEED** (10 ids, head) | `546d5c77…, 7a7ca930…, 2fd1deeb…(idx 2), 54076d09…, 749ccb8b…` |
| 08:16:39.408 | **BEFORE replacement** | scrollTop **1440**, visibleIndex **2**, visibleClip **`2fd1deeb…`**, session id `2fd1deeb…` idx 2 — UI, state and session all agree |
| 08:16:39.408 | `fetchRef.current(0, false, 'for-you')` invoked — the line-506 call | |
| 08:16:39.411 | **ROW REPLACEMENT** (`setReviews` non-append, `page.tsx:568`) | **SECOND FEED** head: `54076d09…, 749ccb8b…, b78a997f…(idx 2), f181e696…, 15d7f00e…` — clip `2fd1deeb…` now at **index 9** |
| 08:16:56.721 | **AFTER replacement** | scrollTop **6480** (browser scroll anchoring followed the moved DOM node — **no user action**), visibleIndex **9**, visibleClip still `2fd1deeb…` — **but session now says id `b78a997f…` idx 2** (the echo reported the new index-2 row) |
| 08:17:xx | **Failure #1 — dead slide** | videos mounted only at slides **[1, 2]** (the render window follows React `activeIndex`=2); the slide the user is LOOKING AT (9) has **no mounted `<video>`** → frozen/blank playback |
| 08:17:54.562 | User (watching `2fd1deeb…`) taps a profile → FREEZE | **snapshot captures `b78a997f…` idx 2 — the WRONG clip** (`SNAPSHOT_NAMES_WRONG_CLIP: true`) |
| 08:18:07.523 | Browser **Back** | restore outcome "exact" — to **`b78a997f…` @ idx 5, scrollTop 3600**. `RESTORED_WRONG_CLIP: true` — the user lands on a clip they were never watching |

## Conclusions

1. **PROVEN:** a non-append feed replacement after restore (exactly what the signed-in personalization effect at `page.tsx:500–507` does) breaks the Explore experience in two observable ways, even when scroll anchoring keeps the same pixels on screen:
   - **Dead slide:** the video render window tracks a stale `activeIndex`; the visible clip stops playing.
   - **Session corruption → wrong restore:** the settled-slide echo absorbs the id of whatever row lands at the stale index; the **next** freeze/Back restores that wrong clip with outcome `exact`. This is the owner's "Back returns the wrong clip", reproduced end-to-end.
2. **Why anonymous E2E could not see it:** the second fetch requires `me` (signed in). Anonymous mounts make exactly one feed call (measured). All prior PASS evidence was anonymous and remains valid *for the anonymous path only*.
3. **Root cause classification:** the feed rows have a **second writer** (the personalization refetch) that acts after restore without informing ExploreSession — an I2 violation *in the page layer*, pre-existing (the same effect ran in the legacy build) and structurally invisible to the migration's unit suite.
4. Residual (unproven, minor): the exact re-sort delta in the owner's account depends on their hashtag history; the mechanism is order-independent — ANY order change triggers both failures. The owner's one-command check (`feedFetches: 2` + session-vs-screen mismatch) remains the in-vivo confirmation.

**No fix is proposed in this document (per instruction). NAV-003/NAV-004 remain OPEN.**
