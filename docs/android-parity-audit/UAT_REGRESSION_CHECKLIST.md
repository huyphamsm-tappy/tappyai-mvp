# TappyAI Android — UAT Regression Checklist

**Purpose:** When a defect is fixed during UAT, this defines the **minimum** set of re-tests before the fix is accepted — the module's own core path **plus** everything that shares code/state with it. Cross-dependencies are derived from the codebase (shared models, DI singletons, navigation, persisted keys).

**Rule of thumb:** always re-run (a) the fixed module's own P0/P1 rows, (b) every module in its "Also re-test" column, and (c) `assembleDebug` + affected unit tests. For any change to a **shared model, DI singleton, navigation host, or string resource**, escalate to the **Global smoke** row.

| Fixed module | Minimum regression scope | Also re-test (shared dependency) | Why |
|---|---|---|---|
| **Auth** (Google / Email OTP) | Sign-in both providers, session persist across restart, sign-out clears | Onboarding routing (new vs returning), every login-gated entry (Chat/Profile/Reviews social/Memory/Bookings), logout/login, session-expiry | Auth token gates the whole authed surface |
| **Onboarding** | New-user wizard, skip, completion POST, returning-user skip | Auth (post-login routing), Home first-load | Onboarding sits between auth and Home |
| **Navigation / Shell** | All 5 tabs switch, back stack, deep links (`tappyai://group/{id}`, review links) | Every tab's landing screen, resume/rotation | AppNavHost drives all destinations |
| **AI Chat / Streaming** | All reply types (text, place cards, `[TAPPY_PLAN]`, CTA links, follow-ups), quota copy, message action bar, save-place | Memory (response-style feeds `responseStyle` on every turn), Home suggested-prompt → chat, Nearby (location-biased) | Chat request embeds response style + location; shared streaming parser |
| **Memory (response style / isLoading)** | Memory load spinner, add/remove/clear, tone/length persist across restart | **AI Chat** (reads persisted style via shared `PreferencesDataSource` keys) | Writer/reader share `RESPONSE_STYLE_*` keys |
| **Reviews model (`ReviewProfile`) / follow** | Profile stats (Reviews/Followers/Following), follow/unfollow optimistic+persist | **Feed, Detail, User Search, Notifications** (all consume `ReviewProfile` + follow DTO) | `ReviewProfile` + `followUser` are shared across the reviews module |
| **Reviews Composer (image/video/link)** | Photo (<=6/5MB), video (<=60s/50MB) progress, link, publish | Feed (new post appears), My Reviews, Sound Detail ("use this sound" pre-attach), Bookings review-prefill | Composer output flows into feed/my-reviews; multiple entry points |
| **Reviews Feed / Video player** | Autoplay muted, watchdog self-heal, active-clip swipe, clip-id back-restore | Detail hero video, attached-sound companion audio, background/foreground pause-resume | Shared `ReviewVideoPlayer` + FeedAudio unlock |
| **Reviews Comments / Reactions** | Post comment, one-level reply indent, 6-emoji reaction counts + my_reaction | Detail screen, Notifications (comment deep-link) | Shared comment section + reaction DTO |
| **Deals / Affiliate** | List, discount badge, countdown, voucher copy, open → click counter + external URL | Chat CTA/booking/flight links (shared external-open + track), disclosure text | Shared external-link + `/api/track` |
| **Maps** | Placeholder + search → external map, saved places | Saved (shared favorites source), Profile → Saved | Favorites-backed; shared `/api/favorites` |
| **Settings / Language** | en↔vi switch app-wide + persist, ToS/Privacy/Copyright, Sign Out, Delete Account | **Global smoke** (every screen re-localizes) | Locale change re-renders all strings |
| **Profile / Account** | Header identity, edit save, QR, all menu rows open | Auth (identity source), each linked screen (Bookings/Preferences/Saved/Memory/etc.) | Profile is the hub for account features |
| **Preferences (gender/settings)** | Load current, change gender persists (auth metadata) across restart, toggles | Chat/Recommendations (personalization consumers) | Prefs feed personalization |
| **Currency / Translate / VietWriter / Scan / Split Bill / Fortune** | The module's own flow only | Home Quick Action entry to it | Mostly self-contained; verify launch + core path |
| **Group Dining / Bookings / Price Tracking / Music / Recommendations / Saved / My Reviews / Chat History** | The module's own GET/POST/DELETE + list/empty states | Profile menu entry; any composer/chat cross-link (e.g. booking→review) | Data screens with a single entry + occasional cross-link |
| **Core designsystem (TappyButton/TappyTextField/TappyMarkdown/etc.)** | The changed component in isolation | **Global smoke** (used app-wide) | Shared UI primitives |
| **Networking / Auth interceptor / DI** | The touched call | **Global smoke** + all authed calls | Shared Retrofit/OkHttp singleton |

### Global smoke (run when a shared model / DI singleton / nav host / string resource / core component changes)
- [ ] App launches (splash → login/home)
- [ ] Sign in (one provider) + session persists
- [ ] One full chat turn (streaming + one reply type)
- [ ] Explore feed loads + one video plays
- [ ] Open one review detail + post one comment
- [ ] Open Profile + one menu row
- [ ] Switch language en↔vi
- [ ] `assembleDebug` + `lintDebug` + `testDebugUnitTest` green
- [ ] No new crash/ANR across the above

### After ANY fix (mandatory)
- [ ] Re-run the failed test-case IDs from the Test Log → mark PASS + record "Fixed In" build
- [ ] Re-run the module's P0/P1 rows
- [ ] Re-run affected unit tests (e.g. `SplitBillCalculatorTest`, `CurrencyMathTest`, `MemoryUpdatedTest`, `TrackWireTest`) — regression tests are permanent, never deleted
- [ ] Confirm fix is on `feat/backoffice-phase0` HEAD and a **clean clone still builds**
