# 08 — Bug History

Chronological engineering log of **web** bugs that were actually diagnosed, fixed, and
shipped to production on or before the freeze commit `79d05f3`.

**Scope rules applied:**
- Only bugs that were **fixed**. Open defects live in `12_Open_Items.md`.
- Web only. Android/iOS-only commits are excluded.
- Every entry was reconstructed from the **commit diff**, not from the commit subject alone.
- "Regression prevention: none" is stated plainly where that is the truth. It is not padded.

**Why this document matters for Android:** most of these bugs are *behavioural*, not
web-specific. An Android engineer re-implementing a screen will hit the same class of
defect unless they read the root cause. The recurring patterns are collected in §Patterns
at the end — **read that section first.**

---

## Evidence base

Only three web release-notes documents exist at the frozen commit:
`docs/release/web/CHAT_LAYOUT_GROUPING_2026-07-24.md`,
`BUG15_EXCHANGE_RATE_2026-07-24.md`, `BUG14_DEALS_V1_RELEASE_2026-07-24.md`.

There is **no consolidated bug list in the repository.** The bug numbering (#8, #11, #12,
#14, #15, #17, #18, #19, #20A) exists only in commit messages. This document is therefore
the first consolidated bug record for Web V1.

---

## 2026-07-05 — MVP feature-freeze remediation

### `9b7a8d3` — Gate A / UAT defect bundle
- **Issue:** Anonymous users could call `/api/chat`; `/api/group/[id]/join` was fully
  anonymous; profile pages read a `profiles.email` column already dropped in production;
  milestone inserts failed after an RLS policy drop; a failed like/save corrupted feed
  counts; YouTube embeds autoplayed off-screen.
- **Root cause:** Multiple, per item. The systemic one: `next.config.mjs` had TypeScript
  and ESLint build gates **disabled**, so type and lint errors could reach production.
- **Fix:** Auth guards on chat and group-join; email sourced from the session; admin client
  for memory/milestone writes; `res.ok` guards on like/save; viewport-gated YouTube
  autoplay; **re-enabled the TS/ESLint build gates**.
- **Regression prevention:** ✅ **Structural.** Re-enabling the build gates is the durable
  guard and is still in force at the freeze — it is Gate 2 in `13_Release_Gate.md`.

### `a0c8ff9` — AI replies mixed Vietnamese with and without diacritics
- **Issue:** Replies came back half `có dấu`, half `không dấu` ("De goi y dung y ban…").
- **Root cause:** The system prompt's clarifying-question template and follow-up chip
  examples were authored in ASCII **to save tokens**; the model echoed them verbatim.
  Tool-injected content kept its diacritics, producing the mix.
- **Fix:** `src/lib/ai/promptBuilder.ts` — rewrote the quoted templates with correct
  diacritics, added an explicit rule that user-facing Vietnamese must always carry them.
- **Regression prevention:** none — prompt-level, manual verification.
- **`[COST]` lesson:** a token-saving shortcut inside the prompt leaked into user-visible
  output. Cost optimisation must never touch text the model may copy verbatim.

### `a7609d9` — Home hero mic dictated but never sent
- **Issue:** Voice input worked in `/chat` but on Home only filled the box.
- **Root cause:** `SearchBar.tsx` owns a **separate** SpeechRecognition instance from
  `ChatInterface`; earlier voice fixes never applied to it.
- **Fix:** Ported the ChatInterface voice behaviour into `SearchBar.tsx`.
- **Regression prevention:** none — the duplicate-recognizer architecture was not
  consolidated, so the two can diverge again.

---

## 2026-07-06 — Zalo login, music playback, device QA

### `7f88c2e` — Zalo login rejected outright
- **Root cause:** `NEXT_PUBLIC_APP_URL` was the apex `https://tappyai.com`, but the site,
  the Zalo-registered callback and the PKCE cookies all live on `www.`. Zalo requires an
  exact `redirect_uri` match.
- **Fix:** Build the callback/app URL from the actual request host (`x-forwarded-host`).
- **Regression prevention:** none.

### `0f71082` — Zalo login failed after token exchange **[SEC]**
- **Root cause:** `graph.zalo.me/v2.0/me` returns error `-501` — *information limited due to
  IP address not inside Vietnam*. Vercel functions run in the US. Token exchange is not
  IP-restricted; only `/me` is.
- **Fix:** The callback exchanges code→token **server-side**, then redirects to
  `/auth/zalo-finish` with the token in the **URL fragment** (never sent to the server, so
  never logged) plus a short-lived httpOnly cookie binding. The VN-IP browser calls `/me`
  and POSTs the profile to `/api/auth/zalo/complete`, gated by that cookie.
- **Regression prevention:** none. **Android note:** this is why Zalo cannot be
  ported by copying the web flow — see `11_Android_Migration.md`.

### `f9dbccb` — Sound API 500ing in production
- **Root cause:** `SUPABASE_SERVICE_ROLE_KEY` is empty in the Vercel env, so
  `createAdminClient()` threw inside `createClient` — **outside any try/catch**.
- **Fix:** Removed the admin client from the sound routes. Totals now come from
  `SECURITY DEFINER` functions `music_saved_count` / `music_followed_count`; per-user state
  uses the authenticated client under own-row RLS. Every extra is best-effort; only the
  core track can fail, and only as a 404.
- **Regression prevention:** ✅ **Architectural** — failure isolation. This
  best-effort-extras pattern is now the house style and Android should mirror it. **[STAB]**

### `6837b5c` — Music previews silent/stuck
- **Root cause:** The first pass **byte-truncated** the mp3s, destroying the VBR/Xing
  header. Browsers fetched them but could not decode.
- **Fix:** Re-encoded all 14 to 25 s / 128 kbps CBR; verified via `decodeAudioData`.

### `89ca325` — Four device-QA defects
- **#21** Videos blank in profile Liked/Saved/Hidden — those queries omitted
  `content_type, media_url, thumbnail, source_type, source_url`.
- **#22** Unmuting never persisted — the toggle stored `String(!next)`, **inverted**.
- **#39** Music previews hung — seeded `audio_url` pointed at `soundhelix.com`, unreachable
  from Vietnam. Self-hosted 14 clips under `/public/music`.
- **#40** Six mini-games were out of product scope — removed; hub shows only SuperTux.
- **Regression prevention:** none — real-device QA only.

---

## 2026-07-07 — Feed and reviews stabilization

### `a1c318d` — Session/memory/regenerate/onboarding bundle
- **Root causes:** `middleware.ts` used `getSession()` (no token revalidation, refreshed
  cookies never written back) → periodic desktop logout. Memory extraction treated an
  **empty array** (`{food:[]}`) as authoritative and overwrote populated preferences →
  silent memory wipe. The regenerate button rendered on **every** assistant message.
- **Fix:** `getUser()` in middleware; empty extraction treated as "no new data"; regenerate
  gated to the last assistant message; Enter cancels a pending voice send.
- **Regression prevention:** none.
- **`[STAB]` lesson:** an empty result is not the same as an authoritative empty value.

### `ff7206a` — Failed follow left the count 2 too high
- **Root cause:** The optimistic update read the **pre-flip** `is_following` with
  `(? -1 : 1)`; the error-path revert read the **already-flipped** value but used the
  inverse ternary `(? 1 : -1)` — so both applied in the same direction.
- **Fix:** Revert now matches the optimistic sign.
- **Regression prevention:** claimed in the commit body but **no test file appears in the
  diffstat** — treat as manual verification.

### `eda1580` / `d1131b6` — iOS Safari media-element exhaustion
- **Issue:** On iPhone the feed froze; a fresh clip wouldn't play; scrolling stalled.
- **Root cause:** Every feed slide mounted its own `<video preload="metadata">`, so N posts
  held N media elements. **iOS Safari caps concurrent `HTMLMediaElement`s** and their
  buffering, saturating the pipeline.
- **Fix:** `eda1580` windows real `<video>` to active ±1 (off-screen slides render the
  thumbnail only). `d1131b6` tightened to **active + next only** with `preload="none"`.
- **Regression prevention:** none — device testing only.
- **Android relevance: HIGH.** ExoPlayer has the same finite-decoder constraint. The
  windowing model, not the web code, is what ports.

### `4120506` — Clip detail page was a black hero
- **Root cause:** Two gaps — `getReview` didn't select `content_type/media_url/thumbnail/
  source_*`, and the hero only rendered `photos[0]` with no `<video>` element at all.

### `fdebf69` → `500b2ed` → `50cca90` — desktop prev/next arrows (3 iterations)
- **Root cause:** `scroll-snap-type: mandatory` **cancels a programmatic smooth scroll** —
  the container re-snaps before the animation advances. Separately, `activeIndex` only
  tracked *user* scroll, so it stayed at 0 after an arrow jump.
- **Fix:** Final form uses `behavior:'auto'` (instant jump, let snap align) and sets
  `activeIndex` to the target slide directly.

### `8782bcc` — Photos couldn't be swiped, only arrowed
- **Root cause:** The feed's gesture layer sits above the media at `z-5` to own tap and
  double-tap, so it swallowed the Carousel's own touch swipe.
- **Fix:** Carousel became parent-controlled; the gesture layer forwards a mostly-horizontal
  drag (`|dx| > 40`, dominant over `dy`) to page it; vertical drags stay native scroll.

### `2a010d9` — Anonymous transcript lost across the login redirect
- **Root cause:** Anonymous turns live only in client `useChat` state — they are never
  persisted server-side — so navigation destroyed them.
- **Fix:** The login CTA stashes the transcript to `sessionStorage` (`tappy_pending_chat`);
  chat restores it on return, and the `?q=` auto-send is skipped while a stash is pending so
  the first turn isn't duplicated.

### `95c4a99` — 15 s clips rejected for being 15.04 s
- **Root cause:** The advertised limit and the accept threshold were the **same number**,
  with no tolerance for encoder drift.
- **Fix:** Backend accept threshold 17 s; UI still says 15 s.
- **This deliberate advertised-vs-enforced split is the origin of the 60 s/62 s rule — and
  of the drift bug `807d77b` three weeks later.**

---

## 2026-07-08 — CSP rollout, streaming UX, place hygiene

### `0f7b1ce` — CSP enforcement shipped **(not a bug — the origin of three later outages)**
Recorded because `936acf6`, `3fd234f` and `900289a` are all consequences.

### `936acf6` — Blob storage hosts added to `connect-src`
- Caught **pre-breakage** by a live CSP probe.
- **Fix was incomplete**, and its comment embedded the misconception that the *storage*
  hosts are what uploads use — **precisely what caused the two-week outage in `900289a`.**

### `73baa81` / `9434d00` / `427a0e5` — nonce CSP Report-Only, then reverted
Shipped to remove script `'unsafe-inline'`; reverted as non-functional. Net zero. This is
why `'unsafe-inline'` is still present in the frozen CSP.

### `480b82b` — Place-less "share" posts leaked in as real places
- **Root cause:** Place-less posts carry a sentinel `place_name` ("Chia sẻ", and in older
  rows the un-diacriticked "Chia se") that nothing filtered on. They were ranked by the
  recommendation engine and counted in "ĐANG HOT GẦN BẠN".
- **Fix:** `isShareOnlyName()` covering **both diacritic variants** plus empty; excluded
  from recommendations and hot-place counting; chip/title/CTA hidden.
- **Regression prevention:** ✅ shared helper centralises the rule; no unit test.
- **Android relevance:** the same sentinel must be filtered natively.

### `6ad3e49` — Streaming text arrived in visible block-jumps
- **Root cause:** Measured — 398 chars arrived in 3 network chunks of 71/147/116; display
  was bound directly to chunk arrival.
- **Fix:** `useSmoothText` keeps the streamed text as a target and reveals a few chars per
  animation frame, snapping to full text at stream end.
- **Android relevance: HIGH** — Android currently renders whole-message; this is the
  reference behaviour.

### `b6a845f` — Hydration mismatch on the deals date
- **Root cause:** `formatDate(locale)` renders the current date with the reactive locale, so
  SSR (locale `vi`, server clock) and client (stored locale, client clock) differed.

### `641301f` — `message_feedback` existed in prod with no tracked migration
Schema drift, fixed by adding the migration. Symptom of the manual-SQL-editor operating
model documented in `04_Database.md`.

---

## 2026-07-09 → 07-11 — Autoplay/audio saga and freemium consistency

### `031fcc7` — Triple-fetch cascade on feed load **[COST]**
- **Root cause:** `fetch_` depended on `[city, topHashtags]`, both resolved asynchronously,
  retriggering the effect as each landed → 2–3 concurrent trending API calls per mount.
- **Fix:** refs + `AbortController` + `Promise.allSettled`, consolidated to one fetch.
- **The same class — unstable effect dependencies causing a fetch storm — recurs in
  `2a341fd`.**

### The autoplay/mute cluster — `ce68a90`, `02ab482`, `1171257`, `2a9db54`, `759f705`, `2185693`, `d6db3d0`, `2ed655b`, `43da5db`, `8f81353`, `239a160`
**Eleven shipped commits on one problem, with zero tests. The largest untested churn cluster
in the freeze.**
- **Root cause (only identified at `8f81353`):** *on iOS you cannot guarantee BOTH
  autoplay-on-scroll AND sound without a fresh gesture per clip* — the unmute attempt is
  what kept pausing clips. Every earlier commit treated a symptom.
- **Final fix:** a **300 ms self-healing watchdog** on the active clip — whatever pauses it
  (iOS rejecting an unmute, decode pressure, media not ready, a stray policy pause) it
  resumes, unless the user long-pressed to pause. Sound is applied once per active session
  so unmute cannot ping-pong; `onPause` drops to muted so the next tick keeps it playing.
  `a0de3ca` then removed the mute button entirely.
- **`[STAB]` lesson, and the single most transferable one in this document:** where a
  platform gives non-deterministic media behaviour, a **self-healing convergent loop** beats
  trying to enumerate every failure path. Android should adopt the watchdog model rather
  than porting the ten intermediate attempts.

### `39270be` — iOS Safari never unmuted; music disc missing
- **Root cause (audio):** The audio-unlock listened to `touchstart/pointerdown/click/keydown`
  behind an early-return flag. On iOS `touchstart` fires **first** and is **not** a valid
  user activation for media — it set the flag, so the later `click` early-returned and the
  unmute never happened.
- **Root cause (disc):** Original-sound registration was **silently failing** because
  production lacked `music_type/uploaded_by/rights_confirmed` — **unapplied migrations**.
- **Fix:** Only `click` triggers the unlock, with no early return, and the subscriber calls
  `play()` **inside the click handler's call stack** (an iOS requirement). Idempotent
  migration `20260711_music_ugc_combined.sql` added the structure and retroactively
  registered original sounds.

### `8f6e1c7` — `/subscription` said 10/day while 15 was enforced
- **Root cause:** An earlier commit raised the limit 10→15 but left three hardcoded literals
  on this page.
- **Fix:** All three → 15.
- **Regression prevention:** ✅ **partly structural** — `14602e4` landed the same day,
  making the backend the single source of these numbers via `product.ts` + `/api/config`.
  **That refactor is exactly what `807d77b` later proves was still incomplete for i18n
  strings.**

---

## 2026-07-17 — Admin dashboard fetch storm

### `2a341fd` — Activation/Auth Analytics and Roles showed "failed to fetch"
- **Root cause:** `useTranslation()`'s `t` is a **fresh closure on every render** (not
  memoized). An i18n pass added `t` to `useCallback` dependency arrays feeding
  `useEffect(() => { load() }, [load])`, so `load` was recreated every render and the effect
  retriggered every render — an **infinite fetch loop**.
- **Fix:** Removed `t` from the three affected dependency arrays (it is only used in
  catch-block error fallbacks, so it never needs to trigger a refetch).
- **Regression prevention:** **none — and the underlying cause (unmemoized `t`) was not
  fixed.** Any future `useCallback` that captures `t` reintroduces this. Carried into
  `12_Open_Items.md` as technical debt.

---

## 2026-07-18 → 07-19 — Video duration rule, Zalo CSP

### `b568c62` — Video duration raised to the approved 60 s/62 s rule
`MAX_VIDEO_DURATION_SEC` 15→60, `MAX_VIDEO_DURATION_ACCEPT_SEC` 17→62 in `product.ts`.
**The composer's i18n hint string was not updated — the bug fixed by `807d77b`.**

### `3fd234f` — Zalo login broke on **all** platforms **[SEC]**
- **Root cause:** `/auth/zalo-finish` must fetch the profile client-side (VN-IP-only), but
  the enforced CSP's `connect-src` omitted `graph.zalo.me`, so the browser blocked it. The
  flow threw, redirected to `/login`, never reached `/complete`, so no session was created.
- **Fix:** Added only `https://graph.zalo.me`. No wildcard.
- **Regression prevention:** none. **This is the second CSP-omission outage; a third
  follows.**

---

## 2026-07-22 — The CSP blob outage and profile unification

### `900289a` — ⚠ **Most severe web bug in the freeze: all uploads dead for two weeks** **[SEC][STAB]**
- **Issue:** **Every video and Original Sound upload failed from 2026-07-08 to 2026-07-22.**
  Last successful production upload: 2026-07-07.
- **Root cause:** `connect-src` listed the blob **storage** hosts but not the blob **API**
  host. `@vercel/blob/client` does not PUT to the storage host — it PUTs to
  `https://vercel.com/api/blob` (`defaultVercelBlobApiUrl`). The browser refused every
  upload before it left the machine.
- **Why it hid for two weeks — the important part:** Chrome reports a CSP refusal as
  `TypeError: Failed to fetch`, which is in the SDK's is-network-error set, so the SDK
  treated it as **retryable** and retried 10× with exponential backoff. The promise stayed
  pending for minutes and the UI sat on "Đang tải clip lên" at 0% — **a hang, not an
  error.** Playback kept working (storage hosts *were* allowed), which masked the breakage
  completely.
- **Evidence:** production logs show `POST /api/upload/video` → 200 (tokens mint fine) then
  nothing — no `POST /api/reviews`. A/B validated: without the host the PUT is refused in
  1 ms with `TypeError`; with it the PUT reaches the API and returns a real HTTP 403 for a
  fake probe token.
- **Fix:** One exact host, https only, no wildcard. The misleading comment was corrected.
- **Regression prevention:** **none — manual A/B probe only.** No upload smoke test, no CSP
  assertion test. Given this was the **third** CSP-omission incident, this is the clearest
  prevention gap in the freeze and is carried into `12_Open_Items.md`.
- **`[STAB]` lesson:** a retry policy that classifies a permanent failure as transient
  converts a loud error into a silent hang. Android's upload path must distinguish
  permanent from transient failures and surface a real error.

### `8070fd9` — Author profile showed caption-only cards for videos
- **Root cause:** `/users/[id]` only knew how to draw `photos[]`. Its local `Review`
  interface never declared `content_type/thumbnail/media_url`, and the sole media branch was
  `r.photos.length > 0`. A video post carries an empty `photos[]`; its poster lives in
  `thumbnail`. **The identical defect had already been fixed on the own-profile grid in
  `d1131b6` two weeks earlier — that fix touched other files, so `/users/[id]` diverged.**
- **Regression prevention:** none — and the commit explicitly notes `/profile/posts` and
  review search results **still carry the same defect** (see `12_Open_Items.md`).

### `24244d0` — Author profile was a different UI from the feed (Bugs #11, #12) **[SEC]**
- **Root cause:** One cause for both symptoms — the route was never migrated to components
  the product already had. `ProfileTab` hardcoded the assumption that the profile is **your
  own**: it unconditionally fetched `review_likes/review_saves/preferences/hidden`, always
  rendered Saved/Liked and the delete/hide sheet, and passed `me={userId}` — **which would
  make every visitor look like the owner of every post on that grid.**
- **Fix:** `ProfileTab` takes `viewerId` and gates all of that on `isOwnProfile`; private
  lists are **no longer requested** for someone else's profile, so a misconfigured RLS policy
  cannot leak them; `me={viewerId}` closes the ownership hole. Net **−158 lines**.
- **Regression prevention:** ✅ existing `profileGridDelete.test.tsx` updated; no new test
  for the ownership gate specifically.
- **`[SEC]` lesson:** don't request private data and hide it — **don't request it.**

### `15e7ffa` — Same URL rendered two different pages depending on the viewer (Bug #18)
- **Root cause:** Layout and permission concerns were conflated in one `isOwnProfile`
  boolean. Rejected by the Product Owner: a route must have one shape.
- **Fix:** Split into two independent axes — `variant` comes from the **route**,
  `isOwnProfile` gates **permissions only**.
- **Regression prevention:** **mechanical** — grep for `isOwnProfile` inside any `className`
  returns nothing; all 12 layout ternaries key on `variant`. A manual check, not a lint rule.

### `e0dcf4c` — 729×322 px gray block on `/users/[id]` desktop (Bug #19)
- **Root cause (measured at 1456×900):** `/reviews` confines every tab to a centred 448 px
  column, so its 3-column grid is always a full row. `/users/[id]` rendered `ProfileTab`
  **bare** — hero centred at 768 px while the grid ran full-bleed 1456 px with up to 6
  columns, guaranteeing partial rows; the empty cells exposed the grid's gray hairline
  background.
- **Fix:** One `max-w-container-content` container for hero, tab bar and grid; columns
  recalculated; from `sm` up the grid background is black so partial rows blend.
- Option A (recolouring alone) was **rejected by the Product Owner as masking the symptom.**

---

## 2026-07-23 — Notifications and feed Back-restore

### `8f12722` — A comment on your review never reached the Inbox (Bug #20A)
- **Root cause:** The InboxTab UI already fully supported `type='comment'`, but
  `GET /api/notifications` only aggregated follow, like and milestone — **it never read
  `review_comments`.** Comment coverage was lost when the notification MVP was reverted and
  never restored.
- **Fix:** One route, +29/−1 — a third query mirroring the existing like aggregation:
  comments on my visible reviews, authored by someone else, newest first, capped at 15.
- **Regression prevention:** none — validated by replicating the endpoint's filters against
  **production data** across three scenarios.

### `b90fc0a` — Back from an author profile landed on a different clip (Bug #8)
- **Root cause:** The feed remounted at the top slide of a freshly-fetched — and for
  trending, **re-ordered** — page 0. The active clip lived only inside an inner snap-scroll
  container: no per-clip URL, no history entry, nothing persisted.
- **Fix:** Persist active clip id + feed type to `sessionStorage`; on a Back/Forward
  traversal (via `popstate`) scroll to that clip **by id** after reload. Restore-by-**id**,
  not index, tolerates the non-deterministic trending order.
- **Regression prevention:** ✅ **`src/app/reviews/feedBackRestore.test.tsx`** — the first
  purpose-built regression suite in this thread.

---

## 2026-07-24 — Bug #17, Deals #14, Currency #15

### `78da9ca` — Bug #8's fix was incomplete on mobile Safari (Bug #17)
- **Root cause:** The Bug #8 restore keyed "is this a Back?" off `popstate` alone, which
  only fires for **same-document** traversals. On mobile Safari the `/reviews` page holds a
  persistent Supabase Realtime WebSocket (the notification badge channel), which **blocks
  bfcache**, so returning is a full document reload — `popstate` never fires.
- **Fix:** A mount counts as Back/Forward if a recent `popstate` fired **OR** the fresh
  document's Navigation Timing entry has `type === 'back_forward'`. Because that signal
  describes the document's *initial* load, it is **consumed once per document**, so a later
  push-visit cannot masquerade as Back.
- **Regression prevention:** ✅ **+2 tests** — cross-document Back, and the consumed-flag
  guard.

### Bug #14 — Deals link rot: `56e4495` → `d1c159c` → `85d65df`/`b4134e8` → `0ebeae7`
- **Root cause (the key finding):** The pool used campaign deep-links that returned
  **HTTP 200 but soft-404 / empty-state / redirect when actually rendered** — Shopee slug
  404s, Lazada "we lost this page", WinMart "product not served". *HTTP status was not a
  valid success criterion.*
- **Fix, staged:** (1) 13 **render-audited** entries, titles generalised so title and
  destination always describe the same thing, Baemin removed (no longer operates in
  Vietnam). (2) Product decision — 7 well-known partners, **official landing pages only**,
  no campaign/seasonal/expiring deep links. (3) **Structural** — deals moved out of code
  entirely into a DB-backed, admin-managed `partner_deals` table with RLS, serving web +
  Android + iOS from one source. `src/lib/shopee-deals.ts` **deleted**.
- **Regression prevention:** ✅ **the migration to admin-managed content is the real
  prevention** — link rot becomes an editorial fix, not a deploy. Permanent suite
  `src/lib/deals/partnerDeals.test.ts` (10 tests). A 12-point production smoke matrix is
  recorded in the release notes, including expired/future scheduling, slug immutability
  (HTTP 400), and confirmation the API never exposes `affiliate_code` / `click_count` /
  `metadata`. Admin CRUD **could not be automated** (needs the owner's admin session) and is
  listed as owner-confirmed.
- **`[COST]` note:** TikTok Shop and Grab return an anti-bot "Security Check" to the audit
  browser, so their live usability was confirmed by Product UAT on a real device.

### `16a8e56` — `1 VND = 0,0000 USD` (Bug #15)
- **Root cause:** `currency/page.tsx` formatted the two unit-rate lines with the **target
  currency's** display decimals. When one unit of the source is worth ~3.8e-5 of the target,
  that rounds to `0,0000`. The main converted amount was always correct.
- **Secondary latent bug found:** `rates[x] || 1` silently substituted a rate of **1** for an
  absent currency.
- **Fix:** `src/lib/finance/format.ts` — `formatRate` scales fraction digits by magnitude so
  a non-zero rate **never renders as 0**. `src/lib/finance/exchange.ts` — `crossRate()`
  **throws `MissingCurrencyError`** instead of returning 1.
- **Regression prevention:** ✅ **two permanent suites**, +12 tests. Honest caveat recorded
  in the release notes: the missing-rate UI branch is **not reachable through the production
  UI** because all 12 selectable currencies are always present — it is unit-tested only.

---

## The chat enrichment thread — 2026-07-24 → 07-25

**The deepest thread in the freeze: six commits, each fixing a defect introduced or exposed
by the previous one. All centre on `src/lib/ai/streamEnrichment.ts`.** Android's chat
rendering must reproduce the *final* behaviour, not any intermediate step.

### `0cdc9be` — Every photo piled into one trailing block at the bottom
- **Root cause:** The deterministic image backfill appended omitted photos as a single
  end-of-message block, and `formatMessage` renders markdown top-to-bottom.
- **Fix:** `injectPlaceEnrichment(places, fullText)` rebuilds the assistant text, splicing
  each place's photo/review/order markdown immediately after that place's own block, using
  **index-preserving `normalizeVN` offsets** (diacritic-tolerant). A length-mismatch guard
  falls back to the legacy trailing block.
- **Regression prevention:** ✅ 11 tests.
- **Accepted UX trade-off, recorded in the release notes:** repositioning needs the full
  text, so the place-list portion is **buffered and appears at end-of-generation** instead of
  typing out live. Pre-tool intro and chitchat still stream live.

### `9eddc74` — ⚠ Hotfix: the trip brochure disappeared entirely
- **Root cause:** `0cdc9be`'s positional injection spliced image markdown after place names
  that live **inside the `[TAPPY_PLAN]` JSON**, corrupting it so the JSON failed to parse.
- **Fix:** Return the legacy trailing block whenever the reply contains `[TAPPY_PLAN]`; and
  bound the injection region at the **earliest** structured marker
  (`[TAPPY_PLAN] | [CTA_BUTTONS] | [FOLLOWUPS]`) so it can never write inside any
  computer-parsed block.
- **Regression prevention:** ✅ +2 tests.
- **`[STAB]` rule this establishes: never splice text into a machine-parsed region.**

### `7ce9eb9` — Replies truncated mid-place (`finishReason: length`) **[COST]**
- **Root cause:** The deterministic per-place image/review/order URLs are long and
  %-encoded, therefore **token-heavy**; 3-place responses overran the 2048 completion cap.
- **Fix, two prongs:** **(A)** raised caps — food/product 2048→3072, planning 3000→4096,
  explicitly framed as headroom, not the norm. **(B)** `promptBuilder.ts` **stops instructing
  the LLM to write images, review links and order links inline at all**, since enrichment
  already injects them deterministically — cutting **~1.6K output tokens per 3-place reply**.
- **Regression prevention:** ✅ +1 test. **Prong B is real architectural prevention: it
  removes the token pressure instead of raising the ceiling.** This is the clearest
  cost-optimisation win in the freeze and the reason the current architecture is *"LLM writes
  prose, the system owns enrichment layout."*

### `7c113cb` — Enrichment still piled at the end
- **Root cause:** `injectPlaceEnrichment` bounded a place's window by the next **enriched**
  place only. When the sole place with photos was followed by photo-less places, its window
  ran to end-of-text and its whole gallery landed at the bottom.
- **Fix:** Bound each window by the next **mentioned** place — photo-less ones included.
  Secondly, **strip any enrichment the LLM wrote itself** and re-inject positionally, so
  placement never depends on the model obeying the prose-only prompt.
- **Regression prevention:** ✅ +2 permanent tests.

### `6aefd4b` + `b5939fc` — Plan brochure photos
- `6aefd4b` (owner request): put a representative image **inside** each trip-plan item.
  `injectPlanPhotos()` **edits the parsed JSON object and re-serializes — it never splices
  markdown, explicitly citing hotfix `9eddc74` as the reason.**
- `b5939fc` — **Issue:** only **1 of 6** plan items got a photo in production.
  **Root cause:** a trip plan runs several place-searches (hotels, food, attractions), but
  the stream filter's `a:` handler **overwrote** `latestPlaces` on each tool call.
  **Fix:** append and dedupe by name, upgrading to the entry that carries a photo.
- **Regression prevention:** ✅ +1 test.

### `79d05f3` — **PRODUCTION HEAD** — enrichment fell back to the trailing block again
- **Root cause:** The **LLM rewrites tool place names.** It shortens
  (`"Hủ tiếu Sa Đéc & Bánh tằm - DÌ NĂM SA ĐÉC - 166 Bùi Thị Xuân, Quận 1"` →
  `"Dì Năm Sa Đéc"`) and respells (`"Hủ Tíu"` → `"Hủ Tiếu"`). A raw `indexOf(fullName)`
  therefore missed the place entirely.
- **Fix:** New `src/lib/ai/placeMatch.ts` — `findPlaceOffset()`, an owner-approved 4-tier
  cascade: **(1)** Canonical Display Key (the LLM's bold header matched to the tool name by
  substring either way), **(2)** exact verbatim, **(3)** distinctive segment (split on
  `- | ( ,`), **(4)** token overlap, guarded, with fuzzy only as last resort.
- **Regression prevention:** ✅ **+7 tests in the new `placeMatch.test.ts`**. Extracting
  matching into its own tested module is the strongest prevention in this thread.

---

## 2026-07-25 — Freeze-day fixes

### `d1fe77c` — Flight "đặt vé" link opened an error page
- **Root cause:** The link pointed at Aviasales — a foreign brand VN users don't recognise —
  and its `/search/{ORIG}{DEST}` form carries **no date**, which is structurally invalid.
- **Fix:** `buildFlightLinks()` produces a Traveloka one-way deep link
  (`fullsearch?ap=O.D&dt=DD-MM-YYYY`) plus a Google Flights fallback. Emitted on success
  **and on every error branch**, defaulting departure ~7 days out so the date stays valid.
- **Regression prevention:** ✅ `travel.test.ts` asserts route, `DD-MM-YYYY` shape, the
  no-date fallback, and **never aviasales**.

### `fd74f36` — Broken cover art for the 12 Jamendo tracks
- **Root cause:** Jamendo covers are hotlinked from `usercontent.jamendo.com`, absent from
  `images.remotePatterns`, so the `next/image` optimizer returned **400**.
- **Fix:** Added `*.jamendo.com`.
- **Regression prevention:** none. **Same class as the CSP omissions: a host allowlist with
  no automated coverage.**

### `22094a7` — TTS read Vietnamese with an English voice
- **Root cause — three compounding:** `useTTS` hardcoded `utter.lang = 'vi-VN'`; called
  `getVoices()` **synchronously**, which is empty on the first call in Chrome; and when no
  `vi` voice existed it left `utter.voice` unset, so the browser fell back to its default
  English voice. On Windows desktop there is typically **no Vietnamese voice at all**
  (measured: 3 English, 0 vi).
- **Fix:** `pickVoice(voices, langCode)` returns the best same-language voice or **`null` —
  never a wrong-language voice**. `useTTS` **awaits `voiceschanged`** before selecting, and
  when null exposes `unavailableLang` and does not speak. Language comes from the pipeline's
  own `detectLang(text)`, not a new heuristic.
- **Regression prevention:** ✅ **+8 tests**. Commit notes the translate page has the same
  class of issue (open — see `12_Open_Items.md`).

### `199b63d` → `b788e48` — Profile grid gray cell (two iterations)
- **Root cause:** The grid draws TikTok-style hairline separators via `gap-px` over a lighter
  `bg-gray-800` container showing through the gaps. On phones a partial last row left empty
  cells exposing the **full** `gray-800`.
- **Fix 1 (`199b63d`):** `trailingFillerCount(items, cols)` appends filler divs to complete
  the last row.
- **Fix 2 (`b788e48`):** **The filler used the wrong colour.** It was `bg-gray-900` (the tile
  colour) but the profile scrolls on `bg-black`, and `gray-900` is lighter than black — so
  the empty cell was **still a visible box in production.** Changed to `bg-black`.
- **Regression prevention:** ✅ `gridFill.test.ts` covers the **arithmetic** — which is
  exactly why it did not catch the colour error. The second bug was purely visual and needed
  live DOM inspection plus a production screenshot.
- **`[STAB]` lesson: "does it blend" bugs cannot be caught by unit tests.** They require a
  production screenshot against the real page background.

### `ad79689` — Login page did not match the approved mockup
- **Root cause:** Stated plainly in the commit body — the preceding commit **did the opposite
  of the request**: it removed the copyright line and kept the statistics block.
- **Fix:** Removed the footer statistics block, the `STATS` array and now-unused imports;
  restored "© 2025 TappyAI. All rights reserved."

### `dd74359` — Language picker reappeared on every refresh, restart and logout
- **Root cause:** `setLocale()` early-returned (`if (current === next) return`) **before**
  writing localStorage. On first visit `current` is seeded to the auto-detected locale
  *before* the user picks, so choosing the language that matches the browser — **the common
  case** — skipped the write. `tappy_lang` was never stored, so the picker rendered again
  every time.
- **Fix:** `setStoredLocale(next)` **always** runs before the early return.
- **Regression prevention:** ✅ **`localePersistence.test.ts`**, +3 tests.
- Storage is `localStorage 'tappy_lang'`, per-browser, by design — see `09_ADRs.md`.

### `807d77b` — UI said 15 s while the app accepted 60 s
- **Issue:** Production told users their video could be at most **15 seconds** while the
  uploader accepted **60** — *people were cutting clips they did not need to cut.*
- **Root cause:** `b568c62` raised the rule to 60 s/62 s in `product.ts`, but the composer's
  **hint string in the i18n bundle was left at "15s"**. The UI's own error message already
  said 60. Classic config/copy drift.
- **Fix:** `src/lib/i18n/w2/reviewNew.ts` → 60 s in both locales. The 62 s tolerance stays
  internal and **is never surfaced to users.**
- **Regression prevention:** **none — no test or lint rule ties the i18n hint to
  `MAX_VIDEO_DURATION_SEC`**, so this drift can recur. Carried into `12_Open_Items.md`.

---

## Patterns — read this section before writing Android code

### 1. CSP host omissions caused three separate outages
`0f7b1ce` shipped the policy → `936acf6` patched blob storage hosts **incompletely, and its
wrong comment caused the next one** → `3fd234f` patched `graph.zalo.me` after Zalo login
broke on all platforms → `900289a` patched the blob **API** host after **two weeks of 100 %
upload failure**. Every one was found by manual probing. **No automated CSP coverage exists
at the freeze.**

### 2. Silent-failure masking is the recurring severity multiplier
`900289a` (CSP refusal → `TypeError` → SDK retry → indefinite hang, not an error);
`f9dbccb` (throw outside try/catch → 500); `39270be` (unapplied migrations → silent
registration failure); `a1c318d` (empty array silently wiping memory).
**Rule: a failure that cannot surface as an error will not be found by users reporting it.**

### 3. Divergent duplicate surfaces cause the same bug twice
`d1131b6` vs `8070fd9` (video poster in two profile grids); `a7609d9` (SearchBar has its own
SpeechRecognition). `24244d0` fixed this class **structurally by deleting the duplicate**
(−158 lines). Two known-identical latent defects were deliberately left in `/profile/posts`
and the search-results grid — see `12_Open_Items.md`.

### 4. Testing improved sharply, but only late
Fixes before ~07-22 have essentially **no** regression tests. From `b90fc0a` onward almost
every bug ships a permanent suite. The freeze's 253 tests are heavily weighted to the last
week of work.

### 5. Tests are not CI-gated
The only workflow is `.github/workflows/architecture-guard.yml`, which runs
`scripts/architecture/check.mjs` (no vendor SDK imports, no hardcoded model ids, no facade
bypass). **It does not run the unit tests.** The re-enabled TS/ESLint build gates and the
architecture guard are the only automated gates in the pipeline.

### 6. Cosmetic bugs consistently needed 2–3 iterations
Unit tests cover arithmetic, not rendering: gray-cell (3 passes), desktop arrows (3),
autoplay/mute (11), enrichment (6). **Live DOM inspection and production screenshots — not
tests — closed each of them.**
