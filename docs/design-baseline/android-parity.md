# Android ⟷ Web Parity

> Web Production is the source of truth. Legend: **✅ Giống** · **⚠️ Khác (cần sửa theo Web)** · **❌ Thiếu (Web có, Android chưa)** · **➖ Backlog / out-of-MVP**.
> Status columns reflect the state as of 2026-07-19. Items already fixed in this sprint are marked ✅ (fixed) with the commit/flag.

---

## 1. Bottom Navigation
**Web** (`BottomNav.tsx:8-14`): `Trang chủ /` · `Chat /chat` · `Khám phá /reviews` · **`Deals /deals`** · **`Tôi /profile`**.
**Android (before):** `Trang chủ` · `Trò chuyện` · `Khám phá` · **`Bản đồ` (Maps)** · **`Hồ sơ`**.

| Item | Web | Android before | Status |
|---|---|---|---|
| Slot 4 | Deals | **Maps** | ✅ fixed → Maps removed, **Deals** tab added (`HomeTab.kt`, `HomeShellScreen.kt`; `DealsScreen` header hidden when tab) |
| Tab 2 label | Chat | Trò chuyện | ✅ fixed → "Chat" |
| Tab 5 label | Tôi / Me | Hồ sơ / Profile | ✅ fixed → "Tôi"/"Me" |
| Order · icons | Home/Chat/Explore/Deals/Me | — | ✅ matches (MapsScreen kept in code, unwired) |

## 2. Home
**Web** (`HomeView.tsx`): ask box → **CategoryPills directly under it** (food/shopping/entertainment/travel/spa) → other sections. **No tool grid.**
**Android (before):** AskTappyCard → **self-invented "Quick Actions" 4-col tool grid** (Explore/Maps/Music/Scan/Translate/Games/Currency/Deals) → sections. **No category chips.**

| Item | Web | Android before | Status |
|---|---|---|---|
| Category chips under ask box | ✅ `CategoryPills` | ❌ absent | ✅ fixed → `CategoryChipsSection` (🍜 Ăn uống · 🛍️ Mua sắm · 🎭 Giải trí · ✈️ Du lịch · 💆 Spa & Làm đẹp), tap → `/chat?category=` |
| Self-invented Quick-Actions grid | ➖ not on Web | ⚠️ present | ✅ fixed → removed |

## 3. Explore / Reviews
Android already at parity on: feed item types (video/photo/carousel/text/share-only), feed tabs (Following/For-You/Latest), video source lanes, watch analytics, optimistic like/save, carousel. Remaining gaps:

| Gap | Web | Android | Status |
|---|---|---|---|
| Double-tap like + tap-pause + heart burst | ✅ (`heart-pop`) | ❌ tap = audio-unlock only | ❌ TODO (client-only; backend n/a) |
| Comment delete (own) | ✅ `DELETE /comments?commentId=` | ❌ | ❌ TODO (endpoint exists) |
| Own-post overflow (delete/hide) in feed | ✅ | ❌ feed hardcodes `isMe=false` | ❌ TODO (`DELETE /api/reviews/[id]` exists) |
| User search + follow (in Explore search) | ✅ Places OR Users | ❌ reviews-only | ❌ TODO (`/api/users/search` exists) |
| Share = in-app modal + canonical URL | ✅ `ShareModal` | ⚠️ system `ACTION_SEND` text-only | ⚠️ TODO |
| In-feed music disc + `SoundSheet` | ✅ | ⚠️ disc hidden (no handler) | ⚠️ TODO (⚠️ "use this sound" mobile contract to verify) |
| Inbox extras (digest/hot-places/sections/follow-back) | ✅ | ❌ plain list | ⚠️ TODO (⚠️ hot-places source to verify) |
| For-You hashtag re-rank | ✅ client re-rank | ❌ server-only | ⚠️ TODO (needs hashtag signal) |
| **Self-Profile tab** (Posts/Saved/Liked grid + ClipViewer + stats + hidden + memory chip) | ✅ `ProfileTab` | ❌ author-only list | ➖ **BACKLOG** (large module, owner-deferred) |
| Orphan `discovery/` package | — | dead code (7 files) | ➖ cleanup candidate |

## 4. Auth (MVP = Google + Zalo)
| Provider | Web | Android | Status |
|---|---|---|---|
| Google | ✅ | ✅ **PASS** | ✅ (fix: created Android OAuth client in GCP — package `com.tappyai.app.debug` + SHA-1) |
| Zalo | ✅ | ✅ **PASS** | ✅ (backend `platform=android` `454b1ac`, CSP `graph.zalo.me` `3fd234f`, deep-link importSession `965364a`) |
| Email | ✅ magic link (Supabase default template + built-in email) | ⏸️ implemented, hidden | ➖ **Deferred** (infra: built-in email ~2–4/hr rate limit, no SMTP). UI hidden `SHOW_EMAIL_LOGIN=false`; code/backend/flow kept |

## 5. Design tokens — Android MUST use these exact values (§1 of README)
| Token | Web value | Rule for Android |
|---|---|---|
| Primary | `#007AFF` (+50–900 ramp) | use exact ramp |
| Accent | `#FF9500` (+50–900 ramp) | use exact ramp |
| TikTok red / teal (Reviews) | `#fe2c55` / `#69c9d0` | use in Reviews surfaces only |
| Card/button radius | `rounded-2xl` = **16px** | 16dp |
| Pills / avatars | `rounded-full` | full |
| Button padding | `py-3 px-6` = **12/24px** | 12/24dp |
| Card shadow | `shadow-sm` `0 1px 2px rgb(0 0 0/.05)` | equivalent 1dp |
| Font | **Inter** 400/500/600/700 (Orbitron brand-title, Cinzel slogan) | Inter; brand fonts for splash/brand only |
| Type scale | `text-xs`12 · `sm`14 · `base`16 · `lg`18 · `xl`20 · `2xl`24 | map sp 1:1 |
| Spacing | 1 unit = 4px | 4dp grid |
| Semantic colors | **none** — Web uses stock `red/green/yellow/blue` | do NOT invent semantic tokens |
| Dark mode | class-based, dark-first app shell | match |

## 6. Screens present on Web that Android should mirror (high-level)
Auth: `/login` (Google/Zalo/Email¹) · `/register` · `/onboarding` · `/auth/*`. App: Home `/` · Chat `/chat`,`/chat/[id]` · Reviews `/reviews`(+detail/new/creator/users) · Deals `/deals` · Service `/service/[id]` · Subscription · Split-bill. Profile: `/profile` + account/edit/history/bookings/favorites/preferences/price-watches/tappy-knows/integrations/notifications/settings/posts. Tools: music/sound/scan/translate/currency/game/viet-content. Fortune: `/boi/*`. Legal: terms/privacy/copyright. (Admin `/admin/*` is internal — not a native surface.)
¹ Email deferred on Android for MVP.

## 7. Component parity notes
- **No product-level Avatar/Chip/Tabs/FAB/Toast on Web** — Android must not add these as "design system" unless Web does; mirror the hand-rolled patterns (avatar = circle + gradient-initial fallback; tabs = underline; chips = `rounded-full`).
- **Toast:** Web consumer app has **no toast** (feedback = inline/optimistic). Android should prefer inline feedback over Snackbar to match Web, unless a screen clearly warrants a native pattern (flag case-by-case).
- **Two design languages:** light `primary/accent` shell vs black `#fe2c55` Reviews — keep them separate on Android too.

---

## Sprint status (this baseline's scope)
✅ Done + build-verified (device UAT pending USB cable): **Bottom Nav parity**, **Home parity**.
❌ In progress / TODO: **Explore parity** (small/medium gaps §3), self-Profile = backlog.
**No merge** until owner review. Web remains the source of truth for every remaining item.
