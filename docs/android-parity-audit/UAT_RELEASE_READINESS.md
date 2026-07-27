# TappyAI Android — UAT & Release Readiness

**Prepared by:** QA Lead / Release Manager
**Branch / HEAD:** `feat/backoffice-phase0` @ `ad5e294`
**App:** `com.tappyai.app` · versionName `0.1.0` · versionCode `1`
**SDK:** minSdk 26 (Android 8.0) · targetSdk 35 (Android 15) · compileSdk 36
**Declared permissions:** `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` (no CAMERA / storage — media selection uses the system Photo Picker)
**Engineering status:** ✅ self-contained HEAD; clean clone passes `assembleDebug` + `assembleStaging` + `lint` (0 errors) + 74 unit tests.
**Publishing status:** ⏳ signed AAB pending upload keystore + release secrets.

> **Governance:** Per project rule, the final UAT verdict is the **Product Owner's** call. Everything in this document is the objective evidence base for that decision — not a self-issued sign-off.

---

## 0. Feature Availability — Scope Control (read first)

QA must **not** raise defects against features that are intentionally not in this build:

| Not in build (do NOT test as a defect) | Status |
|---|---|
| **Anonymous / Guest mode** | Not implemented (backend session contract pending). **Login is required.** |
| **Push notifications (FCM)** | Not in build (no Firebase / `google-services.json`). Only the **in-app notification center** exists. |
| **Zalo login** | Not a provider in this build. Auth = **Google + Email OTP** only (Facebook hidden). |
| **In-app booking / payments** | Out of scope — CTAs deep-link to external partners only. |
| **Tiled interactive map** | Intentional — Maps is a search entry point + saved places (web parity). |

Anything above should be logged as **"N/A — out of scope,"** not as a bug.

---

## 1. UAT Test Plan — User Journeys by Priority

### P0 — Critical (release-blocking; must be 100% PASS)
| ID | Journey |
|----|---------|
| J-P0-1 | Cold start → Splash → Login screen (signed-out) or Home (returning session), no crash |
| J-P0-2 | Sign in with Google → land in-app (onboarding if new, else Home) |
| J-P0-3 | Sign in with Email OTP (request code → enter → authenticated); wrong code rejected |
| J-P0-4 | New user completes onboarding → Home; returning user never re-enters onboarding |
| J-P0-5 | AI Chat: send message → **incremental streaming** reply, no crash |
| J-P0-6 | AI Chat food/travel query → place cards with images + tappable CTA links |
| J-P0-7 | AI Chat plan query → `[TAPPY_PLAN]` itinerary card renders (no raw marker/empty bubble) |
| J-P0-8 | Session persists across app restart (returning user skips login) |
| J-P0-9 | Sign out → returns to login, session cleared |
| J-P0-10 | Navigate all 5 tabs (Home / Chat / Explore / Maps / Profile) with no crash |
| J-P0-11 | Explore feed loads; video autoplays muted; vertical swipe changes active clip |
| J-P0-12 | Delete Account path opens (mailto + confirm) — Play policy requirement |

### P1 — Important (must be ≥95% PASS; no open P1 crash/data-loss)
| ID | Journey |
|----|---------|
| J-P1-1 | Chat: daily quota reached → correct limit copy; follow-up chips send; save-place persists |
| J-P1-2 | Chat: location-granted replies are nearby-biased; denied still returns results |
| J-P1-3 | Chat history: list recent conversations → resume one |
| J-P1-4 | Memory (Tappy Knows): facts load; response style tone/length **persists across restart**; edit/remove/clear |
| J-P1-5 | Reviews: open detail → comments load; post comment; reply indents; 6-emoji reactions |
| J-P1-6 | Reviews composer: photo upload (≤6, 5MB); video upload (≤60s/50MB) with progress; publish |
| J-P1-7 | Reviews: like / save / share (system share sheet); attached-sound clip plays companion audio |
| J-P1-8 | Reviews: user search (2+ chars) → follow/unfollow (optimistic, persists); open profile → stats |
| J-P1-9 | Reviews notifications center loads; deep-links to target |
| J-P1-10 | Profile: real name/email/avatar; account edit saves; QR sheet; menu rows open |
| J-P1-11 | Deals (affiliate): list loads; voucher copy; countdown; opening a deal fires click + opens URL |
| J-P1-12 | Settings: language en↔vi switches app-wide and **persists**; ToS/Privacy/Copyright open |
| J-P1-13 | Maps: search opens external map; saved places render |

### P2 — Optional (track; may defer with owner approval)
| ID | Journey |
|----|---------|
| J-P2-1 | Fortune: Tarot (78-card), Zodiac, Tu-vi (Lifetime / By-Year tabs) render |
| J-P2-2 | Currency convert (+ missing-rate error, no silent ×1); Translate (+ TTS target language) |
| J-P2-3 | Split Bill math (2–20 people, tip presets, equal/custom) |
| J-P2-4 | VietWriter generate + copy/share; Scan (document OCR) |
| J-P2-5 | Group Dining: create group → detail; deep-link `tappyai://group/{id}`; AI budget suggestion |
| J-P2-6 | Bookings list; Price Tracking (view/add/delete); Music library + Sound Detail (CC-BY); Saved; My Reviews; Recommendations |
| J-P2-7 | Theme light/dark; rotation; TalkBack tab labels |

---

## 2. UAT Checklist — Every Production Feature

Legend: **[ ]** untested · mark `PASS` / `FAIL` / `N/A` · record device+OS+build. (Granular per-screen steps: see `RC_UAT_CHECKLIST.md`.)

### Splash `P0`
- [ ] Cold start shows splash (Theme.TappyAI.Splash), hands off to app, no white flash/ANR
- [ ] No splash on warm resume

### Onboarding `P0`
- [ ] New user routed to onboarding (not Home)
- [ ] Interests multi-select + city step; Skip works on both
- [ ] Completion POSTs and replaces wizard with Home; onboarded user never re-enters

### Authentication `P0`
- [ ] Login shows Google + Email (no Facebook, no password register)
- [ ] Google sign-in completes; Email OTP request→verify; wrong code rejected
- [ ] Session persists across restart; sign-out clears session

### Anonymous Mode `N/A`
- [ ] Confirm login is required (no guest path) — **out of scope, verify absence only**

### Home `P0`
- [ ] Greeting + real avatar/first name (neutral placeholder when loading)
- [ ] "Ask Tappy" rotating prompts → opens Chat
- [ ] 9 Quick Actions (Explore, Maps, Music, Scan, Translate, Games, Currency, Deals, Split Bill) each open correct screen
- [ ] Fortune cards, VietWriter card, Recommendations, suggested-prompt chips (network), Recent Activity honest empty state, location "not set" when denied

### AI Chat `P0`
- [ ] Send → reply; place cards + images; CTA/booking links open externally
- [ ] `[TAPPY_PLAN]` itinerary card; follow-up chips; save-place; message action bar (copy/regenerate/feedback)
- [ ] Category shortcut pre-fills & auto-sends; quota copy correct

### Streaming `P0`
- [ ] Reply renders token-by-token (not blank-then-whole); no dropped/duplicated text; long reply completes

### Memory `P1`
- [ ] Facts load (spinner during initial GET); add/remove/clear
- [ ] Response style tone/length select → **persists across restart** (feeds chat responseStyle)
- [ ] Last-updated date shows; no untranslated strings

### Food / Travel / Nearby `P0/P1` (delivered via Chat)
- [ ] Food query → restaurant/place recommendations with images
- [ ] Travel query → itinerary/plan card
- [ ] Nearby: with location granted, results are location-biased; denied → graceful fallback

### Maps `P1`
- [ ] Placeholder + search affordance render; search opens external Google Maps; saved places listed

### Explore / Reviews `P0/P1`
- [ ] Feed tabs (Following / For You / Latest) switch; only active video plays; stalled clip self-heals (~300ms)
- [ ] Attached "use this sound" plays companion audio over muted video
- [ ] Like/Save/Share optimistic; Back restores the same clip by id
- [ ] Detail: author, rating, media, caption, place link; comments + replies + reactions
- [ ] Search users + follow/unfollow; profile stats (Reviews/Followers/Following) + Follow button (hidden on own)
- [ ] Notifications center loads + deep-links

### Image Upload `P1`
- [ ] Composer photo tab: pick up to 6 (5MB each) via Photo Picker; remove; publish; appears in feed

### Video `P1`
- [ ] Composer video: pick ≤60s/≤50MB; thumbnail; upload progress; >60s rejected (message says "60 seconds", never 62)
- [ ] Published video plays muted-autoplay; sound unlock on tap

### Profile `P1`
- [ ] Header real identity; account edit saves; QR sheet
- [ ] Menu: Account, Chat History, Bookings, Preferences, Saved, Price Tracking, Tappy Knows, My Reviews, Group Dining (Upgrade-to-Pro & App Connections hidden)

### Notifications `P1` (in-app only)
- [ ] Reviews notification center loads (likes/comments/follows), items deep-link
- [ ] Confirm **no push** behavior expected — out of scope

### Settings `P1`
- [ ] Theme/notification toggles persist; ToS/Privacy/Copyright open; Sign Out; Delete Account (mailto + confirm)

### Language `P1`
- [ ] Switch en↔vi applies app-wide + section headers re-localize; persists across restart; no leftover English/keys

### Affiliate Links (Deals + CTAs) `P1`
- [ ] Deals list from `partner_deals` (name/category/title/banner); discount badge only when present; countdown; voucher copy chip (copy ≠ navigate)
- [ ] Opening a deal fires click counter (POST) + opens official URL; commercial-disclosure text shown
- [ ] Chat CTA/booking/flight links open the correct external partner

### Additional production features `P2`
- [ ] Fortune (Tarot/Zodiac/Tu-vi) · Currency · Translate · VietWriter · Scan(OCR) · Split Bill · Group Dining · Bookings · Price Tracking · Music/Sound Detail · Recommendations · Saved · My Reviews · Games (SuperTux WebView)

---

## 3. Edge Case Checklist (every screen must degrade gracefully — no crash)

| Condition | Expected behavior | Priority |
|----|----|----|
| **No Internet** | Network screens show error + retry; no crash; cached content where applicable | P0 |
| **Slow Network** | Loading indicators; no ANR; chat stream tolerates latency (60s read timeout); uploads don't abort prematurely | P0 |
| **Permission Denied (Location)** | Chat/Home fall back to non-located results; honest "not set"; no repeated nag | P0 |
| **GPS Disabled** | Same graceful fallback as denied location | P1 |
| **Empty Data** | Feed/Memory/Bookings/Saved/History/Notifications show honest empty states (no fabricated content, no blank screen) | P1 |
| **AI Timeout** | Chat surfaces a timeout error + allows retry; partial stream not left dangling | P0 |
| **API Failure (4xx/5xx)** | Typed error copy (quota/auth/rate-limit/server); no crash; retry where sensible | P0 |
| **App Resume** | Feed restores active clip; video resumes; no double-load; state preserved | P1 |
| **Background / Foreground** | Video/audio pause in background, resume on return; no orphan audio | P0 |
| **Logout / Login** | Sign out clears session + returns to login; re-login lands correctly; no stale user data | P0 |
| **Session Expiration** | Expired token → "please sign in" path, not a silent broken state; re-auth recovers | P0 |
| **Rotation / config change** | No crash; in-flight state preserved | P1 |
| **Low storage / large video** | Upload of a 50MB video on cellular succeeds or fails cleanly with message | P1 |
| **Airplane mode mid-action** | In-flight chat/upload fails gracefully with retry | P1 |

---

## 4. Device Matrix

**OS coverage (minSdk 26 → targetSdk 35):**
| Tier | API / Android | Rationale |
|----|----|----|
| Floor | **API 26 (8.0)** | Minimum supported — verify Photo Picker backport, splash, Credential Manager |
| Common | **API 29 (10)**, **API 31 (12)** | Large installed base; scoped-storage & permission model changes |
| Modern | **API 33 (13)**, **API 34 (14)** | Runtime notification permission (13+), Photo Picker native |
| Target | **API 35 (15)** | targetSdk — behavior changes, edge-to-edge |

**Screen sizes / form factors:**
| Class | Example | Focus |
|----|----|----|
| Small phone | ~5.0", 720p | Layout overflow, text truncation |
| Standard phone | ~6.1", 1080p | Primary baseline |
| Large phone | ~6.7"+, 1440p | Feed/video scaling |
| Tablet (7–10") | sw600dp+ | Two-pane/max-width containers, composer |
| Foldable | inner/outer | Config-change resilience |

**Other axes:** Vietnamese **and** English locale; light + dark theme; default + large font scale; low-RAM device; physical device for camera-adjacent/media + real network throttling. Minimum recommended: 1 low-end (API 26–29), 2 mainstream (API 31–34), 1 tablet, 1 latest (API 35).

---

## 5. Release Configuration Checklist (before generating the signed AAB)

- [ ] **versionCode** incremented for the release (currently `1`) and **versionName** finalized
- [ ] **Upload keystore** created/obtained; stored securely (NOT in repo)
- [ ] Provide the **9 release properties** (via `-P` or `~/.gradle/gradle.properties`), all currently required by the release gate:
  - `TAPPYAI_SUPABASE_URL`, `TAPPYAI_SUPABASE_ANON_KEY`, `TAPPYAI_GOOGLE_WEB_CLIENT_ID`
  - `TAPPYAI_WEB_APP_URL`, `TAPPYAI_API_BASE_URL_RELEASE` *(point at real prod, not `*.example.com`)*
  - `TAPPYAI_RELEASE_KEYSTORE_PATH`, `TAPPYAI_RELEASE_KEYSTORE_PASSWORD`, `TAPPYAI_RELEASE_KEY_ALIAS`, `TAPPYAI_RELEASE_KEY_PASSWORD`
- [ ] `TAPPYAI_GOOGLE_WEB_CLIENT_ID` matches the ID configured in Supabase Google Auth (else Google sign-in fails in prod)
- [ ] Release buildType: `isMinifyEnabled=true`, R8 + ProGuard rules verified (no missing-keep crashes — smoke test the release build)
- [ ] `debuggable=false`; no debug logging in release; `-debug`/`-staging` suffixes absent
- [ ] Cleartext traffic disabled; prod endpoints are HTTPS; network-security + backup/data-extraction rules reviewed
- [ ] Final `applicationId` confirmed (`com.tappyai.app`) and matches Play Console + Supabase redirect + Google OAuth
- [ ] `bundleRelease` produces a **signed** `.aab`; install it on a device and run the P0 journeys
- [ ] Confirm the AAB is built from **HEAD (clean clone)** — not the working tree (46+ WIP files must NOT ship)
- [ ] (If crash reporting expected) verify it's wired; otherwise note its absence as accepted

---

## 6. Google Play Submission Checklist

- [ ] **Signed AAB** uploaded to a track (internal → closed → production)
- [ ] **App access:** provide Google review with **working test credentials** (login is required — review will fail without them) ⚠️
- [ ] **Data safety form** — declare: location (approx/precise), account info (email/name), user content (photos/videos/reviews), analytics; data sharing with processors (Supabase, Vercel Blob, Jamendo)
- [ ] **Content rating** questionnaire completed
- [ ] **Target audience & content** (not directed at children)
- [ ] **Privacy Policy URL** (public, reachable) — matches in-app Privacy page
- [ ] **AI-generated content disclosure** (chat/fortune/vietwriter produce AI content)
- [ ] **Account deletion** method declared (in-app mailto path + any web form)
- [ ] Store listing: app name, short + full description, **phone + tablet screenshots**, feature graphic, hi-res icon, category, contact email, website
- [ ] Permissions justification (foreground location use; declare purpose)
- [ ] Target API level 35 (meets Play requirement)
- [ ] Countries/regions + Free pricing set
- [ ] **Pre-launch report** reviewed (crashes/accessibility) after first upload
- [ ] Financial-features / ads / government-app declarations (all "no" unless changed)

> The owner's draft listing/data-safety/rating/AI-disclosure content already exists under `docs/release/android/` (currently untracked) — reuse it to fill these.

---

## 7. Risk Assessment (focus areas for UAT)

| # | Risk | Why it matters | UAT mitigation |
|---|------|----------------|----------------|
| R1 | **Login-required + Google review** | Reviewer can't test without credentials → rejection | Supply test account in "App access"; verify it works on a clean install |
| R2 | **Prod secrets misconfig** | Placeholder `*.example.com` / wrong Supabase or Google client ID → app can't auth or call API in the *signed* build | Smoke-test the **release AAB** against prod, not just debug |
| R3 | **Video upload to vercel.com (Blob)** | Third-party direct PUT, 50MB on cellular, versioned API pin | Test large video on real cellular + wifi; verify success + failure messaging |
| R4 | **AI streaming reliability** | Core UX; timeouts/partial streams | Exercise slow network + timeout + retry (edge cases) |
| R5 | **Location data-safety accuracy** | Play policy — must match declared use | Confirm foreground-only use; declare precisely |
| R6 | **Affiliate/deal links + disclosure** | Commercial content policy (MFS) | Verify disclosure text shows; links open correct partner; click-tracking non-blocking |
| R7 | **WebView game (SuperTux)** | WebView surface = crash/security | Test load, back navigation, resume, low memory |
| R8 | **R8/minify release-only crashes** | Reflection/serialization keeps | Full P0 pass on the **release** build (not just debug) |
| R9 | **No push / no anonymous mode** | Product expectations | Confirm intended; not defects |
| R10 | **First release, versionCode=1** | Can't re-use once published | Confirm version + package name final before upload |

---

## 8. Bug Report Template

```
Bug ID:            UAT-<area>-<nnn>
Title:             <concise summary>
Severity:          P0 (crash/data-loss/blocker) | P1 (major) | P2 (minor) | P3 (cosmetic)
Feature / Area:    <e.g. Reviews > Composer > Video>
Build:             versionName 0.1.0 (code 1) / <track>
Device / OS:       <model> / Android <ver> (API <n>) / <locale> / <theme>
Network / State:   <wifi|cellular|offline|slow> / <signed-in|signed-out|session-expired>
Preconditions:     <account/data/permission state>
Steps to reproduce:
  1.
  2.
  3.
Expected result:   <what should happen>
Actual result:     <what happened>
Frequency:         Always | Often | Intermittent (x/y) | Once
Evidence:          <screenshot / screen recording / logcat snippet>
Regression?:       <new in this build? / worked before?>
Notes:             <workaround, related bugs>
```

---

## 9. UAT Exit Criteria (objective acceptance rules)

The build is **accepted for release** only when **all** hold:

1. **P0:** 100% of P0 journeys PASS; **zero** open P0 defects.
2. **P1:** ≥95% of P1 journeys PASS; **zero** open P1 crashes or data-loss defects; remaining P1s have owner-approved fix/defer plan.
3. **P2:** triaged; open P2/P3 items logged with owner-approved defer.
4. **Stability:** no crash / ANR across a full pass of every screen; every Edge Case (§3) degrades gracefully (no crash).
5. **Edge/Recovery:** offline, slow network, permission-denied, background/foreground, logout/login, and session-expiry all recover cleanly.
6. **Engineering gates (already green, re-confirm on the release build):** `assembleRelease`/`bundleRelease` succeeds signed; app installs + launches across the device matrix.
7. **Localization:** en + vi complete on tested screens; no raw keys / untranslated leaks on P0/P1 paths.
8. **Compliance:** account deletion works; privacy policy live; data-safety declarations match observed behavior; AI disclosure present.
9. **Release config (§5) & Play submission (§6):** fully checked, including a working test account for review.
10. **Product Owner sign-off:** the owner records the final PASS verdict (QA evidence informs, owner decides).

**Reject / block release if:** any open P0; any P1 crash or data-loss; the signed release build behaves differently from debug in a P0 path; or data-safety/permissions declarations don't match actual behavior.

---
*Companion documents: `RC_UAT_CHECKLIST.md` (granular per-screen steps), `RC_RELEASE_REPORT.md` (engineering RC status), `FINAL_RELEASE_AUDIT` (self-containment proof).*
