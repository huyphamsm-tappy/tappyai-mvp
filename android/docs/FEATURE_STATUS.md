# Android MVP — Feature Status

Progress tracked **per feature** (what a user actually sees), mapped to the 54-feature Master
Feature Specification. This is the day-to-day tracker; the authoritative capability matrix stays
in `Android_Architecture.md` §6.

Status vocabulary: ✅ Complete · 🚧 In progress · ⏳ Next · 📋 Planned · ⛔ Built/Unreachable

| Feature | MFS ref | Android status | Notes |
|---|---|---|---|
| Authentication | 6.1 Identity | ✅ Complete | `features:auth` — Google/Facebook/Email OTP, Supabase PKCE. Login → shell. |
| Navigation shell | — (composition) | ✅ Complete | Responsive bottom-bar ↔ nav-rail, 5 tabs (Home/Chat/Explore/Maps/Profile), in `:app`. |
| Home | — (composition) | ✅ UI Foundation Complete | Launchpad: time-based greeting hero, Ask Tappy prompt card, 8 quick-action tiles (Explore→tab, Maps→tab, Music→Library, Scan/Translate/Games/Currency/Deals→`TappyComingSoonSheet`), "Bói Toán" section, personalized suggestions (empty). **No network/data.** |
| Chat | 2.1 AI Chat | ✅ UI Foundation Complete | Mood chips + suggested prompts welcome state; Markdown bubbles (+copy/links); composer (1–6 lines, attach/voice/send/stop); typing→streaming skeleton. **No AI/network yet.** ⚠️ When wired: MUST go through backend `POST /api/chat` only — never a provider SDK/model id/key in this app. Contract: AI-SDK data-stream; errors 429 `free_limit_reached` (15/day), 401 `anon_limit_reached` (5/day → sign-in), 502 `ai_error`. |
| Reviews feed (Explore tab) | 4.1 Reviews | ✅ UI Foundation Complete | Explore tab = `ReviewsNavHost`. Full-screen TikTok-style `VerticalPager` (black bg, video placeholder, 1/N counter). Per-card: user avatar/handle, caption, place tag + stars, like/comment/save/share rail. Top bar: "Reviews" + search/bell/+ icons. Detail: scrollable with threaded comments. Composer: dark theme, Photo/Video/Link tabs, body (1000-char), place + star rating rows. **No video playback/upload/social backend.** |
| Discovery hub | 3.1–3.6, 3.9–3.13 | ⛔ Built/Unreachable | `DiscoveryHubScreen` (search + 5 domain tiles + "For You") + `DiscoveryCategoryScreen` (sub-category chips + empty results) are built but **not wired to any tab** — Explore tab was reassigned to Reviews after D4. No Web route for a standalone Discovery hub. Re-wire to Home or a sub-tab if needed. |
| Maps | 3.7 Nearby / 3.8 Maps | ✅ UI Foundation Complete | Search, filter chips (All/Ăn uống/Spa/Khách sạn/…), Map/List toggle, `MapCanvas` placeholder + layer/location FABs, place-card list, place detail bottom sheet (address/phone/hours/price/notes), tablet 2-pane. **No map SDK/network/location.** |
| Profile | 6.2 Profile | ✅ UI Foundation Complete | Profile landing: placeholder identity header (no auth) + QR button → `TappyComingSoonSheet`; "ACCOUNT" section with 10 web-matched rows, all navigating to real sub-screens (see below). **"Upgrade to Pro" row HIDDEN** (web parity: `SHOW_PRO_UPGRADE = false`). Settings row navigates. **No auth/network/data.** |
| Settings | 6.4 / 6.10 / 6.11 | ✅ UI Foundation Complete | Profile → Settings. Notifications drills in; Language/Privacy/Terms → `TappyComingSoonSheet`. Destructive Sign-out row present. |
| Notifications | 6.x Push | ✅ UI Foundation Complete | Settings → Notifications. Bell toggle card + "What you'll receive" detail card (5 categories + sound note, revealed only when ON). Toggle = local ViewModel only. **No FCM/push/permission/backend.** |
| Music | 5.2 Music | ✅ UI Foundation Complete | Home → **Music Library** (search, category chips, track rows with note-placeholder thumbnails, `m:ss`) → **Sound Detail** (hero play/pause overlay, type badge, honest-zero stats, Save/Follow/Use/Report → `TappyComingSoonSheet`, empty "videos using this sound"). Audio via `PreviewAudioPlayer` seam (Media3 swap point). **No real audio/catalog/social/backend.** |
| Music upload (UGC) | 5.2 Music | 📋 Deferred | File picker, audio validation, rights-consent, upload pipeline, takedown. Header action → `TappyComingSoonSheet`. |
| Membership / Subscription | 6.3 Membership | ⛔ Built/Unreachable (web parity) | `MembershipScreen` mirrors web `/subscription` (hero, Free 0₫ / Pro 99K cards, FAQ). Entry point ("Upgrade to Pro" row) **gated OFF since 2026-07-11** — web parity (`SHOW_PRO_UPGRADE = false`, no legal entity for payments yet). Re-enable together with the web flag at Pro launch. **No payment/Stripe/backend.** |
| Account | 6.2 Profile | ✅ UI Foundation Complete | Profile → **Account view** (hero avatar initials at 96dp, name/email, Information rows read-only) → **Edit profile** (avatar + camera overlay → `TappyComingSoonSheet`, email read-only + "Cannot change" badge, name max 100, bio max 200 + live char counter, Save → `TappyComingSoonSheet`). Shared `AccountViewModel` scoped to `AccountGraph`. |
| What Tappy Knows (Memory) | 6.5 Memory | ✅ UI Foundation Complete | Profile → "What Tappy knows". Tone/length preference chips; fact-count gradient banner; 10 per-category memory cards (area/companions/timing/style/food/leisure/shopping/avoid/budget/history) each with inline edit/remove actions; two-step full-clear. Empty state with "Start chat" CTA. **No backend/persist.** |
| Chat history | 2.1 AI Chat | ✅ UI Foundation Complete | Profile → Chat history. Conversation rows: category-emoji tile, title, message count + relative time. Per-row delete with confirm dialog. Empty state with "Start chat" CTA. **No backend/persist.** |
| Saved | 3.x Discovery | ✅ UI Foundation Complete | Profile → Saved. Favorite places + saved reviews in one scrollable list; total-item count header; delete action per item. Empty state with "Explore now" CTA. **No backend/persist.** |
| Bookings | 6.6 Bookings | ✅ UI Foundation Complete | Profile → Bookings. Pending-status amber banner; booking cards (emoji, name, customer, status badge, date/time/guests chip row, notes, Share + Review actions). Empty state. **No backend/persist.** |
| Preferences | 6.7 Preferences | ✅ UI Foundation Complete | Profile → My preferences. "Tappy remembers you" freeform tag input + quick-add chips; gender selector; budget selector; cuisine multi-select chips; dietary restriction textarea; Save → `TappyComingSoonSheet`. **No backend/persist.** |
| Price tracking | 6.8 Price Watch | ✅ UI Foundation Complete | Profile → Price tracking. How-to info card ("watches are created via chat"); active watch cards (TrendingDown icon, target/current price, delete → `TappyComingSoonSheet`); triggered/notified watches at 60% opacity. **No backend/persist.** |
| App connections | 6.9 Integrations | ✅ UI Foundation Complete | Profile → App connections. 🔒 Privacy note card; Google Calendar + Zalo integration cards (emoji, description, "TAPPY CHỈ ĐỌC" scope box, "Kết nối" → `TappyComingSoonSheet`); "Tappy dùng dữ liệu này để làm gì?" explanation card. **No OAuth/backend.** |
| My reviews | 4.2 UGC | ✅ UI Foundation Complete | Profile → My reviews. 3-column grid of user's posts with like-count overlay + hidden badge. Tap tile → bottom sheet (Hide/Show + Delete actions). Empty state. **No backend/media.** |
| Group dining | 6.x Social | ✅ UI Foundation Complete | Profile → Group dining. Create-group name form → `TappyComingSoonSheet`; feature-preview section: seeded example group (member avatars, shared link, budget) + AI suggestion card. **No backend/social graph.** |
| Fortune (Bói Toán) | 2.x AI Tools | ✅ UI Foundation Complete | Home "Bói Toán" section → **Tarot** (1/3-card selector, draw → shuffle animation → result cards with emoji/name/upright-reversed/keywords/meaning) + **Tử Vi** (4-digit birth year → can-chi result + love/career/money/health tabs) + **Cung Hoàng Đạo** (day/month birth → zodiac sign + period tabs). All three accessible from Home and from FortuneHubScreen. **No AI/network.** |

---

**Clean build result — 2026-07-13:** `BUILD SUCCESSFUL in 4s` · 264 tasks · all UP-TO-DATE · zero errors.

**Convention reminder:** each feature = build full UI → runtime verify → polish in-cycle → close →
next (no separate polish phases). Feature UI lives in `:app` until it has real
UI+ViewModel+Repository+business logic, then it earns a `features:*` module.
