# Production Report — Photo + URL Composer (Android Web Parity)

**Date:** 2026-07-18 · Web = source of truth · One feature only.
**Workflow:** Survey → verify contracts → implement → clean build → runtime verify → remove TEMP_VERIFY_HACK → report.

## 1. Survey (Web → Backend → Android)
Web composer `src/app/reviews/new/page.tsx` has three media modes; Android previously implemented only **Video** — the **Photo** and **Link** tabs rendered an inert `MediaPlaceholder` (no picker, no upload, no fields), and `CreateReviewRequestDto` lacked `photos`/`source_url`.
- **Photo** (`handlePhotoSelect`): multi-select images, POST each to `/api/reviews/upload`, collect Blob URLs, publish `content_type='photo'` + `photos`.
- **URL** (`handleUrlChange`): `detectSource` → youtube/tiktok/facebook; YouTube poster built from the video id, TikTok/Facebook via `/api/explore/oembed`; publish `content_type='video'`, `media_url=source_url`, `source_type`, `source_url`, `thumbnail`, plus AI hashtags (`triggerUrlAI`).

## 2. Backend contracts (verified — all reused, nothing invented)
- **`POST /api/reviews/upload`** — multipart `file`, image ≤**5MB** (magic-byte sniffed JPG/PNG/WebP/GIF), 10/day, returns `{url}`. `MAX_PHOTOS_PER_REVIEW = 6`.
- **`GET /api/explore/oembed?url=`** — SSRF-guarded proxy → `{thumbnail_url, title, author_name}` (TikTok/Facebook); returns 400 for unsupported hosts.
- **`POST /api/reviews`** already accepts `photos`, `source_type`, `source_url`, `thumbnail`, `content_type`.
- **`POST /api/explore/process`** accepts an optional `title` (used for URL AI).

## 3. Implementation (files)
| File | Change |
|---|---|
| `reviews/data/ReviewNetworkDtos.kt` | `CreateReviewRequestDto` gained `photos` + `source_url`; new `UploadPhotoResponseDto`, `OembedResponseDto`; `ExploreProcessRequestDto` gained `title`. |
| `reviews/data/ReviewsApi.kt` | `@Multipart @POST("api/reviews/upload") uploadPhoto(...)` + `@GET("api/explore/oembed") oembed(...)`. |
| `reviews/data/ReviewsRepository.kt` | `OembedResult`; `uploadReviewPhoto(uri)`, `oembed(url)`; `createReview(...)` gained `photos`/`sourceType`/`sourceUrl`; `processVideoAi(...)` gained `title`. |
| `reviews/data/RealReviewsRepository.kt` | Photo streamed via `ProgressUriRequestBody` → multipart part; oembed mapped; createReview passes the new fields. |
| `reviews/ui/ReviewComposerViewModel.kt` | `PhotoComposerState` + `UrlComposerState`; `onPhotosPicked` (loop-upload up to 6, stop+error on first failure), `removePhoto`, `onUrlChanged` (detectSource + youtube-poster/oEmbed + non-blocking AI hashtags), `detectSource`/`extractYoutubeId`; **mode-aware `submit`** building the exact web payload per mode incl. the web's `placeId` rule (`community_<name>` for photo+name, else `<mode>_<ts>`). |
| `reviews/ui/ReviewComposerScreen.kt` | Replaced the Photo/Link `MediaPlaceholder` with `PhotoComposer` (empty box → scrollable thumbnail strip + remove + add-more, error text) and `UrlComposer` (URL field + oEmbed spinner + poster/title preview + unsupported-link hint); `canPost` now per-mode (photo: body∨≥1 photo · video: body∨ready · url: valid link). |
| `reviews/ui/ReviewsScreens.kt` (host) | Collects `photoState`/`urlState`; wires a `PickMultipleVisualMedia(6)` image picker + `onUrlChanged`; `submit` now passes `mediaMode`. |
| `strings_reviews.xml` (+vi) | Photo hint/add-more/remove/max, URL placeholder + unsupported strings. |

**Parity details:** photo cap 6 (backend + client); photo posts `content_type='photo'` + `photos[]`; URL posts `content_type='video'`, `media_url`/`source_url`=link, detected `source_type`, oEmbed/YouTube `thumbnail`, AI hashtags; `placeId` derivation byte-matches the web. Booking-sourced reviews still use their real `place_id`.

## 4. Build & runtime verification
- `assembleDebug testDebugUnitTest` → **BUILD SUCCESSFUL**, unit tests green. Web `tsc --noEmit` → **0 errors**.
- **Emulator (runtime):** reached the composer and confirmed on screen:
  - **Photo tab** → "Add photo" box + **"Up to 6 photos · 5MB each"** (was an inert placeholder).
  - **Link tab** → URL field **"Paste a YouTube, TikTok or Facebook link"** (was an inert placeholder).
  - Video tab unchanged ("up to 60s · 50MB"); tab switching works.
- **TEMP_VERIFY_HACK removed:** used once in `AppNavHost.kt` to reach the authed composer, then reverted; `grep -r TEMP_VERIFY_HACK android/app/src android/features` → **0**. Rebuilt clean after revert.
- **Owner UAT:** actually uploading a photo / resolving an oEmbed poster / publishing needs a signed-in session (auth) — the picker, upload, oEmbed, and publish calls all require it. UI, validation, detection, and state flow are gate- + runtime-verified.

## 5. Remaining parity notes (out of scope for this feature)
- URL mode auto-detects the source from the pasted link (web also shows 3 manual source chips that detection overrides) — functionally equivalent; the manual chips are cosmetic and not ported.
- Video-mode `placeId` keeps its existing `slugify(placeName)` behavior (untouched — belongs to the video feature); photo/url follow the web's `<mode>_<ts>` rule.

**STOP.** One feature implemented, built, runtime-verified, hack-reverted, and reported. The next feature (Feed Tabs) will be decided separately — not started.
