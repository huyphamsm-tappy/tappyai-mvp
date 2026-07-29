# 06 — UI / UX

**Frozen commit:** `79d05f3` · **58 pages** · **91 API routes** · **52 shared components**

Every path below is relative to the frozen checkout. This document freezes *what the UI does*,
so an Android engineer can rebuild behaviour natively without reading every React file.

---

## 1. Shell and route inventory

**58 pages** under `src/app/**/page.tsx`. Route handlers not counted: `auth/callback`,
`auth/confirm`, `games/supertux`, `.well-known/apple-app-site-association`.

Shell files: `src/app/layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, and
`src/app/admin/layout.tsx`. There is **no `template.tsx`, no route groups, no parallel or
intercepting routes, and no per-route `loading.tsx`** other than the root one.

Globally mounted in `layout.tsx`: `PostHogProvider`, `LocationProvider`, `TrackingProvider`,
`LanguagePicker`, `VersionWatcher`.

---

## 2. Landing / Home — `/`

`src/app/page.tsx` (RSC) → `src/app/HomeView.tsx` (client).
**No auth gating** — guests see everything; only the greeting and recent-conversations block
are user-conditional. Data comes from Supabase directly, not an API route.

Section order: Hero (+ `SearchBar variant="hero"`) → CategoryPills → Fortune 3-up →
Scan card → Tappy Together → Recommendations + Music → Tools 2×2 → Content writer →
AI suggestions → Recent conversations / empty state / guest prompt.

**Time-of-day hero copy — deliberately deterministic.** The server computes VN time
(`Date.now() + 7h`), picks a slot from 7 hour-ranges × weekday/weekend, then indexes by
`dayOfMonth % texts.length`. **Deterministic, not random — this is what prevents a hydration
mismatch.** **[STAB]** Vietnamese variants live server-side; the English mirror is a separate
client-side table with fewer variants.

**Background layer** — `HomeBackground.tsx` renders `fixed inset-0 -z-10 hidden md:block`, i.e.
**desktop/tablet only; mobile never fetches the asset**. **[COST]** Single asset
`/backgrounds/home-desktop-v5.webp`, `unoptimized`, non-priority. Dark overlay
`rgba(0,0,0,0.4)`; no light overlay in V1. `getActiveBackground()` is a pure resolver that
currently always returns the default — the time/weather/season/city dimensions are a declared
seam, **not implemented**.

---

## 3. Authentication

### `/login`
Desktop-first centred card (`max-w-6xl`, `rounded-[28px]`) with
`grid lg:grid-cols-[1fr_minmax(340px,400px)]` — brand + mascot hero + 4 feature bullets on the
left, sign-in card on the right. Brand mark is the **mascot** (`pose="wave"`), not a logo file.
Mascot hero `/tappy/welcome.png` plus 5 floating emoji chips animated by an inline keyframe.

**Providers rendered:** Google, Zalo, and a **"Continue as Guest"** button (`handleGuest`
simply routes to the return destination — it creates no session). Facebook is behind
`AUTH_PROVIDERS.facebook.enabled = false`. **Email OTP is hidden from the normal card**
(`SHOW_EMAIL_OTP_IN_CARD = false`) but **still renders inside the in-app-browser fallback**,
because it is the only provider that works in Zalo/Facebook webviews.

**In-app-browser detection [STAB]** — UA sniff for FB/Messenger/Instagram/Zalo/LINE/TikTok/
WeChat → amber warning card + "Open in Chrome"
(`intent://…#Intent;scheme=https;package=com.android.chrome;end`, Android only) + copy-link +
the email OTP block.

`?error=zalo_failed` is consumed once then stripped via `history.replaceState`. Already-logged-in
users are bounced with `router.replace` **deliberately, to avoid an iOS Safari Back loop**, and
re-checked on `pageshow` (bfcache).

### `/register`
Email+password `signUp`. **Not linked from the production `/login`** — reachable only by direct
URL.

### `/onboarding`
Two steps with a 2-segment progress bar: interests multi-select, then city. **Catalogs come
from `src/lib/config/product.ts` — the same list `/api/config` serves native clients.** Uses
`router.replace` so Back skips onboarding. Both steps have a Skip.

### `/auth/zalo-finish`
Spinner-only interstitial. Reads `#at` / `#next` / `#platform` from the URL **fragment**, calls
`graph.zalo.me/v2.0/me` **client-side** (Zalo only answers Vietnamese IPs), POSTs to
`/api/auth/zalo/complete`, then `location.replace`. **[SEC]** The token travels in the fragment
so it never reaches the server and never appears in logs.

### Anonymous mode
`middleware.ts` does **no route-level auth redirects except `/admin/*`** — it only refreshes
Supabase cookies, using `getUser()` (not `getSession()`) deliberately. Quotas are backend-owned
(5 anonymous / 15 free per VN day). Chat surfaces `anon_limit_reached`, `free_limit_reached`
and `auth_required` as **distinct in-thread cards**. The anonymous transcript survives the
login round-trip via `sessionStorage['tappy_pending_chat']`. Everywhere else the gate is
interaction-level: `requireLogin()` → `/login?returnTo=…`.

---

## 4. Chat — `/chat`, `/chat/[id]`

Both wrap `src/components/ChatInterface.tsx` (**1466 lines — the largest file in the repo**).
`/chat/[id]` redirects unauthenticated users and `notFound()`s if not owned.

### Marker parsing — order matters
1. `parsePlan` → `[TAPPY_PLAN]{json}[/TAPPY_PLAN]` → `TripPlanCard`
2. `parseCTA` → `[CTA_BUTTONS]{json}[/CTA_BUTTONS]` (with a bare-tag fallback)
3. `parseFollowups` → `[FOLLOWUPS]a|b|c[/FOLLOWUPS]`, **line-bounded**, max 3, with an
   orphan-marker strip so protocol tokens can never render

Then `formatMessage()`: **`escapeHtml` first** **[SEC]**, then image-run → horizontal
scroll-snap strip, markdown links, bare URLs, headings, bold, boundary-guarded italics (so URLs
survive), lists. Injected via `dangerouslySetInnerHTML`.

### Streaming UX
- `useSmoothText(target, active)` — a rAF typewriter revealing `max(2, gap/8)` chars per frame
  with ease-out catch-up, snapping to full text at stream end. **Decouples render from network
  burst size.**
- `.streaming-cursor::after` = `▋` blinking at 1 s step-end.
- Pre-first-token: three typing dots plus a rotating hint. **If a tool is running the hint is
  tool-specific** — `TOOL_HINTS` maps 10 tool names to `[vi, en]` strings.
- Stop button replaces Send while loading.

### Mascot
18 canonical poses. `getTappyPose()` priority: error → sorry, success, listening → speaking,
searching (or `delivery` for food), streaming → thinking, welcome, category map, else wave.
Assets `/tappy/<pose>.png` with an **emoji fallback on `onError`** **[STAB]**. Motion via CSS
classes; all GPU transform/opacity; `prefers-reduced-motion` disables them.

### Place cards and CTAs
CTA types: `maps | call | zalo | website | booking | search | internal_booking`.
`internal_booking` is intercepted: it **awaits the in-flight conversation save** (2 s deadline
poll) so Back lands on `/chat/{id}` rather than `/chat`, then refreshes and pushes. **[STAB]**
Each internal_booking button carries an optimistic `FavoriteToggle` that rolls back on throw.
A separate `SavePlaceButton` opens an inline input auto-filled from the first bold token or the
booking URL's `name` param, and **only shows ✓ on a real 2xx**.

### Trip plan brochure
`TripPlanCard.tsx` — gradient header, day tabs when `days.length > 1`, vertical timeline with a
time gutter, per-item colour by category, price pill, Maps + booking links, cost-breakdown
table, share footer (`navigator.share` → clipboard fallback). Production adds
`PlanItem.photo_url` — a server-matched image injected by `streamEnrichment.injectPlanPhotos`,
rendered with `onError` hide.

### Follow-up chips
Only on the **latest** assistant message and only when not loading. `animate-pop-in` with a
70 ms stagger; tapping appends as a user turn.

### Message action bar
Copy · Share · ThumbsUp · ThumbsDown · TTS · Regenerate (**only on the last message**) · "…"
menu (Copy Plaintext / Copy ID / Report). Like and dislike are mutually exclusive.
**All labels are hardcoded Vietnamese.**

### TTS
`speak(msgId, text, langCode)` — language comes from the chat pipeline's own `detectLang()`,
**no longer hardcoded `vi-VN`**. `loadVoices()` awaits `voiceschanged` with a 1000 ms safety
timeout because Chrome returns `[]` on the first synchronous call. **`pickVoice()` never returns
a wrong-language voice**; if none exists it sets `unavailableLang` and stays silent, and the UI
renders a notice in the voice-status line. Player bar: play/pause, ±15 s, elapsed, progress,
speed cycle 1 → 1.5 → 2. **Progress is estimated (`CPS = 13`), not real** — there is no
boundary-event tracking.

### Other chat surfaces
Mood chips (6) · quick prompts (category-static, or VN-hour-dynamic for `general`, with an EN
mirror) · action chips (Nearby triggers geolocation + Nominatim reverse-geocode; Tonight; Trip;
Price-watch) · emoji panel · **voice input** (Web Speech, `lang='vi-VN'` still hardcoded, with a
**2 s cancellable auto-send grace window** and a 5-case error taxonomy) · image attach
(`capture="environment"`, object URLs revoked on unmount) · image lightbox · an in-chat
onboarding modal gated by `localStorage['tappy_onboarded']` · textarea autogrow capped at 160 px,
Enter sends / Shift+Enter newline.

---

## 5. Reviews / video — `/reviews`

**Production split the former 1631-line page into three files** because Next.js forbids extra
named exports from a page file and the regression tests import these components:

| File | Lines | Role |
|---|---|---|
| `reviews/page.tsx` | 1063 | Shell: TikNav, Sidebar, InboxTab, feed state |
| `reviews/feedShared.tsx` | **534, new** | `Post`, `CommentDrawer`, `ShareModal`, `Carousel`, `isShareOnlyName` |
| `reviews/ProfileTab.tsx` | **498, new** | `ProfileTab` + `ClipViewer` |

Four in-page tabs via `?tab=home|explore|inbox|profile`, synced with
`router.replace(..., {scroll:false})` so history is not polluted. Initial tab: URL →
`sessionStorage['reviews_tab']` → `home`.

### Home feed
`h-dvh overflow-y-scroll snap-y snap-mandatory`, one `h-dvh snap-start` slide per post.
Infinite scroll fires at 50 % of the last viewport; `AbortController` per feed switch.

**Video window: only `|i - activeIndex| <= 1` mounts a real `<video>`** — off-screen slides
render the thumbnail only. This exists because **iOS Safari caps concurrent
`HTMLMediaElement`s**. **[STAB]**

**Gestures** — pointer-based. Move > 10 px = drag. Single tap → 300 ms timer → toggle play.
Second tap inside 300 ms → cancel the pause and **double-tap like** (like-only, never unlike)
with a heart burst and `navigator.vibrate(20)`. Horizontal drag > 40 px and > 1.2× vertical
pages the photo carousel. `touchAction: 'pan-y'` preserves native vertical scroll. Layering:
gesture `z-[5]` < carousel nav `z-10` < action rail `z-20`.

**Unread notification badge [COST]** — Supabase **Realtime** `postgres_changes` INSERT
subscriptions on `review_likes`, `review_comments`, `user_follows` (filtered
`following_id=eq.{me}`) and `review_milestones`, used **purely as a trigger**: debounce 300 ms,
then refetch `GET /api/notifications`. Unread = notifications newer than
`localStorage['tappy:notifSeenAt']`. **This removed polling entirely.** Also recounts on
`focus`/`visibilitychange`. Caps at `99+`.

**Feed back-restore** — on unmount, writes `sessionStorage['tappy:reviewsReturn'] =
{clipId, feedType}`. On mount, restores **only on a Back/Forward traversal**, detected by a
recent `popstate` (< 5 s) **or**, for cross-document Backs where popstate never fires (mobile
Safari with bfcache blocked by the realtime WebSocket), Navigation Timing
`type === 'back_forward'`, **consumed once per document**. Restores **by clip ID, not index**,
because trending re-orders between fetches.

### Explore / search tab
Segmented Places | Users. Review search debounced 400 ms; user search fires at ≥ 2 chars with an
**optimistic follow button** (the revert sign-bug is fixed and documented in-code).

### Inbox tab
AI digest banner, hot-places row (client-aggregated from likes in the last 24 h, top 4), and
notifications grouped `VỪA XONG / HÔM NAY / TUẦN NÀY`. Grouping: likes by URL, profile_views
globally, others by id. Avatar stack (max 3). Per-type colours.
**Note: the section keys are literal Vietnamese strings used as Map keys**, then mapped to
localized labels — the *data* keys are Vietnamese even though the display is localized.

### ProfileTab — two independent axes **[SEC]**
- **`variant` = layout, decided by the route.** `'page'` (`/users/[id]`): horizontal hero,
  `max-w-container-content`, `grid-cols-3 sm:grid-cols-4`, `aspect-[3/4]`. `'tab'`: centred
  hero, `contents` wrapper, `grid-cols-3`, `aspect-[9/16]`.
- **`isOwnProfile` = permissions only.** Edit vs follow, the upload badge, private Saved/Liked
  tabs, hidden posts, delete/hide.

**Security property baked into the code:** on someone else's profile, likes/saves/hidden/prefs
are **never requested** — not merely hidden — so an RLS misconfiguration cannot leak them.
`ClipViewer` receives `me={viewerId}`, not `userId`; passing `userId` would have made `isMe`
true for every visitor.

`trailingFillerCount()` pads the last grid row with `bg-black` fillers so the gray hairline
background does not read as a box.

### VideoPlayer — the autoplay engine
Module-level `feedAudioUnlocked` flag plus a **capture-phase `click` listener**: iOS Safari only
honours unmute from a *click* call stack, so touchstart is deliberately not used and every click
re-notifies with no early return. **Playback is driven purely by the `active` prop — no
per-video IntersectionObserver**, which raced with the feed's own tracking. A **300 ms
self-healing watchdog** plus `canplay`/`loadeddata` listeners re-issue `play()` unless the user
long-pressed to pause. `handlePause` drops back to muted if the browser paused an unmuted
active clip.

**Attached sound ("use this sound")** — when `music.origin === 'attached'`, the parent resolves
the borrowed track and passes `soundUrl`. The `<video>` is force-muted **on every watchdog tick**
(not just at play-start) — this closes the race where a clip started unmuted during the track
fetch and could never be re-muted. A **single companion `HTMLAudioElement`, owned only by the
active clip**, mirrors the video's play/pause/loop. If the track fails to load, `soundFailedRef`
flips and the clip's own audio is allowed through — **never silent**. **[STAB]**

Source branches: `upload` (native video, muted/playsInline/loop), `youtube` (IntersectionObserver
≥ 0.5 → iframe), `tiktok`/`facebook` (thumbnail + external link).

### `/reviews/[id]` — detail
Guest-viewable, `notFound()` if hidden. Parallel fetch of review + like + save + a **recomputed
comment count** (the `reviews.comment_count` column drifts because the maintaining trigger is
RLS-blocked for ordinary users). Full `generateMetadata` with OG + Twitter cards. 55 vh hero,
`-mt-6 rounded-t-[28px]` content card, fixed right-edge action bar that tracks the 768 px column
edge and clamps on mobile.

### Comments — replies and reactions
- **One-level threading.** `parent_comment_id`; replying to a reply attaches to
  `replyTo.parent_comment_id ?? replyTo.id`, so nesting never exceeds one level. Replies render
  at `ml-10` with a 26 px avatar.
- **6 reactions** — like/love/haha/wow/sad/angry. **Keys must mirror `ALLOWED` in
  `/api/comments/[commentId]/reactions`.** One reaction per user; switching shifts it,
  re-tapping removes it. Optimistic with a `loadComments()` reconcile on failure.
- Deleting a parent **cascades to replies in the DB**, mirrored locally.

### `/reviews/new` — the upload pipeline
Three media tabs (Photo | Video | URL).

**Video pipeline with structured logging** (`[video-pipeline] <stage> START/SUCCESS/FAIL {ms}`):
select → validate-format → validate-size → validate-duration → thumbnail-generate →
thumbnail-upload → video-upload → ai-process. **Hard timeouts so the UI can never freeze:
20 s metadata read, 8 s thumbnail decode/seek, 15 s thumbnail upload.** **[STAB]** Thumbnail is
canvas-drawn at ≤ 1280 px, JPEG q=0.82, seeking to `min(0.1, dur/2)` — 0.5 was out of range for
sub-0.5 s clips. Upload is direct-to-Blob via `@vercel/blob/client`.

Limits: 6 photos, 50 MB, advertised 60 s, backend tolerance 62 s — **62 is never surfaced.**

Success → mascot success pose for 1.5 s → `/reviews?tab=profile`, **deliberately the author's
own grid, because a 0-engagement clip never appears in the trending feed** and users reloaded
thinking the upload had failed.

Sound deep-link: `/reviews/new?sound=<trackId>` preselects the track.

---

## 6. Music / Sound

`src/modules/music/**` is a self-contained module; feature code imports **only** from the
barrel `index.ts` (client) or `server.ts` (route handlers).

- **`/music`** — library. A **single shared hidden `<audio>`**; swapping `src` guarantees only
  one preview plays at a time. **[STAB]**
- **`/music/upload`** — Original Sound. Audio ≤ 20 MB, 1 s–10 min, **mandatory rights checkbox**
  in an amber consent card linking `/copyright`.
- **`/sound/[trackId]`** — full sound page: cover, type label, **CC-BY attribution derived from
  the Jamendo URL**, trending rank, usage/saved stats, play count, save + follow (optimistic,
  401 → login), "use this sound" → `/reviews/new?sound=`, video grid, and a **copyright report
  modal** (4 reasons + details, 24–48 h promise).
- **`SoundSheet`** — the in-feed compact version; **closes on `popstate`** (the only overlay in
  the app that does).
- **`MusicPickerSheet`** — `role="dialog" aria-modal`, **focus trap** with wrap, focus restore
  on close, Escape to close, clean-slate reset on open.

**`ReviewMusicCard` was gutted** to label + link only; playback moved to the shared
`VideoPlayer` engine. Consequence: `reviews/musicPlaybackController.ts` and
`useMusicPlayback.ts` still exist but **have no consumer — dead code.**

---

## 7. Deals, Recommendations, Service detail

**`/deals`** — page is now a plain shell; `DealsView` fetches `GET /api/deals` **client-side**,
"the same endpoint Android/iOS consume". Card affordances: logo (or partner-initial fallback),
**discount badge only when `discountLabel` exists**, countdown chip via `promoCountdown`, and a
**copyable dashed voucher chip that `preventDefault + stopPropagation`s so it never opens the
partner link**. Click tracking uses `keepalive: true` with a swallowed catch. Commercial
disclosure footer retained (MFS 3.10).

**`/recommendations`** — 401 → login prompt. Ranked numbered cards with matched-signal chips.

**`/service/[id]`** — **the whole route redirects unauthenticated users**, preserving every query
param in `returnTo`. Data is **query-param driven** (name/address/type/phone/price/rating/hours/
maps/placeId) with a UUID → `services` table override — it is a render target for chat results,
not a places database. Shows the user's last 3 bookings and up to 8 community reviews with a
computed Tappy average beside the external rating.

---

## 8. Profile and settings

`/profile` is RSC-gated. Feature flags hide **Pro upgrade** and **App Connections** — both
mirrored by Android gates.

| Route | Notes |
|---|---|
| `/profile/account`, `/edit`, `/posts`, `/history`, `/bookings` | Standard CRUD surfaces; history has per-row delete |
| `/profile/favorites` | Fetches `/api/favorites` + `/api/reviews/saved` in parallel; **skeleton loading** |
| `/profile/preferences` | 3 budget cards, 15 cuisine chips, dietary text, free-form chips (max 50) |
| `/profile/price-watches` | Target/current price, status, last-checked |
| `/profile/tappy-knows` | **Memory transparency**: per-fact removal with optimistic PATCH + revert, two-step confirm for Clear All, plus the response-style picker (tone, length) persisted to `localStorage['tappy_response_style']` |
| `/profile/notifications` | Web Push toggle |
| `/profile/settings` | Language switcher, version line, sign-out |
| `/profile/privacy`, `/terms` | Near-duplicates of the top-level legal pages |

**`/users/[id]` is now 51 lines.** It resolves `viewerId`, renders a black placeholder until
ready (**so it never briefly renders your own profile as a stranger's**), then delegates entirely
to `<ProfileTab variant="page" />`. Tapping a creator avatar now lands in the *same* UI as the
feed.

---

## 9. Utilities

| Route | Notes |
|---|---|
| `/currency` | Math extracted to `lib/finance/`. A missing currency **throws and surfaces `currency.missingRate`** instead of silently using rate 1. 12 currencies, swap, fallback-rates warning |
| `/split-bill` | Pure client math. Equal vs Custom, 2–20 people, 5 tip presets. **No backend, no persistence** |
| `/translate` | 30 target languages, 2000-char counter, read-aloud using the **target language's** BCP-47 tag |
| `/scan` | **OCR/document scan, not QR.** Client resize to ≤ 2048 px JPEG q=0.85 **before upload** **[COST]**. Export to Copy / TXT / **DOCX (dynamic `import('docx')`)** / Share |
| `/group/new` | `redirect('/login')` |
| `/group/[id]` | **No auth gate** — anonymous join by name; uses `alert()` for errors |
| `/game` → `/game/supertux` | Full-screen iframe. Requires **COOP `same-origin` + COEP `require-corp`** on both parent and iframe. `require-corp` is used deliberately, not `credentialless`, because Safari < 17 broke `SharedArrayBuffer`. **Accepted cost: PostHog/Supabase fetches may be blocked on that page** |
| `/boi`, `/boi/tarot`, `/boi/tu-vi`, `/boi/cung-hoang-dao` | Fully offline; deterministic engine (see `07_Features.md`) |
| `/viet-content` | Social caption generator |
| `/subscription` | `redirect('/login')`. Remaining quota uses the **same helper `/api/chat` enforces**, so display cannot drift. Entry point hidden by `SHOW_PRO_UPGRADE` |

---

## 10. Legal

`/terms`, `/privacy`, `/copyright` — sticky blurred header, `max-w-2xl` card, numbered sections,
last-updated date. **All three are 100 % hardcoded Vietnamese with no i18n keys at all.**

> **⚠ Stale copy:** `/terms` §2 says *"Bạn cần đăng nhập bằng tài khoản Google"*, contradicting
> Zalo and Guest in the production login. → `12_Open_Items.md`.

---

## 11. Admin back office

Gate chain: `middleware.ts` redirects unauthenticated `/admin*` **page** requests (it never
touches `/api/admin/*`, which return their own JSON 401/403) → **`admin/layout.tsx` is the
authoritative RBAC gate** (`resolveAdminRole`, non-admins → `/reviews`) → per-handler
`requirePageRole()`.

`AdminShell` — `hidden md:flex` sidebar + sticky header with a VI/EN toggle. Nav items carry
`minRole` (filtered out entirely) and `ready` (**rendered disabled with a "coming soon" chip so
the full structure stays visible**).

| Route | minRole | State |
|---|---|---|
| `/admin` | analyst | **Phase-0 stub** — 4 KPI cards showing `—` |
| `/admin/analytics` | analyst | Legacy RSC; **hardcoded Vietnamese, dark-only, does not use the admin theme** |
| `/admin/analytics/auth` | analyst | Live — success rate, first-login conversion, provider/platform breakdown, trend, acquisition by 6 dimensions, 25/page |
| `/admin/analytics/activation` | analyst | Live |
| `/admin/audit` | admin | Live |
| **`/admin/deals`** | admin | **Live, new** — full CRUD, reorder, show/hide, schedule, logo/banner Blob upload, click counts |
| `/admin/rbac` | super_admin | Live |
| `/admin/settings` | admin | **Read-only shell** — persistence needs a `platform_settings` table not in the frozen schema |
| `/admin/users`, `/moderation`, `/engagement`, `/monitoring` | — | `ready:false`, no page |

**7 of 12 destinations are live; 4 are placeholders; 1 is a rendered stub.**

Admin theming is scoped to `.admin-theme` so shadcn tokens never leak into the consumer app.

---

## 12. Navigation

**Global bottom nav** — 5 tabs: Home, Chat, Explore (`/reviews`), Deals, Profile.
Re-tapping the active tab **scrolls to top and, on a sub-page, returns to the section root**.
Hard early-return: `if (pathname.startsWith('/reviews')) return null`.

**Explore-internal nav (`TikNav`)** — App Home · Discover · Search · **centre Post button** ·
Inbox (with the unread badge) · Profile. Only Discover/Search/Inbox/Profile change tab state.
A desktop `Sidebar` mirrors it.

**Header** — `sticky top-0`, props `user | showBack | backHref | title | hideLogo`. The greeting
is computed **in `useEffect` only** (SSR/client timezone mismatch caused React #425/#422).
**The dark-mode toggle lives here and only renders when `user && !showBack`** — so guests and
every back-navigated screen have no theme toggle.

### `docs/Navigation_Architecture.md` accuracy — verified, 5 defects
Accurate on: the two bottom navs and the early-return, `?tab=`/`?q=`/`returnTo` deep-linking,
`router.replace` discipline and the iOS Back-loop fix, modals-are-state-not-routes, and chat
auto-save.

**Inaccurate against production code:**
1. Claims upload → `router.push('/reviews')`; the code is `'/reviews?tab=profile'`.
2. Lists `/subscription` as "Guest OK"; it is `redirect('/login')`.
3. Lists `/group/[id]` as "Login required"; it has **no auth gate**.
4. Lists `/service/[id]` as "Guest OK"; it **redirects**.
5. Missing entirely: the unread badge + Realtime, feed back-restore, `/admin/deals`, and the
   Guest button.

Its flagged gap — *"modals do not participate in the back stack"* — is **still true**, with
`SoundSheet` the only exception.

---

## 13. i18n

Flat `Record<string,string>` maps with **dot-namespaced keys**, merged by object spread:
`full[locale] = { ...dictionaries[locale], ...w2, ...w3, ...admin }`. **Namespacing makes the
merge collision-free by construction.**

| File group | Keys per locale |
|---|---|
| `dictionaries.ts` | 175 |
| `w2/*` (6 files) | 210 |
| `w3/*` (8 files) | 190 |
| `admin/index.ts` | 134 |
| **Total** | **≈709 per locale** |

**Mechanics.** Two locales (`vi | en`). A single module-level store + `useSyncExternalStore` —
one app-wide reactive locale. `getServerSnapshot()` **always returns `'vi'`** so SSR markup is
deterministic; the client reconciles after hydration. Interpolation is
`str.replace('{k}', v)` — **single occurrence only, no plural rules, no ICU**. Fallback chain:
`full[locale][key] ?? full.vi[key] ?? key`.

**Persistence — `localStorage['tappy_lang']`**, plus a fire-and-forget `PATCH /api/profile`
for cross-device sync (401 ignored for anonymous). `setLocale()` now **always writes to
localStorage before the early return** — see `08_Bug_History.md` `dd74359`.

**Language picker** — mounted globally, shows once iff `getStoredLocale() === null`,
**intentionally bilingual**, with **no dismiss affordance**.

### Hardcoded-Vietnamese debt
The dictionary header states it plainly: *"this is not a full-app translation sweep (explicitly
out of scope for MVP)."*

Worst offenders by line count: `ChatInterface.tsx` (92), `privacy` (52), `tappy-knows` (45),
`BookingForm` (37), `preferences` (37), `group/[id]` (35), `page.tsx` (34 — *intentional*, the VI
hero-copy table), `sound/[trackId]` (33), `subscription` (31), `integrations` (26),
`ReviewCommentButton` (24 — **grew from 13; the new reply/react UI added untranslated strings**),
`DealsManager` (21 — **new file, no i18n at all**).

**Systematically untranslated surfaces:** all legal pages, `/subscription`, `/sound/*`,
`/music/upload`, `/service/*`, `/group/*`, `/recommendations`, `/reviews/creator/*`,
MessageActionBar tooltips, the in-chat onboarding modal, all voice/mic status strings, every
`confirm()`/`alert()`, and the entire `DealsManager`.

---

## 14. Theme, tokens, responsive

**Dark mode exists** (`darkMode: 'class'`). The toggle lives **only in `Header.tsx`**, reads
`localStorage['theme']` then `prefers-color-scheme`.

> **⚠ Known FOUC risk:** the class is applied in a `useEffect` with **no inline blocking script
> in `layout.tsx`**, so a dark-preference user gets a light flash on every load. Combined with
> the toggle being absent for guests and on every `showBack` screen, a dark-mode user navigating
> into a sub-page **cannot switch back** without returning to Home/Profile. → `12_Open_Items.md`.

**Tokens.** `primary` `#007AFF`, `accent` `#FF9500`, both with 50–900 ramps. Explore uses
hardcoded non-token colours: `#fe2c55`, `#69c9d0`, `#1a1a1a`, `#ff6b35`. Back-office tokens are
shadcn HSL triplets declared globally (so portaled Radix components resolve them) but consumed
only under `.admin-theme`, with radii namespaced `rounded-admin-*` so they cannot clobber product
radii.

**Fonts:** Inter + Orbitron (brand) + Cinzel (slogan/tags), loaded via a Google Fonts `@import`
in CSS — **render-blocking, not `next/font`**.

**Breakpoints:** `xs 480 · sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536 · 3xl 1920 · 4xl 2560`
(`sm`–`2xl` are Tailwind defaults; the rest additive).
**Containers:** compact 28rem · content 48rem · wide 64rem · feed 80rem · full 96rem.

**Additive-but-unused:** the `clamp()` fluid type scale, most `.container-*` classes, and the
safe-area utilities (`.pt-safe` etc.) have **almost no consumers**.

**Mobile-first patterns:** `min-h-dvh`/`h-dvh` everywhere (never `vh`), `pb-20`/`pb-24` nav
clearance, horizontal chip rows with `scrollbar-hide`.
**Desktop-only:** Explore Sidebar, feed arrows, HomeBackground, admin sidebar, header greeting.
Desktop feed column is capped at 448 px.

> **⚠ Accessibility:** the viewport locks `maximumScale: 1` — **pinch-zoom is disabled.**

---

## 15. Feedback, loading, error, empty states

**Toasts (sonner) exist in the admin back office ONLY** — `<Toaster />` is mounted in
`admin/layout.tsx`; consumers are `RolesManager` and `AuditViewer`. **Zero toast usage in the
consumer product**, where feedback is inline (icon swap + 1.5–2 s timeout), in-thread cards,
coloured banners, and **two raw `confirm()`/`alert()` sites**.

**Skeletons: only two** — the root `loading.tsx` and `/profile/favorites`. Everywhere else
loading is a spinner.

**Error states:** root `error.tsx` (Retry + Home, `min-h-[48px]` touch targets) and
`not-found.tsx`; feature-level `AlertCircle` blocks and coloured inline banners.

**Empty states** exist for feed, profile grid (per tab), inbox, search, history, favorites,
recommendations, sound-page videos, and deals.

**Loading discipline:** most fetches use a `cancelled` flag or `AbortController`; the feed aborts
on every feed-type switch.

**`VersionWatcher`** polls `/api/version` on load and `visibilitychange`; if the live commit SHA
differs from `NEXT_PUBLIC_BUILD_ID` it reloads the tab, with a per-version `sessionStorage` guard
so it can reload **at most once per version** (no loop). Disabled when `BUILD_ID === 'dev'`.
**[STAB]** This is the fix for the recurring "iOS Safari shows an old build" problem.
