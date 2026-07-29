# Parity Feature — In-Feed Video Playback (+ Hide Facebook Login)

**Date:** 2026-07-18 · Web = source of truth · Workflow: survey → implement → build → runtime verify → report.

## 1. Hide Facebook login (owner decision)
Web's auth-provider contract (`src/lib/config/product.ts` `AUTH_PROVIDERS`) = google / zalo / email — **Facebook is not offered on Web**. Android was rendering a Facebook button. Per owner decision (2026-07-18), gated it behind `SHOW_FACEBOOK_LOGIN = false` in `features/auth/.../LoginScreen.kt`; the underlying capability (`LoginViewModel.onFacebookSignInClick` → `AuthRepository`) is kept intact for re-enabling if Meta verification ever completes (same pattern as the hidden App Connections). Zalo remains a backend-missing item (needs a mobile token contract) and is not added here.

## 2. In-feed video playback

### Web behavior surveyed (`src/components/explore/VideoPlayer.tsx`)
Uploaded clips render an inline `<video autoplay muted loop playsInline>` whose **playback is driven purely by an `active` prop** the feed sets from its exact scroll position (no per-video observer — that raced). Every clip starts muted; the user's **first tap anywhere unlocks sound for the whole feed** (TikTok/Reels model, no mute button). A poster covers the surface until playing. YouTube = in-view iframe; TikTok/Facebook = poster + external link.

### Android implementation
media3/ExoPlayer 1.5.0 was already a dependency (used by Music); added only `media3-ui` (`PlayerView`) to the catalog + `:app`.

- **NEW `reviews/ui/ReviewVideoPlayer.kt`** — `ExoPlayer` in a `PlayerView` (`useController=false`, `RESIZE_MODE_ZOOM` crop). Autoplay **muted + `REPEAT_MODE_ONE` loop**; playback driven purely by the `active` param (current page plays, others pause) — same contract as the web `active` prop. Poster `thumbnail` overlays until `onRenderedFirstFrame`. A process-global `FeedAudio.unlocked` mirrors the web's shared audio unlock: muted until the first tap on any clip, then active clips play with sound (no mute button). Lifecycle-aware (pauses on `ON_STOP`, resumes the active clip on `ON_START`); `ExoPlayer.release()` on dispose.
- **`reviews/ui/ReviewCard.kt`** — added `active: Boolean = false`; `ReviewMediaBackground` now plays inline via `ReviewVideoPlayer` for **upload** videos with a `mediaUrl` (source_type null/upload), and keeps the poster+play placeholder for YouTube/TikTok/Facebook sources (matching the web's non-upload branches).
- **`reviews/ui/ReviewsScreens.kt`** (live feed pager) — passes `active = page == pagerState.currentPage`.
- **`reviews/ui/ReviewDetailScreen.kt`** — passes `active = true` (hero always visible).

### Contract
No backend change — ExoPlayer's `MediaItem.fromUri()` points straight at the review's `media_url` Blob URL (the same URL the web `<video src>` uses), consistent with how the Music `AudioPlayer` already streams `audio_url` directly.

### Build & verification
- `assembleDebug testDebugUnitTest` → **BUILD SUCCESSFUL**, tests green (warnings only: an ineffective `@OptIn(UnstableApi)` and a pre-existing `LocalLifecycleOwner` deprecation shared with MyReviewsScreen).
- Emulator install + launch → **process alive, 0 crashes, 0 media3 load errors** (dependency + player code load cleanly at runtime).
- **Owner UAT:** actual playback (muted autoplay, active-page switching, loop, tap-to-unlock-sound) needs a signed-in feed containing a real uploaded clip — not reachable in the emulator without auth. The code path only instantiates ExoPlayer when a video review is `active`, so there's no startup/idle risk.

### Minor deviation from Web (noted)
Android unlocks feed audio via a tap **on the video surface** (a `clickable` overlay), vs. the web's global "first click anywhere." Functionally equivalent for the feed (the clip fills the surface); it avoids intercepting the action-rail taps.

## Next
Per owner direction (large features first, one at a time): next is the **review comment system** (post + delete via `/api/reviews/{id}/comments`).
