# Android Parity — Integration Acceptance Checklist (QA)

**Branch under test:** `integration/android-parity` @ `9d07a30` (off `main`)
**Scope:** 9 merged feature branches (Reviews sub-features ×6, Membership status, App-Connections status, Chat suggested-prompts). Split-bill is **excluded** (scope-3, Reserved).
**Source of truth:** production Web app + backend. Android must match user-visible behavior and backend contracts, not add features.
**Status at hand-off:** conflict-resolved + static-inspected. **NOT built, NOT runtime-verified.** Every box below is UNVERIFIED until QA checks it.

Legend: ☐ = to verify · Each item lists **Backend contract** + **Acceptance (user-visible)**.

---

## 0. Preconditions (gate — nothing else can pass until these do)

- ☐ **0.1 Clean build.** `integration/android-parity` compiles (`gradlew :app:assembleDebug`) with zero errors. *(This is the current known unknown — 6 features were text-merged into shared files.)*
- ☐ **0.2 Lint/unit.** `gradlew :app:testDebugUnitTest` passes (or documents pre-existing failures only).
- ☐ **0.3 App launches** to Home shell without crash on a clean install.
- ☐ **0.4 Auth session** present (signed-in user) — required for every write endpoint below.

---

## A. Reviews module (6 merged sub-features)

### A1. Photo upload — `feat/android-reviews-photo-upload`
- **Backend:** `POST /api/reviews/upload` (multipart `file`, ≤5MB, server re-sniffs type) → Blob URL; URLs sent as `photos[]` (camelCase, ≤6) in `POST /api/reviews`.
- ☐ A1.1 Composer **Photo** tab opens the system photo picker (no runtime permission prompt).
- ☐ A1.2 Multi-select is capped at **6** photos total; picking beyond remaining slots is trimmed.
- ☐ A1.3 Each picked photo uploads; a spinner shows on the add-tile while uploading.
- ☐ A1.4 Per-file rejects surface a toast: >5MB → "under 5MB"; non-image → "Only JPG, PNG, WebP or GIF"; unreadable → "Couldn't read that photo".
- ☐ A1.5 Uploaded thumbnails render in a horizontal strip, each with a remove (✕) affordance; remove drops it from the draft.
- ☐ A1.6 Posting a photo review shows the photos on the resulting feed card.
- ☐ A1.7 Add-tile disappears once 6 photos are attached.

### A2. Link sharing — `feat/android-reviews-link-sharing`
- **Backend:** `GET /api/explore/oembed?url=` (TikTok/FB thumbnail proxy); review sent with `content_type='video'`, `media_url=source_url`, `source_type`, `source_url`, `thumbnail`.
- ☐ A2.1 Composer **Link** tab shows a URL field.
- ☐ A2.2 Pasting a **YouTube** URL derives a thumbnail client-side (no network wait).
- ☐ A2.3 Pasting a **TikTok/Facebook** URL shows "Fetching preview…" then the oEmbed thumbnail.
- ☐ A2.4 Recognized provider with no poster frame → "Link attached (<provider>)" text instead of a broken image.
- ☐ A2.5 Unrecognized URL → no preview, and posting is **not** enabled by the link alone.
- ☐ A2.6 A valid link makes the review postable **with an empty body** (body OR media rule).
- ☐ A2.7 A newer keystroke cancels a stale in-flight thumbnail lookup (no wrong thumbnail lands).

### A3. Comment posting — `feat/android-reviews-comment-posting`
- **Backend:** `GET /api/reviews/{id}/comments`, `POST /api/reviews/{id}/comments` (body 1–300, rate-limit 10/min).
- ☐ A3.1 Review detail shows the comments list + an "Add a comment…" input with a send action.
- ☐ A3.2 Posting appends the new comment optimistically/after success and bumps the comment count.
- ☐ A3.3 Empty/over-300-char input is blocked or rejected with the mapped error.
- ☐ A3.4 Rate-limit / validation failure surfaces a typed error toast (not a crash).

### A4. Follow — `feat/android-reviews-follow`
- **Backend:** `POST /api/users/{id}/follow` → `{following, follower_count}`; `GET /api/users/{id}` now carries `is_following`, `is_self`, `follower_count`.
- ☐ A4.1 Another user's profile shows a **Follow / Following** button reflecting `is_following`.
- ☐ A4.2 Tapping toggles state and updates the follower count to the authoritative returned value.
- ☐ A4.3 On the **user's own** profile (`is_self`) the follow button is hidden.
- ☐ A4.4 Follow state is consistent when re-entering the profile.

### A5. Feed tabs — `feat/android-reviews-feed-tabs`
- **Backend:** `GET /api/reviews/feed` with `sort` (`trending`/`latest`) + `following=true` only for the Following tab.
- ☐ A5.1 Feed shows three tabs: **For You**, **Following**, **Latest**.
- ☐ A5.2 For You → trending ranking; Latest → reverse-chronological; Following → followed authors, latest order.
- ☐ A5.3 Following tab with no follows shows the correct empty state (not an error).
- ☐ A5.4 Switching tabs reloads page 1 and paginates correctly per tab.

### A6. Video playback + watch analytics — `feat/android-reviews-video-playback`
- **Backend:** `POST /api/reviews/{id}/interact` `{watch_seconds, completion_rate}` (fire-and-forget; first ≥3s watch counts one view).
- ☐ A6.1 A video review in the vertical pager **autoplays only on the settled page**; off-screen clips are paused.
- ☐ A6.2 Video starts **muted**; first tap unlocks audio for the feed session.
- ☐ A6.3 Scrolling away finalizes the previous clip's watch; leaving the feed flushes the in-progress watch.
- ☐ A6.4 A watch ≥ minimum threshold POSTs `interact` with `watch_seconds` (rounded) and `completion_rate` (watched/duration, ≤1, 2-dp).
- ☐ A6.5 A failed `interact` call never affects playback (no crash, no stall).

### A7. Reviews cross-feature integration (highest merge risk — features share the composer/feed/card)
- ☐ A7.1 **Composer** exposes Photo + Link + (placeholder) Video tabs; switching tabs preserves body/rating/place draft across rotation.
- ☐ A7.2 A review created with **photos AND a sound** (and, separately, a link) sends all attached fields in one `POST /api/reviews`.
- ☐ A7.3 **Feed** shows tabs (A5) AND video autoplay (A6) simultaneously on the same screen.
- ☐ A7.4 A single feed card supports like, save, comment-open, share, avatar→profile→follow, and (video) playback without interference.
- ☐ A7.5 Detail screen shows the review card + comments together.

---

## B. Standalone modules (3 merged, read-only status)

### B1. Membership status — `feat/android-membership-status`
- **Backend:** `GET /api/subscription` (read-only).
- ☐ B1.1 Membership screen replaces the previous ComingSoon and shows the user's current plan/status from `/api/subscription`.
- ☐ B1.2 Loading and error states render (no blank screen on failure).
- ☐ B1.3 **No purchase/manage action** is claimed here (status display only) — matches scope.

### B2. App Connections status — `feat/android-appconnections-status`
- **Backend:** `GET /api/integrations` (read-only).
- ☐ B2.1 App Connections screen replaces ComingSoon and lists integrations + their connected/disconnected status from `/api/integrations`.
- ☐ B2.2 Loading and error states render.
- ☐ B2.3 **Connect/disconnect action is NOT wired** (see C2 blocker) — verify the UI does not present a non-functional connect button that errors.

### B3. Chat suggested prompts — `feat/android-chat-suggested-prompts`
- **Backend:** `GET /api/suggested-prompts`.
- ☐ B3.1 Chat empty state shows suggested prompts fetched from `/api/suggested-prompts`.
- ☐ B3.2 Tapping a prompt pre-fills/sends it into the chat input.
- ☐ B3.3 Fetch failure degrades gracefully (chat still usable, no crash).

---

## C. Backend blockers & Web-architecture issues (NOT in this branch — gate remaining parity)

These are **not** acceptance items for the merged code; they are the open gaps QA/PM must track. None should appear as broken UI in the build.

- ☐ **C1. Video UPLOAD — BLOCKED (backend contract undefined).** Web's `/api/upload/video` delegates to `@vercel/blob/client` SDK internals; no mobile HTTP contract exists. Composer **Video** tab remains a placeholder. *Proposed contract:* `POST /api/upload/video/mobile` → `{upload_url, token, required_headers, pathname, public_url}`. **Verify:** Video tab shows a placeholder, not a broken/half-working uploader. Owner decision required to unblock.
- ☐ **C2. App Connections CONNECT — BLOCKED.** Only status read (`GET /api/integrations`) is implemented; initiating a connection needs a mobile-OAuth backend flow that does not exist. **Verify:** no dead "Connect" control that fails.
- ☐ **C3. Reviews "Liked" tab — WEB ARCHITECTURE ISSUE.** Web queries Supabase directly client-side; there is no `/api/reviews/liked` endpoint to consume. **Not implemented on Android** (correctly not copied). Needs backend endpoint before parity.
- ☐ **C4. My Reviews (self, incl. hidden) — BLOCKED.** Needs a self-scoped include-hidden endpoint. `GET /api/reviews/mine` exists; confirm whether it satisfies the hidden-inclusion requirement during QA.
- ☐ **C5. Music upload (Android) — BLOCKED.** Vercel Blob client-direct upload protocol vs 4.5MB serverless cap for 20MB audio; needs a mobile upload contract (same shape as C1).
- ☐ **C6. Delete Account — NO BACKEND (release blocker).** No self-service delete on Web or Backend (email-request only). Google Play blocker. Owner must choose Path A (endpoint) or Path B (email-request UI).

---

## D. Regression sanity (unchanged surfaces that share code with the above)

- ☐ D1. Plain **text-only** review (no media, no sound) still posts.
- ☐ D2. Like / Save toggles still work and persist across feed reload.
- ☐ D3. Notifications, Search, My Reviews, profile screens open without regression.
- ☐ D4. Non-Reviews tabs (Home, Chat, Currency, Translate, Deals, Games, Music, etc.) unaffected.

---

### Sign-off
- Build owner: __________  Date: ______  Result (0.1–0.4): PASS / FAIL
- QA owner: __________  Date: ______  Features A–B: __ / __ passed
- PM (blockers C, scope): __________  Date: ______
- **Definition of Done:** integration is "Completed" only after §0 build PASS + §A/§B all pass + owner explicit acceptance.
