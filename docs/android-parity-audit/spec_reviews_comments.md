# Spec — Android parity: Comment replies + Comment reactions

**Scope:** Two P1 Reviews gaps (P1-3 replies, P1-4 reactions) from `ANDROID_WEB_PARITY_GAP_REPORT.md:41-42`.
**Web = source of truth.** **Read-only audit; no code changed.**
**Date:** 2026-07-26.

---

## ⚠ CRITICAL BASELINE TRAP (read first)

The **primary working tree is BEHIND production** for this exact feature. Both replies and reactions
are **already shipped on Web prod** but **NOT present in the primary tree's Web source**:

- Primary tree `src/app/api/reviews/[id]/comments/route.ts` — flat comments, **no** `parent_comment_id`, **no** reactions.
- Primary tree has **no** `src/app/api/comments/[commentId]/reactions/route.ts` at all.
- Primary tree `src/app/reviews/[id]/ReviewCommentButton.tsx` — flat, no reply/reaction UI.

The **real production source** (frozen commit = prod, `git worktree list` → branch `main`, `b68be0d`) lives at:
`.claude/worktrees/cool-vaughan-b3c7ff/`

**All Web contract evidence below is cited from that worktree.** This matches MEMORY's documented trap
("primary tree was 192 files behind prod; deployed commit lives at worktree `cool-vaughan-b3c7ff`") and the
freeze docs (`docs/freeze/Web_V1_Platform_Freeze_2026-07-25/`) that describe both features as LIVE.

**BLOCKER STATUS: NONE for Android.** Backend endpoints + DB schema already exist on prod (see §1).
This is a **pure client-side Android port** — no backend work required. (The primary-tree Web source
lagging prod is a separate Web-repo hygiene issue, out of scope here.)

---

## 1. WEB CONTRACT (source of truth)

### 1.1 Reactions endpoint — `src/app/api/comments/[commentId]/reactions/route.ts`
(worktree `cool-vaughan-b3c7ff`, full file 49 lines)

- **`ALLOWED` set (line 6):** `['like', 'love', 'haha', 'wow', 'sad', 'angry']` — exactly 6 keys.
  Reaction stored as free text in DB (no enum / CHECK is length-only); the 6-value vocabulary is **enforced only by this API**.
- **`POST /api/comments/[commentId]/reactions`** (lines 11-33):
  - Body: `{ reaction: string }`. Rejects with **400** `{ error: 'Reaction khong hop le' }` if not in `ALLOWED`.
  - **401** `{ error: 'Can dang nhap' }` if not signed in (line 13).
  - Upserts `comment_reactions {comment_id, user_id, reaction}` with `onConflict: 'comment_id,user_id'` → one row per (comment,user); a repeat POST with a different key **updates in place** (switch reaction).
  - Success: **200** `{ ok: true, reaction }`.
- **`DELETE /api/comments/[commentId]/reactions`** (lines 36-48):
  - No body. Deletes caller's row. **401** same as above. Success: **200** `{ ok: true }`.
  - **There is NO GET here** — reaction aggregates are returned by the comments GET (§1.2), not this route.

### 1.2 Comments endpoint — `src/app/api/reviews/[id]/comments/route.ts`
(worktree `cool-vaughan-b3c7ff`, full file 176 lines)

- **GET** (lines 70-93): resolves current user (line 76), selects `id, body, created_at, user_id, parent_comment_id` (line 80),
  then `attachReactions(...)` (lines 45-67) aggregates per-comment:
  - Response comment shape:
    ```json
    { "id","body","created_at","user_id","parent_comment_id",
      "profiles": {"full_name","avatar_url"} | null,
      "reactions": { "like": 2, "love": 1 },   // per-key COUNT map; keys with 0 omitted
      "my_reaction": "like" | null }            // caller's single reaction, or null
    ```
  - Top-level response: `{ comments: Comment[], count: number }`. **Replies are returned FLATTENED** in the same `comments` array (distinguished by non-null `parent_comment_id`) — **not nested**. `count` is the authoritative total (comments + replies both counted; DB trigger counts replies too — freeze `04_Database.md:159-161`). GET fetch limit default 30, cap 50.
- **POST** (lines 96-152):
  - Body: `{ body: string, parentId?: string }` (lines 112-116). `parentId` is trimmed; blank/absent → `null`.
  - Inserts `{ review_id, user_id, body, parent_comment_id: parentId }` (line 124).
  - Response: `{ comment, count }` where the returned `comment` includes `parent_comment_id` + `reactions: {}` + `my_reaction: null` (line 131).
  - Validation `1..300` chars → **400**; **401** if unauthed; **429** rate limit `comment:{user.id}` 10/60s.
- **One-level nesting is enforced CLIENT-SIDE, not server-side.** DB allows arbitrary depth; the UI sends
  `parentId = replyTo.parent_comment_id ?? replyTo.id` (§1.3) so a reply to a reply re-parents to the thread root.
- **DELETE** unchanged from primary tree; a deleted parent cascades to replies in DB.

### 1.3 Web UI — `src/app/reviews/[id]/ReviewCommentButton.tsx`
(worktree `cool-vaughan-b3c7ff`, full file 267 lines)

- **The 6 reactions with emoji (lines 21-28)** — keys mirror `ALLOWED`:
  | key | emoji |
  |------|-------|
  | like | 👍 |
  | love | ❤️ |
  | haha | 😂 |
  | wow | 😮 |
  | sad | 😢 |
  | angry | 😡 |
  - `reactionEmoji(key)` falls back to 👍 for unknown keys (line 29).
- **Grouping (lines 194-198):** `topLevel = comments.filter(c => !c.parent_comment_id)`; `repliesByParent` reduces the flat array into `{ [parentId]: Comment[] }`. **Android must replicate this client-side grouping** (backend returns flat).
- **Rendering (lines 144-192, 232-237):** each top-level comment renders, then its replies; a reply renders with
  `className="... ml-10 mt-3"` (line 150) and a **26 px** avatar vs **32 px** for top-level (`av`, line 148).
- **Reply affordance (lines 141, 168, 241-246, 253):** "Trả lời" button sets `replyTo`; a reply banner
  ("Đang trả lời {name}" + "Huỷ") shows above the input; input placeholder switches to the reply target.
  `send()` (lines 93-115) computes `parentId = replyTo ? (replyTo.parent_comment_id ?? replyTo.id) : null`.
- **Reaction row + picker (lines 163-183):**
  - "Cảm xúc" button toggles a picker (`pickerFor`); when the user has a reaction it shows `{emoji} Cảm xúc` in pink.
  - Picker = horizontal row of the 6 emoji; tapping one calls `react(commentId, key)`.
  - A summary chip (lines 169-174) shows up to 3 distinct emoji + total count when `total > 0`.
- **Optimistic toggle (lines 118-139), one reaction per user:**
  - `removing = my_reaction === key`. Optimistically: decrement old `my_reaction`, increment new key (unless removing), drop any key that hits ≤0, set `my_reaction = removing ? null : key`.
  - Fire `DELETE` if removing else `POST {reaction:key}`. **On failure → `loadComments()` full reconcile** (lines 136-138).
  - Delete of a comment also removes its replies locally (line 88) to mirror the DB cascade.

---

## 2. CURRENT ANDROID STATE (baseline = primary working tree)

All present; **flat comments only, zero reply/reaction support.**

| Layer | File | Current | Missing |
|-------|------|---------|---------|
| Domain | `reviews/data/ReviewComment.kt:3-9` | `id, body, createdAt, userId, profiles` | `parentCommentId`, `reactions`, `myReaction` |
| DTO (comment) | `reviews/data/ReviewNetworkDtos.kt:84-91` (`CommentDto`) | `id, body, created_at, user_id, profiles` | `parent_comment_id`, `reactions`, `my_reaction` |
| DTO (create req) | `ReviewNetworkDtos.kt:94-95` (`CreateCommentRequestDto`) | `{ body }` only | `parentId` (nullable) |
| DTO→domain | `ReviewNetworkDtos.kt:326-332` (`CommentDto.toDomain`) | maps 5 fields | map new fields |
| API | `reviews/data/ReviewsApi.kt:49-67` | `getComments`, `postComment(body)`, `deleteComment` | reactions POST/DELETE; `postComment` needs `parentId` |
| Repo iface | `reviews/data/ReviewsRepository.kt:62-68` | `getComments`, `postComment(reviewId, body)`, `deleteComment` | `reactToComment`, `removeCommentReaction`; `postComment` needs `parentId` |
| Repo impl | `reviews/data/RealReviewsRepository.kt:67-77` | 3 methods | reaction methods; pass `parentId` |
| ViewModel | `reviews/ui/ReviewDetailViewModel.kt:34-151` | `comments`, `commentInput`, post/delete | `replyingTo` state, `react()`, reply-aware `postComment()`, optimistic reaction toggle + reconcile |
| UI | `reviews/ui/ReviewCommentSection.kt` (whole file) | avatar+name+time+body+delete only (`ReviewCommentItem` 74-130); flat `items()` in `reviewCommentItems` 179-200 | reply indent, reaction row+picker, reply button + reply banner in composer |
| Screen wiring | `reviews/ui/ReviewsScreens.kt:331-345` | passes comments+delete+composer | wire reply/react callbacks |
| Strings | `res/values/strings_reviews.xml:12-17`, `res/values-vi/strings_reviews.xml` | comment header/placeholder/send/delete | reply + reaction labels (both locales) |

Notes: `ReviewDetailScreen.kt` is a **preview-only** file (line 18-22); the live screen is `ReviewsScreens.kt`.
DTO defaults + `ignoreUnknownKeys=true` (NetworkModule) mean adding fields is backward-safe.

---

## 3. IMPLEMENTATION PLAN (client-only, reuse-first)

### 3.1 DTO additions — `ReviewNetworkDtos.kt`
```kotlin
@Serializable
data class CommentDto(
    val id: String,
    val body: String = "",
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("user_id") val userId: String = "",
    @SerialName("parent_comment_id") val parentCommentId: String? = null,   // NEW
    val profiles: ProfileDto? = null,
    val reactions: Map<String, Int> = emptyMap(),                            // NEW (per-key counts)
    @SerialName("my_reaction") val myReaction: String? = null,               // NEW
)

@Serializable
data class CreateCommentRequestDto(
    val body: String,
    val parentId: String? = null,   // NEW — matches Web POST body key exactly (camelCase, NOT snake)
)

// NEW request for POST reactions
@Serializable
data class ReactionRequestDto(val reaction: String)
```
- `parentId` is camelCase on the wire (Web reads `b.parentId`), so **no `@SerialName`**. With `encodeDefaults=false` a null `parentId` is simply omitted — the backend treats absent as null, so that is correct.
- Reactions POST/DELETE responses (`{ok, reaction}` / `{ok}`) can reuse a small DTO or be ignored — the UI reconciles from local optimistic state, only needing success/failure. Recommend a minimal `@Serializable data class ReactionResponseDto(val ok: Boolean = false, val reaction: String? = null)`.

### 3.2 Domain — `ReviewComment.kt`
```kotlin
data class ReviewComment(
    val id: String,
    val body: String,
    val createdAt: String,
    val userId: String,
    val profiles: ReviewProfile?,
    val parentCommentId: String? = null,        // NEW
    val reactions: Map<String, Int> = emptyMap(),// NEW
    val myReaction: String? = null,              // NEW
)
```
Update `CommentDto.toDomain()` (`ReviewNetworkDtos.kt:326`) to map the three new fields.

### 3.3 API — `ReviewsApi.kt`
```kotlin
@POST("api/comments/{commentId}/reactions")
suspend fun reactToComment(@Path("commentId") commentId: String, @Body body: ReactionRequestDto): ReactionResponseDto

@DELETE("api/comments/{commentId}/reactions")
suspend fun removeCommentReaction(@Path("commentId") commentId: String): ReactionResponseDto
```
`postComment` keeps the same signature — `CreateCommentRequestDto` now carries `parentId`.

### 3.4 Repository — `ReviewsRepository.kt` + `RealReviewsRepository.kt`
- Change `postComment(reviewId, body)` → `postComment(reviewId, body, parentId: String? = null)` and pass into `CreateCommentRequestDto(body, parentId)`.
- Add:
```kotlin
suspend fun reactToComment(commentId: String, reaction: String): NetworkResult<Unit>
suspend fun removeCommentReaction(commentId: String): NetworkResult<Unit>
```
  impl via `safeApiCall { api.reactToComment(commentId, ReactionRequestDto(reaction)); Unit }` etc.

### 3.5 ViewModel — `ReviewDetailViewModel.kt`
- State add: `val replyingTo: ReviewComment? = null`. Derived helpers for grouping in the UI layer (or expose `topLevel`/`repliesByParent`).
- `startReply(comment)` / `cancelReply()` set/clear `replyingTo`.
- `postComment()` (line 108): compute `parentId = replyingTo?.let { it.parentCommentId ?: it.id }`, pass to repo, clear `replyingTo` on success. On append, the flat list model is preserved (append to `comments`).
- `reactToComment(commentId, key)`: replicate Web `react()` optimistic logic (§1.3) against `comments`:
  - `removing = target.myReaction == key`; adjust `reactions` map (decrement old, increment new unless removing, drop ≤0), set `myReaction`.
  - Call repo DELETE (removing) or POST; **on failure re-run `loadComments()`** (the existing load path) to reconcile.
- Delete: when removing a comment, also drop children (`parentCommentId == id`) to mirror cascade.

### 3.6 UI — `ReviewCommentSection.kt` + `ReviewsScreens.kt`
- `reviewCommentItems`: build `topLevel` + `repliesByParent` from the flat `comments` list (mirror `ReviewCommentButton.tsx:194-198`); emit each top-level item followed by its replies.
- `ReviewCommentItem`: add `isReply: Boolean` param → indent (`Modifier.padding(start = 40.dp)` ≈ `ml-10`) and smaller avatar (`TappyAvatarSize` ~26 dp vs list-row 32 dp). Add:
  - a "Trả lời"/Reply text button → `onReply(comment)`.
  - a reaction affordance: a "Cảm xúc"/React button that opens an emoji picker row (6 emoji from a Kotlin constant mirroring `COMMENT_REACTIONS`), plus a summary chip (top-3 distinct emoji + total) when total > 0. Highlight current `myReaction`.
- Composer (`ReviewCommentComposer` + `ReviewsScreens.kt:339`): when `replyingTo != null`, show a reply banner ("Đang trả lời {name}" + cancel) above the input and switch the placeholder.
- Define the reaction table once in Kotlin (single source), e.g. `val COMMENT_REACTIONS = listOf("like" to "👍", "love" to "❤️", "haha" to "😂", "wow" to "😮", "sad" to "😢", "angry" to "😡")`.

### 3.7 String resources (add to BOTH `res/values/strings_reviews.xml` and `res/values-vi/strings_reviews.xml`)
| key | en | vi (mirror Web copy) |
|-----|-----|-----|
| `reviews_comment_reply` | Reply | Trả lời |
| `reviews_comment_react` | React | Cảm xúc |
| `reviews_comment_replying_to` | Replying to %1$s | Đang trả lời %1$s |
| `reviews_comment_reply_cancel` | Cancel | Huỷ |
| (optional) reaction a11y labels per emoji | Like/Love/… | (VN) |
Emoji themselves are literals in code, not strings. VN copy above is taken verbatim from the Web UI.

---

## 4. BLOCKERS / BACKEND

- **NONE for Android.** `/api/comments/[commentId]/reactions` (POST/DELETE) and the threaded/reaction-augmented
  `/api/reviews/[id]/comments` GET+POST **exist and ship on prod** (evidence: worktree `cool-vaughan-b3c7ff`, §1).
  `comment_reactions` table + `review_comments.parent_comment_id` self-FK exist (freeze `04_Database.md:145-157`).
- **Backend returns replies FLATTENED** (single `comments` array, non-null `parent_comment_id` marks a reply) —
  **Android must group by parentId client-side** (§3.6). Not nested.
- **One-level nesting is a client rule**, not server-enforced: send `parentId = replyTo.parentCommentId ?? replyTo.id`.
- Watch-out: the primary Web tree lags prod (§ trap). If an implementer diffs against the primary tree's Web
  source they'll wrongly conclude the endpoints don't exist. Always verify against the `cool-vaughan-b3c7ff` worktree / prod.
