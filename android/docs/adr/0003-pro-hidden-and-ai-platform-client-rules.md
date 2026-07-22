# ADR-0003 — Pro upsell hidden (web parity) + AI Platform v1.0 client rules

**Date:** 2026-07-11 · **Status:** Accepted · **Supersedes:** the always-visible Membership
entry implied by `Android_Architecture.md` §6 (MPS 6.3) and `FEATURE_STATUS.md` (Membership row).

## Context

Two Web-platform decisions landed while Android was paused, and both bind Android
(Web is the single source of truth for product behavior):

1. **Pro is hidden app-wide** during the free test phase (web commit `66aedb8`):
   no legal entity for payments yet, so the Web hid every Pro entry point behind
   `SHOW_PRO_UPGRADE = false`, unlinked `/subscription`, raised the free tier to
   **15 messages/day** (`FREE_DAILY_LIMIT`), and changed the quota-exhausted UX to
   "come back tomorrow" (429 `free_limit_reached`, **no** `upgradeUrl`, no upsell).
2. **AI Platform v1.0 is frozen law** (web commits `20cd623`/`aa2c8dd`/`d7efb7d`,
   `docs/architecture/AI_PLATFORM.md`): all LLM access is provider-abstracted behind
   the backend AI capability layer; an Architecture Guard (CI) forbids provider SDKs,
   model ids, provider API keys, and vendor cache logic outside the provider layer.

## Decision

1. **Pro upsell is gated OFF on Android**, mirroring the Web flag:
   `SHOW_PRO_UPGRADE = false` in `app/profile/ProfileScreen.kt` hides the
   "Upgrade to Pro" account row — `MembershipScreen` stays built but unreachable
   (exactly how Web keeps `/subscription` alive but unlinked). Membership copy
   corrected to **15 messages/day**. Re-enable by flipping BOTH flags (web + Android)
   together when Pro launches.
2. **AI Platform client rules bind this app** (same as iOS, `ios/README.md`):
   Android must NEVER contain an AI provider SDK, provider name, model id, or
   provider API key. All AI features call backend `POST /api/chat` (AI-SDK
   data-stream protocol: `f:/0:/9:/a:/e:/d:` lines) and map its errors:
   429 `free_limit_reached` → "come back tomorrow" (no upsell),
   401 `anon_limit_reached` → sign-in prompt, 502 `ai_error` → retryable failure.
   The `core:payment`/`features:subscription`/`core:ads` modules planned in
   `Android_Architecture.md` remain architecture-only seams; none may ship UI
   while Pro is hidden.

## Consequences

- Profile shows 10 account rows (was 11); Membership is dead code until Pro launches — intentional.
- Any future chat implementation must be reviewed against `docs/architecture/AI_PLATFORM.md`;
  a provider SDK in `android/` is an architecture violation even though the Web
  Architecture Guard does not scan this directory (it scans `src/`). Reviewers own this rule here.
- Freemium numbers are server-owned. Android must not hardcode quota math; display
  values (like the Membership copy) must cite the server constant they mirror.
