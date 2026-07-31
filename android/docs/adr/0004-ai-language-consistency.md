# ADR 0004 — AI Language Consistency: backend-owned, no client detection

**Status:** Accepted (Owner-directed documentation/governance update, 2026-07-31)
**Backend authority:** `docs/architecture/ADR-016-ai-language-detection-and-localization.md` (the full strategy, incidents, and permanent regression suite). This ADR binds Android to it.

## Context

Two production incidents on the shared backend (2026-07-29 `f68836d`, 2026-07-30 `33eb188`): English questions containing correctly-diacritized Vietnamese proper nouns — `Phú Quốc itinerary, 4 days, 2 people, 8M budget` · `Đà Nẵng hotels` · `Best bún chả in Hà Nội?` · `i wanna fo to eat Phở` — were answered entirely in Vietnamese, across every AI capability. Root cause both times: language decided from single-character evidence instead of the whole sentence. Both were fixed **once, server-side**, with **zero client changes** — Android inherited the fix automatically because it has no language logic of its own. This ADR makes that inheritance a permanent, recorded rule before Android's Chat feature (`features:chat`, `core:ai`) is built.

## Decision

1. **The Web backend is the single source of truth for AI response language.** `/api/chat` decides from the user's latest message (explicit request > whole-sentence detection; proper nouns never decide). Android sends message text only — **no locale, device-language, or profile-language hint** to `/api/chat`.
2. **Android MUST NOT implement language detection for AI content** — in `core:ai`, `features:chat`, or anywhere else. Not for display, not for TTS voice choice on AI replies, not for analytics tagging of replies.
3. **Android MUST NOT duplicate prompt logic.** No prompt text, no prompt localization, no system-prompt fragments on the client (already law via the thin-client boundary, `docs/ios/14_BACKEND_CLIENT_BOUNDARY.md` §2 — which governs Android equally).
4. **Preserve backend language exactly.** The streaming renderer and marker extractor (`[TAPPY_PLAN]`, `[CTA_BUTTONS]`, `[FOLLOWUPS]`) must pass AI prose through byte-transparent: no translation, no diacritic stripping/normalization, no re-casing, no "correction". Android UI chrome localizes via Android's own resources; AI content is untouchable.
5. **If client-side detection is ever genuinely required** (e.g., a future offline mode), it must be a verified port of the shared backend algorithm (`src/lib/ai/intent.ts` semantics) carrying the same ADR-016 §6 regression suite, changed only when Web changes — the same rule that governs other deterministic ports.
6. **Release gate:** any Android release touching Chat rendering/streaming/marker parsing runs the ADR-016 §6 scenario set against the live backend (English-with-Vietnamese-proper-nouns → English; Vietnamese → Vietnamese; explicit override respected). Vietnamese test inputs must carry real diacritics (Engineering Constitution Article VII). The ADR-016 §6 cases are a **permanent regression suite** — rows are never removed, only appended.

## Consequences

- `Android_Architecture.md` gains §8 "AI Language Consistency Requirements" (same change).
- `core:ai`'s scope note (streaming response state machine) is constrained by rule 4 — the state machine is a transport/parser, never a text transformer.
- Code review rejects on sight: any Android language-detector for AI content, any locale field added to the chat request, any transformation of streamed AI prose.
