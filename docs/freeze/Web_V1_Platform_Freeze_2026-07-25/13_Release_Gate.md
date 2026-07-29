# 13 — Release Gate: End-to-End Validation Evidence

**Frozen commit:** `79d05f351f20550e6f4e981cb9e4c3e29bf8837b`
**Validation performed:** 25 July 2026, during the freeze window
**Validation host:** Windows 11 Pro 26200, Node/npm local toolchain
**Validation tree:** clean checkout of `79d05f3` (a dedicated worktree — *not* the primary working directory, which was 192 files behind production)

> **Evidence rule for this document:** every PASS below is followed by the command that
> produced it and the output that was actually observed. Where something was not tested,
> it says so. Functional acceptance of features is **not** claimed here — see
> §6 Product UAT.

---

## 1. Snapshot provenance — VERIFIED (live)

The single most important gate: *is the documented commit the one actually serving users?*

| Check | Command | Result |
|---|---|---|
| Deployed build ID | `GET https://tappyai-mvp.vercel.app/api/version` | `{"v":"79d05f351f20550e6f4e981cb9e4c3e29bf8837b"}` |
| Repository ref | `git rev-parse origin/main` | `79d05f351f20550e6f4e981cb9e4c3e29bf8837b` |
| Match | — | ✅ **Identical** |

`NEXT_PUBLIC_BUILD_ID` is injected from `VERCEL_GIT_COMMIT_SHA` at build time
(`next.config.mjs`), so `/api/version` is emitted by the running deployment and cannot be
spoofed by local state.

**Gate 1: PASS — the frozen commit is the deployed commit.**

---

## 2. Build — VERIFIED (automated)

```bash
npm run build
```

| Metric | Value |
|---|---|
| Exit code | **0** |
| TypeScript errors | **0** |
| ESLint errors during build | **0** |
| Routes compiled | **72** |
| First Load JS shared by all | **87.4 kB** |

**This is a meaningful gate, not a formality.** `next.config.mjs` carries an explicit
comment recording that `ignoreBuildErrors` / `ignoreDuringBuilds` were previously enabled
and have been **removed**:

> *"Build gates ENFORCED: production builds fail on TypeScript or ESLint errors.
> (Previously both were disabled via ignoreBuildErrors/ignoreDuringBuilds, which let
> type/lint regressions reach production unchecked.)"*

Because those escape hatches are gone, a green build is real proof that the entire
production surface type-checks and lint-passes. **[STAB]**

**Gate 2: PASS — clean production build with type and lint gates enforced.**

---

## 3. Lint — VERIFIED (automated)

```bash
npm run lint
```

| Severity | Count |
|---|---|
| **Errors** | **0** |
| Warnings | 26 |

The 26 warnings are entirely two known, accepted categories:

1. `@next/next/no-img-element` — raw `<img>` used instead of `next/image`. This is
   **deliberate**: place photos arrive from arbitrary third-party CDNs (Serper/gstatic
   thumbnails) that cannot be enumerated in `images.remotePatterns`, and routing them
   through the Next optimizer would incur per-image transform cost. **[COST]**
2. `react-hooks/exhaustive-deps` — intentionally narrowed dependency arrays in
   `ChatInterface.tsx`, `reviews/page.tsx`, `VideoPlayer.tsx`, `SearchBar.tsx`,
   `TappyMascotState.ts`, where adding the flagged dependency would re-trigger streaming
   or video effects.

These are tracked as technical debt in `12_Open_Items.md`. They are warnings, not errors,
and do not fail the build.

**Gate 3: PASS — zero lint errors.**

---

## 4. Automated tests — VERIFIED (automated)

```bash
npx vitest run
```

| Metric | Value |
|---|---|
| Test files | **31 passed (31)** |
| Tests | **253 passed (253)** |
| Failures | **0** |
| Duration | 4.24 s |

### 4.1 Test inventory (all 31 files, as executed)

**AI pipeline — the highest-risk subsystem, and the best covered**
| File | Guards |
|---|---|
| `src/lib/ai/streamEnrichment.test.ts` | Stream enrichment contract: place/photo grouping, boundary detection, no injection into `[TAPPY_PLAN]`/CTA/follow-up blocks |
| `src/lib/ai/placeMatch.test.ts` | Tiered place-name matching (the `79d05f3` fix) |

**Reviews / video feed**
| File | Guards |
|---|---|
| `src/app/reviews/feedBackRestore.test.tsx` | Bug #8/#17 — active feed clip survives browser Back |
| `src/app/reviews/profileGridDelete.test.tsx` | Profile grid behaviour after delete |
| `src/components/explore/attachedSoundMute.test.tsx` | Attached-sound mute race on playback |
| `src/lib/ui/gridFill.test.ts` | Profile grid trailing-filler count |

**Commerce / finance / links**
| File | Guards |
|---|---|
| `src/lib/deals/partnerDeals.test.ts` | Deals V1 catalog + click counter |
| `src/lib/finance/exchange.test.ts` | Bug #15 — exchange-rate precision |
| `src/lib/finance/format.test.ts` | Currency formatting |
| `src/lib/platformLinks/travel.test.ts` | Flight deep links (Traveloka / Google Flights) |

**i18n / TTS**
| File | Guards |
|---|---|
| `src/lib/i18n/localePersistence.test.ts` | Language persistence — the `dd74359` regression |
| `src/lib/tts/voiceSelection.test.ts` | TTS never reads Vietnamese with an English voice |

**Back office analytics (11 files)**
`activationAnalyticsClient`, `activationAnalyticsService`, `activationDimensionWriter`,
`activationEvaluationRunner`, `activationRuleEngine`, `authAnalyticsClient`,
`authAnalyticsService`, `rollupWindow`, `userAcquisitionService`, plus route + schema
tests for `/api/admin/analytics/activation` and `/api/admin/analytics/auth`, plus their
two component tests.

**Music + tracking**
`formatDuration`, `normalizeSearch`, `validateSelection`, `deviceContext`.

### 4.2 Regression-test policy — honoured

The standing rule is that every automatable bug gets a permanent regression test. The
inventory above confirms this held for the V1 bug sweep: language persistence, TTS voice,
exchange-rate precision, grid fill, feed back-restore, attached-sound mute, place matching
and stream enrichment each have a dedicated test file that maps to a specific fixed bug in
`08_Bug_History.md`.

**Gate 4: PASS — 253/253 automated tests green, with named regression coverage for the V1 bug sweep.**

### 4.3 ⚠ Test-runner trap (must be recorded)

Running `npx vitest run` from the **repository root** picks up test files inside
`.claude/worktrees/**` and reports **2 failed suites**. These failures are an artifact of
the `@` path alias resolving to the root `./src` while the test file lives in another
worktree's `src`. They are **not** production defects.

Run vitest from within the intended checkout, or exclude `**/.claude/**`. This trap is
recorded because a future engineer re-running the suite will otherwise see red and
misdiagnose it.

---

## 5. Production runtime verification — VERIFIED (live)

All checks below were executed against `https://tappyai-mvp.vercel.app` at freeze time.

### 5.1 Availability
| Endpoint | Status | Observed |
|---|---|---|
| `/api/health` | **200** | `{"status":"ok"}` |
| `/` (landing) | **200** | HTML served |

### 5.2 Security headers — VERIFIED (live) **[SEC]**

Every header below was read off the live production response, not from source:

| Header | Live value |
|---|---|
| `Content-Security-Policy` | Full policy present (see §5.3) |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` (2 years) |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(self), microphone=(self), geolocation=(self), browsing-topics=()` |

### 5.3 CSP verified in production

```
default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self';
frame-ancestors 'self';
script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://us.i.posthog.com https://us-assets.i.posthog.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' data: https://fonts.gstatic.com;
img-src 'self' data: blob: https:;
media-src 'self' data: blob: https:;
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://us.i.posthog.com
  https://us-assets.i.posthog.com https://nominatim.openstreetmap.org https://graph.zalo.me
  https://vitals.vercel-insights.com https://*.public.blob.vercel-storage.com
  https://blob.vercel-storage.com https://vercel.com;
frame-src 'self' https://www.youtube.com; worker-src 'self' blob:;
manifest-src 'self'; upgrade-insecure-requests
```

Two entries in `connect-src` are load-bearing and must not be removed:
- **`https://vercel.com`** — `@vercel/blob/client` PUTs uploads to `vercel.com/api/blob`.
  Its absence silently killed **all** video and audio uploads for two weeks (see
  `08_Bug_History.md`, commit `900289a`).
- **`https://graph.zalo.me`** — the client-side profile fetch in `/auth/zalo-finish`.

**Both are confirmed present in the live policy.** This closes a stale internal note
claiming the CSP upload fix was un-deployed; it **is** deployed.

### 5.4 Public endpoint smoke — VERIFIED (live)

| Endpoint | Status | Evidence of real data |
|---|---|---|
| `/api/config` | 200 | Full product contract returned (see §5.6) |
| `/api/rates` | 200 | Live FX: `USD 1, VND 26278.14, EUR 0.878972, JPY 163.82, …` |
| `/api/deals` | 200 | Real partner rows incl. Shopee, with `partnerSlug`/`partnerType`/`category` |
| `/api/reviews/feed` | 200 | Real review rows with UUIDs, `user_id`, `place_name` |
| `/api/music/tracks` | 200 | Real tracks incl. UGC "Âm thanh gốc" with Blob `audioUrl` |
| `/api/suggested-prompts` | 200 | Bilingual prompts with `text` / `textEn` / `category` |
| `/api/memory` | 200 | `{"memory":null}` — correct anonymous response, no leak |

### 5.5 Authorization negative tests — VERIFIED (live) **[SEC]**

Protected surfaces were probed **unauthenticated** and correctly refused:

| Endpoint | Expected | Observed |
|---|---|---|
| `/api/admin/settings` | deny | **401 Unauthorized** ✅ |
| `/api/cron/price-check` | deny | **401 Unauthorized** ✅ |

This confirms in production that (a) the admin RBAC surface is not publicly reachable and
(b) cron endpoints enforce the shared-secret gate rather than being open URLs.

### 5.6 Live product config contract

`GET /api/config` returned, in production:

```json
{
  "freemium": { "freeDailyLimit": 15, "anonDailyLimit": 5 },
  "flags": { "showProUpgrade": false, "showAppConnections": false },
  "upload": { "maxPhotosPerReview": 6, "maxVideoSizeMb": 50, "maxVideoDurationSec": 60 },
  "auth": { "providers": [
    { "id": "google", "enabled": true },
    { "id": "zalo",   "enabled": true },
    { "id": "email",  "enabled": true } ] },
  "onboarding": {
    "interests": ["food","spa","travel","shopping","entertainment","hotel"],
    "cities": ["TP. Hồ Chí Minh","Hà Nội","Đà Nẵng","Cần Thơ",
               "Nha Trang","Vũng Tàu","Hội An","Phú Quốc"] }
}
```

This is the **authoritative V1 product contract** and Android must consume it rather than
hard-coding equivalents. Note in particular:
- `maxVideoDurationSec: 60` — the UI limit. The backend tolerance is 62 s; **62 must never
  be surfaced in any UI.**
- `showProUpgrade: false` and `showAppConnections: false` — both surfaces are built but
  deliberately gated off in V1.
- `email.enabled: true` — email auth **is** enabled in the live contract.

**Gate 5: PASS — production is live, correctly headered, serving real data, and refusing unauthorized access.**

---

## 6. Product UAT — NOT CLAIMED HERE

Everything above is **engineering evidence**: build, lint, automated tests, live HTTP
behaviour, and authorization refusals.

**Functional / product acceptance of individual features is the product owner's decision
and is deliberately not asserted in this package.** This document does not mark any
feature "UAT PASS".

**Product UAT status: WAITING FOR PRODUCT OWNER.**

Features whose correctness was established by *manual* verification during development
(screenshot or DOM inspection rather than an automated test) are flagged as such in
`08_Bug_History.md` under each bug's "regression prevention" line, so the owner can see
exactly which behaviours rest on manual evidence.

---

## 7. What was NOT validated during this freeze

Stated explicitly so no reader over-reads the gates above.

| Area | Status | Why |
|---|---|---|
| Authenticated end-to-end user journeys | **NOT VERIFIED** | Would require driving a real production login. Standing rule prohibits clicking real OAuth in production. |
| Payment flows (Stripe checkout, Apple IAP) | **NOT VERIFIED** | Live commerce; not exercised against production. Also gated off (`showProUpgrade: false`). |
| Push notification delivery | **NOT VERIFIED** | Requires VAPID configuration and a subscribed device. |
| Cron job execution results | **NOT VERIFIED** | Only the auth gate was probed (401); job outcomes were not inspected. |
| Media upload round-trip | **NOT VERIFIED (this freeze)** | The enabling CSP entry was confirmed present; an actual upload was not performed. |
| Load / performance / soak testing | **NOT PERFORMED** | No load testing exists for V1. |
| Accessibility audit | **NOT PERFORMED** | No automated a11y gate exists. |
| Cross-browser matrix | **NOT PERFORMED** | No formal matrix; iOS Safari cache behaviour is handled by the `VersionWatcher` build-ID mechanism. |

---

## 8. Gate summary

| # | Gate | Verdict | Evidence type |
|---|---|---|---|
| 1 | Frozen commit == deployed commit | **PASS** | Live `/api/version` |
| 2 | Production build (types + lint enforced) | **PASS** | `npm run build` exit 0, 72 routes |
| 3 | Lint — zero errors | **PASS** | 0 errors / 26 accepted warnings |
| 4 | Automated tests | **PASS** | 253/253 across 31 files |
| 5 | Production live + headers + authz | **PASS** | Live HTTP probes, 401s on protected routes |
| 6 | Product UAT | **OWNER** | Not claimed by this package |

**Engineering release gate: PASS at `79d05f3`.**
**Product acceptance: pending product owner.**

The Web platform is frozen and fit to serve as the reference implementation for Android.

---

## 9. Reproducing this validation

```bash
git fetch origin
git worktree add ../tappyai-freeze 79d05f351f20550e6f4e981cb9e4c3e29bf8837b
cd ../tappyai-freeze
npm ci
npm run build
npm run lint
npx vitest run
```

Then confirm the deployment still matches the freeze:

```bash
curl https://tappyai-mvp.vercel.app/api/version
```

If that SHA is no longer `79d05f3`, production has moved past this freeze and the package
must be re-baselined before being used as an Android reference.
