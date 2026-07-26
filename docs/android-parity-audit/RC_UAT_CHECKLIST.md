# TappyAI Android — Release-Candidate UAT Checklist

**Date:** 2026-07-26 · **Build under test:** `feat/backoffice-phase0` debug APK · **Reference:** Web production (worktree `cool-vaughan-b3c7ff`, `main`).

**How to use.** Each row is one concrete pass/fail check a human tester runs on-device. Mark `PASS` / `FAIL` / `N/A` and note the device + OS. Legend for the **Needs** column: 🔓 = works signed-out · 🔑 = requires a signed-in account · 📊 = requires specific seeded data (existing reviews, bookings, watches, etc.) · 📶 = requires live network · 📍 = requires a location/permission grant.

> Product UAT is the product owner's verdict. These checks are evidence, not a release sign-off.

---

## 0. Launch, shell & navigation

| # | Check | Needs |
|---|-------|-------|
| 0.1 | App cold-starts to the login/landing screen (signed-out) or Home (returning session) without a crash. | 🔓 |
| 0.2 | Bottom navigation shows exactly five tabs in order: Home, Chat, Explore, Maps, Profile. | 🔓 |
| 0.3 | Tapping each tab switches content; selected tab highlights; no flicker or duplicate back-stack. | 🔓 |
| 0.4 | System Back from a nested screen returns to the previous screen, not straight to exit. | 🔓 |
| 0.5 | TalkBack announces each bottom-tab by name (Home/Chat/Explore/Maps/Profile). | 🔓 |
| 0.6 | Rotate device / switch light↔dark theme mid-session: no crash, state preserved. | 🔓 |
| 0.7 | Switch app language (Settings): tab labels + section headers re-localize; no leftover English. | 🔓 |

## 1. Onboarding

| # | Check | Needs |
|---|-------|-------|
| 1.1 | A fresh login for a not-yet-onboarded user lands in the onboarding wizard (not Home). | 🔑 |
| 1.2 | Each wizard step advances; Back returns to the prior step; progress is retained. | 🔑 |
| 1.3 | Selections (interests/preferences) persist and POST successfully; finishing replaces the wizard with Home. | 🔑📶 |
| 1.4 | A returning, already-onboarded session never re-enters onboarding. | 🔑 |

## 2. Home tab

| # | Check | Needs |
|---|-------|-------|
| 2.1 | Hero shows greeting; when signed in, real avatar + first name appear (neutral placeholder when signed out). | 🔑 |
| 2.2 | "Ask Tappy" card rotates example prompts (~3 s) and always opens Chat when tapped. | 🔓 |
| 2.3 | Quick Actions grid shows 9 tiles: Explore, Maps, Music, Scan, Translate, Games, Currency, Deals, Split Bill — each opens the right screen. | 🔓 |
| 2.4 | Recommendations card opens the personalized recommendations screen. | 🔑📶 |
| 2.5 | Fortune section shows Tarot, Horoscope (Tu-vi), Zodiac cards — each opens its screen. | 🔓 |
| 2.6 | Content Writer card opens VietWriter. | 🔓 |
| 2.7 | Suggested-prompts section loads dynamic chips from the network; tapping one opens Chat pre-filled with that text. | 🔑📶 |
| 2.8 | Recent Activity renders real items or an honest empty state (no fabricated content). | 🔑 |
| 2.9 | Location line shows "not set" when no location is granted (no fabricated city). | 🔓📍 |

## 3. Chat tab

| # | Check | Needs |
|---|-------|-------|
| 3.1 | Sending a message shows a streaming reply that renders **incrementally** token-by-token (not blank-then-whole-message). | 🔑📶 |
| 3.2 | A place/travel reply renders place cards with images; CTA/booking links are tappable and open externally. | 🔑📶 |
| 3.3 | A plan-style reply renders a **[TAPPY_PLAN] itinerary card** (day/place structure with photos), not an empty bubble or raw `[TAPPY_PLAN]` text. | 🔑📶 |
| 3.4 | Follow-up suggestion chips appear after a reply and send when tapped. | 🔑📶 |
| 3.5 | Hitting the daily quota shows the correct quota/limit copy (matches web wording). | 🔑📶 |
| 3.6 | "Save place" affordance on a place result saves it (POST favorites) and reflects saved state. | 🔑📶 |
| 3.7 | With location granted, replies are location-biased (nearby results); denying location still returns results. | 🔑📶📍 |
| 3.8 | Category entry (e.g. from a Home shortcut) pre-fills and auto-sends the intended prompt. | 🔑📶 |
| 3.9 | Message action bar (copy/regenerate/feedback) works on an assistant message. | 🔑 |
| 3.10 | Opening Chat from history resumes a listed conversation (tapping a listed row resolves its messages). | 🔑📊 |

## 4. Explore — Reviews feed

| # | Check | Needs |
|---|-------|-------|
| 4.1 | Feed loads review cards; tabs/segments (e.g. For You / Following / Trending) switch content. | 📶 |
| 4.2 | Vertical swipe changes the active clip; only the active video plays, others pause. | 📶 |
| 4.3 | Video auto-plays muted; a stalled clip self-heals within ~300 ms (watchdog) rather than staying frozen. | 📶 |
| 4.4 | A clip with an attached "use this sound" track plays that companion audio over the muted video. | 📊📶 |
| 4.5 | Like / Save / Share on a card update optimistically; Share opens the system share sheet. | 🔑📶 |
| 4.6 | Open a review then press Back: the feed restores to the **same clip you left** (by id), even if trending re-ordered. | 📶 |
| 4.7 | Photo-only reviews render the photo carousel correctly (swipe between images). | 📶 |

## 5. Explore — Review detail, comments & composer

| # | Check | Needs |
|---|-------|-------|
| 5.1 | Review detail shows author, star rating, media, caption, place link. | 📶 |
| 5.2 | Comments list loads; posting a comment appears in the thread. | 🔑📶 |
| 5.3 | Replying to a comment renders **indented under its parent** (one-level `parentId`), not flat. | 🔑📊📶 |
| 5.4 | Comment reactions: the 6-emoji reaction picker works, counts update, and your own reaction (`my_reaction`) is highlighted. | 🔑📶 |
| 5.5 | Composer enforces caps read from `/api/config` (photo count, video length). Video length hint reads "60 seconds" — never "62". | 🔑📶 |
| 5.6 | Recording/selecting a >60 s video is rejected or trimmed per the config cap. | 🔑📶 |
| 5.7 | Publishing a review uploads media, shows progress, and the new review appears in the feed / My Reviews. | 🔑📶 |
| 5.8 | Composer opened from Sound Detail ("Use this sound") pre-attaches that track. | 🔑📊 |
| 5.9 | Composer opened from a past booking's Review button pre-fills the real place (dedupe keys on real place id). | 🔑📊 |

## 6. Explore — Review search, profiles & notifications

| # | Check | Needs |
|---|-------|-------|
| 6.1 | Search returns matching reviews; a **"Users" segment** returns matching users. | 📶 |
| 6.2 | Follow/Unfollow on a user in search updates **optimistically** and persists. | 🔑📶 |
| 6.3 | Tapping a user opens their profile (their reviews grid/list). | 📶 |
| 6.4 | Review notifications list loads (likes/comments/follows) and each item deep-links to its target. | 🔑📶 |

## 7. Music

| # | Check | Needs |
|---|-------|-------|
| 7.1 | Music library loads tracks; tapping a track opens Sound Detail. | 📶 |
| 7.2 | Sound Detail plays audio (play/pause) with correct metadata. | 📶 |
| 7.3 | **CC-BY attribution** renders ("‹artist› · CC-BY · Jamendo") with a working source link. | 📶 |
| 7.4 | "Videos using this sound" shows a **thumbnail grid** (not a text stub); tapping a thumbnail opens that review. | 📊📶 |
| 7.5 | "Use this sound" opens the composer with the track attached. | 🔑📊 |
| 7.6 | Report-sound sheet opens and submits. | 🔑📶 |
| 7.7 | Music **upload (UGC)** shows the "coming soon" sheet (correctly gated off). | 🔓 |

## 8. Deals

| # | Check | Needs |
|---|-------|-------|
| 8.1 | Deals list loads from the `partner_deals` contract (partner name, category, title, banner/logo). | 📶 |
| 8.2 | A discount **badge** shows only when `discountLabel` is present. | 📊📶 |
| 8.3 | An `endAt` promo shows a **countdown** ("ending soon" / "N days left"). | 📊📶 |
| 8.4 | A voucher code renders as a **copyable chip**; copying it does **not** navigate/open the deal. | 📊📶 |
| 8.5 | Opening a deal fires the **click counter** (POST `/api/deals/[id]/click`) and opens the official URL. | 📶 |

## 9. Split Bill

| # | Check | Needs |
|---|-------|-------|
| 9.1 | Opens from Home Quick Action; enter a total amount. | 🔓 |
| 9.2 | People count adjusts within the supported range (2–20); per-person amount recomputes. | 🔓 |
| 9.3 | Tip presets apply and the tipped total + per-person split update correctly. | 🔓 |
| 9.4 | Equal vs custom split modes both produce correct math (rounding matches web). | 🔓 |

## 10. Fortune — Tarot

| # | Check | Needs |
|---|-------|-------|
| 10.1 | Tarot draws from the full **78-card deck** (major + minor arcana). | 🔓 |
| 10.2 | Each drawn card shows name, imagery/emoji, and reading text. | 🔓 |
| 10.3 | Reading content matches the web for the same draw (deterministic where web is). | 🔓 |

## 11. Fortune — Zodiac (Western)

| # | Check | Needs |
|---|-------|-------|
| 11.1 | Selecting a sign shows a reading; lucky number/color + element render. | 🔓 |
| 11.2 | The **same sign on the same day gives the same reading** as web (deterministic engine), and rotates daily/weekly/monthly as web does. | 🔓 |

## 12. Fortune — Tu-vi (Horoscope)

| # | Check | Needs |
|---|-------|-------|
| 12.1 | Entering full birth date produces a reading (not a static per-sign blurb). | 🔓 |
| 12.2 | **Lifetime tab**: overview + advice + 4 life stages render. | 🔓 |
| 12.3 | **By-Year tab**: year picker, can-chi compatibility, and 12-month breakdown render. | 🔓 |
| 12.4 | Ngũ Hành / aligned-elements content matches web for the same inputs. | 🔓 |

## 13. Currency

| # | Check | Needs |
|---|-------|-------|
| 13.1 | Convert between two supported currencies returns a correct rate/amount. | 📶 |
| 13.2 | An unsupported/missing-rate currency surfaces an explicit error (no silent wrong "×1" conversion). | 📶 |
| 13.3 | Swapping currencies and editing the amount recomputes live. | 📶 |

## 14. Translate

| # | Check | Needs |
|---|-------|-------|
| 14.1 | Translating text returns the translated result. | 📶 |
| 14.2 | Read-aloud (TTS) speaks in the **target language**; on a device lacking that voice it warns/falls back rather than silently reading English. | 📶 |
| 14.3 | Language pickers (source/target) switch and swap correctly. | 🔓 |

## 15. VietWriter (Content writer)

| # | Check | Needs |
|---|-------|-------|
| 15.1 | Selecting options (tone/type) and a topic generates content. | 🔑📶 |
| 15.2 | Output can be copied/shared. | 🔓 |

## 16. Scan

| # | Check | Needs |
|---|-------|-------|
| 16.1 | Scan requests camera permission; denying it shows a graceful message. | 📍 |
| 16.2 | Scanning a QR/code routes to the correct target (e.g. a profile QR opens that profile). | 📶 |

## 17. Group Dining

| # | Check | Needs |
|---|-------|-------|
| 17.1 | Group Dining opens from Profile; creating a group succeeds and opens the group detail page. | 🔑📶 |
| 17.2 | Opening a shared group deep-link (`tappyai://group/{id}`) resolves to the same group detail. | 🔑📶 |
| 17.3 | Group detail shows members and the AI budget/suggestion prompt works. | 🔑📶 |

## 18. Bookings

| # | Check | Needs |
|---|-------|-------|
| 18.1 | Bookings list loads the user's bookings (up to the 20-row limit, mirroring web). | 🔑📊📶 |
| 18.2 | A past booking's "Review" button opens the composer pre-filled with that place. | 🔑📊 |

## 19. Price Tracking

| # | Check | Needs |
|---|-------|-------|
| 19.1 | Price-watch list loads existing watches (GET). | 🔑📊📶 |
| 19.2 | Adding a watch (POST) succeeds and appears in the list. | 🔑📶 |
| 19.3 | Deleting a watch (DELETE) removes it. | 🔑📊📶 |

## 20. Maps

| # | Check | Needs |
|---|-------|-------|
| 20.1 | Maps tab renders the placeholder + search affordance (parity: web has no tiled map). | 🔓 |
| 20.2 | Searching a place opens the external map/search URL. | 📶 |

## 21. Recommendations

| # | Check | Needs |
|---|-------|-------|
| 21.1 | Recommendations screen loads personalized items for a signed-in user. | 🔑📶 |
| 21.2 | Tapping a recommendation opens its detail/target. | 🔑📶 |

## 22. Profile landing & Account

| # | Check | Needs |
|---|-------|-------|
| 22.1 | Profile header shows real signed-in name/email/avatar (placeholder while loading / signed out). | 🔑 |
| 22.2 | Account section lists exactly: Account, Chat History, Bookings, Preferences, Saved, Price Tracking, Tappy Knows (memory), My Reviews, Group Dining. (Upgrade-to-Pro & App Connections **hidden**.) | 🔓 |
| 22.3 | Each menu row opens its real screen (no dead "coming soon" for the above rows). | 🔑 |
| 22.4 | QR button opens the profile QR sheet with the signed-in user's id. | 🔑 |
| 22.5 | Account edit: changing name/avatar saves and reflects on return. | 🔑📶 |

## 23. Preferences

| # | Check | Needs |
|---|-------|-------|
| 23.1 | Preferences load current values. | 🔑📶 |
| 23.2 | Changing **gender** saves (persisted to Supabase auth metadata) and survives app restart. | 🔑📶 |
| 23.3 | Other preference toggles save and persist. | 🔑📶 |

## 24. Memory (Tappy Knows)

| # | Check | Needs |
|---|-------|-------|
| 24.1 | Memory list loads the user's stored facts. | 🔑📊📶 |
| 24.2 | Adding / deleting a memory item works. | 🔑📶 |
| 24.3 | No untranslated string leaks (e.g. stray "under "). | 🔑 |

## 25. Saved

| # | Check | Needs |
|---|-------|-------|
| 25.1 | Saved shows favorites + bookmarks. | 🔑📊📶 |
| 25.2 | Removing a saved item updates the list. | 🔑📶 |

## 26. My Reviews

| # | Check | Needs |
|---|-------|-------|
| 26.1 | My Reviews lists the user's own reviews. | 🔑📊📶 |
| 26.2 | Tapping one opens its detail. | 🔑📶 |

## 27. Chat History

| # | Check | Needs |
|---|-------|-------|
| 27.1 | History lists recent conversations (up to 20). | 🔑📊📶 |
| 27.2 | Tapping a conversation opens it in Chat. | 🔑📶 |

## 28. Settings

| # | Check | Needs |
|---|-------|-------|
| 28.1 | Language switch applies app-wide and persists across restart. | 🔓 |
| 28.2 | Theme / notification toggles reflect and persist their state. | 🔑 |
| 28.3 | Terms of Service, Privacy Policy, Copyright pages open and render. | 🔓 |
| 28.4 | Sign Out returns to the login screen and clears the session. | 🔑 |
| 28.5 | Delete Account: opens the email-request path (mailto + confirm dialog), satisfying the Play Store requirement. | 🔑 |

## 29. Auth

| # | Check | Needs |
|---|-------|-------|
| 29.1 | Login screen shows Google + Email (OTP) options (Facebook hidden; no email+password registration). | 🔓 |
| 29.2 | Google sign-in completes and lands the user in-app. | 🔑📶 |
| 29.3 | Email OTP: requesting a code sends it; entering the correct code signs in; a wrong code is rejected. | 🔑📶 |
| 29.4 | Session persists across app restart (returning user skips login). | 🔑 |

## 30. Cross-cutting

| # | Check | Needs |
|---|-------|-------|
| 30.1 | No screen shows raw untranslated keys or debug text. | 🔓 |
| 30.2 | Airplane-mode / network-loss on any network screen shows a graceful error + retry (no crash). | 🔓 |
| 30.3 | Deep links: `tappyai://group/{id}` and review links resolve to the correct in-app screen. | 📶 |
| 30.4 | No crash across a full pass of every screen above. | 🔓 |
