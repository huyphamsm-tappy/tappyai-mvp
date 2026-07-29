# Production Report — Follow / Unfollow (Android Web Parity)

**Date:** 2026-07-18 · Web = source of truth · One feature only.
**Workflow:** Survey → verify contract → implement → clean build → runtime verify → remove TEMP_VERIFY_HACK → report.

## 1. Survey (Web → Backend → Android)
- **Web UI** (`src/app/users/[id]/page.tsx`): author profile shows stats **Review / Followers / Following** and a follow button gated on `!profile.is_self`, toggling **Theo dõi** (Follow) ⇄ **Đang theo dõi** (Following) with an optimistic spinner (`handleFollow`). Self sees an "edit profile" link instead. Also invoked from reviews user-search and the "follow back" notification.
- **Android before**: `ReviewProfileScreen` had **no follow button**; stats were Posts/Likes/Saves summed from the loaded reviews; `ReviewProfileViewModel` discarded `follower_count`/`following_count`/`is_following`/`is_self`/`review_count` even though `UserProfileDto` already carried them.

## 2. Backend contract (verified)
`src/app/api/users/[id]/follow/route.ts` — **POST** `/api/users/{id}/follow`, no body. Toggles: inserts `user_follows`; on duplicate (`23505`) deletes → unfollow. Returns **`{ following: boolean, follower_count: number }`**. `401` if not signed in, `400` on self-follow. Reused as-is — no backend change, no new business logic.

## 3. Implementation (files)
| File | Change |
|---|---|
| `reviews/data/Review.kt` | `ReviewProfile` gained defaulted social fields: `userId`, `followerCount`, `followingCount`, `reviewCount`, `isFollowing`, `isSelf` (the embedded review-author `ProfileDto` keeps them at defaults). |
| `reviews/data/ReviewNetworkDtos.kt` | `FollowResponseDto(following, @SerialName("follower_count") followerCount)`; `UserProfileDto.toReviewProfile()` now maps all social fields. |
| `reviews/data/ReviewsApi.kt` | `@POST("api/users/{id}/follow") followUser(...)`. |
| `reviews/data/ReviewsRepository.kt` | `FollowResult(following, followerCount)`; `followUser(userId)`. |
| `reviews/data/RealReviewsRepository.kt` | `followUser` via `safeApiCall`. |
| `reviews/ui/ReviewProfileViewModel.kt` | `isFollowLoading`; `toggleFollow()` — optimistic flip of `isFollowing` + `followerCount`, reconciles with the backend's authoritative `{following, follower_count}`, reverts on error (e.g. 401 signed-out); no-op for self. |
| `reviews/ui/ReviewProfileSection.kt` | Stats switched to **Reviews / Followers / Following**; **Follow / Following** button (`TappyButton`, primary→secondary by state, disabled while loading) rendered only when `!isSelf`. |
| `reviews/ui/ReviewsScreens.kt` | Passes `isFollowLoading` + `onToggleFollow` into `reviewProfileItems`. |
| `strings_reviews.xml` (+vi) | `reviews_profile_stat_reviews`, `_followers`, `_following_count`, `reviews_profile_follow`, `reviews_profile_following`. |

**Parity details:** button hidden for one's own profile (web `!is_self`); optimistic toggle mirrors `handleFollow`; the returned `follower_count` is authoritative and replaces the optimistic value. `reviewCount` uses the backend value, falling back to the loaded page size when the profile resolved from an embedded review author rather than `GET /api/users/{id}`.

## 4. Build & runtime verification
- `assembleDebug testDebugUnitTest` → **BUILD SUCCESSFUL**, unit tests green.
- Emulator install + launch (`com.tappyai.app.debug`) → **process alive, 0 crashes**.
- `grep -r TEMP_VERIFY_HACK android/app/src android/features` → **0**.
- **Owner UAT:** the actual follow/unfollow toggle needs a signed-in session viewing **another** user's author profile (reached by tapping an avatar in the feed) — not reachable in the emulator without login. Logic is optimistic + revert-on-error and gate-verified; no startup/idle risk.

## 5. Remaining parity gaps in this area (out of scope for this feature)
- **Follow-back button** on follow-type notification rows (audit item B7) — depends on this endpoint, deferred to its own step.
- **is_self "edit profile" link** on the author profile: Android hides the follow button when `is_self` (matches `!is_self`) but does not render the web's edit-profile link (the user's own profile is the Profile tab). Minor; noted, not built here.

**STOP.** One feature implemented, built, verified, and reported per the workflow. The next feature will be decided separately.
