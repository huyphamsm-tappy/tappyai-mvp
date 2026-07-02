# Localization Implementation Report

> **Scope:** implements `docs/Localization_Architecture.md`'s foundation — i18n infrastructure (vi/en), default-language detection, UI/AI language separation, and a settings surface for changing UI language. Per the task's explicit constraint, this is infrastructure plus converting only the strings touched by this session's own edits — **not** a full-app translation sweep, consistent with `Localization_Architecture.md` §2.1's recommendation against building full UI translation for MVP.
> **Status:** implemented and live-verified (device-locale detection and stored-override both confirmed working in a running dev server). One migration included.

---

## 1. Files Modified

**New:**
- [`supabase/migrations/add_user_language_preference.sql`](supabase/migrations/add_user_language_preference.sql) — adds `profiles.language` (nullable text), the one field `Localization_Architecture.md` §3 proposed for MVP. **Not yet run against the Supabase project** — needs to be applied via the SQL editor or migration pipeline before `PATCH /api/profile { language }` will persist anything (it will 500 on the missing column until then).
- [`src/lib/i18n/dictionaries.ts`](src/lib/i18n/dictionaries.ts) — `vi`/`en` key-value dictionaries. Currently contains only the keys used by the Email OTP UI (the one component touched this session) — this is deliberately not a full-string inventory.
- [`src/lib/i18n/useTranslation.ts`](src/lib/i18n/useTranslation.ts) — `useTranslation()` hook: resolves the active locale (stored override → device detection) and exposes `t(key, vars?)`.

**Modified:**
- [`src/app/login/page.tsx`](src/app/login/page.tsx) — the Email OTP block added in this session (see `Authentication_Implementation_Report.md`) uses `t()` instead of hardcoded strings, since it's new code written in this pass. The rest of the login page's pre-existing Vietnamese copy was **not** touched — it wasn't part of this session's edits, per the "don't sweep the whole project" instruction.
- [`src/app/api/profile/route.ts`](src/app/api/profile/route.ts) — `GET` now returns `language`; `PATCH` now accepts `{ language: 'vi' | 'en' }` alongside the existing `full_name`/`bio` fields (reused the existing endpoint rather than adding a new one).

---

## 2. Translation Strategy

- **Key convention:** dot-namespaced by feature area, e.g. `auth.emailOtp.cta` — mirrors the folder-by-feature structure already used across `src/app`, per `Localization_Architecture.md` §7's own recommendation for when full translation eventually happens.
- **Fallback rule:** `t()` looks up the current locale, and if a key is missing there, falls back to the `vi` dictionary (the always-complete base locale, since Vietnamese is the product's primary language), and only returns the raw key as a last resort. This matches §7's stated fallback rule exactly.
- **No new hardcoded text was introduced** in the code this session touched — every string in the new Email OTP block goes through `t()`.
- **Scope, stated plainly:** the other ~100+ pre-existing hardcoded Vietnamese strings across the app (Home, Chat, Explore, Settings, etc.) remain hardcoded. This is intentional, not an oversight — converting them wasn't part of what this session edited, and a full sweep was explicitly out of scope per the task's own instruction and per the architecture doc's MVP recommendation.

## 3. Default Language

Implemented exactly as specified: **device locale, no first-launch picker, English fallback only when locale is undetectable.**

```
useTranslation() on mount:
  1. localStorage['tappy_lang'] set?  → use it (explicit user override, persists across reloads)
  2. else: navigator.language starts with 'vi'?  → 'vi'
  3. else (including navigator.language unavailable)  → 'en'
```

**Live-verified, not just reasoned about:** the dev preview browser's `navigator.language` is `en-US` — on load, the Email OTP button correctly rendered "Sign in with Email" (English), with no picker shown. Setting `localStorage.tappy_lang = 'vi'` and reloading correctly switched it to "Đăng nhập bằng Email" — confirming both the detection path and the stored-override path work.

This mirrors the existing `theme` (dark mode) localStorage pattern in `Header.tsx`, per `Localization_Architecture.md` §1's own recommendation to reuse that precedent rather than invent a new persistence mechanism.

**Settings API:** `PATCH /api/profile { language: 'vi' | 'en' }` persists the choice to `profiles.language` for signed-in users (guests get client-only `localStorage` persistence, consistent with every other guest-vs-account trade-off already documented). No UI screen was built to call this — the task asked for the API and logic to be *ready*, not for a Settings page to be added (that would be a new feature/UI surface beyond this task's scope).

## 4. AI Language

**No changes made — confirmed correct as designed, by explicit decision during this session (not an oversight).**

Per your clarification before implementation began: AI Response Language stays fully auto-detected per-message via the existing `detectLang()` (`src/lib/ai/intent.ts`), with **no stored override, no new column**. `Localization_Architecture.md` §2.3 had already established this needs zero new code, and this session confirmed that conclusion rather than reopening it — a stored `ai_language` preference was considered and explicitly rejected (see the earlier clarifying question in this session) to keep the finalized architecture intact.

If a Settings screen for language is ever built, "AI Response Language" should be shown there as **informational only** ("tự động theo tin nhắn của bạn" / "follows your message automatically") — no toggle, no stored value.

## 5. Remaining Issues

1. **Migration not yet applied.** `add_user_language_preference.sql` needs to be run against the Supabase project (SQL editor or migration pipeline) before `PATCH /api/profile { language }` will actually persist — right now it will fail with a missing-column error if called. This mirrors the same manual-apply step every other migration in this repo already requires (per `MEMORY.md`'s existing "DDL needs Chrome+SQL Editor" pattern).
2. **No Settings UI wired to the new API.** The endpoint and the `t()`/locale-detection infrastructure are ready; there is no screen yet where a user can see or change their language preference. Not proposed here — building that screen is new UI surface, out of this task's scope ("Chuẩn bị API và logic," not "build the screen").
3. **Dictionary coverage is intentionally minimal.** Only the Email OTP strings are translated. This is not a gap to "finish later automatically" — per the architecture doc, expanding coverage should happen deliberately, file by file, only when there's a concrete reason to translate that surface (not as a mechanical sweep).
4. **Timezone and `country` fields** — still not implemented, unchanged from `Localization_Architecture.md` §7's own explicit "defer" recommendation. Not touched in this session.
