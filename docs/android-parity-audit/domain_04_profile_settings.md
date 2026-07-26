# Domain 04 — Profile / Account / Settings / Preferences / Memory / Language / Theme / Membership

**Audit baseline:** current working tree (uncommitted included), read directly on 2026-07-26. Web = source of truth.

## Verdict

**Near-full parity.** All core surfaces (Profile, Account view/edit, Preferences, Memory, Settings, Language, QR, Sign-out, Legal, Delete-Account Path B) are implemented against the shared Web endpoints and are well-externalized for i18n. The only real gaps are two Web behaviors Android drops — **gender persistence** and **memory `updated_at` display** — both of which the freeze doc lists as "BLOCKED / not exposed by API" but which Web actually achieves (gender via Supabase auth metadata, `updated_at` via the full `/api/memory` row). Gating (Pro, App Connections) is correct. No P0/P1.

---

## IMPLEMENTED

- **[P1] Profile landing** — real signed-in identity from `GET /api/profile`; avatar, name, email; neutral placeholder only on load/fail (never fabricated). EVIDENCE: `profile/ProfileScreen.kt:149-262` ↔ Web `src/app/profile/ProfileView.tsx`. Conversation-count pill deliberately hidden (`ProfileScreen.kt:111-113` comment) — consistent with freeze §4.3 blocked "conversation count".
- **[P1] Account view + edit** — view (name/email/joined) `account/AccountScreen.kt:117-165`; edit name(≤100)/bio(≤200)/avatar via `PATCH`+`POST /api/profile`, SavedStateHandle draft survival `account/AccountViewModel.kt:66-197`. Avatar cap `MAX_AVATAR_BYTES = 3MB` matches Web server cap `AccountViewModel.kt:202` ↔ `src/app/api/profile/route.ts`. Email read-only w/ "cannot change" badge `AccountEditScreen.kt:159-181`.
- **[P1] Preferences** — budget(3)/cuisine(15)/quick-chips(8)/dietary mirror Web constants exactly. EVIDENCE: `preferences/PreferencesData.kt:34-99` ↔ Web `src/app/profile/preferences/page.tsx:10-30` (BUDGET_OPTIONS/CUISINE_OPTIONS/QUICK_PREF_CHIPS). Save-gating guards against wiping server data on unloaded form `PreferencesViewModel.kt:168-177`. NOTE: Web preferences has **no city/interests selector** — scope's "cities" is not a Web feature; Android correctly has none.
- **[P1] Memory (Tappy Knows)** — `GET /api/memory` load, per-fact optimistic remove → full-state `PATCH`, `DELETE` clear, response-style tone/length persisted locally (native analog of Web `localStorage['tappy_response_style']`). EVIDENCE: `memory/MemoryViewModel.kt:74-162`, `memory/Memory.kt:35-49` ↔ Web `src/app/profile/tappy-knows/page.tsx`, `src/app/api/memory/route.ts`.
- **[P1] Settings** — Notifications drill-in, Memory drill-in, Language picker, Terms/Privacy legal, version text, real Sign-out (`AuthRepository.signOut()` → reactive nav, mirrors Web `SignOutButton`). EVIDENCE: `profile/SettingsScreen.kt:110-195`, `profile/SettingsViewModel.kt:89-106` ↔ Web `src/app/profile/settings/SettingsView.tsx:22-46`.
- **[P1] Language switch + persistence** — `AppCompatDelegate.setApplicationLocales` (app-scoped, OS resource system), best-effort `PATCH /api/profile {language}` fire-and-forget matching Web `LanguagePicker`. EVIDENCE: `language/LanguageManager.kt:36-54`.
- **[P2] QR profile sheet** — on-device ZXing QR encoding `<WEB_APP_URL>/users/<id>` + native share, mirrors Web `QRProfileButton`. EVIDENCE: `profile/QrProfileSheet.kt:57-136`.
- **[P1] Delete Account — Path B (Play Store requirement)** — in-app deletion *request* via `ACTION_SENDTO` mailto to support, dialog-confirmed, no self-service backend (matches Web profile/privacy §5 "contact support"). EVIDENCE: `profile/SettingsScreen.kt:178-213,281-299`. **Satisfies scope item 9.**
- **[P2] Gating correct** — `SHOW_PRO_UPGRADE = false` (`ProfileScreen.kt:81`), `SHOW_APP_CONNECTIONS = false` (`ProfileScreen.kt:87`); menu entries conditionally added `ProfileScreen.kt:98,101`. MembershipScreen + AppConnectionsScreen remain intact but unreachable (both open `TappyComingSoonSheet`). Matches freeze §4.4 exactly (cites these same line numbers). No payments/billing present — correct for V1. Do NOT flag.

---

## MISSING

- **[P2] Gender persistence** — Web loads gender from `user.user_metadata.gender` and saves via `supabase.auth.updateUser({ data: { gender } })` (client-side, **bypasses `/api/profile`**). Android gender is form-only, never loaded or saved. EVIDENCE: Android `preferences/PreferencesViewModel.kt:70-72,105` (comment "gender: no backend field") ↔ Web `src/app/profile/preferences/page.tsx:62,108-111`. **FREEZE CONTRADICTION:** §4.3 calls this BLOCKED ("not exposed by the API") — true for `/api/profile`, but Web achieves it through Supabase auth metadata, which Android's Supabase client can also write. Not truly blocked; it is unimplemented.
- **[P3] Memory `updated_at` ("Cập nhật {date}")** — Web displays the last-updated date; `GET /api/memory` returns the full memory row including `updated_at`. Android's `Memory` model omits the field entirely, so the date is never shown. EVIDENCE: Android `memory/Memory.kt:12-20` (no `updatedAt`) ↔ Web `src/app/profile/tappy-knows/page.tsx:21,273-274`, `src/app/api/memory/route.ts:24` (returns whole `memory` object). **FREEZE CONTRADICTION:** §4.3 lists memory `updated_at` as BLOCKED "not exposed" — it IS in the returned row; Android just doesn't parse it.

---

## DIFFERENT BEHAVIOR

- **[P3] Dark-mode toggle is an Android-only addition** — Android Settings adds an explicit Dark Mode switch (`SettingsScreen.kt:132,240-271`, persisted to DataStore, read by MainActivity). Web `SettingsView` has **no theme toggle** — its Options are only Notifications/Memory/Language (`SettingsView.tsx:26-30`); Web dark styling is OS-driven via `dark:` classes. This is a reasonable mobile addition, not a bug. **FREEZE NOTE:** freeze §4.1 lists Web "Settings (theme, ...)" but the actual Web code has no theme control — the freeze doc overstates Web here.
- **[P3] `created_at` / join date** — Account "Joined" row shows a no-data placeholder because `GET /api/profile` selects `created_at` server-side but omits it from JSON. EVIDENCE: `account/AccountProfile.kt:3-13`, `account/AccountScreen.kt:143-144`. Consistent with freeze §4.3 (blocked); Web account page likewise cannot show it. Not a divergence in outcome, only in that Android renders an explicit placeholder.
- **[P3] Cuisine / quick-chip localized-identity drift** — the localized display string doubles as the stored `cuisine_likes`/`preferences` value (no stable backend key), so a chip selected in one language stops rendering as selected after an in-app language switch (raw value not lost server-side). Documented, and Web shares the same pattern with fixed VN strings. EVIDENCE: `preferences/PreferencesData.kt:54-99`. Out of scope for this pass per its own note.

---

## BUGS

- **[P3] i18n leak — hardcoded English "under "** — `formatBudget` emits `"under ${amount}"` in a VN-first app when `min == 0`. EVIDENCE: `memory/Memory.kt:80`. Should be a string resource (Web `fmtVND`/`BudgetLabel` localizes this). Minor, but user-visible in the Memory budget cards.

**i18n scale (scope item 8):** This domain is essentially fully externalized — every user-facing label routes through `R.string.*` (verified by scan; only exceptions are the `"under "` leak above and a `"🔒"` emoji in `appconnections/AppConnectionsScreen.kt:106`, which is a gated-off screen). This is far cleaner than Web's ~624 hardcoded VN strings noted elsewhere; no bulk hardcoding problem here.

---

## REQUIRED BACKEND CONTRACTS

- **Gender:** either add `gender` to `GET/PATCH /api/profile`, or (matching Web) have Android write it directly to Supabase auth `user_metadata` via its Supabase client. Currently discarded. (Freeze §4.3 mislabels as fully blocked.)
- **Memory `updated_at`:** already present in the `GET /api/memory` row — no backend change needed; Android need only add the field to `Memory` and render "Cập nhật {date}".
- **Profile `created_at`:** `/api/profile` already selects it but strips it from the JSON — expose it to enable the Account "Joined" date on both platforms.
- **Cuisine/preference stable keys** (optional, cross-platform): a non-localized key per option would fix the localized-identity drift on both Web and Android. Out of scope for V1.
