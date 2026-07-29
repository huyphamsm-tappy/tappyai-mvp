# Production Report — Feed Tabs (For You / Following / Latest)

**Date:** 2026-07-18 · Web = source of truth · One feature only.
**Workflow:** Survey → verify contract → implement → clean build → runtime verify → remove TEMP_VERIFY_HACK → report.

## 1. Survey (Web → Backend → Android)
- **Web** (`src/app/reviews/page.tsx`): a centered top switcher **Following · For You · Latest** over the feed. `feedType` defaults to `'for-you'`; the active tab is bold + underlined (`border-b-2`). Mapping (`fetch_`): `for-you` → `&sort=trending` (+`&city=` when known); `following` → `&sort=latest&following=true`; `latest` → `&sort=latest`.
- **Android before**: `ReviewsFeedViewModel` always called `getFeed(page, limit)` (default `sort=latest`, no following); the top bar showed a static "Reviews" title — no switcher.

## 2. Backend contract (verified — reused, nothing invented)
`GET /api/reviews/feed?sort=trending|latest&following=true&…`:
- `sort=trending` → personalised scoring pass (recency + engagement + optional `city` boost). Only applies when no `userId`/`following`/`search`.
- `following=true` → posts from followed authors (requires auth); returns `{reviews:[], empty:'not_following_anyone'}` when the user follows nobody; falls back to a public feed when unauthenticated.
- default `sort=latest` → chronological.

## 3. Implementation (files)
| File | Change |
|---|---|
| `reviews/data/ReviewsApi.kt` | `getFeed` gained `@Query("following") following: Boolean? = null`. |
| `reviews/data/ReviewsRepository.kt` / `RealReviewsRepository.kt` | `getFeed(...)` gained a `following` param, threaded to the API. |
| `reviews/ui/ReviewsFeedViewModel.kt` | New `enum FeedType(sort, following)` — `ForYou("trending",false)`, `Following("latest",true)`, `Latest("latest",false)`; `feedType` in state (default **ForYou**, matching the web); `onFeedTypeChange(type)` clears the list + reloads page 0; `loadFirstPage`/`loadNextPage` now pass `sort`+`following` from the active type. |
| `reviews/ui/ReviewsScreens.kt` | `FeedTopBar` center replaced with a **Following / For You / Latest** switcher (`FeedTab`: bold + underline for active, dimmed otherwise); wired `feedType` + `onFeedTypeChange`; the empty state is now feed-type-aware — the **Following** tab with no follows shows a "Not following anyone yet" message (mirrors the backend's `not_following_anyone`). |
| `strings_reviews.xml` (+vi) | Tab labels (Following/For You/Latest, matching the web's exact i18n) + following-empty title/message. |

**Parity details:** default tab, tab order, active-tab styling, and the three sort/following mappings all match the web. Android omits only the optional `city` boost on For You (no city source on device) — the backend treats an empty city as no-boost, so this is behaviourally identical to the web when a city isn't set.

## 4. Build & runtime verification
- `assembleDebug testDebugUnitTest` → **BUILD SUCCESSFUL**, unit tests green.
- **Emulator (runtime):** on the Reviews feed the top bar now shows **Following / For You / Latest** with **For You** active (bold + underline) by default; tapping **Following** moved the active state to Following (bold + underline) and triggered a reload — confirming the switcher and `onFeedTypeChange` work end-to-end. (The feed body showed the error/empty state because the verification build fakes auth without a real token — the actual trending/following/latest data needs a signed-in session.)
- **TEMP_VERIFY_HACK removed:** used once in `AppNavHost.kt` to reach the authed feed, then reverted; `grep -r TEMP_VERIFY_HACK android/app/src android/features` → **0**. Rebuilt clean after revert (tests green).
- **Owner UAT:** the actual ranked/followed/latest results require a real signed-in session + backend data.

## 5. Remaining parity notes (out of scope)
- For You `city` boost is not sent (Android has no city/location source for the feed) — behaviourally identical to the web's no-city case; would only differ once a device city source exists.
- The web's hashtag-chip filter on For You is a separate feature, not part of the feed-tabs switcher, and is not included here.

**STOP.** One feature implemented, built, runtime-verified, hack-reverted, and reported. No other feature started — the next will be decided separately.
