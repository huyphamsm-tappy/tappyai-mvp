# 11 — Android Migration Guide

**Web reference commit:** `79d05f3` · **Android state assessed:** working tree, 2026-07-25

---

## 0. How to read this document

Every Web feature is classified into exactly one of four buckets:

| Class | Meaning |
|---|---|
| **READY** | A native implementation exists and already calls the Web backend. Verify parity; do not rebuild. |
| **NEEDS NATIVE** | The backend is reusable, but Android has no implementation or only a placeholder. This is the build list. |
| **BLOCKED** | Cannot be completed until the backend provides something that does not exist yet. Requires owner sequencing. |
| **WEB ONLY / N-A** | Deliberately not an Android concern. |

A fifth state cuts across all of them: **GATED OFF** — built on both platforms but switched
off by product decision. Do not "fix" these.

---

## 1. ⚠ Critical state findings — read before planning any sprint

### 1.1 The committed Android tree does not build

`git status --porcelain -- android/` returns **117 entries**. Only **one** commit has ever
touched `android/`. Everything since is working-tree only.

**Untracked build-critical files:**
- `android/settings.gradle.kts`
- `android/gradle/libs.versions.toml`
- `android/gradle/wrapper/*` (jar + properties)
- `android/gradlew.bat`

A clean checkout has **15 `build.gradle.kts` files that all reference `libs.*` version-catalog
aliases** and **no `settings.gradle.kts` to include the modules**. It cannot build. There is
also **no POSIX `gradlew`** at all — only `gradlew.bat` — so Linux/macOS CI has no wrapper.

**Also uncommitted:** the entire Play Store release kit (`docs/release/android/**`, 25 files),
all four repo-root `ANDROID_*_2026-07-17.md` reports, and `android/docs/adr/0004-*.md`.

**This is the highest-priority Android action item and it is not a code change.**

### 1.2 Every Android-facing status document is stale — do not plan from them

| Doc | Date | Verdict |
|---|---|---|
| `android/docs/FEATURE_STATUS.md` | 2026-07-13 | **VERY STALE — do not use.** Claims most features have "No backend/persist" and Chat has "No AI/network yet". Contradicted by the code: nearly every feature now has a real `data/` package hitting a live endpoint. |
| `android/docs/Android_Architecture.md` §6 | undated | **VERY STALE.** 54-feature matrix marks essentially every row NOT_STARTED. A pre-implementation planning artifact. §7 Freeze Rules and the module-boundary sections remain useful. |
| `docs/Android_Sprint_Go_NoGo.md` | pre-sprint | Verdict "GO WITH CONDITIONS". Its blocker (1) — no per-user Supabase-JWT bearer verification — appears resolved (Android now calls 41 authed endpoints), **but that should be re-verified on the web side**. Blocker (2) — `GET /api/context` does not exist — is still true. |
| `ANDROID_FINAL_CERTIFICATION_2026-07-17.md` | 2026-07-17 | Claims "zero known Android bugs". **The document itself discloses that all four audit agents hit the API rate limit and terminated early**, and the audit was redone via grep sweeps. **Treat the zero-bugs claim as low-confidence by its own admission.** |
| `docs/release/android/FINAL_WEB_PARITY_REPORT_2026-07-18.md` | 2026-07-18 | **The single most useful gap inventory** (B1–B22 implementable, C1–C7 backend-missing, D1–D8 product decisions, E1–E2 infra). Partly superseded — B1–B4 and D3 are now implemented. |
| `docs/release/android/RC_AUDIT_REPORT_2026-07-18.md` | 2026-07-18 | Most recent RC signal. Release blocker N1 (blob-token `type` dropped by `encodeDefaults=false`) fixed. |

**This freeze package supersedes all of them.**

### 1.3 The Play Store release kit predates the current feature set
The kit targets versionCode 1 / 0.1.0 and was generated 2026-07-17 — **before** video
playback, the photo composer, follow, and feed tabs landed. **Data-safety and permissions
answers must be re-derived** against the current manifest and the new media/upload paths.

---

## 2. Android baseline as frozen

| Item | Value |
|---|---|
| applicationId / namespace | `com.tappyai.app` |
| minSdk / targetSdk / compileSdk | **26 / 35 / 36** |
| versionCode / versionName | 1 / 0.1.0 |
| UI | Jetpack Compose (BOM 2024.12.01), Material3, Navigation-Compose type-safe `@Serializable` routes |
| DI | Hilt 2.52 (KSP) |
| Networking | Retrofit 2.11.0 + OkHttp 4.12.0, `SafeApiCall`/`NetworkResult` wrapper |
| Serialization | kotlinx.serialization 1.7.3 (`ignoreUnknownKeys`, `isLenient`, `coerceInputValues`) |
| Auth SDK | supabase-kt 3.0.3 (auth only) + Credential Manager 1.3.0 |
| Media | media3 / ExoPlayer 1.5.0 |
| Modules | `:app`, 12 × `:core:*`, and **`:features:auth` — the only feature module** |
| Permissions | **only `INTERNET` + `ACCESS_NETWORK_STATE`** |
| Tests | **4 unit test files. No instrumented or UI tests.** |

**Release builds are hard-gated:** `assembleRelease`/`bundleRelease` throw unless all nine
`TAPPYAI_*` Gradle properties are supplied (Supabase URL/anon key, Google web client id, web
app URL, release API base URL, 4 keystore props). **[SEC][STAB]** A release artifact cannot
be produced with placeholders.

**Shell:** 5 tabs — Home / Chat / Explore / Maps / Profile.
**Web** bottom nav is Home / Chat / Explore / **Deals** / Profile. Deals is a Home
quick-action on Android — a deliberate, documented divergence.

---

## 3. Backend reuse — the core of this guide

**Android already calls 41 distinct Web endpoints.** The backend is genuinely shared; this is
the migration's biggest asset.

### 3.1 Auth transport contract — READY
`core:network/AuthInterceptor` attaches `Authorization: Bearer <supabase access token>`;
`TokenAuthenticator` retries once on 401 via `SessionRefresher`. Tokens live in
`EncryptedTokenStorage` (androidx.security-crypto).

Every Web route that uses `getRequestUser(req)` accepts that Bearer token **identically to a
cookie session**. See `03_Backend.md` for the exhaustive list — and for the routes that are
**cookie-only** and therefore unreachable with a Bearer token.

**Known real gap:** `inferFromBooking()` inside `POST /api/bookings` **silently no-ops for
Bearer callers.**

**Session mechanics worth flagging:** supabase-kt 3.0.3 stores sessions **in memory only**, so
`AuthRepository` manually re-imports tokens from `EncryptedTokenStorage` on first collection
and re-persists on every `Authenticated` status. `currentUserId()` decodes `sub` from the JWT
rather than calling the SDK.

### 3.2 Endpoints Android does NOT yet call
`/api/suggested-prompts` · `/api/track` · `/api/version` (PWA-only) · `/api/auth/anonymous` ·
`/api/auth/zalo*` · `/api/notifications/subscribe` · `/api/notifications/broadcast` ·
`/api/comments/[commentId]/reactions` (new) · `/api/deals/[id]/click` (new).

`/api/context` **does not exist server-side**, yet `core/database/CachedContextEntity` caches
it — dead scaffolding, delete it.

### 3.3 The `/api/config` contract — currently ignored by Android **[STAB]**

Web serves every product number from one place. Android **hard-codes the equivalents as Kotlin
`const val`s**, which is exactly how the 15 s/60 s drift bug happened on Web.

Live production contract:
```json
{"freemium":{"freeDailyLimit":15,"anonDailyLimit":5},
 "flags":{"showProUpgrade":false,"showAppConnections":false},
 "upload":{"maxPhotosPerReview":6,"maxVideoSizeMb":50,"maxVideoDurationSec":60},
 "auth":{"providers":[google,zalo,email — all enabled]},
 "onboarding":{6 interests, 8 cities}}
```

**Android must consume this rather than mirroring it.** `android/docs/adr/0004` proposed
exactly that and is still **Status: Proposed (Deferred)** — and untracked. Note also that
`MAX_VIDEO_DURATION_ACCEPT_SEC = 62` is deliberately **absent** from the payload; **62 must
never appear in any UI, on any platform.**

---

## 4. Feature classification

### 4.1 READY — native implementation exists and calls the Web API

Verify parity against `06_UI_UX.md` and `03_Backend.md`; do not rebuild.

| Domain | Android state |
|---|---|
| **Chat** | Streaming via raw OkHttp (`RealChatRepository.kt:78`), message feedback, conversation history, save/resume |
| **Reviews** | Feed + For You/Following/Latest tabs, detail, comments (posting), like/save/share, follow, composer (text/photo/video/URL), My Reviews, notifications list, video playback + watch analytics |
| **Music** | Browse, search, detail, play, save, follow, report |
| **Profile** | Profile/Account/Edit, Preferences, Memory, Saved/Favorites, Settings (theme, language, sign-out, legal) |
| **Commerce-adjacent** | Bookings + service-detail booking, Price watch (list/cancel), Deals (read), Recommendations |
| **Group dining** | Create / join / detail / AI-suggest |
| **Utilities** | Currency, Translate, VietWriter, Scan, Onboarding |
| **Auth** | Google (Credential Manager → Supabase IDToken), Email OTP (passwordless) |

### 4.2 NEEDS NATIVE IMPLEMENTATION — the build list

Ordered by user impact.

| # | Item | Why it matters | Reference |
|---|---|---|---|
| 1 | **Incremental token-by-token chat rendering** | Android renders whole-message. Web reveals a few chars per animation frame via `useSmoothText`, decoupling display from network burst size — a measured fix for visible block-jumps | `08_Bug_History.md` `6ad3e49` |
| 2 | **`[TAPPY_PLAN]` itinerary card** | The trip brochure is a flagship surface. Note Web's hard rule: **never splice text into the plan JSON — edit the parsed object and re-serialize** | `05_AI.md`; bug `9eddc74` |
| 3 | **Map rendering** | `maps/MapCanvas.kt:24` renders a styled placeholder. maps-compose is pinned but unapplied. Search/list/detail are real and backed by `/api/favorites` | — |
| 4 | **Location** | Zero `FusedLocationProvider`, zero location permission. Blocks chat `userLocation` bias, the "Nearby" chip, and the For-You city boost | — |
| 5 | **Push notifications** | `NotificationsViewModel` toggle is a `MutableStateFlow(false)` with an explicit comment: no push engine, permission request, persistence or backend. **No FCM**; firebase-bom pinned but unused; no `POST_NOTIFICATIONS` permission | `07_Features.md` |
| 6 | **`/api/track` analytics** | `LoggingAnalyticsProvider` logs only — **Android contributes nothing to the personalization signal**, so recommendations degrade for Android users | — |
| 7 | **`/api/suggested-prompts`** | Home + Chat suggestion chips | — |
| 8 | **Comment replies + reactions** | New in this freeze: one-level threading (`parentId`) and 6 reactions with `my_reaction`. Android has comment posting but not these | `04_Database.md` §1.4 |
| 9 | **Split Bill** | **Does not exist in Android source.** Pure client math, no backend — cheap to build. A 2026-07-17 report claiming it complete was **false** | — |
| 10 | **Deals click counter + promo UI** | `POST /api/deals/[id]/click`, discount badge, countdown, copyable voucher chip | `04_Database.md` §1.6 |
| 11 | **App Links / assetlinks.json** | Only custom-scheme `tappyai://` exists. Real `https://<origin>/reviews/{id}` and `/group/{id}` links do **not** open the app; share sheets send composed text instead of URLs | — |
| 12 | **`/api/config`-driven flags and upload limits** | See §3.3 | ADR-0004 |
| 13 | **Fortune parity** | Android has 22 Major Arcana vs Web's 78 cards, and 3 static readings/sign vs Web's deterministic date-seeded engine. No `fortuneEngine.ts` port | `07_Features.md` |
| 14 | **Sound-detail videos grid + CC-BY attribution** | Legal requirement for CC-BY tracks | — |
| 15 | **Liked-reviews collection** | Profile tab parity | — |

### 4.3 BLOCKED — needs backend work first

| Item | Blocker |
|---|---|
| **Zalo login** | **Not implemented anywhere in Kotlin.** Web's flow is unportable by design: the callback exchanges code→token server-side, then a **browser on a Vietnamese IP** must call `graph.zalo.me/v2.0/me` (Zalo returns `-501` outside Vietnam) and POST the profile back. A mobile token/deep-link contract is required. See `08_Bug_History.md` `0f71082`. Backend partially prepared: `auth/zalo/*` already accept `platform=android`. |
| **Anonymous / guest tier** | Android is a hard login wall; `/api/auth/anonymous` unused. Web gives 5 free questions/day to anonymous users — a top-of-funnel mechanism Android currently forfeits |
| `gender` persistence, profile `created_at`, memory `updated_at`, bookings pagination, conversation count | Fields/paging not exposed by the API |

### 4.4 GATED OFF — built, deliberately switched off on BOTH platforms

**Do not "fix" these. Flipping any of them requires flipping Web and Android together.**

| Feature | Web gate | Android gate |
|---|---|---|
| Membership / Pro | `SHOW_PRO_UPGRADE = false` | `ProfileScreen.kt:81` |
| App Connections | `SHOW_APP_CONNECTIONS = false` | `ProfileScreen.kt:87` |
| Facebook login | `AUTH_PROVIDERS.facebook.enabled = false` | `LoginScreen.kt:40` |
| Music upload (UGC) | live on Web | `TappyComingSoonSheet` |

**Android has no payments of any kind** — no Stripe, no Play Billing. Given
`showProUpgrade: false`, that is correct for V1.

### 4.5 WEB ONLY / NOT APPLICABLE

`admin/*` back office · `cron/*` · `webhooks/*` · `iap/*` (iOS) · `/api/version` (PWA
version watcher) · Web-Push/VAPID (Android uses FCM) · email+password `/register` ·
the browser-cookie Zalo flow · SuperTux (Android wraps the Web game in a `WebView` — a
native shell over web content, and acceptable as-is).

---

## 5. Behavioural contracts Android must preserve

These are not style preferences. Each one is the settled outcome of a production bug — the
root causes are in `08_Bug_History.md`.

1. **Video playback is driven by an `active` flag from the feed, not a per-item observer.**
   Web tried per-video IntersectionObserver and it raced with the feed's own tracking.
2. **Use a self-healing watchdog, not an enumerated state machine, for media.** Web needed
   **eleven** commits before landing a 300 ms watchdog that re-issues `play()` on the active
   clip whatever paused it. **Port the watchdog, not the ten failed attempts.** ExoPlayer has
   the same finite-decoder constraint that forced Web's ±1 video window.
3. **Feed back-restore must key on clip ID, not index** — the trending feed re-orders between
   fetches. Persist active clip id + feed type; restore by id; fall back to top if absent.
4. **Never splice text into a machine-parsed region** (`[TAPPY_PLAN]`, `[CTA_BUTTONS]`,
   `[FOLLOWUPS]`). Edit the parsed object and re-serialize.
5. **The LLM rewrites place names.** Any client-side matching of a reply to tool data must use
   a tolerant cascade, not `indexOf`. Web's is `placeMatch.ts`.
6. **`reviews.comment_count` is unreliable** — the maintaining trigger is RLS-blocked for
   ordinary users, and since `20260720` it counts replies as comments. Use the authoritative
   `count` returned by the comments API.
7. **Filter the place-less sentinel.** Posts without a place carry `place_name` = "Chia sẻ"
   (and, in older rows, the un-diacriticked "Chia se"). Both variants must be filtered from
   place chips, CTAs and recommendations.
8. **Distinguish permanent from transient upload failures.** Web's worst outage was a
   permanent failure classified as retryable, producing a silent two-week hang instead of an
   error.
9. **Quota copy is backend-owned.** `/api/chat` 401/429 bodies carry the user-facing `message`
   with the limit baked in; render it verbatim rather than composing your own.
10. **Modals must handle system Back.** On Web every overlay is state-driven and does not push
    history — a known Web defect. **Android must not replicate it**: system Back is a
    first-class Android affordance and must close the sheet.

---

## 6. Divergences that are approved, not bugs

| Divergence | Status |
|---|---|
| Android tab 4 = Maps; Web tab 4 = Deals (Home quick-action on Android) | Approved (D4) |
| Android has no email+password registration (OTP only) | Approved (D5) |
| Android Games = `WebView` over the Web SuperTux hub | Approved |
| TikTok login | Deferred — `android/docs/adr/0002` |
| Delete Account | **No self-service backend exists on Web or backend.** Owner authorised "Path B": in-app *request* deletion by email, mirroring Web. This is the only thing satisfying the Play Store account-deletion requirement |

---

## 7. Recommended sequencing

**Phase 0 — unblock (not feature work).** Commit the Gradle foundation, add a POSIX `gradlew`,
commit the release kit and ADRs, re-derive Play data-safety answers against the current
manifest. Nothing else can be trusted until a clean checkout builds.

**Phase 1 — close behavioural parity on shipped features.** Comment replies/reactions,
`/api/config` consumption, `/api/track`, suggested prompts, deals click + promo UI. All are
small, all reuse existing backend.

**Phase 2 — the visible gaps.** Incremental chat rendering, `[TAPPY_PLAN]` card, Split Bill,
liked-reviews, fortune parity.

**Phase 3 — platform capabilities.** Location, map rendering, FCM push, App Links.

**Phase 4 — owner-sequenced.** Zalo login and the anonymous tier, both of which need a backend
contract decision first.

---

## 8. iOS — status note only

`ios/` is a real XcodeGen Swift/SwiftUI project (165 `.swift` files, bundle `com.tappyai.ios`,
deployment target 16.0, Swift 6 strict concurrency) with feature directories for Auth, Chat,
Discovery, Home, Music, Notifications, Profile, Reviews, UtilityTools over a `Core/` layer.

Its state is **ambiguous and internally contradictory**: `ios/README.md` describes it as
"Phase 0 Foundation + Phase 1 Auth — all other product tabs are placeholders" and
`App/Shell/` still contains `PlaceholderShellView.swift`, while the last two commits are
titled "complete iOS app" and a parity sync. Unlike Android, iOS **does** claim Zalo and
anonymous-session auth, and has `Core/Location` and `Core/Payments` layers Android lacks.
iOS is fully committed (no uncommitted iOS work). It cannot be built or verified here.

**iOS is out of scope for this freeze and its status is NOT VERIFIED.**
