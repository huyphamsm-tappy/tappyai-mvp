# Android Video Upload — Switch to Web's Client-Upload Architecture (Blob handshake)

**Date:** 2026-07-18
**Branch:** `feat/backoffice-phase0`
**Owner decision:** Do NOT host a separate upload service (rejected Option A). Instead:
1. Remove `/api/upload/video/mobile`.
2. Use the **same upload architecture as the Web**: mint client token → direct-to-Blob upload → publish.
3. Keep all existing Android UI (preview, progress, retry, AI enrichment, 60s UI / 62s backend tolerance).

This reverses the earlier "no Blob handshake on mobile" decision — made knowingly after the Vercel 4.5 MB function-body limit ruled out the server-receives design for 60 s videos.

---

## Why this is the only Vercel-native way
Vercel Functions cap the request body at **4.5 MB** (→ 413 `FUNCTION_PAYLOAD_TOO_LARGE`). A 60 s video is always larger, so the file can never pass *through* a function. The Web solves this by never routing the file through its backend: `@vercel/blob/client`'s `upload()` mints a short-lived **client token** from a function, then PUTs the bytes **directly to Vercel Blob**. Android now performs the identical two steps.

---

## Backend
- **Deleted** `src/app/api/upload/video/mobile/route.ts` (the server-receives multipart endpoint). No other file referenced it (grep clean; `tsc --noEmit` exits 0).
- **No new backend.** Android now calls the **existing** Web token endpoint `POST /api/upload/video` (`src/app/api/upload/video/route.ts`) — the same one the Web SDK posts to. It already authenticates via `getRequestUser` (which accepts a `Bearer` token, exactly what Android sends), rate-limits per user, and applies per-lane size/content-type limits in `onBeforeGenerateToken`. This endpoint is now the shared Web + Android + iOS upload contract.

## Android — transport swap (UI layer untouched)
The `ReviewsRepository` interface signatures (`uploadReviewVideo`, `uploadReviewThumbnail`) are **unchanged**, so `ReviewComposerViewModel`, `ReviewComposerScreen`, progress/retry/cancel, and the AI-enrichment step are all untouched. Only the transport inside the repository changed.

| File | Change |
|---|---|
| `reviews/data/ReviewNetworkDtos.kt` | Removed `UploadMediaResponseDto`. Added `BlobTokenRequestDto` / `BlobTokenPayloadDto` (STEP-1 request), `BlobTokenResponseDto` (`{type, clientToken}`), `BlobPutResponseDto` (`{url}` from Blob). |
| `reviews/data/ReviewsApi.kt` | Removed the `@Multipart uploadReviewMedia`. Added `@POST("api/upload/video") generateBlobToken(...)` (STEP 1). Dropped now-unused Multipart/Part imports. |
| `reviews/data/VercelBlobUploader.kt` (NEW) | STEP 2: cancellable OkHttp `PUT https://vercel.com/api/blob/?pathname=<enc>` with the SDK's exact headers — `authorization: Bearer <clientToken>`, `x-api-version: 12`, `x-vercel-blob-store-id: <storeId>`, `x-api-blob-request-id`, `x-api-blob-request-attempt: 0`, `x-vercel-blob-access: public`, `x-content-type`. Parses `{url}`. `storeId = clientToken.split("_")[3]` (the SDK's own parse). |
| `reviews/data/ReviewsModule.kt` | Added a **dedicated** `@Named("blobUpload")` OkHttpClient — bare (no AuthInterceptor/TokenAuthenticator, no BODY logging), 300 s write timeout for large uploads. |
| `reviews/data/RealReviewsRepository.kt` | `uploadReviewVideo`/`uploadReviewThumbnail` now: mint token (pathname `videos/<ts>.<ext>` / `thumbnails/<ts>.jpg`, `clientPayload="thumbnail"` for the thumb) → `blobUploader.put(...)`. Reuses `ProgressUriRequestBody` (streams the picked Uri with progress) directly as the PUT body. |
| `reviews/data/ReviewsRepository.kt` | Doc-comment updated to describe the handshake. |

### Verified against the Web SDK
Wire protocol reverse-read from the installed `@vercel/blob` **v2.4.1** (`node_modules/@vercel/blob/dist/`): STEP-1 body `{type:"blob.generate-client-token", payload:{pathname, clientPayload, multipart:false}}` → `{type, clientToken}`; STEP-2 `PUT` base `https://vercel.com/api/blob`, `BLOB_API_VERSION = 12`, header map (`x-content-type`, `x-vercel-blob-access`, `x-api-blob-request-*`), and `storeId = token.split('_')[3]`.

### Security isolation (important)
The direct PUT runs on a **separate** OkHttp client so the Supabase JWT is never sent to `vercel.com` — the blob PUT authenticates only with its per-upload client token. (The shared client's `AuthInterceptor`/`TokenAuthenticator` are already host-scoped to our own API, so even a reuse wouldn't leak the JWT, but the dedicated client also avoids BODY-logging a 50 MB video and gives it a realistic write timeout.)

---

## Build & runtime verification
- `:app:compileDebugKotlin` → **BUILD SUCCESSFUL** (Hilt KSP resolved the new `@Named("blobUpload")` client + `VercelBlobUploader` — DI graph valid).
- `assembleDebug testDebugUnitTest` → **BUILD SUCCESSFUL**, unit tests green.
- Web `tsc --noEmit` → **0 errors** after deleting the mobile route.
- `grep -r TEMP_VERIFY_HACK android/` → **0 matches**.
- Emulator (`emulator-5554`): reinstalled the debug APK, launched `com.tappyai.app.debug/…MainActivity` → **process alive, zero crash-buffer entries, no Hilt/Dagger errors** → the new binding instantiates at runtime. App boots to the Login screen (unauthenticated).

### What is Owner UAT (not verifiable here)
The full pick → thumbnail → **direct Blob upload** → AI enrich → publish **success** path needs a real signed-in session and now hits the **live** Vercel Blob API. Per the standing "never click real OAuth" rule, that path is Owner UAT. The observable no-auth path (token mint 401 → error → Retry) is unchanged from the last verified run since the UI state machine is byte-for-byte identical.

---

## Remaining risk (flagged for owner)
The STEP-2 PUT uses Vercel Blob's **versioned, non-public** wire contract (`x-api-version: 12`, `https://vercel.com/api/blob`), pinned to `@vercel/blob` v2.4.1 in `VercelBlobUploader` (constant `API_VERSION`, doc-noted). The Web SDK updates its own pin on upgrade; a hand-rolled client does not. **Action on every `@vercel/blob` bump:** diff the SDK's `BLOB_API_VERSION` + header map against `VercelBlobUploader` and update the pin if it changed. If uploads start returning 4xx after a dependency upgrade, this is the first thing to check.
