# Account & Settings i18n Audit — Web + Android

**Date:** 2026-08-04
**Scope:** every screen reachable from **Account** and **Settings**
**Excluded by instruction:** Privacy Policy, Terms of Service (handled in a separate task)
**Branches audited:** Web `main`-equivalent tree, Android `feat/backoffice-phase0` @ `77ccf67` (the Android V1 tree submitted to Google Play)

---

## 1. Headline finding

The reported bug — *"English is selected but Account/Settings pages still show Vietnamese"* — is **a Web-only defect**. Android is already fully localized.

| | Web | Android |
|---|---|---|
| Localization mechanism | `useTranslation()` module store + flat key maps | `values/` + `values-vi/` XML resources, `AppCompatDelegate.setApplicationLocales` |
| In-scope screens fully localized | **4 of 17** | **17 of 17** (3 helper-level string defects, §5) |
| Hard-coded user-visible strings in scope | **~230** (Vietnamese) | **3** (English) |
| Key pairs (en/vi) | 761 distinct keys, 0 gaps | 1041 en / 1040 vi, 1 intentional `translatable="false"` |
| Duplicate keys | 0 | 0 |
| Keys used but undefined | 0 | 0 (build would fail) |

Android carries **1041 strings across 29 per-feature resource files with a complete `values-vi` mirror**. Every in-scope Android screen resolves its text through `stringResource(...)`; the only string literals left in those files are emoji. Android therefore needs no *resource* work — but three user-visible strings were never externalized at all and are hard-coded **English**, the mirror image of the Web bug (§5).

---

## 2. Root cause (Web)

Two independent causes produce the same symptom.

### Cause A — Server Components cannot reach the client-only locale store

`src/lib/i18n/useTranslation.ts` is `'use client'` and keeps locale in a `useSyncExternalStore` backed by `localStorage`. A React Server Component cannot call it, so any page rendered on the server ships whatever literal the author typed — always Vietnamese.

Affected: `/profile/account`, `/profile/history`, `/profile/bookings`.

The codebase already contains the correct pattern — the server page does auth + data fetch and delegates rendering to a `'use client'` view:

```
src/app/profile/settings/page.tsx    (server: auth + profile)
  └── SettingsView.tsx               ('use client': useTranslation)
```

Only **Settings**, **Profile**, and **Notifications** were ever migrated to it.

### Cause B — Client Components that simply never adopted i18n

The larger group. These are already `'use client'`, so nothing prevented them from calling `useTranslation()` — the strings were just hard-coded and never revisited.

Affected: `/profile/preferences`, `/profile/favorites`, `/profile/price-watches`, `/profile/tappy-knows`, `/profile/edit`, `/profile/posts`, `/profile/integrations`, `/group/*`, and 4 shared child components.

### Aggravating factor — the fallback chain hides gaps

`translate()` resolves:

```ts
let str = full[locale]?.[key] ?? full.vi[key] ?? key   // useTranslation.ts:69
```

A key missing an English value **silently renders Vietnamese** rather than failing. Today 0 keys are missing, so this is latent — but it is exactly the mechanism that would let this bug class reappear unnoticed. Addressed by a regression test (§6.5).

---

## 3. Per-screen inventory (Web)

"VN lines" = source lines containing Vietnamese characters.

| # | Screen (Account) | Route | File | Type | i18n | VN lines |
|---|---|---|---|---|---|---|
| 1 | Profile hub | `/profile` | `ProfileView.tsx` | client | ✅ full | 0 |
| 2 | Account | `/profile/account` | `account/page.tsx` | **server** | ❌ none | 7 |
| 3 | Edit profile | `/profile/edit` | `edit/page.tsx` | client | ❌ none | 20 |
| 4 | Chat history | `/profile/history` | `history/page.tsx` | **server** | ❌ none | 5 |
| 5 | ↳ delete button | — | `DeleteConversationButton.tsx` | client | ❌ none | 2 |
| 6 | Bookings | `/profile/bookings` | `bookings/page.tsx` | **server** | ❌ none | 15 |
| 7 | ↳ review button | — | `BookingReviewButton.tsx` | client | ❌ none | 13 |
| 8 | ↳ share button | — | `BookingShareButton.tsx` | client | ❌ none | 9 |
| 9 | My preferences | `/profile/preferences` | `preferences/page.tsx` | client | ❌ none | 37 |
| 10 | Saved | `/profile/favorites` | `favorites/page.tsx` | client | ❌ none | 19 |
| 11 | ↳ delete button | — | `FavoriteDeleteButton.tsx` | client | ❌ none | 1 |
| 12 | Price tracking | `/profile/price-watches` | `price-watches/page.tsx` | client | ❌ none | 20 |
| 13 | Memory ("What Tappy knows") | `/profile/tappy-knows` | `tappy-knows/page.tsx` | client | ❌ none | 46 |
| 14 | My reviews (own posts) | `/profile/posts` | `posts/page.tsx` | client | ❌ none | 10 |
| 15 | App connections | `/profile/integrations` | `integrations/page.tsx` | client | ❌ none | 26 |
| 16 | Group dining — new | `/group/new` | `GroupNewForm.tsx` | client | ❌ none | 9 |
| 17 | Group dining — detail | `/group/[id]` | `[id]/page.tsx` | client | ❌ none | 34 |

| # | Screen (Settings) | Route | File | Type | i18n | VN lines |
|---|---|---|---|---|---|---|
| 18 | Settings hub | `/profile/settings` | `SettingsView.tsx` | client | ✅ full | 0 |
| 19 | Notifications | `/profile/notifications` | `NotificationsView.tsx` + `NotificationSettings.tsx` | client | ✅ full | 0 |
| 20 | Language | in Settings | `LanguageSwitcher.tsx` | client | ✅ full | 0 |

### Shared components that leak Vietnamese into otherwise-localized screens

| File | Issue |
|---|---|
| `src/components/MenuItem.tsx:38` | `Sắp có` ("Coming soon") badge hard-coded |
| `src/lib/utils.ts:13-16` | `formatRelativeTime()` returns Vietnamese unconditionally — **and contains a shipped typo: `phúp trước` should be `phút trước`** |
| `src/components/Header.tsx:22` | `'bạn'` fallback display name — an English reader with no name on file was greeted "Good morning, bạn" |
| `src/app/profile/account/page.tsx:27` | `toLocaleDateString('vi-VN')` — date format pinned to Vietnamese |
| `src/app/profile/tappy-knows/page.tsx:274` | `toLocaleDateString('vi-VN')` — same |
| `src/app/profile/favorites/page.tsx:34`, `price-watches/page.tsx:26` | `toLocaleDateString`/`toLocaleString('vi-VN')` — same |

`CATEGORIES[].label` in `src/lib/utils.ts:21-25` is also hard-coded Vietnamese, but it is **not** an Account/Settings defect: the only in-scope consumer (`/profile/history`) reads `cat.emoji`, never `.label`. The label is rendered by `CategoryGrid` on Home. Out of scope → follow-up **FU-6**.

---

## 4. Audit findings by requested category

### 4.1 Missing translation keys

**Web:** 0 keys missing an `en` or `vi` value. The problem is not missing keys — it is ~230 strings that were never given keys at all. All 17 in-scope screens' worth of keys are added in this sprint (§6.1).

**Android:** 1 — `support_email` exists only in `values/`, correctly marked `translatable="false"` (it is an email address). **Not a defect.**

### 4.2 Hard-coded strings

**Web:** ~230 user-visible strings across 17 files (§3).
**Android:** 0 in the Compose screens — the only literals there are emoji (`"🍜"`, `"♡"`, `"📝"`, `"🎉"`, `"🔒"`) and category-key `when` branches, which are locale-independent by design. But **3 hard-coded English strings** hide in Kotlin helper functions rather than in the screens (§5) — a resource-coverage check does not surface them.

### 4.3 Inconsistent translations

| Concept | Web (current) | Android | Resolution |
|---|---|---|---|
| Saved — empty state | `Chưa lưu gì cả` | `Chưa có mục nào được lưu` | Adopt Android's |
| Saved — reviews section | `Bài viết đã lưu` | `Đánh giá đã lưu` | Adopt Android's |
| Chat history — empty | `Chưa có cuộc trò chuyện nào` | `Chưa có cuộc trò chuyện nào` + a body line Web lacks | Adopt Android's |
| Relative time | `phúp trước` (**typo**) | `%1$d phút trước` | Adopt Android's |
| Account — not set | `Chưa cập nhật` | `—` | Adopt Android's |
| Bookings — guests | `{n} người` | `%1$d khách` | Adopt Android's |

In every divergence the Android copy is the newer and better-formed one, so **Android is the source of truth for text** in this sprint. This also means some Vietnamese strings change on Web — intentional, and the reason it is called out here rather than buried in a diff.

### 4.4 Duplicated translations

**Web:** 0 duplicate key definitions across all 6 dictionary modules (`dictionaries`, `w2`, `w3`, `admin`, `landing`). The namespaced-merge design in `useTranslation.ts` has held.

**Android:** 0 duplicate resource names across all 29 files.

Real duplication exists only at the *value* level: the five `*_error_no_connectivity` / `_timeout` / `_session_expired` / `_server` / `_generic` sets repeat identical text under `account_`, `history_`, `saved_`, `bookings_`, … prefixes on **both** platforms. Deduplicating them would require touching Android resource names shipped in the submitted V1 build, so it is **deliberately deferred** — recorded as follow-up FU-1.

### 4.5 Unused keys

Static analysis reports 158 web keys with no literal `t('…')` call site. **That number is not actionable and must not be bulk-deleted.** The codebase resolves keys dynamically in at least 30 places:

```ts
t(labelKey)  t(`tag.${cat.id}`)  t(LEVEL_KEY[result.risk.level])
t(mood.promptKey)  t(RATING_LABEL_KEY[review.rating])  t(`landing.shots.${shot.key}.label`)
```

Every one of `nav.*`, `tag.*`, `chat.mood*`, `landing.*`, `admin.nav.*`, `scamShield.result.*`, `reviewDetail.rating*`, `fortune.*`, `vietContent.*` and `login.feature*` is reached this way. Deleting them on the strength of the static report would break the bottom navigation, the landing page and Scam Shield.

**Provably unused after manual verification — 5 keys, none in Account/Settings scope:**

| Key | Module |
|---|---|
| `video.mute` | `dictionaries.ts` |
| `video.unmute` | `dictionaries.ts` |
| `auth.emailOtp.sending` | `dictionaries.ts` |
| `auth.emailOtp.verifying` | `dictionaries.ts` |
| `scamShield.qrCamera` | `dictionaries.ts` |
| `scamShield.orScanQr` | `dictionaries.ts` |

These sit outside the Account/Settings scope and touch the Scam Shield and auth surfaces, which are in production. Removing them is a 6-key cleanup with no bearing on this bug; recorded as follow-up **FU-2** rather than smuggled into a localization sprint.

### 4.6 Cross-platform key alignment

Before: the two platforms shared **no** key names — Web used `profile.chatHistory`, Android used `profile_menu_chat_history`.

After this sprint, every newly localized screen uses **the Android resource name verbatim** as its Web key:

```
web:      t('saved_empty_title')
android:  R.string.saved_empty_title
```

288 keys across 11 modules now have literally identical names on both platforms. The pre-existing `profile.*` / `settings.*` menu keys are left alone — they work, they are used by shipped screens, and renaming them is churn with no user-visible benefit. Recorded as follow-up **FU-3**.

---

## 5. Android defects found

Android's *resources* are clean — but three user-visible strings never made it into a resource file at all. All three are the mirror image of the Web bug: **hard-coded English shown to Vietnamese readers**. A resource-coverage check alone misses them, because the literals live in Kotlin helpers rather than in XML.

| # | Location | Defect | Vietnamese reader saw |
|---|---|---|---|
| A-1 | `memory/Memory.kt:94` | `"under ${amount(item.max)}"` — English literal inside `formatBudget()` | `under 500k` instead of `dưới 500k` |
| A-2 | `bookings/Booking.kt:87` | `guestsLabel()` built from `"guest"/"guests"` | `4 guests` instead of `4 khách` |
| A-3 | `groupdining/GroupModels.kt:41-45` | `BudgetOption` labels hard-coded `"Under 100k"/"Over 200k"` | English chips on a Vietnamese form |

A-3's own source comment stated the labels were *"English to match the rest of the native app's copy (the web is Vietnamese)"* — i.e. the divergence this audit was asked to remove was a documented decision, not an oversight.

All three are fixed in §6.3.

---

## 6. Implementation

### 6.1 Web — new key modules, generated from Android (`src/lib/i18n/w4/`)

Rather than hand-transcribing ~290 strings twice, the modules are **generated** from the Android resource files by a script, then committed:

| Module | Source resource | Keys | Screens |
|---|---|---|---|
| `common.ts` | `strings_common.xml` | 7 | shared chrome |
| `account.ts` | `strings_account.xml` | 25 | Account, Edit profile |
| `history.ts` | `strings_history.xml` | 20 | Chat history |
| `bookings.ts` | `strings_bookings.xml` | 20 | Bookings |
| `preferences.ts` | `strings_preferences.xml` | 55 | My preferences |
| `saved.ts` | `strings_saved.xml` | 17 | Saved |
| `priceTracking.ts` | `strings_pricetracking.xml` | 23 | Price tracking |
| `memory.ts` | `strings_memory.xml` | 43 | Memory |
| `myReviews.ts` | `strings_myreviews.xml` | 17 | My reviews |
| `groupDining.ts` | `strings_groupdining.xml` | 46 | Group dining |
| `appConnections.ts` | `strings_app_connections.xml` | 15 | App connections |
| | **total** | **288** | |

Android's positional specifiers are rewritten to the Web dictionary's placeholder syntax (`%1$s` → `{1}`), preserving argument order. `translatable="false"` entries are skipped. Generating rather than transcribing means the two platforms cannot drift through a typo, and satisfies "same translation keys" exactly rather than approximately.

`w4` is merged into `useTranslation.ts` alongside `w2`/`w3`.

### 6.2 Web — screen conversion

- Server pages (`account`, `history`, `bookings`) gain a `'use client'` `*View.tsx` sibling; the page keeps auth + data fetching and passes props down. Same pattern as the existing `SettingsView`.
- Client pages call `useTranslation()` directly.
- Shared leaks fixed: `MenuItem` "Sắp có", `formatRelativeTime()` (including the `phúp` typo), `CATEGORIES` labels, `Header` fallback, and both `toLocaleDateString('vi-VN')` calls become locale-aware.
- **No business logic and no layout changes.** Data fetching, routing, and markup structure are untouched; only string sources move.

Because `useTranslation` is a reactive store, every converted screen re-renders on the Settings language toggle with no reload — satisfying requirement 4.

### 6.3 Android

| Defect | Fix | New resources |
|---|---|---|
| A-1 | `formatBudget()` split into `formatBudgetAmount()` + `formatBudgetRange()`; the caller renders the "under" wording from a resource | `memory_budget_under` |
| A-2 | `guestsLabel()` → `guestsLabelRes()` returning a `@StringRes`; both call sites resolve it against the active locale | `bookings_guests_count_one`, `bookings_guests_count_other` |
| A-3 | `BudgetOption` gains `@StringRes labelRes` (display) **and** `wire` (submitted value) | `groupdining_budget_low/mid/high` |

### 6.4 Persisted values vs. displayed labels

Two option sets are stored as free-form text rather than as a stable id, so translating them naively would corrupt user data. Android already documents this for cuisines in `PreferencesData.kt`: it stores the *localized* label, so a user who switches language sees their saved chips stop matching and appear unselected.

The web deliberately does **not** copy that. `CUISINE_OPTIONS` and `BUDGET_OPTIONS` became `{ value, labelKey }` pairs — `value` keeps the exact Vietnamese string already in the database, `labelKey` drives display only. Result: zero data change, no migration, and no selection desync when switching language.

Android's group-dining budget was aligned the same way (`BudgetOption.wire`), which also means both clients now submit the *same* string for a given tier — previously an English Android user stored `"Under 100k"` while the web stored `"Dưới 100k"`. **This does change what Android submits** (English label → canonical value); the backend stores the field verbatim and the AI prompt interpolates it, so there is no schema or migration impact, but it is a behaviour change and is called out here rather than buried in the diff.

The equivalent cuisine fix on Android is **not** included — it would alter values already written by V1 users. Follow-up **FU-7**.

### 6.5 Regression guard

`src/lib/i18n/__tests__/localeParity.test.ts` asserts, for all six dictionary modules, that:

- the `vi` and `en` key sets are identical — so a missing English value fails CI instead of silently rendering Vietnamese through the `?? full.vi[key]` fallback;
- no value is empty;
- placeholders (`{1}`, `{2}`) match across locales — a dropped placeholder would render a literal `{1}` to users;
- no key is defined by two modules (the spread merge would silently pick one).

`src/app/profile/accountSettingsI18n.test.tsx` mounts the three former Server Components under each locale and asserts the copy actually flips, including the guest count and the absence of the `phúp` typo.

---

## 7. Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `next lint --dir src` | 0 errors (warnings all pre-existing: `exhaustive-deps`, `no-img-element`) |
| `next build` | successful, all Account/Settings routes emitted |
| Web unit tests (primary tree) | **31 files / 292 tests passed** |
| i18n locale-parity tests | 19 passed |
| EN/VI rendering tests (Account, Chat history, Bookings) | 10 passed |
| Android `:app:compileDebugKotlin` | BUILD SUCCESSFUL (only pre-existing deprecation warnings) |
| Android `:app:testDebugUnitTest` | **85/85 passed, 0 failures** |
| Hard-coded Vietnamese remaining in scope | 0 (sweep returns only emoji, comments, canonical `value:` strings and the test's own assertions) |

**What was not verified, and why.** A full-suite `vitest run` reports 38 failing files — every one of them inside `.claude/worktrees/*`, which are separate checkouts from other sessions with their own `node_modules`. They are untouched by this work; scoping the run to this tree (`--exclude "**/.claude/**"`) gives 31/31 files and 292/292 tests green.

Live browser UAT of the signed-in screens was **not** performed. The production build was served from this tree on `:3800` and every Account/Settings route redirects to `/` without a session, and the standing rule forbids driving real OAuth. The EN/VI rendering tests above are the substitute evidence for the three screens that were Server Components; the remaining nine screens are covered by build + typecheck + the string sweep, not by rendered-output assertions. **Owner UAT on a logged-in session is still required** to close this out.

Android was verified by compile + unit tests only — no device run.

## 8. Branch strategy

The Web and Android fixes **cannot ship on one branch**, because the two platforms' trees have diverged:

- `src/app/profile/**` is byte-identical between `main` and `feat/backoffice-phase0` → **Web work targets `main`**.
- `android/**` differs by **253 files**; the Android V1 tree submitted to Play lives on `feat/backoffice-phase0`, and `feat/backoffice-phase0` is 174 commits behind `main` → **Android work targets `feat/backoffice-phase0`**.

Two PRs, per the standing rule that production changes go GitHub PR → Review → Merge → Deploy. Attempting a single branch would either drag 174 stale commits into `main` or ship the Web fix from a branch that must never be deployed.

---

## 9. Deferred follow-ups (not done in this sprint)

| ID | Item | Why deferred |
|---|---|---|
| FU-1 | Deduplicate the 5 repeated network-error strings per feature prefix | Requires renaming Android resources already shipped in V1 |
| FU-2 | Delete the 6 provably-unused keys (`video.mute/unmute`, `auth.emailOtp.sending/verifying`, `scamShield.qrCamera/orScanQr`) | Outside Account/Settings; touches production Scam Shield + auth |
| FU-3 | Migrate legacy `profile.*` / `settings.*` keys to Android resource names | Churn on working, shipped screens |
| FU-4 | Flash-of-Vietnamese on first paint: `getServerSnapshot()` returns `'vi'`, so SSR HTML is always Vietnamese and flips after hydration | Pre-existing app-wide; a real fix needs cookie-based locale + SSR — a design change, not a localization fix |
| FU-5 | **Navigation inconsistency:** Web "My reviews" → `/reviews` (the public Explore feed); Android "My reviews" → own-posts grid (≡ Web `/profile/posts`) | Changing a link target is business logic, explicitly out of scope |
| FU-6 | `CATEGORIES[].label` hard-coded Vietnamese, rendered by `CategoryGrid` on Home; `tag.*` keys already exist for all five ids | Home screen, outside Account/Settings |
| FU-7 | Android stores the *localized* cuisine label in `cuisine_likes`, so switching language desyncs saved chips (documented in `PreferencesData.kt`) | Fixing it rewrites values already stored by V1 users — needs an owner call on migration |

### Note on requirement 6 ("remove unused keys")

The generated `w4` modules intentionally mirror Android's full key set for each in-scope feature, so some keys have no web call site (Android classifies network errors more granularly than the web screens do). Those are **not** dead: deleting them would break both the 1:1 key parity this sprint was asked to establish and the generator, which would re-add them on the next run.

Genuinely dead keys were removed: `menu_coming_soon` (added during implementation, then made unnecessary when `MenuItem`'s unreachable `comingSoon` branch was changed to take a caller-supplied string instead of a hard-coded `Sắp có`). The six provably-dead pre-existing keys are FU-2.
