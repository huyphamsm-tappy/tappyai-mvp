# ADR-0004 — Runtime-configurable Upload Limits

**Date:** 2026-07-18 · **Status:** Proposed (Deferred) · **Related:** ADR-0003 (server-owned product
values should originate from backend-defined configuration), iOS `docs/ios/adr/ADR-009-media.md`.

## Context

- Today **Android and iOS use compile-time constants** for upload limits (video duration, photo
  count, file size).
- **Web exposes upload limits through `/api/config`** (`upload.{maxPhotosPerReview, maxVideoSizeMb,
  maxVideoDurationSec}`; source of truth `src/lib/config/product.ts`) and reads them live.
- The recent **15 → 60 production drift** (2026-07-18) showed that compile-time constants can become
  inconsistent with backend configuration: production `/api/config` served `15` while the approved
  product rule was `60`, and native clients would only pick up such a change through an app release.
- The **62-second tolerance** (`MAX_VIDEO_DURATION_ACCEPT_SEC`) is an implementation detail and
  **must never be exposed to users** — UI always advertises 60; 62 is a backend/client-internal
  reject threshold only.

## Decision

**No implementation now.** This ADR records only the architectural question, for a future decision:

> **"Should upload-related limits eventually become runtime-configurable from `/api/config`
> instead of compile-time constants?"**

Status stays **Proposed (Deferred)**. Nothing in Android, iOS, or Web changes as a result of this
ADR. The current 60/62 values are correct and stable across all platforms today; this is a
consistency-of-mechanism question, not a defect.

## Decision drivers

**Current priority** — the reasons deferral is the right call now:
- Product release
- Owner UAT
- Production stability

**The current (compile-time) architecture is acceptable because:**
- Upload limits rarely change.
- Compile-time constants reduce runtime complexity (no fetch/cache/fallback path to get wrong).
- Existing values are already synchronized across platforms (60/62 on Web, Backend, Android, iOS).

## Reconsider runtime configuration only if

Revisit this decision (move to Accepted/implementation) **only** when one of these becomes a real
requirement — not preemptively:
- Upload policies need **remote adjustment** (change limits without an app release).
- **A/B testing** of upload limits is required.
- **Different regions** require different limits.
- **Enterprise deployments** need configurable policies.

Absent one of the above, compile-time constants remain the accepted approach.

## Current architecture

- **Web** — reads the constants from `src/lib/config/product.ts` at build/runtime; a value change
  ships on the next deploy with no client release. `/api/config` re-exports the same constants as a
  client contract.
- **Android** — hardcodes constants in `reviews/ui/ReviewComposerViewModel.kt`
  (`MAX_VIDEO_DURATION_ADVERTISED = 60`, `MAX_VIDEO_DURATION_ACCEPT_SEC = 62.0`,
  `MAX_VIDEO_SIZE_BYTES = 50 MB`). The `/api/config` model (`onboarding/data/OnboardingDtos.kt →
  AppConfigDto`) parses only the `onboarding` block; the `upload` block is dropped by
  `ignoreUnknownKeys`.
- **iOS** — hardcodes the equivalent `UploadLimits` constants.
- **Net:** three independent definitions of the same limits; only Web is server-driven.

## Pros (of moving native to runtime config)

- A server-side limit change propagates to native **without an app release** (same benefit already
  intended for freemium quotas and feature flags — ADR-0003).
- **Single source of truth** enforced at runtime, not by reviewer discipline across three code
  locations.
- Eliminates the drift class demonstrated by the 15 → 60 incident.
- Enables A/B or staged rollout of limits from the backend.

## Cons

- Added complexity: native must parse, cache, and **fall back** when `/api/config` is unavailable
  (offline / first launch / request failure) — the constants don't disappear, they become defaults.
- The advertised value becomes dynamic, so **UI copy and validation must both read the fetched
  value** consistently (today they read one local constant).
- A new server contract surface to version and test on every client.
- Marginal benefit if limits change rarely (they have been stable).

## Risks

- **Tolerance leak:** `MAX_VIDEO_DURATION_ACCEPT_SEC` (62) must never reach the UI. Any runtime
  design must keep the advertised value and the tolerance strictly separated so 62 cannot surface.
- **Fail-open/fail-closed:** if the config fetch fails and the fallback is wrong (stale binary), a
  user could be allowed/blocked incorrectly — the fallback constant must stay maintained even after
  migration.
- **Contract drift in the other direction:** adding `upload` parsing to `AppConfigDto` without a
  wire-contract test reintroduces the silent-decode risks seen elsewhere in this codebase.
- Enforcement is **client-side only** today (duration is not validated server-side); making the
  limit dynamic does not change that — a tampered client still bypasses it.

## Migration approach (if ever adopted)

1. Extend Android `AppConfigDto` to parse the `upload` block (`maxPhotosPerReview`, `maxVideoSizeMb`,
   `maxVideoDurationSec`) — additively, keeping `ignoreUnknownKeys`.
2. Add a wire-contract test asserting the `upload` block decodes (pairs with the existing reviews
   blob-token wire-contract test task).
3. Thread the fetched limits into `ReviewComposerViewModel`, keeping the current constants as the
   **fallback defaults** when config is absent.
4. Decide the **tolerance** representation (see Open questions) — do NOT add 62 to `/api/config` as a
   displayed field.
5. Mirror the same on iOS (`UploadLimits` ← config, constants as fallback).
6. Keep Web unchanged (already server-driven).

## Open questions

- **Where does the 62s tolerance live?** Options: (a) client-derived (`advertised + 2s`);
  (b) a separate, explicitly non-displayed field in the config contract; (c) remain a client
  constant. It must stay invisible in UI regardless.
- **Cache/refresh policy:** how long may native cache `/api/config` upload limits, and when is a
  stale value acceptable vs. a blocking refresh before the composer opens?
- **Fallback source of truth:** if the fetched and compiled values disagree, which wins, and how is
  that surfaced to engineers to prevent silent drift?
- **Scope:** only the three upload limits, or all currently-hardcoded server-owned numbers on
  native?

## Related ADRs

- [ADR-0001 — Clock and UUID Provider Abstractions](0001-clock-and-uuid-providers.md) — precedent
  for abstracting platform-supplied values behind a provider seam; the pattern any runtime-config
  source would follow.
- [ADR-0002 — TikTok Login Deferred](0002-tiktok-login-deferred.md) — precedent for recording a
  **Proposed (Deferred)** decision without implementation, which this ADR mirrors.
- [ADR-0003 — Pro upsell hidden (web parity) + AI Platform v1.0 client rules](0003-pro-hidden-and-ai-platform-client-rules.md)
  — establishes the client rule that server-owned product values should originate from
  backend-defined configuration. ADR-0004 explores whether upload limits should eventually follow
  the same pattern.
- [ADR-009 (iOS) — Media](../../../docs/ios/adr/ADR-009-media.md) — the iOS media/upload
  architecture that carries the equivalent hardcoded `UploadLimits`; any migration here must be
  mirrored there.
