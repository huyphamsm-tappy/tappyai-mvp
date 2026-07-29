# 07 · QA / UAT Checklist

Run this against the **signed release build** (R8/minification on) before promoting past internal testing. Minified release builds can behave differently from debug — always validate the real artifact. Covers every shipping feature verified present in the Android source.

**Device matrix (minimum):**
- One phone on **Android 8.0 (API 26, minSdk)** — oldest supported.
- One phone on **Android 14/15 (API 34/35, targetSdk area)** — newest.
- One **large screen** (tablet or foldable) — the app declares `resizeableActivity` and responsive layouts.
- Both **light and dark** themes; both **Vietnamese and English**.

---

## 0. Install & launch
- [ ] Release AAB installs (via internal testing track or bundletool).
- [ ] Cold start shows splash → lands on Login (signed out) or Home (signed in) without crash.
- [ ] No debug artifacts visible (the Design System Showcase screen is not reachable from normal navigation).

## 1. Authentication
- [ ] **Google sign-in** completes end-to-end on a physical device (requires real release config). Returns to app authenticated.
- [ ] **Email OTP:** invalid email (no `@`) → "Enter a valid email"; valid email → code screen; wrong-length code (<6) → "The code is 6 digits"; correct code signs in.
- [ ] **Facebook:** per launch decision — if kept, confirm it does not crash (expected to dead-end at Meta verification); if hidden, confirm it's gone.
- [ ] OAuth deep-link callback (`tappyai://auth-callback`) returns into the app.
- [ ] **Sign out** (Settings) returns to Login and clears session.
- [ ] Onboarding wizard appears for a brand-new account; not shown again after completion.

## 2. Home
- [ ] Time-based greeting renders; shows the signed-in user's first name + avatar (or neutral placeholder if profile not yet loaded).
- [ ] Quick actions navigate correctly (Explore, Maps, Music, Scan, Translate, Games, Currency, Deals).
- [ ] "For you" / Recommendations and Fortune shortcuts open.

## 3. Chat / AI
- [ ] Sending a message streams an AI reply from the production API.
- [ ] CTA buttons (when present) open external links; no raw `[CTA_BUTTONS]`/`[FOLLOWUPS]`/`[TAPPY_PLAN]` markers leak as text.
- [ ] Follow-up chips (when present) send as a new message.
- [ ] Markdown images in replies render (not a stray `!` + broken link).
- [ ] Attach a photo → AI responds about it; attach from camera and from gallery.
- [ ] Voice input (mic) opens the system recognizer and inserts recognized text (correct language for the app's current locale).
- [ ] Read-aloud (TTS) speaks a reply; toggling stops it.
- [ ] Like/dislike/report on a reply works; report is recorded.
- [ ] Regenerate replaces the last reply.
- [ ] Failed send shows retry and preserves the typed input.
- [ ] Conversation persists to history; resuming a past conversation loads its messages.

## 4. Discovery / Explore / Maps
- [ ] Explore hub shows the five groups; category screens filter and search.
- [ ] Maps screen renders places, search, filter chips, detail sheet; Save/Open/Share place actions work.
- [ ] Saved places appear under Profile → Saved.

## 5. Reviews (social)
- [ ] Feed loads and paginates; like/save toggles persist.
- [ ] Open a review → detail + comments load.
- [ ] Compose a review (text/photo/rating/place) → posts and appears.
- [ ] Own post shows overflow → **Delete** (with confirm dialog) and **Hide**; both reflect immediately; error reverts with a message.
- [ ] Search reviews: blank query blocked; typing returns results (debounced).
- [ ] My Reviews grid shows own posts incl. hidden.

## 6. Utilities
- [ ] **Currency:** converts; rejects malformed multi-dot input gracefully.
- [ ] **Translate:** translates; TTS/voice in correct language.
- [ ] **Scan:** camera and gallery both work; on a device with no camera, a friendly "no camera" message (not a crash).
- [ ] **Deals / Price tracking:** load; error states show a message + retry.
- [ ] **Music:** categories load; search (debounced) works; a track plays via ExoPlayer; pause/resume.
- [ ] **Games:** each game loads and is playable; no WebView error on load.

## 7. Fortune (entertainment)
- [ ] Tarot / Tử Vi / Zodiac each render results and show the "for entertainment only" disclaimer.
- [ ] Zodiac rejects impossible dates (e.g. Feb 30).

## 8. Group dining / bookings
- [ ] Create a group; shared link uses the real web origin (`WEB_APP_URL`).
- [ ] `tappyai://group/{id}` deep link opens the group (routes correctly even from a logged-out cold start → after login).
- [ ] Booking form collects name/phone; survives rotation/process death; Review button gated correctly.

## 9. Settings / account / personalization
- [ ] Settings → **Dark mode** toggle re-themes the whole app immediately and **persists across restart**.
- [ ] Settings → **Language** switches VI/EN across the app and persists; the row reflects the resolved locale.
- [ ] What Tappy Knows: response-style (tone/length) selection persists and is applied to chat.
- [ ] Preferences save without data loss.
- [ ] Account screen shows real name/email/joined; Edit profile works; avatar upload works.
- [ ] ⚠️ **Account deletion** available (once implemented) — verify it deletes and signs out.

## 10. Cross-cutting / robustness
- [ ] Rotate the device on chat, booking form, onboarding — no input loss (process-death safe).
- [ ] Airplane mode → clear offline/error states with retry; no crash.
- [ ] Back navigation is sane on every stack; back from a deep-linked group returns to Home, not Login.
- [ ] Large-screen / tablet: content is width-capped and centered (not edge-to-edge stretched).
- [ ] Landscape: bottom sheets/lists don't clip.
- [ ] All tap targets reachable; no untranslated strings in the selected language.
- [ ] No ANRs; scrolling is smooth in the reviews pager and long chats.

## 11. Release-config sanity
- [ ] Merged **release** manifest declares only `INTERNET` + `ACCESS_NETWORK_STATE`.
- [ ] No logcat spam of analytics/user content in the release build (logging is debug-gated).
- [ ] Play **pre-launch report** (automated) shows no crashes or blocking accessibility issues.

---

### Sign-off
| Area | Tester | Date | Result |
|---|---|---|---|
| Auth | | | |
| Chat/AI | | | |
| Reviews | | | |
| Utilities & Music | | | |
| Settings/Account | | | |
| Robustness/large-screen | | | |
| **Overall UAT** | | | **PASS / FAIL** |
