# 14 — Appendix

**Frozen commit:** `79d05f3`.

---

## A. Android Development Rules (BINDING)

These are the standing rules for all Android work against this freeze. They restate the task's
Section 12 and are binding.

1. **The Web platform is the source of truth.** Where Android and this freeze disagree, the
   freeze wins — unless the divergence is listed as approved in `11_Android_Migration.md` §6.
2. **Do not redesign business logic.** Quotas, limits, ranking, validation, ownership rules and
   the `music`/deals/enrichment contracts are fixed. Reproduce behaviour; do not reinvent it.
3. **Do not duplicate backend logic.** Business decisions live server-side. If Android needs a
   number or a rule, it comes from the backend (`/api/config` or the relevant endpoint), not a
   Kotlin constant. The 15s/60s drift bug is the cautionary tale.
4. **Prefer backend APIs over client logic.** 41 endpoints are already shared; reuse them. New
   client-side computation of anything the server already owns is a regression.
5. **Native UI should feel Android-native while preserving behaviour.** Match Material/Compose
   idioms, but the *behavioural contracts* in `11_Android_Migration.md` §5 must hold (video
   `active`-flag playback, self-healing media watchdog, clip-ID back-restore, no injection into
   machine-parsed blocks, tolerant place-name matching, backend-owned quota copy, system-Back
   closing sheets).
6. **Reach behavioural parity before enhancement.** A feature is not "done" on Android until it
   matches Web behaviour; only then may it be improved.

**Cost / Security / Stability** remain the priority order, in that order, for every Android
change — identical to the Web principles in `00_README.md`.

---

## B. Environment variables

**45 distinct variables. 5 are hard-required for the app to boot:**
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`ANTHROPIC_API_KEY`, `CRON_SECRET`.

### Server-only
| Variable | Used by | Required? |
|---|---|---|
| `ANTHROPIC_API_KEY` | `ai/llm/providers/claude.ts` | **Required** — all AI dead without it |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabase/admin.ts`, webhooks, iap, users/search | **Required** |
| `CRON_SECRET` | all 8 crons, broadcast, debug routes | **Required in prod** |
| `SERPER_API_KEY` | chat tools, price-check, debug routes | Optional — search degrades |
| `GOOGLE_PLACES_API_KEY` | chat place tools, debug-places | Optional — place search degrades |
| `TRAVELPAYOUTS_TOKEN` | travel tool | Optional — flight/hotel prices degrade |
| `LLM_PROVIDER`, `LLM_FAST_MODEL`, `LLM_SMART_MODEL`, `LLM_PLANNING_MODEL`, `LLM_VISION_MODEL` | `ai/llm/registry.ts` | Optional overrides |
| `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | stripe routes | Required only if Pro enabled (currently off) |
| `APPLE_IAP_ISSUER_ID`, `_KEY_ID`, `_PRIVATE_KEY`, `_BUNDLE_ID`, `_ENV`, `APPLE_ROOT_CA_PEM` | `apple-iap/*` | Optional; must be set in prod or entitlement can't verify |
| `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL` | `notifications/send.ts` | Required for any push |
| `ZALO_APP_ID`, `ZALO_APP_SECRET` | zalo auth + integration | Required for Zalo login |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Calendar integration | Optional (flag-hidden) |
| `ADMIN_IDS` | `admin.ts`, music report | Legacy/deprecated |
| `AUDIT_LOG_RETENTION_DAYS`, `BACKOFFICE_ENABLED` | admin settings | Display-only (`BACKOFFICE_ENABLED` is **not** used as a gate anywhere — the RBAC layout is) |
| `NODE_ENV` | debug routes, iap verify, jws | Platform-provided |
| `VERCEL_GIT_COMMIT_SHA` | `/api/version` (→ `NEXT_PUBLIC_BUILD_ID`) | Platform-provided |

### Client-exposed (`NEXT_PUBLIC_`)
| Variable | Used by | Required? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` (12 refs) | supabase clients, middleware, music repo, PostHog | **Required** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (9 refs) | same | **Required** |
| `NEXT_PUBLIC_APP_URL` | integration OAuth redirects | Required for OAuth |
| `NEXT_PUBLIC_SITE_URL` | stripe, rbac same-origin check | Optional; **the rbac same-origin guard weakens if unset** |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | push subscribe | Required for push |
| `NEXT_PUBLIC_POSTHOG_KEY`, `_HOST` | PostHog | Optional |
| `NEXT_PUBLIC_SUPERTUX_DATA_URL`, `_WASM_URL` | game | Optional — game unplayable without them |
| `NEXT_PUBLIC_BUILD_ID` | VersionWatcher | Optional (`'dev'` fallback) |
| `NEXT_PUBLIC_APP_VERSION`, `_BUILD_NUMBER`, `_ANALYTICS_SDK_VERSION` | analytics envelope | Optional |

> **Local-dev trap:** `BLOB_READ_WRITE_TOKEN` and `SERPER_API_KEY` are absent locally
> (`.env.local`). A localhost upload or web-search failure is **not** a production bug.

---

## C. Client storage keys

| Key | Store | Purpose |
|---|---|---|
| `tappy_lang` | localStorage | UI locale (survives refresh/restart/logout) |
| `theme` | localStorage | `dark`/`light` |
| `tappy_location` | localStorage | reverse-geocoded location, 30-min TTL |
| `tappy_response_style` | localStorage | chat tone/length |
| `tappy_onboarded` | localStorage | in-chat onboarding modal seen |
| `tappy_pending_chat` | sessionStorage | anonymous transcript across login redirect |
| `reviews_tab` | sessionStorage | last Reviews tab |
| `tappy:reviewsReturn` | sessionStorage | feed back-restore (clipId + feedType) |
| `tappy:notifSeenAt` | localStorage | unread-badge marker |
| `tappy_vw_reloaded` | sessionStorage | VersionWatcher one-reload-per-version guard |
| `tappy_anon` | httpOnly cookie | legacy anonymous quota counter (server-set) |
| `joined_group_{id}` | localStorage | group-join marker |

---

## D. Deep-link / URL-scheme reference

| Scheme | Platform | Purpose |
|---|---|---|
| `tappyai://auth-callback` | **Android** | OAuth/OTP/Zalo completion |
| `tappyai://auth/callback` | **iOS** | OAuth completion (note: differs from Android) |
| `tappyai://group` | Android | group deep link |
| `?returnTo=`, `?redirect=`, `?next=` | Web | post-login destination |
| `/reviews/new?sound=<trackId>` | Web | pre-select a sound in the composer |
| `/chat?q=<text>&category=<id>` | Web | seed a chat from a suggestion |
| `/reviews?tab=<home\|explore\|inbox\|profile>` | Web | Reviews tab deep-link |

---

## E. Command reference

```bash
# Reproduce the frozen checkout
git worktree add ../tappyai-freeze 79d05f351f20550e6f4e981cb9e4c3e29bf8837b
cd ../tappyai-freeze && npm ci

# Validate (evidence in 13_Release_Gate.md)
npm run build                          # type + lint gate, 72 routes
npm run lint                           # 0 errors / 26 accepted warnings
npx vitest run                         # 31 files / 253 tests
node scripts/architecture/check.mjs    # the CI architecture guard

# Confirm production still matches the freeze
curl https://tappyai-mvp.vercel.app/api/version   # must be 79d05f3…
```

---

## F. Key dependency versions (from `package.json`)

Next 14.2.5 · React 18.3.1 · TypeScript 5.5.4 · Tailwind 3.4.7 · `ai` 4.3 ·
`@ai-sdk/anthropic` 1.0 · `@supabase/supabase-js` 2.45 · `@supabase/ssr` 0.5 ·
`@vercel/blob` 2.4.1 · `stripe` 16.0 · `web-push` 3.6.7 · `zod` 3.23.8 · `posthog-js` 1.391 ·
`docx` 9.7.1 · `matter-js` 0.20 · Vitest 4.1.9.

---

## G. Glossary

| Term | Meaning |
|---|---|
| **Enrichment** | Server-side injection of place photos / review / order links into the reply, per place, `streamEnrichment.ts` |
| **`[TAPPY_PLAN]` / `[CTA_BUTTONS]` / `[FOLLOWUPS]`** | Machine-parsed protocol blocks in the assistant reply; never written into by injection |
| **Original Sound** | User-uploaded audio (`music_type = 'original_sound'`), reusable by SoundID |
| **`music` contract** | `{version, trackId, startSec, volume}` (+ `origin: 'original'\|'attached'`) on a review |
| **Share-only post** | A review with no place; sentinel `place_name` = "Chia sẻ" (or legacy "Chia se") |
| **VN day** | Quota/rollup day boundary at `Asia/Ho_Chi_Minh` (UTC+7) |
| **Facade** | The `AI` object from `@/lib/ai/llm`; the only sanctioned model entry point |
| **RBAC roles** | analyst < moderator < admin < super_admin |
| **Self-healing watchdog** | The 300 ms loop that re-converges media playback on the active clip |
| **Product UAT** | Functional acceptance — the product owner's call, never claimed by this package |

---

## H. Document manifest

| # | File | Chapter |
|---|---|---|
| 00 | `00_README.md` | Package overview, provenance, evidence standard |
| 01 | `01_Project_Overview.md` | Product, stack, environments, deployment, topology |
| 02 | `02_Architecture.md` | Layering, ownership, enforced rules |
| 03 | `03_Backend.md` | 91 routes; cross-cutting contracts |
| 04 | `04_Database.md` | Tables, RLS, functions, storage, migrations |
| 05 | `05_AI.md` | Prompt, memory, streaming, enrichment, tools |
| 06 | `06_UI_UX.md` | Every screen + cross-cutting UI systems |
| 07 | `07_Features.md` | Feature inventory with production status |
| 08 | `08_Bug_History.md` | Chronological fixed-bug log |
| 09 | `09_ADRs.md` | Architectural decisions |
| 10 | `10_Testing.md` | Test inventory and posture |
| 11 | `11_Android_Migration.md` | Per-feature classification + behavioural contracts |
| 12 | `12_Open_Items.md` | Limitations / debt / future (kept separate) |
| 13 | `13_Release_Gate.md` | End-to-end validation evidence |
| 14 | `14_Appendix.md` | This file |

---

## I. Freeze provenance (one-line recap)

`origin/main` == deployed production == `79d05f351f20550e6f4e981cb9e4c3e29bf8837b`, confirmed by
`GET /api/version` at freeze time. All analysis was performed against a clean checkout of that
commit, **not** the primary working directory (which was 192 files behind). See `00_README.md`
and `13_Release_Gate.md`.
