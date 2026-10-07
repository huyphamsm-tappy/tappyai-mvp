# Phase 7 → RC integration record

2026-09-24 · worktree `D:/Claude/Projects/TappyAI/.worktrees/web-uat-rc` · branch `rc/web-uat`
HEAD **`b496f4a`** — unchanged. Nothing committed, nothing pushed, `9f85cde` not amended.

Everything below is in the working tree as uncommitted changes.

---

## 1. Topology

```
f258ca5  (merge base)
├── … → feat/g1-growth → feat/g1-completion → rc/web-uat  b496f4a   ← RC, PR #252
└── … → 7487b4d → 9f85cde  "feat: complete Phase 7 UAT fixes"       ← the approved fix set
```

`git merge-base --is-ancestor 9f85cde rc/web-uat` → **NO**. `9f85cde` is **one commit** with one
parent, touching **115 files**. It is not a branch to merge; it is a change set to select from.

**Only two of those 115 files were touched by the RC line since the merge base** —
`src/app/HomeV3.tsx` and `src/app/layout.tsx`. Every other file on the RC is still the merge-base
version, so the selected files transfer without conflict.

## 2. What was taken, and what was deliberately left

**Taken — 47 files from `9f85cde`, plus 3 hand-merges.**

| Group | Files | Why it is required |
|---|---|---|
| V3 public profile | `users/[id]/{PublicProfileView.tsx,UserProfileView.tsx,ownerCollections.ts,publicProfile.test.tsx}`, `api/users/[id]/{route.ts,publicFields.test.ts}` | §4 — the RC rendered the old 53-line `ProfileTab` at `/users/[id]` |
| Profile cover + bio | `api/profile/{route.ts,coverAndBio.test.ts,patchMetadataFallback.test.ts}`, `lib/profile/cover.ts`, `lib/media/key.ts`, `profile/edit/{page.tsx,editProfileCover.test.tsx}`, `lib/i18n/w4/misc.ts`, `20260915_profile_public_presentation.sql` (+ rollback) | the V3 profile hero reads `profiles.cover_url` / `bio` |
| Profile hub | `profile/{ProfileView.tsx,page.tsx,profileHub.test.tsx}` | §4 — self and other share one architecture |
| Self-scope | `api/reviews/mine/selfScope.test.ts` | the owner-only tabs |
| In-app back | `lib/nav/{inAppBack.ts,inAppBack.test.ts}`, `components/{NavHistoryTracker.tsx,InAppBackButton.tsx,Header.tsx,legalBackNavigation.test.tsx}`, `boi/*`, `currency`, `split-bill`, `viet-content`, `recommendations`, `reviews/[id]/{ReviewBackButton,ReviewClipView}`, `group/new/*` | §12 D — the RC had no back primitive at all |
| QR | `lib/qr/brandedCard.ts`, `profile/qr/{QRProfileView.tsx,qrProfile.test.tsx}`, `components/QRProfileButton.tsx` | §8 |
| Shell + naming | `components/v3/V3Shell.tsx`, `lib/i18n/v3/web.ts` | §3, and "Gợi ý cho bạn" as one name |
| **CSS** | `src/app/globals.css` (+388 lines) | **the single biggest fix** — see below |
| Record | `docs/uat/PHASE7-AUDIT.md`, `docs/uat/PHASE7-CHANGE-INVENTORY.md` | the audit behind `9f85cde` |

**The CSS is the reason most screens looked broken.** Measured on the RC before this pass:
`globals.css` carried **0** `.v3-post-*` rules while `reviews/new/page.tsx` used **50** of those
class names, and **0** `.v3-pp-*` rules for the public profile. Merge `1e7b77e` had dropped one
whole side of the file (recorded as R1 in `PHASE7-AUDIT.md`); the restoration landed in `9f85cde`,
which the RC line never received. The markup was always there — only its stylesheet was missing.

**Left out — 68 files, on purpose.**

| Excluded | Files | Reason |
|---|---|---|
| Music restoration | `src/modules/music/**` (44), `app/music/page.tsx`, `api/music/*` (5), `reviews/ReviewMusicCard.tsx`, `20260922_music_soundhelix_attribution.sql` | §11 — Jamendo / music licensing untouched |
| Music inside shared files | `api/reviews/route.ts` (attach path), `api/reviews/{[id],feed,mine}/route.ts` (a `music` column in the SELECT), `reviews/feedShared.tsx`, `reviews/[id]/ReviewDetailView.tsx`, `reviews/new/page.tsx`, `lib/i18n/w2/reviewNew.ts` | each of these diffs is 100 % music — inspected hunk by hunk. The composer's V3 markup was **already** on the RC (from `aa229fc`); `9f85cde` only changed its music chip |
| Scam Shield dataset copy | `lib/scam-shield/knowledge/bocongan2026.ts` | §11 — Scam Shield untouched. (The *nav label* "Cảnh báo lừa đảo" came in with `v3/web.ts`; that is i18n, not the tool.) |
| Group avatar feature | `api/group/[id]/avatar/route.ts`, `api/group/route.ts`, `20260922_groups_avatar_url.sql` (+ rollback), and the avatar hunks of `group/[id]/page.tsx` | not in this batch, and §11 excludes unrelated migrations. The **back-navigation** hunk of `group/[id]/page.tsx` was applied by hand |
| GA4 wiring | the `<GoogleAnalytics />` import + mount that the 3-way merge of `layout.tsx` pulled in | §11 — GA4 untouched, and `components/GoogleAnalytics.tsx` does not exist on the RC |

## 3. Conflicts and how they were resolved

| File | Conflict | Resolution |
|---|---|---|
| `src/app/layout.tsx` | RC added the OpenSearch + Atom `<head>` block (G1 acquisition); Phase 7 added `<NavHistoryTracker />` | 3-way merge, **clean**. Both kept. The GA4 lines the merge also carried were removed by hand (§11) |
| `src/app/HomeV3.tsx` | RC added `<PublicFooter />` (Option A, 2026-09-19); Phase 7 retitled the for-you strip and pointed its action at `/chat` | 3-way merge, **clean**. Both kept |
| `src/app/group/[id]/page.tsx` | Phase 7's diff mixes the back fix with the excluded group-avatar feature | only the back hunk applied by hand |
| `src/lib/auth/socialWriteAccess.test.ts` | Phase 7's version lists `api/group/[id]/avatar/route.ts` in `SOCIAL_WRITES`; that route is excluded | kept the RC version |
| `src/lib/i18n/webHardcodedUiStrings.test.ts` (ratchet 466) | the merged `HomeV3` comment pushed the count to 468 | the two lines were **comment** continuation lines that the test's per-line comment strip cannot see. The comment was reworded to name the i18n keys instead of quoting the Vietnamese — the ratchet was **not** raised |

## 4. Applied on top of the integration

### §3 / §9 — the canonical MY ACCOUNT group and the V3 shell

- `V3Shell`: MY ACCOUNT is now exactly **Profile / Me · Tài khoản · Cài đặt**, in that order.
  The QR row moved out (both references show three rows); `/profile/qr` stays reachable from the
  two places those same references show it — the Profile hub's header button and its "QR Profile"
  rail card. The "Cài đặt & khác" group lost its two duplicate rows, which both pointed at
  `/profile/settings`.
- `v3.nav.account` group header: "Tài khoản" → **"Tài khoản của tôi"** / "My account", so the group
  is not called the same thing as the row inside it.
- `/profile/account` and `/profile/settings` moved from `Header` + `BottomNav` onto **`V3Shell`**
  + `Panel`. Every row, data source and destination is unchanged. Two unit tests were updated for
  the new chrome (mock the notification store; the Sign-out card is `.v3-panel`, was `.card`).

🚨 **What was NOT rebuilt.** The reference also shows a "Tài khoản & Cài đặt" hub — the nine-row
inventory beside a Settings panel. That hub already exists, once, as the lower half of `/profile`
(`ProfileRows.accountRows` + `settingsRows`, pinned by `profileRowParity.test.tsx`), and its nine
rows are **exactly** the nine in the reference, in the same order. Building it again at
`/profile/account` would be the second copy §4 forbids.

### §7 — one number for the image limit, on all three platforms

| Before | After |
|---|---|
| `/api/config` served `maxPhotosPerReview`, `maxVideoSizeMb` and both durations — not the photo size | serves `upload.maxPhotoSizeMb` (verified live: `{"maxPhotoSizeMb":5,"maxPhotosPerReview":6,"maxVideoSizeMb":150,"maxVideoDurationSec":300,"maxVideoDurationAcceptSec":305}`) |
| `media.imageTooLarge5` — the number 5 in the key name **and** in the VI/EN copy | `media.imageTooLarge` with `{n}`; both enforcing routes pass `MAX_PHOTO_SIZE_MB` |
| iOS `maxPhotoSizeBytes = 5 * 1024 * 1024` (bare literal) | `maxPhotoSizeMB = 5` + derived bytes; `AppConfigService.Upload` decodes `maxPhotoSizeMb` |
| Android `MAX_PHOTO_BYTES = 5 * 1024 * 1024` (bare literal) | `MAX_PHOTO_SIZE_MB = 5` + derived bytes, with the config field named in the comment |

New `src/lib/config/photoSize.test.ts` pins all three layers. `videoSize.test.ts`'s neighbouring
guard now pins the **value** rather than the literal spelling.

Video copy was left alone: `reviewNew.videoHint` already reads "mp4 · mov · webm · tối đa 5 phút ·
150MB", and `videoSize.test.ts` already carries a stale-copy guard (`\b50MB`) that the photo side
was missing — which is why the photo side was the one that had drifted.

### §8 — the exported QR card

- QR stays **plain**: nothing is drawn inside the matrix, full quiet zone, dark on white. (Note:
  reference image 1 shows a mark in the centre of the code; images 4 and 5, and §8, do not — §8 is
  followed.)
- Added the shipped tagline (`v3.page.subtitle`, "One Agent. One Conversation. Everyday Life.") and
  the site host, taken from `NEXT_PUBLIC_SITE_URL` via `absoluteUrl('/')` — not a literal.
- **No App Store / Google Play badges.** Measured across `src/`, `public/` and `docs/`: this
  repository holds no canonical listing URL for either platform. The only App Store strings are
  third-party test fixtures and Apple's server-to-server StoreKit host; the Android
  `applicationId` (`com.tappyai.app`) is not a published listing. New `brandedCard.test.ts` fails
  if a store URL, a centre overlay or a hardcoded host appears.
- Payload unchanged: `encodeQR(opts.text)` where `text` is the profile URL.

### §12 D — the last three hardcoded Back targets

`/chat`, `/chat/[id]` and `/game` moved from `backHref="/"` to `backFallbackHref` (Home for chat,
Smart Tools for the game hub). These were the three the `9f85cde` sweep had not reached.

---

## 5. §6 — the upload failure, reproduced and diagnosed on this build

Run against the RC dev server with a **real authenticated session** (an access token refreshed from
the UAT harness's stored refresh token — no password was entered), posting a valid 1×1 PNG:

```
POST /api/reviews/upload   →   500
{"error":"upload_failed","message":"Không thể tải ảnh lên. Vui lòng thử lại."}
```

Server log:

```
Media upload error: WifExchangeError: Workload Identity Federation failed at the oidc stage
    at getAccessToken (src/lib/media/gcpAuth.ts)
    at put (src/lib/media/providers/gcs.ts)
    at putMedia (src/lib/media/index.ts)
    at POST (src/app/api/reviews/upload/route.ts)
  { stage: 'oidc', status: undefined, reason: undefined, audience: undefined }
```

**`stage: 'oidc'` is the whole answer.** The request passed every gate — authentication, the
anonymous-write refusal, the 18+ eligibility check, the daily rate limit and the magic-byte sniff —
and failed only when `putMedia` tried to mint a GCS token. `readDeploymentOidcToken` reads exactly
two sources, `x-vercel-oidc-token` and `VERCEL_OIDC_TOKEN`; outside a Vercel deployment there is
neither, so the exchange never reaches Google. **It is not IAM, not the bucket, not authorization,
and not a code defect.** The fail-closed behaviour is correct.

The error codes stay distinguishable, which is how this was isolated without guessing:
401 `unauthorized` · 403 age gate · 429 `rate_limit` · 400 `bad_image_type` / `image_too_large` ·
**500 `upload_failed` = storage identity only**.

### What the owner must do, and the caution

```bash
vercel env pull .env.local --environment=preview
```

🚨 **Confirm the environment first, and back up `.env.local`.** `.vercel/repo.json` shows **one**
project (`tappyai-mvp`, `prj_TsvZsCCjekxlqm0z8Hy47SmMlBmE`), so Preview and Production are
environments inside it, not separate projects. The local `.env.local` currently points at the
**non-prod** Supabase `zdaprdfgpbpnxyofagmc` (`AUDIT_CONFIRMED_NONPROD_REF`), and a pull overwrites
it with whatever that Vercel environment carries — which on a single-project setup is frequently
the production Supabase. **I did not run the command.** Alternatively, run the upload journey
against the real Preview deployment, where Vercel injects `x-vercel-oidc-token` itself and nothing
local is needed.

---

## 6. §10 — cross-platform matrix

"Parity pending" = architecture/spec exists, implementation incomplete. Nothing below was invented.

| Surface | Web (RC + this integration) | Android | iOS | Canonical behaviour | Gap |
|---|---|---|---|---|---|
| Profile / Me | `/profile` `ProfileView.tsx` in `V3Shell` | `profile/ProfileHubV3.kt`, `SelfProfileScreen.kt` | `Features/Profile/UI/ProfileMainView.swift` | one hub: identity, collections, account rows | iOS has no right-rail equivalent — **parity pending** |
| Other User Profile | `/users/[id]` → `PublicProfileView.tsx` (V3) ✅ restored | `profile/ProfileTab.kt` + `ReviewProfileViewModel.kt` | `Features/Reviews/UI/UserProfileView.swift` | same architecture as self; only actions/permissions differ | Android has no separate public-profile screen; it reuses the clip-grid tab — **parity pending** |
| Profile Clip Pager | `ClipViewer` overlay, in place ✅ verified | `ProfileTab.kt` clip grid | — | selected clip first, that profile's clips, Back → same profile | iOS **not implemented** |
| Generic Detail Viewer | `/reviews/[id]` `ReviewClipView` + `ReviewBackButton` | deep-link route | deep-link route | kept for notification / search / deep link | — |
| Post / Upload | `/reviews/new` + `.v3-post-*` ✅ styling restored | `reviews/ui/ReviewComposerScreen.kt` | `Features/Reviews/UI/CreateReviewView.swift` | photo/video/link, same limits | all three blocked on §6 in this environment |
| Saved | `/profile/favorites` `SavedView` (V3Shell) | `saved/SavedScreen.kt` | — | two real sources: `favorites`, `review_saves` | iOS **not implemented** |
| Share Profile | `components/share/ShareMenu.tsx` + `TappyShare` | `TappyShareSheet.kt`, `SharePublicDialog.kt` | `TappyShareSheet.swift` | profile URL unchanged on every platform | mascot lockup at the head of the sheet is web-only so far — **parity pending** |
| QR Profile | `/profile/qr` `QRProfileView` — plain code | `profile/QrProfileSheet.kt` — "no logo", same rule | — | payload = profile URL; nothing inside the matrix | iOS **not implemented** |
| QR Export (card) | `lib/qr/brandedCard.ts` ✅ + tagline + website | — | — | branding around the code, never on it; no store URLs | Android and iOS export **not implemented** |
| Gợi ý cho bạn | `/recommendations` — one name everywhere ✅ | `recommendations/RecommendationsScreen.kt` | `RecommendationsView.swift` | personalised places from `/api/recommendations` | web page is not yet V3-skinned (no `V3Shell`) — **parity pending** |
| Account | `/profile/account` → `V3Shell` ✅ | `account/AccountScreen.kt` | `AccountView.swift` | the account record + edit | — |
| Settings | `/profile/settings` → `V3Shell` ✅ | `profile/SettingsScreen.kt` | `SettingsView.swift` | language, notifications, legal, sign-out, deletion | theme lives in the V3 header on web, in-screen on native — **parity pending** |
| Khoảnh khắc nổi bật | — | — | — | — | **no data model on any platform** (see §7 below) |
| Back navigation | `lib/nav/inAppBack.ts` + `NavHistoryTracker` ✅ | Compose back stack | SwiftUI navigation | pop in-app history, fall back to the real parent | — |

Nothing in this pass created web-only *behaviour*: the shell migrations and the sidebar are web
chrome (Android and iOS carry their own), and the one contract change — `upload.maxPhotoSizeMb` —
was mirrored into **both** Android and iOS in the same pass.

---

## 7. Still open

1. ✅ **MUSIC IS NOW HIDDEN ON ALL THREE PLATFORMS** (owner instruction, same day) — see
   `docs/uat/PHASE7-MUSIC-HIDDEN.md`. The routes below now answer **404** and every entry point is
   gated behind `SHOW_MUSIC` / `ProductFlags.SHOW_MUSIC` / `ProductFlags.showMusic`. The finding
   that prompted it is kept here for the record:
   🛑 **MUSIC: the RC shipped the surface that was withdrawn for copyright reasons.** Probed live on
   this build: `/api/music/tracks` **200**, `/music` **200**, `/music/upload` **200**,
   `/sound/<id>` **200**, `/api/upload/audio` **401 (live, auth-gated)** — and no `410` anywhere
   under `api/music` or `api/sound`. F-024 / F-034 retired exactly these routes (UGC audio upload
   and the "use this sound" reuse path), and `PHASE7-AUDIT.md` records that they must stay 410 even
   if the licensed library returns. The RC branches from **before** that removal, so it never got
   it. §11 puts music out of scope for this pass, so this is **reported, not changed** — but it is
   a release decision, not a cosmetic one, and it sits on the branch with the open PR.
2. **`Khoảnh khắc nổi bật` · `TappyAI Points` · `Hoạt động gần đây` · the `Bạn bè` card · the
   `Hoạt động` tab · Saved's Video/Deals/Bộ sưu tập tabs.** Per §2 these are visual references, not
   permission to invent a backend. Measured over the whole history: none has ever existed in any
   commit on any branch, and `ProfileView.tsx`'s 2026-09-12 header records the audited reason for
   each. Documented as gaps; existing functionality untouched.
3. **`/recommendations` is not yet V3-skinned** (§10 of the previous batch). It renders real
   `/api/recommendations` data with its own chrome. Naming and Back were fixed by `9f85cde`.
4. **Migration `20260915_profile_public_presentation.sql`** (adds `profiles.cover_url`, `bio`) is
   in the tree but must be **applied** before the cover/bio UI has anything to store. The client
   degrades cleanly when the columns are absent, so this is not a crash — it is a missing feature
   until applied.
5. **§6** — `vercel env pull --environment=preview` (owner, after confirming the environment), or
   run the upload journey on the Preview deployment.

---

## 8. Tests

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors** |
| `npx next lint` | **0 errors** |
| `git diff --check` | clean |
| Vitest project `app` | **702 files · 12,950 passed · 0 failed** (10 skipped) |
| Vitest project `db` | **29 files · 805 passed · 0 failed** |
| Android `:app:testDebugUnitTest` | **95 classes · 745 tests · 0 failed** |

Live checks on the RC dev server (`localhost:3111`, non-prod Supabase `zdaprdfgpbpnxyofagmc`):

- served stylesheet now carries **84** `.v3-post-*` and **82** `.v3-pp-*` occurrences (was 0 / 0)
- `/users/<id>` renders the V3 public profile: 20 distinct `.v3-pp-*` classes, computed styles
  applied, cover + avatar + stats + pill tabs ("Bài đăng 1 / Chia sẻ 2") + posts grid, visitor
  "Theo dõi" action
- Profile → clip opens the **Profile Clip Pager** as an in-place overlay — URL unchanged, so it did
  **not** route to the generic Detail Viewer — with like / comment / save / share and up-down
  paging; Back closes it and returns to the **same** profile
- sidebar reads `TÀI KHOẢN CỦA TÔI → Profile / Me · Tài khoản · Cài đặt`, and `KHẢ NĂNG → Gợi ý cho
  bạn · … · Cảnh báo lừa đảo`
- `GET /api/config` → `upload.maxPhotoSizeMb: 5`
- `POST /api/reviews/upload` unauthenticated → **401**; authenticated with a real PNG → **500** at
  the OIDC stage (§5 above)
