# TappyAI Android — Web Parity Sync Sprint Report
**Date:** 2026-07-17
**Mandate:** Sync Android to current production Web (bug fixes, UX fixes, existing features). Web is Source of Truth; Backend owns business behavior; Android owns only native presentation. No new features, no Backend changes, no Web changes.

---

## 1. Parity Matrix

Audited domains: Authentication, Home, Chat, AI, Food/Shopping/Travel/Entertainment/Spa, Explore, Nearby, Reviews, Comments, Likes, Saves, Shares, Notifications, Profile, Settings, Price Watch, Bill Split, Maps, Search, Deep Links, Uploads, Media, Streaming, Language, Theme.

| Domain | Finding | Class | Status |
|---|---|---|---|
| Chat — CTA buttons | Web renders `[CTA_BUTTONS]` markers as tappable buttons; Android showed raw JSON as chat text | B | **Fixed** |
| Chat — markdown images | Web renders inline place/product photos in AI replies; Android's markdown renderer had no image support (stray `!` + broken link shown) | B | **Fixed** |
| Chat — followups | Android used a static, fabricated per-category canned-prompt table with no web equivalent; real followups are model-generated via `[FOLLOWUPS]` marker | B | **Fixed** |
| Chat — `[TAPPY_PLAN]` leak | Raw itinerary JSON marker was never stripped, leaked into the chat bubble as literal text | A | **Fixed** (strip only; full itinerary card UI is E, out of scope) |
| Chat — userPreferences | Web sends saved preference tags on every `/api/chat` call; Android never sent this field | D | **Fixed** |
| Chat — responseStyle | Web sends the user's tone/length pick (`localStorage['tappy_response_style']`) on every chat call; Android's tone/length picker existed but was never persisted or sent | B | **Fixed** |
| Chat — location bias | Web sends `userLocation` for place-search bias; Android has no location permission/wiring at all | B | **Deferred (E-scale)** — see §5 |
| Auth — email format validation | Web rejects an email missing `@` before hitting the network; Android only checked non-empty | A | **Fixed** |
| Auth — OTP code length validation | Web rejects a code under 6 digits before hitting the network; Android only checked non-empty | A | **Fixed** |
| Auth — Facebook button | Web hides Facebook via `AUTH_PROVIDERS` config (blocked by Meta Business Verification); Android shows it active | Product decision | **Not changed** — owner explicitly decided to build it identically to Google in an earlier session (works the instant Verification completes, no code change needed then) |
| Auth — anonymous/guest tier | Web has a full anon-user tier (5 free AI questions/day, browse-only elsewhere); Android has no equivalent auth state | B (E-scale) | **Deferred** — see §5 |
| Reviews — delete/hide | Backend calls + UI existed (`MyReviewsViewModel` pattern) but the public feed/detail screens hardcoded `isMe = false`, `onDelete = {}`, `onHide = {}` | A | **Fixed** |
| Reviews — search | Android blocked queries under 2 chars (web only blocks blank) and debounced at 350ms (web: 400ms) | B | **Fixed** |
| Music — search debounce | Android 400ms vs web's `useMusicSearch.ts` 300ms | B | **Fixed** |
| Money formatting | `formatCompactVnd` truncated instead of rounding (e.g. 1,250,000 → "1.2 triệu" instead of "1.3 triệu") | A | **Fixed** |
| Settings — Dark mode | Toggle existed only inside the dev-only, navigationally-unreachable `DesignSystemShowcaseScreen`; no persistence (lost on app restart) | C | **Fixed** — persisted + reachable from Settings |
| Settings — Language default display | Showed hardcoded "English" before an explicit pick, even on a vi-resolved device | C | **Fixed** |
| Home — identity/avatar | Greeting and avatar ignored sign-in state entirely (always neutral placeholder, no name) — web shows real avatar + first name once signed in | B | **Fixed** (identity/avatar/greeting only; full `RecentActivitySection`/`SuggestionsSection` data-wiring is out of scope) |
| Split Bill | Task history claims "completed" but exhaustive grep found **zero** real implementation | Discrepancy | **Reported**, not rebuilt (E-scale, out of scope this sprint) |
| Trip plan card | Web renders a rich itinerary card from `[TAPPY_PLAN]`; Android only strips the marker | E | **Out of scope** |
| Comments post/delete, Follow/unfollow, review composer media upload, user-search, review deep-link | Whole capabilities missing on Android with no equivalent | E | **Out of scope**, reported |
| Zalo login | No Supabase-native provider, would need a custom backend flow like Zalo's own `/api/auth/zalo` | E | **Out of scope**, reported |

---

## 2. Files Modified (this sprint only)

**Chat (CTA buttons, markdown images, real followups, preferences, response style):**
- `android/app/src/main/java/com/tappyai/app/chat/ChatCtaButton.kt` (new)
- `android/app/src/main/java/com/tappyai/app/chat/ChatMessage.kt`
- `android/app/src/main/java/com/tappyai/app/chat/ChatScreen.kt`
- `android/app/src/main/java/com/tappyai/app/chat/ChatViewModel.kt`
- `android/app/src/main/java/com/tappyai/app/chat/data/ChatRepository.kt`
- `android/app/src/main/java/com/tappyai/app/chat/data/ChatRequest.kt`
- `android/app/src/main/java/com/tappyai/app/chat/data/RealChatRepository.kt`
- `android/core/designsystem/src/main/java/com/tappyai/core/designsystem/component/TappyMarkdown.kt`

**Auth validation:**
- `android/features/auth/src/main/java/com/tappyai/features/auth/ui/login/LoginViewModel.kt`
- `android/features/auth/src/main/java/com/tappyai/features/auth/ui/otp/EmailOtpVerificationViewModel.kt`
- `android/features/auth/src/main/res/values/strings.xml`, `values-vi/strings.xml`

**Reviews (delete/hide wiring, search parity):**
- `android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewsFeedViewModel.kt`
- `android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewDetailViewModel.kt`
- `android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewsScreens.kt`
- `android/app/src/main/java/com/tappyai/app/reviews/ui/ReviewSearchViewModel.kt`

**Money formatting:**
- `android/core/common/src/main/kotlin/com/tappyai/core/common/MoneyFormatter.kt`

**Music search debounce:**
- `android/app/src/main/java/com/tappyai/app/music/MusicLibraryViewModel.kt`

**Response style persistence (What Tappy Knows):**
- `android/app/src/main/java/com/tappyai/app/memory/Memory.kt`
- `android/app/src/main/java/com/tappyai/app/memory/MemoryViewModel.kt`

**Theme persistence + Settings entry point:**
- `android/app/src/main/java/com/tappyai/app/theme/AppTheme.kt` (new)
- `android/app/src/main/java/com/tappyai/app/MainActivity.kt`
- `android/app/src/main/java/com/tappyai/app/profile/SettingsViewModel.kt`
- `android/app/src/main/java/com/tappyai/app/profile/SettingsScreen.kt`
- `android/app/src/main/res/values/strings_settings.xml`, `values-vi/strings_settings.xml`

**Language default resolution:**
- `android/app/src/main/java/com/tappyai/app/language/LanguageManager.kt`

**Home identity/avatar:**
- `android/app/src/main/java/com/tappyai/app/home/HomeViewModel.kt`
- `android/app/src/main/java/com/tappyai/app/home/HomeScreen.kt`

**Dead-code cleanup:**
- `android/app/src/main/res/values/strings_chat.xml`, `values-vi/strings_chat.xml` (removed 18×2 unused `chat_followup_*` strings, now dead after the real-followups fix)

Every file above was compile-verified per-batch (`gradlew :app:compileDebugKotlin`) before moving to the next fix, per this session's established discipline.

---

## 3. Features Synced
- Real AI-generated CTA buttons (external-open only — `internal_booking` is unreachable, forbidden by the current prompt).
- Real AI-generated follow-up chips (replacing the fabricated static table).
- Inline markdown images in chat replies.
- `userPreferences` and `responseStyle` now sent on every chat turn, matching web's request body exactly.
- Dark/light theme toggle: persisted, and reachable for the first time from Settings.
- Reviews delete/hide: fully wired in the public feed and detail screens (previously only worked in the separate My Reviews grid).

## 4. Bug Fixes Synced
- Email/OTP client-side validation now matches web (`@` check, 6-digit check) before hitting the network.
- `MoneyFormatter.formatCompactVnd` rounds instead of truncating.
- Reviews search: blank-only guard (was 2-char minimum) + 400ms debounce (was 350ms).
- Music search debounce: 300ms (was 400ms).
- Settings language display now reflects the actually-resolved locale instead of hardcoding "English".
- Home greeting/avatar now reflect sign-in state instead of always showing the signed-out placeholder.

## 5. Remaining Differences (deferred, not implemented this sprint)
All below are real, confirmed gaps — classified E (whole new capability) or judged too large in scope for a parity-sync pass, and explicitly out of scope per the mandate's "no new features" rule:
- Anonymous/guest auth tier (5 free AI questions/day, browse-only elsewhere).
- Chat location-bias search (`userLocation` sent to `/api/chat`) — requires Android's first-ever runtime location permission + FusedLocationProviderClient wiring from scratch.
- Full `[TAPPY_PLAN]` itinerary card UI (currently stripped so it doesn't leak as raw text, but not rendered as a card).
- Comments post/delete, Follow/unfollow, review composer media upload (Photo/Video/Link), user-search, review-link deep linking.
- Zalo login (no Supabase-native provider; needs a custom backend flow).
- Home's `RecentActivitySection`/`SuggestionsSection` real data wiring (only the identity/avatar/greeting portion was in scope).

## 6. Blocked Items / Reported Discrepancies
- **Split Bill task-history contradiction**: an earlier task list entry claims Split Bill was "completed" as a client-only feature. Exhaustive grep (`split|Split|SplitBill|tipPercent|equalSplit`) across `android/` found **zero** real implementation — only unrelated `.split()` string-method calls and a doc mention. Reported per STEP 4 rather than silently trusting the stale entry or silently rebuilding a whole feature.
- **Facebook login button**: web hides it via `AUTH_PROVIDERS` config since Meta Business Verification blocks it in production; Android shows it active. This is a documented, explicit prior owner decision (build identically to Google, no code change needed once Verification completes) — not touched, reported as a deliberate, owner-approved divergence rather than "fixed" to match web.

## 7. Build
- `gradlew clean assembleDebug testDebugUnitTest` — **BUILD SUCCESSFUL**, full unit test suite passed, zero new warnings beyond pre-existing deprecation notices unrelated to this sprint's changes.
- Every fix batch was also compile-verified individually (`:app:compileDebugKotlin`) before proceeding to the next fix.

## 8. Runtime Verification
Interaction-verified live on the Android emulator (`emulator-5554`), screenshots captured at each step:
- **Email validation**: typed `notanemail`, tapped Send code → "Enter a valid email" error rendered correctly (real device interaction, not a static review).
- **Dark mode toggle**: via a temporary, fully-reverted `TEMP_VERIFY_HACK` (forced `AuthSessionState.Authenticated` in `AppNavHost.kt` to reach post-auth screens without a real login — confirmed removed via `grep -rn "TEMP_VERIFY_HACK"` returning zero matches before finishing) — navigated to Settings, confirmed the new "Dark mode" row renders correctly positioned below Language, toggled it, and the entire app immediately re-themed to dark — confirming the DataStore-backed persistence + live `MainActivity` reactivity work end-to-end.
- **Settings language row**: confirmed shows "English" correctly (matches the device's actual resolved locale — the `LanguageManager.resolved` fix).
- **Home/Profile screens**: confirmed no crash and correct signed-out-consistent fallback (neutral avatar, no name) when `AuthRepository.currentUserId()` legitimately returns null (the hack bypasses the nav gate but not the real token store) — this is the correct, coded fallback path, not a false pass.

**Not runtime-verified** (would require a real signed-in session with actual chat/review data, which this environment cannot produce per this session's standing "never click real OAuth" rule): CTA button rendering/tap-through, markdown image rendering, real follow-up chips, Reviews delete/hide against live data, userPreferences/responseStyle actually reaching the backend. These are build-verified and logically verified against the exact web source (line-by-line marker/regex/field-name comparison), but not interaction-confirmed with real data.
