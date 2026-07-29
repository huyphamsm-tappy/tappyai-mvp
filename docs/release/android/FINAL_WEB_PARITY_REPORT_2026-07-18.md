# FINAL Web Parity Report — Android vs Web (Source of Truth)

**Date:** 2026-07-18 · **Branch:** `feat/backoffice-phase0`

**Method:** Six parallel read-only audit agents, one per feature cluster, compared the current Web source (`src/`) against Android (`android/`) end-to-end across all seven dimensions (navigation · actions · backend contract · loading · empty · error · success). Every reported gap was then re-verified by hand against the Web source before classification. Completeness bar applied: *a feature is at parity only if Android matches the FULL Web capability* — a similar screen or partial implementation is a gap.

**Classification:** (1) Fixed this sprint · (1-open) Implementable on Android now (category-1 backlog) · (2) Backend-missing · (3) Product-decision · (4) Infrastructure.

**Scope note:** `admin/*` (Back Office) and `cron/*`, `webhooks/*`, `iap/*` server routes are web/server-only and out of Android parity scope. Owner-approved hidden features (**App Connections**, **Membership/Upgrade to Pro**) are correctly gated off on both and are NOT gaps.

---

## A. Fixed & verified this sprint (category 1)

| # | Gap | Cluster | Files | Type |
|---|-----|---------|-------|------|
| 1 | **Tu-Vi "Can" label systematically wrong** — Android hardcoded a fabricated heavenly-stem per animal (`"Canh Tý"`…); the stem cycles every 10 years so it was correct for only one birth year per animal. Web uses the chi only (`"Tý"`…). | Tools | `fortune/tuvi/CanChiData.kt` | Correctness |
| 2 | **Tarot reversed-card odds** were 0.4 vs Web's 0.5. | Tools | `fortune/tarot/TarotCard.kt` | Correctness |
| 3 | **Memory screen flashed the empty state during load** (no spinner) — Web shows a loader until the GET resolves. | Profile | `memory/MemoryViewModel.kt`, `memory/MemoryScreen.kt` | Loading state |
| 4 | **Deals missing MFS-3.10 commercial-nature disclosure** + curated-count subtitle. Compliance obligation. | Discovery | `deals/DealsScreen.kt`, `strings_deals.xml` (+vi) | Compliance |

**Verification:** `assembleDebug testDebugUnitTest` → BUILD SUCCESSFUL, unit tests green. Emulator relaunch → process alive, 0 crashes. `grep TEMP_VERIFY_HACK` → 0. (Deals/Fortune screens sit behind auth, so their on-screen appearance is Owner UAT; changes are compile- and test-verified and low-risk.) Also aligned Tu-Vi zodiac-animal emoji to the Web set as part of #1.

---

## B. Implementable on Android now — category-1 backlog (reuse existing endpoints, no new business logic)

These are genuine parity gaps that can be closed purely on Android against **existing** backend contracts. They are **not yet implemented** — several are large multi-file features and are itemized here for a dedicated follow-up rather than rushed into one changeset. Ordered by value.

### Reviews / Social
- **B1 — Comment posting & deletion.** Android comments are read-only. Web posts `POST /api/reviews/{id}/comments {body}` (1–300 char, rate-limited) and `DELETE …/comments?commentId=`. Add the two API methods + a composer row + optimistic count. *(medium)*
- **B2 — Photo & URL composer modes.** Android composer only does text + video; Photo and Link tabs render a decorative non-clickable placeholder. Web uploads photos via `POST /api/reviews/upload` and detects YouTube/TikTok/Facebook via `/api/explore/oembed`. `CreateReviewRequestDto` also lacks `photos` and `source_url`. *(large)*
- **B3 — Follow / unfollow.** Absent on Android; Web posts `POST /api/users/{id}/follow`. `UserProfileDto` already carries `is_following`/`follower_count`/`is_self` but the VM discards them. *(medium)*
- **B4 — Feed tabs (For You / Latest / Following).** Android always calls `getFeed()` with default sort; Web offers `sort=trending` (+city boost), `latest`, and `following=true` — all already supported by `/api/reviews/feed`. *(small-medium)*
- **B5 — Review detail chrome.** Missing rating label, verified badge, address, attached-music card, and the "Ask Tappy about this place" → chat CTA. *(small-medium)*
- **B6 — Liked reviews collection.** No "liked" surface on Android; Web's profile has Posts/Saved/**Liked**. *(medium)*
- **B7 — Notifications enrichment.** Missing follow-back button on follow rows (depends on B3). *(small)*

### Chat / AI / Scan
- **B8 — Incremental streaming display.** `streamAssistantReply` buffers the whole reply into a `StringBuilder` and only shows it after the stream closes; Web fills the bubble token-by-token. *(small-medium)*
- **B9 — `[TAPPY_PLAN]` itinerary card.** Android strips and discards the plan payload; Web renders a structured `TripPlanCard`. *(medium)*
- **B10 — Dynamic suggested prompts.** `GET /api/suggested-prompts` is never consumed; Android uses a static per-category table. Also drives Home (B13). *(small)*
- **B11 — Scan camera full-res capture.** Uses `TakePicturePreview()` (thumbnail) → poor OCR; switch to `TakePicture()` + FileProvider full-res through the existing downscale path. *(small)*
- **B12 — Chat quick-action chips + manual "save place" button.** Web shows Nearby/Tonight/Trip/Price-watch chips above the composer and a per-reply save-place button (`POST /api/favorites`). *(small-medium; "Nearby"/userLocation needs a location source)*

### Home / Tools
- **B13 — Home suggested-prompts + richer greeting.** `SuggestionsSection` is permanently Empty; `/api/suggested-prompts` unused. *(small)*
- **B14 — Split-Bill screen.** Entirely absent from Android source (only referenced in a doc; the earlier "completed" task left no code). Pure client-side calculator (people 2–20, tip presets, equal/custom split). *(small)*
- **B15 — Tarot full 78-card deck.** Android ships 22 Major Arcana only; Web has 78 (Major + Minor). Port `buildMinorArcana()`. *(medium; data port)*
- **B16 — Tu-Vi / Zodiac lucky number + lucky color** (and Ngũ hành for Tu-Vi). Web shows these from the fortune banks; Android's models lack the fields. *(small)*
- **B17 — Sound Detail "videos using this sound" grid.** Backend returns `videos[]`; Android's DTO omits it and shows only a text count. Add clickable grid → `/reviews/[id]`. *(small-medium)*
- **B18 — Sound Detail CC-BY attribution line.** Licensing obligation for the 100 hotlinked Jamendo tracks; Web derives "{artist} · CC-BY · Jamendo" from the audioUrl. *(small)*
- **B19 — Sound save/follow/report → login redirect on 401** (anon users currently get a generic error toast). *(small)*
- **B20 — Price-watch card date+time format + "will check soon" placeholder** (Android shows date-only English month, omits the never-checked placeholder). *(small)*
- **B21 — Preferences loading spinner + inline save-error** (Web shows both; Android has neither). *(small)*
- **B22 — Deals header per-category color chip** (Android folds category into the source line as plain text). *(small; extends the fix in §A-4)*

> **Larger architectural category-1 items** (implementable but each a significant, standalone effort): **B2** (photo/URL composer), and — listed under §D because they need a new dependency or a shell/auth change — **video playback (media3)** and **anonymous/guest access**.

---

## C. Backend-missing — STOP & report (category 2)

Cannot be closed on Android without a backend change; **not implemented** per "reuse existing APIs, never invent business logic."

- **C1 — Zalo login.** Web offers Google/**Zalo**/Email (`product.ts` `AUTH_PROVIDERS`). Android has no Zalo flow; the Zalo web flow relies on a browser cookie session + a Vietnam-IP profile fetch. Needs a mobile token/deep-link contract (the `zalo-finish` page already has an iOS custom-scheme branch — backend is partway there).
- **C2 — Preferences gender persistence.** Web writes gender to Supabase auth metadata directly (`supabase.auth.updateUser`), which native can't call; `PATCH /api/profile` and `/api/preferences` accept no `gender` field.
- **C3 — Account "join date".** `GET /api/profile` SELECTs `created_at` but omits it from the JSON; add it to the response, then Android can render the row.
- **C4 — Memory "updated {date}" banner.** Depends on `/api/memory` returning `updated_at` to the client (verify/expose).
- **C5 — Bookings list cap.** `/api/bookings` caps at 20 most-recent; Web's page bypasses via direct DB. Raise/paginate.
- **C6 — Profile conversation-count pill.** Needs a conversation-count field/endpoint for native (Web computes server-side).
- **C7 — Chat analytics (`/api/track`).** Web fires `chat_response_received` / `chat_search` (a `REBUILD_SIGNALS` personalization event). No Android client tracker found — Android usage contributes nothing to the learning signal. Needs a native tracking path.

---

## D. Product-decision — STOP & report (category 3)

Deliberate divergences or capabilities whose native form is a product call, not a bug.

- **D1 — Login provider set.** Android hardcodes Google/**Facebook**/Email and ignores `/api/config` `auth.providers`. Web's contract is Google/**Zalo**/Email — Facebook is NOT offered on Web (not in `AUTH_PROVIDERS`), yet Android shows it (per the earlier owner "build Facebook anyway" decision), and omits Zalo (see C1). **Owner ruling needed:** hide Facebook to match Web, and drive the button list from `/api/config`?
- **D2 — Anonymous / guest access.** Web lets guests browse the whole app (5 AI questions/day) via `/api/auth/anonymous` (documented as the native contract); Android is a hard login wall. Implementable (backend exists) but it re-architects the app's entry/gating model — **owner should confirm the login-first native stance** before building.
- **D3 — Video playback in feed/detail.** Android shows a static poster + play icon; Web plays clips inline. Implementable but needs the **androidx.media3** dependency + player lifecycle keyed to the visible page. Confirm we want in-app playback on native. *(category-1-capable, infra-adjacent)*
- **D4 — Primary tab set.** Web bottom nav = Home/Chat/Explore/**Deals**/Profile; Android = …/**Maps**/Profile (Deals demoted to a Home quick-action, Maps promoted). No screen unreachable either way.
- **D5 — Email + password registration.** Web `/register` has password sign-up; Android is passwordless Email-OTP only (functionally covers onboarding).
- **D6 — Tu-Vi Lifetime / By-Year modes & date-seeded daily variation; Zodiac date-seeded readings.** Android uses 3 static readings per sign/animal; Web generates date-seeded readings via `fortuneEngine.ts` and adds Lifetime + By-Year engines. Full engine port is a large scope decision (the cheap lucky-field parts are B16).
- **D7 — Minor chat/scan affordances:** emoji picker, memory indicator chip, image lightbox/zoom, first-run onboarding modal, scan TXT/DOCX export (the last is already a documented intentional native scope decision).
- **D8 — App-shell chrome density:** Web header carries greeting + avatar + inline theme toggle; Android app bar is title-only (theme toggle lives in Settings). Theme + language persistence themselves are at parity.

---

## E. Infrastructure — STOP & report (category 4)

- **E1 — Push notifications (native).** Both the Notifications settings toggle (currently a cosmetic in-memory switch) and the **Deals daily 7:30 push** rely on Web-Push/VAPID, which doesn't apply to Android. Needs **FCM** + a device-token registration endpoint. (This is why §A-4's Deals disclosure omits the Web's "turn on notifications" clause — that toggle doesn't exist on Android yet.)
- **E2 — Share canonical URL.** Android review/sound share sends composed text instead of a `/reviews/{id}` link because no production domain is configured for deep links.

---

## F. Verified AT PARITY (no gap) — for the record

Currency · Translate · VietWriter · Games (SuperTux WASM) · Music Library (browse/search/report) · Fortune hub · Recommendations/For-You · Deals data contract · Price-watch contract (list/cancel/VND format) · Edit profile (name/bio/avatar, 3MB validation) · Onboarding wizard · Group dining (create/join/detail/AI-suggest) · Service booking form · Memory cards + response-style · Bookings list + review CTA · Settings (sign-out, language, terms/privacy, delete-account email Path B) · Video upload (Blob client-upload handshake) · My Reviews (incl. hidden) · Chat message-feedback (like/dislike/report) · Chat conversation save/resume · Chat history · Scan resize/MIME/error mapping · Theme & language persistence · Email-OTP validation.

---

## G. Summary counts

- **Fixed this sprint:** 4 (correctness ×2, loading-state ×1, compliance ×1).
- **Category-1 backlog (implementable on Android now):** ~22 items (B1–B22) — several small, a few large (photo/URL composer, 78-card deck, feed tabs, comment/follow systems).
- **Category-2 backend-missing:** 7 (C1–C7).
- **Category-3 product-decision:** 8 (D1–D8).
- **Category-4 infrastructure:** 2 (E1–E2).

**Honest status:** the category-1 backlog is real and large. This sprint closed the highest-confidence correctness/compliance items with full build+test verification; the remaining B-items are itemized against existing endpoints so they can be worked through in follow-up passes (each built + runtime-verified individually) without guesswork. The C/D/E items require an owner or backend decision before any Android work.
