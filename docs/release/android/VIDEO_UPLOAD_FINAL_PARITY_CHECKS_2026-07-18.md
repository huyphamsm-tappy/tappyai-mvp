# Android Video Upload — Final Parity Checks (Sprint Close)

**Date:** 2026-07-18
**Branch:** `feat/backoffice-phase0`
**Scope:** The two closing parity checks requested before this sprint is closed:
1. Web triggers `/api/explore/process` after publishing a video → Android must do the same.
2. Verify `/api/upload/video/mobile` can handle the production maximum (60-second videos) on the production hosting platform; report any infrastructure limit with a recommended deployment configuration.

---

## Check 1 — AI enrichment parity (`/api/explore/process`) — ✅ IMPLEMENTED

### Web behavior (Source of Truth)
`src/app/reviews/new/page.tsx` — after a video's thumbnail + video are uploaded, the web fires a **non-blocking** enrichment call:

```
POST /api/explore/process
{ thumbnail_url: <thumbUrl>, caption: <body.trim() || undefined> }
```

Response handling (`page.tsx:409-416`):
- `if (Array.isArray(ai.hashtags) && ai.hashtags.length > 0) setAiHashtags(ai.hashtags)` — hashtags attach to the published review.
- `if (!body.trim() && ai.caption) setBody(ai.caption)` — the suggested caption fills the body **only when the user left it empty**.
- On any failure (`aiRes.ok === false`, network, abort) the step is swallowed (`note: 'non-blocking'`) — publishing continues regardless.

`src/app/api/explore/process/route.ts` returns `{ caption, hashtags, category, location }`, and returns an empty envelope (`{caption:'', hashtags:[], category:'other', location:''}`) when there's no user or no input, SSRF-guarding `thumbnail_url` via `isSafeHttpsUrl`.

### Android implementation (matches exactly)
| Web step | Android equivalent |
|---|---|
| `POST /api/explore/process { thumbnail_url, caption }` | `ReviewsApi.exploreProcess(ExploreProcessRequestDto)` → `RealReviewsRepository.processVideoAi(thumbnailUrl, caption)` |
| Fires after video upload, non-blocking | `VideoStep.AiProcessing` in `ReviewComposerViewModel.runVideoUpload(...)` — runs after a successful video upload; any failure logs and proceeds to `Done` (never blocks publish) |
| `caption = body.trim() || undefined` | `caption = lastBodyForAi` (captured from the live composer body via `rememberUpdatedState` at pick time) |
| `setAiHashtags(...)` then attach on publish | hashtags stored in `VideoComposerState.hashtags`; `submit(...)` sends `hashtags.takeIf { video.isReady }` in `CreateReviewRequestDto.hashtags` |
| `if (!body.trim()) setBody(ai.caption)` | `suggestedCaption` set **only if `lastBodyForAi.isBlank()`**; Host `LaunchedEffect(videoState.suggestedCaption){ if (suggestion.isNotBlank() && body.isBlank()) body = suggestion }` |
| "Analyzing content…" UI state | `reviews_composer_video_analyzing` (en: "Analyzing content…", vi: "Đang phân tích nội dung…") shown during `AiProcessing` |

**Backend contract:** reuses the existing `/api/explore/process` and `/api/reviews` (`hashtags` field already accepted by the publish route). No new backend, no invented business logic.

**Verdict:** Full parity. The Android publish path now performs the same non-blocking AI enrichment as the Web.

---

## Check 2 — Production hosting limit for `/api/upload/video/mobile` — ⚠️ INFRASTRUCTURE LIMIT CONFIRMED

### The finding
`/api/upload/video/mobile` receives the whole file into the function via `await req.formData()` (`route.ts:46`) before calling `put(path, file)`. That means **the entire request body is buffered by the serverless function**.

**Vercel Functions cap the request body at 4.5 MB.** Exceeding it returns **HTTP 413 `FUNCTION_PAYLOAD_TOO_LARGE`** — the function code never runs. This applies to the App Router and all runtimes; there is **no configuration flag to raise it** on Vercel's managed functions.

Sources:
- [Vercel Functions Limits](https://vercel.com/docs/functions/limitations)
- [How do I bypass the 4.5MB body size limit of Vercel Serverless Functions? (Vercel KB)](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions)

### Why this blocks the production maximum
A 60-second video is effectively **always** larger than 4.5 MB. Even a conservative ~1 Mbps encode is ~7.5 MB for 60s; typical phone camera clips are 20–50 MB. Our own client + server cap is **50 MB** (`MAX_VIDEO_SIZE_MB`). So on Vercel-managed functions, `/api/upload/video/mobile` would reject essentially every real 60-second upload with 413 **before** auth, validation, or Blob write.

Note this is exactly **why the Web never sends the file through a function** — the web `/api/upload/video` mints a Blob **client-upload token** and the browser PUTs bytes **directly to `blob.vercel-storage.com`**, bypassing the function body limit entirely. The mobile endpoint deliberately did the opposite (server-receives, per the owner's "no Blob handshake on mobile" decision), which is correct for local/self-hosted Node but collides with the Vercel function cap.

Where it works today vs. fails:
- ✅ **Local dev server / self-hosted Node** — no 4.5 MB cap; full 50 MB / 60s uploads succeed. (This is the environment the emulator pipeline exercised.)
- ❌ **Vercel-managed Serverless/Edge Functions** — 413 above 4.5 MB.

### Recommended deployment configuration
Pick one; all keep the **Android/iOS client contract unchanged unless noted**:

**Option A — Deploy this route on a large-body host (recommended; zero client change).**
Run `/api/upload/video/mobile` on infrastructure without the 4.5 MB function cap — a small Node service/container (Fly.io, Render, Railway, a VPS, or a Docker target), or Vercel's own long-running compute if provisioned. It receives multipart, validates, `put()`s to Blob with `BLOB_READ_WRITE_TOKEN`, returns `{ url }`. The Android multipart contract and all client code stay exactly as built. Point the mobile base URL (or just this route) at that host.

**Option B — Vercel-native, client-direct-to-Blob with a mobile token endpoint (changes client transport).**
Add a tiny function that authenticates + mints a **scoped Blob client-upload token** (same mechanism the web already uses at `/api/upload/video`), and have the mobile client PUT bytes directly to Blob. This bypasses the function body limit while staying 100% on Vercel. **Trade-off:** it partially reintroduces the Blob handshake on mobile that the owner explicitly chose to avoid — needs owner sign-off before adopting.

**Option C — Streaming ingest (needs validation).**
Vercel's KB notes streaming functions are not bound by the 4.5 MB body limit. Reworking the route to **stream** the request body straight into Blob (no full-body buffering) may lift the cap on Vercel. This requires validating current Vercel streaming semantics for large request bodies before relying on it; treat as investigation, not a shipped answer.

**Recommendation:** **Option A** for launch — it preserves the owner-approved mobile multipart contract and every line of the shipped Android client, and only moves *where the route is hosted*. Revisit B/C only if staying fully on Vercel functions is a hard requirement.

### What I did NOT change
Per the "if any backend/API mismatch exists, STOP and report" rule, I did **not** re-architect the transport or reintroduce the Blob handshake. This is reported for an owner deployment decision. The in-code deployment `NOTE` in `route.ts:17-20` already documents the limit for future maintainers.

---

## Build & verification
- `assembleDebug testDebugUnitTest` → **BUILD SUCCESSFUL** (26s), unit tests green.
- `grep -r TEMP_VERIFY_HACK android/` → **0 matches** (all verification hacks reverted).
- Check 1 grounded against `src/app/reviews/new/page.tsx:395-417` and `src/app/api/explore/process/route.ts`.
- Check 2 grounded against `src/app/api/upload/video/mobile/route.ts:46` (`req.formData()` buffers full body) + authoritative Vercel docs.

## Remaining parity gaps / owner actions
1. **Deployment decision for `/api/upload/video/mobile`** (Option A recommended) — required before real 60-second uploads work in production. This is the only thing standing between the built pipeline and a working production upload.
2. **Owner UAT** — the successful upload+publish path (real auth + real Blob token) remains Owner UAT only; the emulator verified pick → validate → poster → progress → cancel/retry/error, not a real authenticated Blob write.
