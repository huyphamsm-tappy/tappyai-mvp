# Domain 02 — Reviews / Feed / Comments / My Reviews / Saved

**Verdict:** Core feed + card + posting + like/save/share/follow + composer reach solid parity, but the two *newest* Web behaviours in this freeze — **comment replies + reactions** — are entirely absent, and two settled production-bug contracts (**feed back-restore by clip ID**, **300 ms video watchdog**) are not ported. Liked-reviews collection and in-feed attached-sound playback are also missing.

**Audit baseline:** working tree (uncommitted), read directly 2026-07-26. Web truth = `docs/freeze/Web_V1_Platform_Freeze_2026-07-25/`.
**Contradiction with freeze doc:** `11_Android_Migration.md` §4.1 classifies Reviews as **READY** with "comments (posting)" and lists replies/reactions + liked-reviews as NEEDS-NATIVE (#8, #15) — the current tree confirms that split is still accurate. The freeze README's parenthetical "video playback + watch analytics" overstates: no watchdog, and no `/api/track` watch analytics call exists in `reviews/`.

---

## IMPLEMENTED

- `[P1]` **Feed tabs For You / Following / Latest with correct sort mapping.** ForYou→`sort=trending`, Following→`sort=latest&following=true`, Latest→`sort=latest`; default ForYou. EVIDENCE Android `reviews/ui/ReviewsFeedViewModel.kt:38-42,101-102`; Web `src/app/reviews/page.tsx` + `/api/reviews/feed`. City-boost omission is documented (no Android city source).
- `[P1]` **Video playback driven by `active` prop, not a per-view observer (contract 1).** EVIDENCE Android `reviews/ui/ReviewVideoPlayer.kt:56-92` + `reviews/ui/ReviewsScreens.kt:167` (`active = page == pagerState.currentPage`); Web `06_UI_UX.md` §5 VideoPlayer.
- `[P2]` **Finite-decoder safety — only the active clip prepares a decoder** (stricter than Web's ±1 window; off-screen cards render poster only). EVIDENCE `reviews/ui/ReviewVideoPlayer.kt:81-92`. Not a regression — safer than the contract requires.
- `[P2]` **Muted autoplay + session-wide audio unlock on first tap.** Process-global `FeedAudio.unlocked`. EVIDENCE `reviews/ui/ReviewVideoPlayer.kt:42-44,106-108,143`; Web `06_UI_UX.md` §5 (module-level `feedAudioUnlocked`).
- `[P1]` **Comment count uses the authoritative API `count`, not `reviews.comment_count` (contract 6).** Header shows `totalCount`; post/delete sync `review.commentCount` from the API's recomputed `count`. EVIDENCE Android `reviews/ui/ReviewCommentSection.kt:186-191`, `reviews/ui/ReviewDetailViewModel.kt:122,141,147`, DTO `reviews/data/ReviewNetworkDtos.kt:79-109`; Web contract `11_Android_Migration.md` §5.6.
- `[P1]` **Place-less sentinel filtered (contract 7).** Both "Chia sẻ" and un-diacritic "Chia se" filtered from the place chip and share text; composer posts the sentinel for a place-less review. EVIDENCE Android `reviews/data/ReviewFormatter.kt:63-87`, `reviews/ui/ReviewCard.kt:405`, `reviews/ui/ReviewsScreens.kt:612`, `reviews/ui/ReviewComposerViewModel.kt:379,441`; Web `11_Android_Migration.md` §5.7.
- `[P1]` **Like / Save / Follow — optimistic with revert + server reconcile.** EVIDENCE `reviews/ui/ReviewsFeedViewModel.kt:166-200`, `reviews/ui/ReviewDetailViewModel.kt:158-188`, follow in `reviews/ui/ReviewProfileViewModel.kt`.
- `[P1]` **Composer: text / photo / video / URL with correct limits.** 6 photos, 50 MB, advertised 60 s, backend 62 s never surfaced; structured video pipeline validate→thumbnail→upload→AI enrich; hard `community_<name>` slug byte-parity with Web. EVIDENCE `reviews/ui/ReviewComposerViewModel.kt:146-255,356-441`; Web `06_UI_UX.md` §5 upload pipeline + `video_upload_60_62_rule`.
- `[P2]` **Vercel Blob direct client-upload handshake parity** (token mint → direct PUT), incl. the `@EncodeDefault(ALWAYS) type` guard that RC audit N1 flagged. EVIDENCE `reviews/data/RealReviewsRepository.kt:162-199`, `reviews/data/ReviewNetworkDtos.kt:210-234`.
- `[P2]` **My Reviews grid** (own posts incl. hidden, per-tile hide/delete action sheet, like-count badge) mirrors `/profile/posts`. EVIDENCE `myreviews/MyReviewsScreen.kt`.
- `[P2]` **Saved = favorites + saved reviews** under one screen with header count + skeleton, matching `/profile/favorites`; favorite delete is instant (no confirm). EVIDENCE `saved/SavedScreen.kt`.
- `[P2]` **Other-user profile never requests likes/saves/hidden** — the Web security property (`06_UI_UX.md` §5 ProfileTab) holds by construction: `ReviewProfileViewModel` only fetches the user's public reviews. EVIDENCE `reviews/ui/ReviewProfileSection.kt:179-218`.

---

## MISSING

- `[P1]` **Comment replies (one-level `parentId` threading) — absent (contract 4 / freeze #8).** No `parent_comment_id` in the DTO, domain model, request body, or UI; no reply affordance / `ml-10` nesting. EVIDENCE Android `reviews/data/ReviewComment.kt:3-9` (no parent field), `reviews/data/ReviewNetworkDtos.kt:84-95` (`CommentDto`/`CreateCommentRequestDto` have no parent), `reviews/ui/ReviewCommentSection.kt` (flat list only); Web `06_UI_UX.md` §5 Comments + `04_Database.md` §1.4. Backend returns replies flattened into the comments array, so Android renders them as un-indented top-level comments.
- `[P1]` **Comment reactions (6 emoji + `my_reaction`) — absent (contract 4 / freeze #8).** No reaction row, no `/api/comments/[commentId]/reactions` call. EVIDENCE `reviews/ui/ReviewCommentSection.kt` (only delete icon), `reviews/data/ReviewsApi.kt` has no reactions endpoint; Web `06_UI_UX.md` §5 (like/love/haha/wow/sad/angry, keys mirror `ALLOWED`).
- `[P1]` **Feed back-restore keyed on clip ID + persisted feedType — not ported (contract 3 / freeze §5.3).** Nothing persists active clip id / feed type; no `sessionStorage['tappy:reviewsReturn']` equivalent (no `SavedStateHandle`/DataStore write). Grep for `clipId`/`restore`/`back_forward` in `reviews/` = 0 hits. Position survives *within a session* only because the retained `ReviewsFeedViewModel` is not refetched and `rememberPagerState` restores by **index** — which is exactly the index-not-id anti-pattern the contract forbids when trending re-orders. EVIDENCE `reviews/ui/ReviewsScreens.kt:86` (`rememberPagerState`, no saved clip id), `reviews/ui/ReviewsFeedViewModel.kt` (feedType defaults to ForYou on every construction, no restore).
- `[P2]` **300 ms self-healing video watchdog — not ported (contract 2 / freeze §5.2).** Playback relies solely on `playWhenReady=true` + lifecycle re-prepare; no periodic tick re-issuing `play()` on the active clip when something pauses it. EVIDENCE `reviews/ui/ReviewVideoPlayer.kt:81-129` (LaunchedEffect + lifecycle observer, no watchdog loop).
- `[P2]` **Liked-reviews collection — absent (scope #9 / freeze #15).** Saved holds favorites + *saved* (bookmarked) reviews only; there is no "Liked" collection anywhere (profile or Saved). EVIDENCE `saved/SavedScreen.kt:172-200` (favorites + reviews sections only), `saved/SavedData.kt`; Web ProfileTab private Liked tab (`06_UI_UX.md` §5).
- `[P2]` **In-feed attached-sound ("use this sound") playback — absent.** The composer can *attach* a borrowed track, but the feed player never resolves `music.origin === 'attached'` to a companion audio element played over the muted video (Web's single `HTMLAudioElement` mirror + force-mute on every watchdog tick). `ReviewVideoPlayer` only plays the clip's own audio. EVIDENCE `reviews/ui/ReviewVideoPlayer.kt` (no `soundUrl`/companion audio), `reviews/ui/ReviewCard.kt:294` (music disc is a click target only); Web `06_UI_UX.md` §5 "Attached sound".
- `[P2]` **Explore "Users" search segment + optimistic follow — absent.** Android search hits only `feed?search=` (places/reviews); no user search, no segmented Places|Users. EVIDENCE `reviews/ui/ReviewSearchViewModel.kt:76` (single review-feed search); Web `06_UI_UX.md` §5 Explore (segmented, user search ≥2 chars, optimistic follow).

---

## DIFFERENT BEHAVIOR

- `[P2]` **Comments are a full navigation screen (`ReviewDetailScreen`), not a bottom-sheet `CommentDrawer`.** System Back navigates out of the detail screen (contract 10 satisfied incidentally), but it is not the overlay drawer Web uses. EVIDENCE `reviews/ui/ReviewsScreens.kt:276-359`; Web `CommentDrawer` in `reviews/feedShared.tsx`.
- `[P3]` **Other-user profile is a vertical list of review rows, not a 3-col media grid.** Functional but visually divergent from Web's `grid-cols-3 aspect-[9/16]`. EVIDENCE `reviews/ui/ReviewProfileSection.kt:210-216`; Web ProfileTab (`06_UI_UX.md` §5).
- `[P3]` **Share uses system `ACTION_SEND` with composed text** (place + body + sourceUrl), no canonical `/reviews/{id}` URL — no production domain configured (ties to App Links gap, freeze #11). The in-app `ReviewShareSheet` (copy-link + tappyai.com URL) exists but is **dead code — zero call sites**. EVIDENCE `reviews/ui/ReviewsScreens.kt:610-629` (the live path), `reviews/ui/ReviewShareSheet.kt:53` (defined, never invoked; grep = 1 hit, the declaration).
- `[P3]` **Modals rely on Material3 default Back handling, not an explicit `BackHandler` (contract 10).** `ModalBottomSheet`/`TappyBottomSheet`/`TappyDialog` dismiss on system Back by default, so the contract is met, but there is no explicit guard — grep `BackHandler` in `reviews/`,`myreviews/`,`saved/` = 0. Low risk; verify predictive-back on device. UNVERIFIED on-device.

---

## BUGS

- `[P3]` **Upload failures are uniformly treated as retryable (contract 8 partial).** A blob-PUT / `createReview` failure always lands in `VideoStep.Error` with a Retry button regardless of whether the cause is permanent (server rejects type/size mid-PUT) or transient (timeout/5xx). Pre-upload validation (format/size/duration) *does* correctly reset rather than offer retry, which catches the common permanent cases — so the practical blast radius is small, but a server-side permanent rejection still offers a pointless retry loop. EVIDENCE `reviews/ui/ReviewComposerViewModel.kt:228-254` (single Error branch), `reviews/data/ReviewErrorMessages.kt:31-41` (maps 400/409/413 to copy but not to a "do-not-retry" signal); Web contract `11_Android_Migration.md` §5.8.

---

## REQUIRED BACKEND CONTRACTS (for the MISSING items)

- **`/api/comments/[commentId]/reactions` (GET aggregate incl. `my_reaction`; POST toggle).** Listed in `11_Android_Migration.md` §3.2 as new + not-yet-called by Android. Android needs a DTO carrying per-reaction counts + `my_reaction`, and reaction keys must mirror Web's `ALLOWED`.
- **Comments API `parent_comment_id` round-trip.** `CommentDto` must add `parent_comment_id` and `CreateCommentRequestDto` must send `parentId` (attach to `replyTo.parent_comment_id ?? replyTo.id` to cap nesting at one level, per Web). Backend already stores/returns it; Android just drops it today.
- **(For Liked collection)** a saved/liked-reviews endpoint for the current user's liked reviews — confirm whether `/api/reviews/saved` or a sibling exposes likes; Web ProfileTab's Liked tab is currently the only consumer.
