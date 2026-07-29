# Parity Feature — Review Comment System (post + delete)

**Date:** 2026-07-18 · Web = source of truth · Workflow: survey → implement → build → runtime verify → report.

## Survey (source of truth)
`src/app/api/reviews/[id]/comments/route.ts` + `src/app/reviews/page.tsx` (CommentDrawer):
- **POST** `/api/reviews/{id}/comments` body `{ body }` — validated **1–300 chars**, rate-limited (`comment:{userId}`, 10/min), pushes a notification to the review owner. Returns `{ comment, count }` where `comment = {id, body, created_at, user_id, profiles}` and `count` is the **recomputed exact** comment count.
- **DELETE** `/api/reviews/{id}/comments?commentId=` — scoped to the caller's own rows (`user_id` match). Returns `{ ok, count }`.
- Web UI: inline input (`maxLength=300`) + send in the comment drawer; own comments show a delete affordance; optimistic count.

Android previously rendered comments **read-only** — no composer, no delete, and `ReviewsApi` had only `GET`.

## Implementation (reuse existing endpoints, no new backend)
| File | Change |
|---|---|
| `reviews/data/ReviewNetworkDtos.kt` | `CreateCommentRequestDto(body)`, `PostCommentResponseDto(comment, count)`, `DeleteCommentResponseDto(ok, count)`. |
| `reviews/data/ReviewsApi.kt` | `@POST("api/reviews/{id}/comments")` + `@DELETE("api/reviews/{id}/comments")` (`@Query commentId`). |
| `reviews/data/ReviewsRepository.kt` | `PostedComment(comment, count)`; `postComment(reviewId, body)` / `deleteComment(reviewId, commentId)`. |
| `reviews/data/RealReviewsRepository.kt` | Both wired through `safeApiCall`, DTO→domain mapped. |
| `reviews/ui/ReviewDetailViewModel.kt` | `commentInput` + `isPostingComment` + `canPostComment` (non-blank ≤300, matches web send-enabled rule); `onCommentInputChange` (hard-caps at 300); `postComment()` (append returned comment + sync exact count onto the review card); `deleteComment(id)` (optimistic remove, revert + error toast on failure). |
| `reviews/ui/ReviewCommentSection.kt` | `ReviewCommentComposer` (input + send, spinner while posting) + per-own-comment delete icon; `reviewCommentItems` now takes `currentUserId` + `onDeleteComment`. |
| `reviews/ui/ReviewsScreens.kt` | Detail `LazyColumn` → `weight(1f)` with the composer pinned below; passes `currentUserId`/delete + the composer callbacks. |
| `strings_reviews.xml` (+vi) | `reviews_comment_input_placeholder`, `_send`, `_delete`. |

**Parity details:** own-comment delete gated on `comment.userId == currentUserId` (web `isMe`); client caps at 300 to match the backend; the returned `count` updates the review card's comment count so it stays truthful (the web recomputes server-side for the same reason).

## Build & verification
- `assembleDebug testDebugUnitTest` → **BUILD SUCCESSFUL**, tests green.
- Emulator install + launch → process alive, **0 crashes**; `TEMP_VERIFY_HACK` → 0.
- **Owner UAT:** actually posting/deleting a comment needs a signed-in detail screen (auth + a real review) — not reachable in the emulator without login. Logic is unit-safe (optimistic + revert) and gate-verified.

## Next
Per owner direction (large features, one at a time): next is **follow / unfollow** (`POST /api/users/{id}/follow`) + surfacing follower/following/is_following on the profile.
