# Phase 7 — Web UAT regression audit (2026-09-22)

Branch `uat/release-audit-2026-09` (worktree `g1-place-guard`), web at http://localhost:3000, audit DB `zdaprdfgpbpnxyofagmc`.
Audit FIRST, then fix. Reuse → restore → extend → create-last. Nothing committed; everything left unstaged.

## 0. Root causes that span several issues

| # | Finding | Evidence |
|---|---|---|
| R1 | **Merge `1e7b77e` discarded a whole side of `globals.css`.** The merge of `wip/cool-vaughan` (3fe8c12, 4476 lines) into `a6ca9f0` (4259 lines) kept `a6ca9f0`'s file wholesale, so every rule the cool-vaughan side had added was lost — including the entire `.v3-post-*` block that `aa229fc` (the approved composer redesign) authored, plus the `.v3-pp-*` public-profile skin. `page.tsx` for the composer WAS merged, so the markup ships without its stylesheet. | `git show 1e7b77e^2:src/app/globals.css \| grep -c v3-post` → 76; `git show 1e7b77e:src/app/globals.css \| grep -c v3-post` → 0. Class-usage sweep: 34 `v3-post-*` classes used in `reviews/new/page.tsx`, 0 defined anywhere. |
| R2 | **The audit DB has no media content.** `reviews` holds exactly 1 row (text-only, F-037); `music_tracks`, `music_categories`, `music_providers` are all empty. Explore's "Chưa có video nào" is the honest render of an empty feed, not a code regression. | `select count(*) from reviews` → 1; music tables → 0. `ExploreStage.tsx` (1008 lines, the approved three-column stage) is intact at HEAD. |
| R3 | **Uploads cannot work on this host.** The only media writer is GCS via Vercel WIF; outside a Vercel deployment `VERCEL_OIDC_TOKEN` is absent, so every `putMedia` fails closed (documented in MANUAL-UAT-HANDOFF §5). Composer photo/video, avatar and any new group avatar all need `vercel env pull` (owner) to be exercised end-to-end here. | `src/lib/media/index.ts` (`getMediaProvider` → GCS only), `gcpAuth.ts` (`VERCEL_OIDC_TOKEN`). |
| R4 | **The real clips exist — in the production media bucket, which lists publicly.** `https://storage.googleapis.com/tappyai-media-prod?prefix=videos/` answers an XML listing anonymously: 4 clips (2 uploaders, 2026-08-13 / 08-18) with matching thumbnails. These are the owner's own UAT clips. ⚠️ Public *listing* of a media bucket is itself a finding (every user's media key is enumerable) — reported, not changed. | curl of the bucket root (see §6). |
| R5 | **Music: the "library" that existed is Jamendo CC-BY hotlinks (100 rows seeded on prod by `scripts/ingest-jamendo.mjs`) + 14 SoundHelix demo tracks self-hosted in `/public/music`.** Jamendo's API terms (fetched 2026-09-22, devportal.jamendo.com/api_terms_of_use): *"The API may be used freely for non-commercial uses. For any other type of use including … commercial uses please contact … licensing@jamendo.com"*, and require crediting artist + Jamendo + a backlink per track. TappyAI is monetised (Pro, affiliate), so the Jamendo catalogue is **not cleanly licensed for production without an agreement** even though each track is CC-BY. SoundHelix's site was unreachable (HTTP 500) so its terms could not be re-verified today; the seed migration calls it "free to use, REPLACEABLE DATA". | Commits 93683e0, 20260705_seed_music_demo_catalog.sql, 20260706c_repoint_music_audio_local.sql. |
| R6 | **No shared "in-app back" primitive.** `Header` has `backFallbackHref` (history-length based); `ReviewClipView` uses `document.referrer` (which never changes on client-side navigation, so a tab that opened on `/profile` and client-navigated to a clip always thinks it "came from outside" and pushes `/reviews`); six tool pages hard-link Back to `/`. | grep in §7. |

## 1. Issue-by-issue audit table

| Issue | Root cause | Existing impl found | Planned fix | Files affected |
|---|---|---|---|---|
| **1. Post/Upload UI broken** | R1 — markup from `aa229fc` ships, its 200-line `.v3-post-*` stylesheet was dropped by merge `1e7b77e`. Live: tabs render as unstyled stacked blocks, chips lose their pill, drop-zone overlaps the top bar. | The complete block in `3fe8c12:src/app/globals.css` L4090–4290 (incl. `.v3-post-error`, `.v3-post-tag`, reduced-motion rule). Mascot (`TappyPresence` welcome pose), upload/caption handlers untouched. | **Restore** the block verbatim from `3fe8c12` (append to `globals.css`). No markup change. | `src/app/globals.css` |
| **2. "Gợi ý cho bạn" vs Smart Tools "Gợi ý"** | Three labels for one destination: Home "Gợi ý dành cho bạn" (prompt suggestions, See-all → `/recommendations`), Smart Tools tile "Gợi ý" → `/recommendations`, sidebar row labelled **"Search"** → `/recommendations`. `/recommendations` itself is the personalised-places page (`/api/recommendations`, recommendation engine) — a distinct feature from Home's prompt strip, not a duplicate. | `src/lib/tools/registry.ts` (`suggest`), `V3Shell.tsx` capability group, `HomeV3.tsx` for-you section, `/recommendations/page.tsx`. | **Consolidate the name**: one canonical label "Gợi ý cho bạn" for the tile and the sidebar row (the row currently lies: "Search"). Keep Home's strip (different content, honest title) with its See-all pointing at the same page. Fix `/recommendations` Back (`router.push('/')`) → in-app back, fallback `/tools`. | `src/lib/i18n/v3/web.ts`, `src/components/v3/V3Shell.tsx`, `src/app/recommendations/page.tsx` |
| **3. Scam Shield naming + nav** | Tile label is `v3.tool.safety` = "An toàn" while nav/page say "Cảnh báo lừa đảo"; the Bộ Công an dataset's VI `whatToDo` copy says "… của Scam Shield" (3 rows) — surfaced in the VI UI. Nav: the destination pages `currency`, `split-bill` (`<Link href="/">`), `boi`, `viet-content` (`backHref="/"`), `recommendations` (`push('/')`) all send Back to Home regardless of parent. `/scam-shield` itself has no in-page Back (browser Back → `/tools` verified OK). | URL/QR/message checks: `ScamShieldView` 3 tabs + `/api/scam-shield/{check,qr,analyze}` intact (scamShieldV3.test). | Rename VI tile label to "Cảnh báo lừa đảo"; replace "Scam Shield" in the 3 VI dataset strings; new `useInAppBack(fallback)` helper; convert the 5 pages' Back to history-back with `/tools` fallback. EN keeps "Scam Shield"; internal names untouched. | `src/lib/i18n/v3/web.ts`, `src/lib/scam-shield/knowledge/bocongan2026.ts`, `src/lib/nav/inAppBack.ts` (new), `currency/page.tsx`, `split-bill/page.tsx`, `boi/BoiLandingView.tsx`, `viet-content/VietContentView.tsx`, `recommendations/page.tsx`, `components/Header.tsx` |
| **4. Group Back + group avatar** | `group/new` and `group/[id]` both render `<Header backHref="/">`. `groups` table has no avatar column; the page draws a static `Users` glyph. | Avatar infra: `POST /api/profile` (magic-byte sniff `sniffImageType`, `putMedia('avatars/…')`, 3 MB cap) + `profile/edit` upload handler. Group RLS "Creators manage own groups" (creator = the only admin role that exists). | Back → in-app back (fallback `/tools` for `new`; `/tools` for `[id]`). Avatar: migration `20260922_groups_avatar_url.sql` (+rollback), `POST /api/group/[id]/avatar` (creator-only, same sniff/size/putMedia, key `groups/<id>-<suffix>`), GET returns `avatar_url`, page shows avatar + creator-only change control. Upload itself needs R3. | `supabase/migrations/…`, `src/app/api/group/route.ts`, `src/app/api/group/[id]/avatar/route.ts` (new), `src/app/group/[id]/page.tsx`, `src/app/group/new/GroupNewForm.tsx` |
| **5. Music removed too far** | F-024/F-034 retired *everything*: library GETs (410), `/music` → notice, composer chip, module deleted, feed playback of an attached track removed, `music_tracks` grants revoked. The Smart Tools "Nhạc" tile still points at the notice page (dead tile). | R5. Pre-removal code: `src/modules/music/*` (c584367^), `/music` V3 library UI (ef046c0, 21cc9cf^), composer picker (21cc9cf^), feed attached-sound playback (c584367^), `POST /api/reviews` `b.music` (919736a^). | **Restore the licensed-library path only**: module (repository moved server-side behind the admin client, hooks → API), GET `/api/music/{tracks,tracks/[id],tracks/search,categories}` serving `music_type='royalty_free'` + `is_active` only; `/music` library page; composer "Thêm nhạc" chip + picker; `POST /api/reviews` accepts `music` only for a royalty_free track; feed/detail play the attached library track with an attribution card. **Keep 410**: `/api/upload/audio`, `POST /api/music/tracks` (UGC publish), `/api/sound/*` (save/follow/play/"use this sound"), `/music/upload`, `/sound/[id]`; `original_sound` rows are never served. DB lockdown stays (no client-direct reads). Licensing decision (R5) flagged to owner; audit DB gets the 14 self-hosted SoundHelix rows via the existing seed migration so the flow is testable. | `src/modules/music/**`, `src/app/api/music/**`, `src/app/music/page.tsx`, `src/app/reviews/new/page.tsx`, `src/app/api/reviews/route.ts`, `src/app/reviews/feedShared.tsx`, `src/app/reviews/[id]/ReviewDetailView.tsx`, `src/app/reviews/ReviewMusicCard.tsx` |
| **6 + 10. Explore empty / not UAT-able** | R2 + R3. Code path intact (`ExploreStage`, `feed/route.ts`, `isExploreRenderable`). | The 4 real clips + thumbnails in the prod bucket (R4). | Seed reviews for the 4 real clips under the UAT accounts on the audit DB (documented, reversible SQL), then walk Explore → clip → like/comment/share → creator profile → Back → Explore. | audit DB only (SQL in §6) |
| **7. QR Back / delete / Profile→Post→Back** | QR Back is `<Link href="/profile">` (a push, ignores where you came from). Profile→Post→Back: text posts go through `ReviewBackButton` (`history.length>1` → back — worked in test); video posts go through `ReviewClipView` whose `document.referrer` test is wrong for SPA navigation (R6) → lands on `/reviews`. "QR delete": no delete exists on the QR page; the only delete in this area is a post's own delete (`DELETE /api/reviews/[id]`, ClipViewer `onDelete`) — verified live after seeding (§6). | `Header.goBack`, `ReviewBackButton`, `ReviewClipView`, `ProfileTab.ClipViewer`. | One helper `src/lib/nav/inAppBack.ts` (tracks in-app navigation depth per tab; `goBack(router, fallback)`), used by Header, ReviewBackButton, ReviewClipView, QR page, group pages, tool pages. | as listed |
| **8. Share is a raw OS dialog** | `QRProfileView.share()` and `QRProfileButton` call `navigator.share` directly. | `components/share/ShareMenu` — the branded TappyAI sheet already used by reviews/plans/chat (Copy, Zalo, FB, WhatsApp, Telegram, Email, Inbox, Save, "Other apps" only when `navigator.share` exists; never claims an app is installed). | Route both QR surfaces through `ShareMenu` with the canonical `absoluteUrl('/users/<id>')` (the only host `isShareableUrl` admits). | `src/app/profile/qr/QRProfileView.tsx`, `src/components/QRProfileButton.tsx` |
| **9. Branded QR download** | Download rasterises the bare SVG only. | `TappyLockup` (shipped mark `/branding/otter-logo.png` + "Tappy"/"AI" wordmark), encoder `lib/qr/qrcode.ts`, decoder `qr/decode.js` (+sharp) already in the scam-shield QR path. | Compose the PNG: white card, quiet-zone QR, mark + wordmark, display name, margin; keep the on-screen code plain. Verify by decoding the produced PNG in Node with the same decoder → URL ends in `/users/<that user's id>`; two accounts → two URLs. | `src/app/profile/qr/QRProfileView.tsx` (+ test) |

## 2. Global nav sweep (CHILD → Back → ACTUAL PARENT)

`grep -rn "router.push('/')|router.replace('/')|href=\"/\"|backHref=\"/\"|router.push('/reviews')"` (non-test):

| File | Today | Verdict |
|---|---|---|
| `currency/page.tsx:115`, `split-bill/page.tsx:101` | `<Link href="/">` as the Back glyph | **bug** → in-app back, fallback `/tools` |
| `boi/BoiLandingView.tsx:76`, `viet-content/VietContentView.tsx:18` | `<Header backHref="/">` | **bug** → drop `backHref`, `backFallbackHref="/tools"` |
| `recommendations/page.tsx:55` | `router.push('/')` labelled "Trang chủ" | **bug** → in-app back, fallback `/tools` |
| `group/new/GroupNewForm.tsx:66`, `group/[id]/page.tsx:156` | `<Header backHref="/">` | **bug** → in-app back, fallback `/tools` |
| `profile/qr/QRProfileView.tsx` | `<Link href="/profile">` | **bug** → in-app back, fallback `/profile` |
| `reviews/[id]/ReviewClipView.tsx:43` | `document.referrer` gate | **bug** (R6) → helper |
| `reviews/[id]/ReviewBackButton.tsx:15` | `history.length>1` | works in-app; a fresh-tab deep link still walks out of the site → helper |
| `reviews/creator/[id]/page.tsx:67` | `router.push('/reviews')` on a failed profile fetch | acceptable (error path), left |
| `V3Shell.tsx:271` | `router.replace('/')` after sign-out | correct (Home is the public surface) |
| `age-check`, `error.tsx`, `not-found`, logo links, `tools/ToolsView.tsx:82` ("do more with TappyAI") | destination links, not Back | correct |
| `profile/bookings`, `price-watches`, `tappy-knows` | `href="/"` CTAs inside empty states | destination links, left |

## 3. Out of scope, reported only

- R4: public bucket listing on `tappyai-media-prod` (security/privacy).
- R1 also dropped the cool-vaughan `PublicProfileView` V3 skin (`/users/[id]`, 472 lines) and profile cover/bio work; not part of the 10 items, not restored here.
- R5: the Jamendo commercial-use question is an owner/legal decision; the code below serves only rows with `music_type='royalty_free'` and shows attribution, it does not decide the licence.
- iOS still ships the old music-reuse module (F-024 note) — untouched.

## 4. What was done (all UNSTAGED, nothing committed)

| Issue | Change | Verified how |
|---|---|---|
| 1 | `.v3-post-*` block (202 lines) appended to `globals.css`, byte-exact from `3fe8c12`. No markup change. | Live at 1280 and 375 px: hero, drop card, 3 tabs, chips, visibility card render as the approved design. |
| 2 | `v3.tool.suggest` = "Gợi ý cho bạn" / "Suggested for you"; sidebar row uses that key (was "Search"); `/recommendations` Back → in-app back, fallback `/tools`. | `/tools` tile, sidebar row and Home "see all" now name one destination. |
| 3 | `v3.tool.safety` VI = "Cảnh báo lừa đảo" (EN "Scam Alerts"); 3 Bộ Công an VI strings de-branded. Nav: `lib/nav/inAppBack` + `NavHistoryTracker` (root layout) + `InAppBackButton`; `Header.goBack` uses it; currency, split-bill, boi, viet-content, recommendations, music, both group pages, QR page, `ReviewBackButton`, `ReviewClipView` all go through it. | `/scam-shield` body contains 0 × "Scam Shield", 2 × "Cảnh báo lừa đảo". Live: `/tools → /currency → Back → /tools`; deep link `/split-bill` → Back → `/tools` (fallback, no off-site pop). |
| 4 | Back on `/group/new` and `/group/[id]` → in-app back (fallback `/tools`). Group avatar: migration `20260922_groups_avatar_url.sql` (+rollback, APPLIED to the audit DB), `POST /api/group/[id]/avatar` (creator-only 403, sniffed, 3 MB, `avatars/group-<id>-…`, RLS-scoped UPDATE with row check → no fake success), GET returns `avatar_url`, page shows the picture + creator-only camera control; added to the social-write boundary test. | Live: `/tools → /group/new → create → /group/<id> → Back → /group/new` (stack `["/tools","/group/new","/group/<id>"]` index 2→1). Avatar control renders for the creator only; upload answers 500 `upload_failed` here (R3: no WIF token on this host) and the page shows the server's message, DB stays null. |
| 5 | Music LIBRARY restored: `src/modules/music` back with the repository server-only (admin client, `music_type IN ('royalty_free','licensed')`, `license`/`source_url` read), hooks on a fetch client, browser barrel free of the repository; GET `/api/music/{tracks,tracks/[id],tracks/search,categories,providers}` live; `/music` = the approved redesign minus the UGC upload action/pill, Back → in-app; composer "Thêm nhạc nền" chip + picker + selected card (with attribution); `POST /api/reviews` accepts `music` only when `getTrack()` finds a library row, else 410; feed/detail play the attached track (VideoPlayer `hasSound/soundUrl`) and show the credit; `ReviewMusicCard` is attribution only (no `/sound` link). Kept 410: `/api/upload/audio`, `POST /api/music/tracks`, `/api/sound/*`, `/music/upload`, `/sound/[id]`. `music_tracks` lockdown untouched. Audit DB: `add_music_attribution.sql` applied, providers seeded, the 14 self-hosted SoundHelix rows seeded via the existing seed + repoint migrations. | Live: `/api/music/tracks` 200 (14), categories 200 (6), search 200; `/api/sound/x` 410. `/music` renders chips + tiles, preview plays (`/music/soundhelix-song-4.mp3`). Composer: chip → picker → "Chọn nhạc này" → selected card. Server: POST with a library id → 200 and stores `{origin:'attached',…}`; POST with a non-library id → 410 (both rows cleaned up). |
| 6/10 | 4 real clips (R4) seeded as PUBLISHED video reviews on the audit DB: 2 × manual.uat.user, 1 × pro, 1 × admin (ids in §5). | Live as manual.uat.user: Explore stage shows 2 clips (own posts are excluded by the feed rule), video plays, like toggles (count 0→1→0), creator link → `/users/<admin>` → Back → `/reviews`. |
| 7 | QR Back → in-app back (fallback `/profile`); clip close uses the stack, not `document.referrer`. "QR delete": there is no delete on the QR surfaces; the post delete is the ⋮ → "Xoá bài" menu on an own clip → `DELETE /api/reviews/[id]`. | Live: Profile → video post → close → `/profile` (referrer was `""`, which the old code read as "from outside"). Delete: 200, row gone from the DB (clip re-seeded afterwards). QR page → Back → `/profile`. |
| 8 | QR page and profile QR modal share through `ShareMenu` with `absoluteUrl('/users/<id>')`. | Live: sheet opens (Facebook, Zalo-as-copy, WhatsApp, Telegram, Viber, LINE, TikTok, Email, Tappy Inbox, Save, Copy); Copy wrote `https://www.tappyai.com/users/5c674157-…` and said "Đã sao chép". |
| 9 | `lib/qr/brandedCard.ts`: white card, lockup (shipped mark + "Tappy"/"AI"), quiet-zone QR, display name, caption; download uses it. | The PNG the page produced (909×1172, 73 KB) decoded with `qr/decode.js`+sharp → `http://localhost:3000/users/5c674157-7bfd-4eb5-b1b1-6c61d13b30ef`, which resolves to "Minh Anh (UAT)"; `/users/892c7032-…` resolves to "Quốc Huy (UAT Pro)" (different user → different destination; the id comes from the server session, no hardcoding). |

## 4b. Build / typecheck / lint / tests (exact)

- `tsc --noEmit`: **0 errors**.
- `next lint`: **0 errors**, 2 warnings, both in untouched files (`BrandLogo.tsx` img, `TappyMascotState.ts` deps).
- `next build` (run in an isolated detached worktree with the same patch, so the owner's running dev server and its `.next` were not touched): **exit 0**, all routes compiled.
- `vitest run` (full): **13 708 passed / 4 failed / 210 skipped** across 747 files. After fixing the one failure my change caused (`categoryLabel.test.ts` read the file `getCategoryLabel` moved out of) the touched suites (`src/modules/music`, `src/app/reviews`, `src/app/profile`, `src/app/api/reviews`, `src/lib/auth`) are **578 passed / 0 failed**. The remaining failures were re-run on a pristine `7487b4d` checkout and **fail identically there — pre-existing, not from this work**: `clientFeatureParity › Music` (Android `music/` folder was deleted in ae2a777), `chatPlaceDecisionWiring › still renders after the turn is saved`, `supabase/tests/portAllocation › no two suites share a port`, and the four embedded-Postgres DB suites (`cohort_metrics_rollup`, `daily_snapshots_rollup`, `moderation_queue_boundary`, `user_notes_boundary`: `0xe2 0x9c 0x85 … no equivalent in encoding "WIN1252"` on this host).

## 5. Audit-DB writes made this session (reversible)

```sql
-- groups.avatar_url (migration 20260922_groups_avatar_url.sql); rollback file drops it.
-- music: add_music_attribution.sql; INSERT music_providers (internal, pixabay); 20260705 seed (6 categories + 14 SoundHelix rows); 20260706c repoint to /public/music.
DELETE FROM public.music_tracks WHERE artist = 'SoundHelix';                -- undo the demo catalogue
DELETE FROM public.reviews WHERE body LIKE '[UAT clip %';                    -- undo the 4 seeded clips
-- seeded clip ids: 7aaf5559-6dbb-417c-b758-96460d4aec22, d92a22d7-bff1-4428-b026-336192fb027e,
--                  e681d4cd-6182-456e-ac43-b782bdf97c1b, 8d959f57-3f60-48f9-966a-d769c2185bbb
```
Two throwaway groups created during the walk-through were deleted again; the music-attach test review was deleted.

## 6. Owner decisions still open

1. **Music licensing (R5).** The library code serves only rows typed `royalty_free`/`licensed` and shows the recorded credit. Production's catalogue is Jamendo API hotlinks, and Jamendo's API terms are non-commercial without an agreement (licensing@jamendo.com). The SoundHelix demo rows are the seed migration's "replaceable data". Decide: license Jamendo, self-host CC-BY files with attribution recorded in `license`/`source_url`, or replace the catalogue. Until then the audit env's library is the 14 SoundHelix demos.
2. **Uploads on this host (R3).** Composer photo/video, avatar and group avatar need `VERCEL_OIDC_TOKEN` (`vercel env pull`) to be exercised here end-to-end.
3. **Bucket listing (R4).** `tappyai-media-prod` answers anonymous object listings.
4. Whether to also restore the cool-vaughan `/users/[id]` V3 profile skin that merge `1e7b77e` dropped (R1, out of scope here). → **Done in the closure pass, §7.3.**

---

# Closure pass (2026-09-22, later the same day)

## 7.1 Music licensing — status: **RESOLVED for what is served; PRODUCTION CATALOGUE STILL NEEDS A DECISION**

Every track the library can serve today (audit env) — 14 rows, all `music_type = royalty_free`, all self-hosted under `/public/music/soundhelix-song-{1..14}.mp3`:

| Field | Value |
|---|---|
| Source | SoundHelix audio examples, `https://www.soundhelix.com/audio-examples` (files copied into `/public/music` on 2026-07-06, commit 89ca325/6837b5c; original objects `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-N.mp3`) |
| Artist | T. Schürger (the page's "Artist" column, songs 1–14) |
| Licence | **No formal licence text.** The page's grant, verbatim: *"You may use these audio examples in any way you like, but you must give credit to SoundHelix and the artist of the respective song."* (`/license` on that site is the GNU GPLv3 for the SoundHelix *software*, not the songs.) |
| Commercial use | Permitted by the wording ("in any way you like"); it is an informal site statement — no warranty, no versioned terms |
| Attribution | **Required**: SoundHelix + the artist |
| Safe for TappyAI commercial/Pro use? | **Usable with credit**, on the strength of that statement. Recommend the owner keep the dated page copy and, if legal wants certainty, ask SoundHelix for a one-line written confirmation |

Evidence kept: `docs/uat/evidence/soundhelix-audio-examples-2026-09-22.html` (the page as fetched; it answers HTTP 500 but the body is intact). Recorded on the rows by `supabase/migrations/20260922_music_soundhelix_attribution.sql` (applied to the audit DB): real title `SoundHelix Song N`, artist `T. Schürger · SoundHelix`, `license`, per-song `source_url` (the seed had labelled them artist "SoundHelix" with invented Vietnamese titles). The feed/detail credit and the composer card now read "T. Schürger · SoundHelix · Free use with credit (SoundHelix audio examples)" and link the source. `0 of 14` rows are unlicensed.

**Not resolved — production's catalogue (owner decision):** production `music_tracks` holds ~100 Jamendo rows (`scripts/ingest-jamendo.mjs`, CC-BY tracks hot-linked via `mp3d.jamendo.com/?trackid=…&from=app-<client_id>`). Jamendo's API terms (devportal.jamendo.com/api_terms_of_use, fetched 2026-09-22): *"The API may be used freely for non-commercial uses. For any other type of use including … commercial uses please contact … licensing@jamendo.com"*, plus credit + backlink per track and no caching. TappyAI is monetised (Pro, affiliate) → **not safe for commercial use as ingested**. Those rows also have `license`/`source_url` NULL (the ingest never wrote them). Options: sign a Jamendo licence; or self-host each CC-BY file with recorded attribution (CC-BY itself allows commercial use — the API terms are what restrict the hot-link); or deactivate them. No tracks were added; the UGC/reuse path (`original_sound`, `/api/sound/*`, `/api/upload/audio`, POST tracks) stays 410 and never served.

## 7.2 Storage security — status: **DIAGNOSED, FIX PREPARED, NOT APPLIED (permission)**

Bucket `tappyai-media-prod` (project `aerobic-lock-498409-u7`, ASIA-SOUTHEAST1, uniform bucket-level access ON, so IAM is the only policy layer). IAM as read on 2026-09-22:

| Member | Role | Grants |
|---|---|---|
| `allUsers` | `roles/storage.objectViewer` | `storage.objects.get` **and `storage.objects.list`** (+ folders get/list) |
| `serviceAccount:tappyai-media-bridge@…` | `roles/storage.objectUser` | create / get / list / update / delete objects — the app's server-side writer (WIF) |
| project owner/editor/viewer | legacy bucket/object owner/reader | console + gsutil use |

Measured anonymously: object GET → 206 (range) ✓ needed; bucket LIST → **200 (the finding)**; object PUT → 403; object DELETE → 403.

- **Anonymous object READ is required.** Every media URL is used directly by `<video>` / `<img>` / `next/image`: `media_url`, `thumbnail`, `photos[]`, `avatar_url`, `cover_url` are absolute `https://storage.googleapis.com/tappyai-media-prod/...` URLs (Explore feed and stage, clip viewer, review detail, profile grid, avatars everywhere, the new group avatar). No signed URLs anywhere.
- **Anonymous LIST is NOT required.** grep of `src/lib/media`, `src/app/api`, Android and iOS: no code lists the bucket. The three GCS calls the app makes (`providers/gcs.ts`) are resumable-upload create, upload PUT, and `statObject` (objects.get) — all with the service-account token. Nothing deletes objects (there is no delete path in the app; `objectUser` on the SA is broader than the app uses).
- **Fix (no code change; exact swap of the public role):** `roles/storage.legacyObjectReader` = `storage.objects.get` only.

```bash
gcloud storage buckets add-iam-policy-binding gs://tappyai-media-prod --member=allUsers --role=roles/storage.legacyObjectReader
gcloud storage buckets remove-iam-policy-binding gs://tappyai-media-prod --member=allUsers --role=roles/storage.objectViewer
# verify
curl -s -o /dev/null -w "%{http_code}\n" -r 0-1023 "https://storage.googleapis.com/tappyai-media-prod/thumbnails/4dcce7cf-5f49-4c58-9901-2d586e31352d/vavOXpvZtCwGhtBF6cGv0T2u.jpg"   # expect 206
curl -s -o /dev/null -w "%{http_code}\n" "https://storage.googleapis.com/tappyai-media-prod?prefix=videos/&max-keys=1"                       # expect 401/403
```
Rollback: the same two commands with the roles swapped. **I could not run them: the sandbox classifier blocked the write to the production bucket** (`gcloud auth list` shows the owner's account, so the commands will work from the owner's shell). Post-change verification to run: Explore plays a clip, `/users/<id>` shows avatar/cover, `/reviews/<id>` thumbnail, an authenticated upload (needs `VERCEL_OIDC_TOKEN` locally, or a real deploy) — none of these touch LIST, and the SA binding is untouched, so uploads are unaffected by the swap.

## 7.3 V3 profile skin — status: **RESTORED and verified**

Restored from `3fe8c12` (the cool-vaughan snapshot merge `1e7b77e` discarded) with a 3-way apply, then reconciled with what landed after it:
- `src/app/users/[id]/PublicProfileView.tsx` (472 lines, the V3 Explore profile: cover, identity card, stats, follow, Posts/Shares tabs, 3:4 media grid), `ownerCollections.ts`, `publicProfile.test.tsx`; `UserProfileView.tsx` merged — **kept HEAD's 2026-09-17 rule that `/users/<me>` redirects to the `/profile` hub**, and Back goes through `lib/nav/inAppBack` (fallback `/reviews`).
- `.v3-pp-*` block (186 lines) appended to `globals.css` byte-exact; class sweep: 0 `v3-pp-*` classes used but undefined.
- Profile presentation fields: `supabase/migrations/20260915_profile_public_presentation.sql` (`profiles.bio`, `profiles.cover_url`; applied to the audit DB), `api/users/[id]` serves `bio`/`cover_url` with the 42703 schema bridge, `api/profile` GET/PATCH/POST merged with the later age/demographics contract (bio now written to the row, cover upload under `covers/`), `/profile/edit` cover control, `/profile` hub passes `coverUrl`, `lib/profile/cover.ts`, `lib/media/key.ts` `covers` prefix, i18n `w4/misc.ts`, tests `coverAndBio`, `editProfileCover`, `publicFields`, `selfScope`, `profileHub`.
- **Deliberately NOT restored** (it was bundled in the same snapshot but is a separate DB-privacy change): `20260915b_review_likes_private.sql` + `review_likers()` / `hot_places_24h()` RPCs and the `likes` route / `ExploreStage` / `reviews/page` edits that depend on them. Those files stay at HEAD; the profile works with the current public `review_likes`.
- One existing test updated: `patchMetadataFallback.test` expected the bio to skip `profiles`; it is a column again, so the expectation is `{ full_name, bio }`.

Verified live (manual.uat.user): Explore → creator "UAT Admin" → `/users/3ce552c5…` renders the V3 skin (cover, identity "Bài đăng 1 · Người theo dõi 0", Follow, tabs Bài đăng 0 / Chia sẻ 1 with the clip tile) → Back → `/reviews` (stack index 1→0). Profile → QR → Back → `/profile`. Profile → video post → close → `/profile`. `GET /api/profile` returns `bio`, `cover_url`; `GET /api/users/<id>` returns `bio`, `cover_url`, `review_count`, `is_following`.

## 7.4 Recommendation UX — decision: **two different features, now named as such; one canonical route**

- **`/recommendations` = personalised PLACES** (`/api/recommendations`, the recommendation engine). It is reached from exactly two entry points, both now called **"Gợi ý cho bạn"** — the sidebar row (was "Search") and the Smart Tools tile (was "Gợi ý") — and the page title is the same string. The Explore stage's right-column panel "Gợi ý cho bạn" is the same feature (same endpoint) and its "Xem tất cả" goes there too. Canonical route: `/recommendations`.
- **Home's strip = PROMPT ideas** (`getDynamicPrompts`; every card opens `/chat?q=…`). It was titled "Gợi ý dành cho bạn · Được cá nhân hóa bởi Tappy AI" with a "Xem tất cả" that opened `/recommendations` — that link is what made three things look like one. It is now **"Hỏi Tappy thử — Gợi ý câu hỏi theo thời điểm và sở thích của bạn"** (EN "Try asking Tappy — Prompt ideas for this moment and your tastes") and its one action is **"Mở trò chuyện" → `/chat`**, where its cards go. No entry point to `/recommendations` was removed; no duplicate remains.

Verified live: Home section title "Hỏi Tappy thử", action `/chat`, five cards → `/chat?q=…`; sidebar row → "Gợi ý cho bạn"; Smart Tools tile → "Gợi ý cho bạn".

## 7.5 Checks (closure pass, exact)

- `tsc --noEmit`: 0 errors. `next lint`: 0 errors (same 2 pre-existing warnings).
- `next build` in an isolated detached worktree carrying this exact patch: exit 0, "Compiled successfully".
- `vitest run` (full): **13 777 passed / 3 failed / 210 skipped** tests, 734 files passed / 7 failed / 11 skipped. The 7 failing files are the same set proven pre-existing on a pristine `7487b4d` checkout in §4b (`clientFeatureParity › Music`, `chatPlaceDecisionWiring`, `portAllocation`, and the four WIN1252 embedded-Postgres suites). Suites touched by this pass (`src/app/users`, `src/app/profile`, `src/app/api/profile`, `src/app/api/users`, `src/app/api/reviews`, `src/lib/media`, Home/i18n/tools/v3): 0 failures.
- Working tree: 53 modified + 21 untracked files, all UNSTAGED, HEAD unchanged at `7487b4d`, nothing pushed.

## 7.6 UAT-ready?

Superseded by §8 — the owner applied the IAM change; see the final verification there.

---

# 8. Final closure verification (2026-09-22, after the owner applied the bucket IAM swap)

## 8.1 Storage (`gs://tappyai-media-prod`, re-read after the change)

| Binding | Now |
|---|---|
| `allUsers` | `roles/storage.legacyObjectReader` (= `storage.objects.get` only) ✓ — no `objectViewer` binding remains |
| `serviceAccount:tappyai-media-bridge@…` | `roles/storage.objectUser` (unchanged) — includes `storage.objects.create/get/list/update/delete`, `storage.multipartUploads.*` |
| project owner/editor/viewer legacy roles | unchanged |

| Probe (anonymous, from this host) | Result |
|---|---|
| Object GET, `Range: 0-1023`, thumbnail jpg | **206**, 1 024 B |
| Object GET, `Range: 0-65535`, clip mp4 | **206**, 65 536 B, `video/mp4` |
| Bucket LIST `?prefix=videos/&max-keys=1` | **403** `AccessDenied: Anonymous caller does not have storage.objects.list access` |
| Object PUT | 403 |
| Object DELETE | 403 |

**Upload permission (service account):** intact **by policy** — the `objectUser` binding is byte-identical to before and the role definition carries every permission the media bridge uses (resumable-upload create/PUT, `objects.get` for `statObject`). A live upload from this host is not possible: impersonating the SA needs `iam.serviceAccountTokenCreator` (denied for the owner's account), and the app's own path needs Vercel's OIDC token. A deployed upload (composer photo/video, avatar) is the definitive check and is unaffected by the swap.

## 8.2 Checks (exact)

- `tsc --noEmit`: **0 errors**. `next lint`: **0 errors**, 42 warnings (all pre-existing `no-img-element` / `exhaustive-deps` lines, incl. in the restored snapshot files).
- `next build` (isolated detached worktree with this exact tree): **exit 0, "Compiled successfully"**.
- Full `vitest run` (closure pass): **13 777 passed / 3 failed / 210 skipped** tests; **734 passed / 7 failed / 11 skipped** files — the 7 are the pre-existing set proven on a pristine `7487b4d` (§4b).
- Touched suites (users, profile, api/profile, api/users, api/reviews, api/group, reviews, music, modules/music, lib/nav, lib/media, lib/auth, lib/i18n, Home, tools, components, boi, group, currency, split-bill, viet-content, scam-shield, lib/scam-shield, recommendations): **3 028 passed / 2 failed / 14 skipped** — the 2 are `clientFeatureParity › Music` (Android `music/` folder deleted in ae2a777) and `chatPlaceDecisionWiring`, both pre-existing. After the last two route edits: `src/modules/music`, `src/app/music`, `src/app/api` → **1 087 / 1 087**.
- One more fix found during the journeys: `GET /api/music/tracks/[id]` (and `/providers`) served the pre-backfill title/credit — a param-only GET handler is cached by the framework by default, so the attribution backfill was invisible to the composer card and the feed credit. Both routes now `export const dynamic = 'force-dynamic'` (same rule the categories route already had). Verified: by-id returns `SoundHelix Song 2 · T. Schürger · SoundHelix · Free use with credit…`.

## 8.3 Browser journeys (manual.uat.user, after the IAM change)

| Journey | Result |
|---|---|
| Explore → clip plays from the bucket | ✓ `<video>` src `gcs:videos/…ax6f…mp4`, playing at 12.5 s, readyState 4, no media error; 3/3 bucket thumbnails loaded |
| Like on the active clip | ✓ toggles (pointer click) |
| Explore → creator "UAT Admin" → V3 profile | ✓ `.v3-pp` cover + identity ("Bài đăng 1 · Người theo dõi 0"), Follow, tabs; 1/1 bucket tile loaded |
| Creator profile → Back → Explore | ✓ `/reviews` (stack index 1→0) |
| Profile → QR → download → share → Back | ✓ PNG 72 762 B `tappyai-qr.png` (decoded earlier to `/users/5c674157…`); share sheet Copy → `https://www.tappyai.com/users/5c674157-…`; Back → `/profile` |
| Profile → video post → close | ✓ `/reviews/d92a22d7…` plays from the bucket (readyState 4) → `/profile` |
| Smart Tools → Currency → Back | ✓ `/tools` |
| Smart Tools → Tạo nhóm → create → group page (creator avatar control present) → Back | ✓ `/group/new` |
| Smart Tools labels | "Cảnh báo lừa đảo", "Gợi ý cho bạn" |
| Composer (/reviews/new) | ✓ `.v3-post-tab` computed `display:flex` (CSS present); "Thêm nhạc nền" → picker → card "SoundHelix Song 2 · T. Schürger · SoundHelix · Free use with credit (SoundHelix audio examples) · 4:00" |
| Music library / retired paths | `/music` 200; `/api/music/tracks` serves the licence; `/api/sound/x` 410 |
| Profile avatar / cover images | The UAT accounts have no avatar or cover (uploads need Vercel OIDC), and the bucket holds no `avatars/` or `covers/` objects, so there is no real avatar object to load. The avatar/cover `<img>` path is the same anonymous-GET class as the thumbnails and clips above (same bucket, same role), which now answer 206. |

## 8.4 Verdict

**PHASE 7 TECHNICAL UAT READY — pending music licensing decision.**

Remaining blockers (none technical in this tree):
1. **Production music catalogue** (§7.1): the ~100 Jamendo rows are hot-linked under Jamendo's non-commercial API terms and carry no recorded licence — decide (licence / self-host CC-BY with attribution / deactivate) before the library is enabled in production. Not modified.
2. Uploads (composer media, avatar, group avatar, cover) cannot be exercised on this host without `VERCEL_OIDC_TOKEN`; verify on a deploy.
3. The 7 pre-existing test failures (Android `music/` parity, chatPlaceDecisionWiring, embedded-Postgres port/WIN1252 suites) are outside this batch.
