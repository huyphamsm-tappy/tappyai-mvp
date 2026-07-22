# ADR 0002: TikTok Login Deferred

**Status:** Accepted (deferred, not implemented)
**Date:** Phase 1B (Authentication, Navigation, Deep Link)
**Governed by:** `android/docs/Android_Architecture.md` §7 (Architecture Freeze Rules)

## Context

Phase 1B's authentication scope originally listed Google, Facebook, and TikTok (alongside
Email OTP). Before implementing, a repo-wide grep and a read of every Authentication-related
doc confirmed two things not previously stated this precisely:

- **TikTok has zero existing integration anywhere.** The only hits for "tiktok" in the entire
  codebase are in `docs/Authentication_Architecture.md` and `src/app/login/page.tsx`'s
  in-app-browser *detection* list (blocking the Google OAuth button when opened inside
  TikTok's embedded webview) — a different concern entirely from TikTok as a login provider.
- **TikTok is not a Supabase-native OAuth provider.** Google and Facebook are; TikTok isn't.
  A real TikTok login would need a fully custom OAuth backend flow — the same shape as the
  web app's existing Zalo integration (`/api/auth/zalo` → `/api/auth/zalo/callback`, a
  hand-built flow specifically because Zalo also isn't Supabase-native) — and no such flow
  exists for TikTok on any platform today.

## Decision

**TikTok login is excluded from Phase 1B entirely** — no UI (not even a disabled button), no
placeholder code calling a non-existent endpoint, no custom backend work started. This
was an explicit choice, not an oversight: building UI against a backend capability that
doesn't exist would violate this project's own "no placeholder code" standard, and building
the backend flow itself is out of scope for an "Android MVP" phase — it's new server-side
work, not an Android concern.

Google and Facebook are built (see `features:auth`'s `AuthRepository`/`GoogleSignInClient`).
Facebook is built despite being currently blocked by Meta's Business Verification requirement
(confirmed live-tested and documented in `Facebook_Login_Implementation_Report.md`) — that's a
different situation from TikTok: Facebook's *integration* is real and complete, just gated on
an external business decision. TikTok has no integration to gate.

## Consequences

- `Android_Architecture.md`'s Feature Readiness Matrix (§6, row 6.1 Identity) already notes
  "Facebook, TikTok, Email OTP are new providers" from the original Architecture v3 planning —
  that note is now superseded by this ADR for the TikTok portion specifically. Per the
  Architecture Freeze Rules, this ADR is the record of that change; the matrix itself isn't
  being hand-edited to match (routine Feature Matrix status updates don't require touching the
  frozen document body, per §7.2 — this ADR is the authoritative record instead).
- **Revisit this when:** a custom `/api/auth/tiktok` backend flow is built (web-first, mirroring
  Zalo's pattern) — Android's TikTok button becomes straightforward to add once that contract
  exists, using the same `AuthRepository` shape already established for Google/Facebook/Email
  OTP. Until then, there is nothing for Android to build against.
- No architecture changes required — no new module, no dependency-direction change. This ADR
  exists purely to record a scope decision made during Phase 1B, per your explicit instruction
  to "record TikTok Login as a future capability in the roadmap/ADR."
