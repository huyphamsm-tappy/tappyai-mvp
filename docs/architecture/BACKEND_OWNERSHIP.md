# TappyAI — Backend Ownership of Business Behavior

> **Status: governing document** (Backend Contract Audit, 2026-07-11). Companion to
> `AI_PLATFORM.md`. Rule of thumb: **business behavior belongs to the backend;
> presentation belongs to clients.** Web, Android and iOS render UI, handle native
> UX, display data, and call backend APIs — nothing more.

## 1. Single sources of truth

| Concern | Owner (the ONLY place it's defined) | Served to clients via |
|---|---|---|
| Free/anon daily quotas (15 / 5) | `src/lib/config/product.ts` | enforced in `POST /api/chat`; displayed via its 429/401 `message`; `GET /api/config` |
| Quota measurement (VN-day user-message count) | `countTodayUserMessages()` in `product.ts` | `/api/chat` enforcement + `/subscription` display use the SAME helper |
| VN quota-day boundaries | `vnMidnight()` / `vnToday()` in `product.ts` | all quota/limit code |
| Feature flag `SHOW_PRO_UPGRADE` | `product.ts` | Web ProfileView imports it; natives read `GET /api/config` |
| Upload limits (6 photos, 50 MB, 15 s advertised / 17 s accepted) | `product.ts` | composer + `/api/upload/video` import it; natives read `GET /api/config` |
| Daily per-IP route caps (reviews 20, scan 20, translate 30) | each route's `DAILY_*` const + shared `dailyRateLimit()` in `lib/security/rateLimit.ts` | server-only |
| Quota/limit user-facing copy | the API response `message` field | clients render it verbatim (fallback text only if unparseable) |
| AI provider/model/prompt behavior | AI capability layer (`AI_PLATFORM.md`) | `POST /api/chat` and AI-backed routes |
| Entitlement (free/pro) | `subscriptions` table, read server-side | `/api/chat` gating; native `EntitlementService` seam (Phase 7) |
| Permissions/authorization | Supabase RLS + per-route auth (`getRequestUser`) | never trusted client-side |
| Recommendation/ranking (recs, trending, budget/luxury filters) | server (`recommendationEngine`, feed API, `budget.ts`) | API responses |
| Content validation (review fields, music selection, magic-byte upload checks) | API routes + `@/modules/music` validators + RLS | 400 responses |

## 2. `GET /api/config` — the client configuration contract

```json
{
  "freemium": { "freeDailyLimit": 15, "anonDailyLimit": 5 },
  "flags":    { "showProUpgrade": false },
  "upload":   { "maxPhotosPerReview": 6, "maxVideoSizeMb": 50, "maxVideoDurationSec": 15 }
}
```

- Public, cacheable (`max-age=300, stale-while-revalidate=3600`) — values change only on deploy.
- **Display values only.** Enforcement is always server-side (`/api/chat`, upload
  token limits, route caps). A tampered client changes what it *shows*, never what it *can do*.
- Native clients MUST read quotas/flags/limits from here instead of hardcoding
  (Android's `SHOW_PRO_UPGRADE` and Membership copy currently mirror these — wire
  them to this endpoint when Android networking lands).
- Contract is additive-only: new keys may be added; existing keys never change
  meaning or disappear without a versioned successor.

## 3. What intentionally REMAINS on clients (and why)

| Client logic | Why it stays |
|---|---|
| Optimistic like/save count updates | Presentation latency; server response reconciles (authoritative) |
| Pre-submit validation (email shape, OTP length, file type/size/duration pre-checks) | UX convenience; backend re-validates everything — client checks are never the security boundary |
| Emoji/category display maps (web `CATEGORIES`, Android mirrors) | Pure presentation; flagged as drift-risk in Android docs |
| Feed gesture/playback logic (double-tap like, watchdog, active-slide) | Native UX by definition |
| iOS `RetryPolicy` / token-refresh orchestration | Client-side network resilience; limits (`free/anon`) are excluded from retry |
| Notification grouping/sections (`groupNotifs`) | Display grouping of server data |
| `getTappyPose()` mascot state engine | Presentation state machine |

## 4. Known debt (accepted, tracked)

1. **Feed personalization on Web client** (`reviews/page.tsx`): city/top-hashtag
   signals computed from direct Supabase reads + client-side hashtag re-sort of
   the trending feed. Acceptable while Web is the only feed client (RLS-guarded
   reads; avoids extra server queries per load — Cost Optimization). **MUST move
   server-side into `/api/reviews/feed` before any native feed is built**, or
   ranking will fork across clients.
2. **Video duration limit is client-enforced only** (server can't measure without
   media processing). Server clamps the reported `duration` (1–600 s) for the
   original-sound track; a hostile client could upload a longer clip within 50 MB.
   Revisit with the Phase-2 media pipeline.
3. **`SHARE_ONLY_NAMES` sentinel** ("Chia sẻ" placeholder places) exists in both
   the feed UI and server code paths — harmless display filter client-side, but a
   rename would need both spots.
4. **In-memory rate limiters are per-instance** (documented in
   `lib/security/rateLimit.ts`) — back with Redis/Upstash if hard global limits
   are ever needed.
5. Direct Supabase reads from the Web client (profile grids, comments, etc.) are
   **by design** (anon key + RLS is the contract); natives use REST APIs instead.

## 5. Contract stability review (native-readiness)

Audited 2026-07-11 across every native-relevant endpoint: auth (`/api/auth/*`,
Supabase), chat (`/api/chat` + data-stream + 429/401/502 bodies with `error` code
+ `message`), reviews (`feed`, create with `duration`, like/save/comments), sound
(`/api/sound/[trackId]` + save/follow/play), upload token, notifications, version,
config. Error envelope is consistent (`{error, message?}`); pagination is
`page/limit` on the feed; auth is Bearer JWT (native) or cookies (web). No
breaking drift found after the AI-platform refactor (provider abstraction changed
no response shapes). The iOS dossier (`docs/ios/04`) is the per-endpoint contract
reference and was synced 2026-07-11.
