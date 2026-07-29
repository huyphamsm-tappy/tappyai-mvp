# TappyAI — Web Design Baseline

> **Web Production (`https://www.tappyai.com`) is the single Design Source of Truth.**
> Android and iOS must mirror Web. Do not invent UI, do not add components Web lacks, do not
> remove components Web has. This document is the reference for reaching 100% UI parity.
>
> **Method note — "measured, not estimated":** All design values below are read **directly from
> the Web source** (Tailwind config, `globals.css`, component classes), not eyeballed from
> screenshots. Reading the actual `rounded-2xl` / `px-6` / `text-sm` / color tokens gives the
> exact value the browser renders; that is the most accurate possible measurement. Screenshots
> are reference only (see [Screenshots](#screenshots)).

Generated 2026-07-19. Cite paths are relative to the repo root.

---

## Contents
1. [Design Specification (tokens)](#1-design-specification-tokens) — colors, typography, spacing, radius, shadows, breakpoints, animation, dark mode
2. [Screens](#2-screens) — every screen: URL, name, function, components, states
3. [Component Inventory](#3-component-inventory)
4. [Navigation Flow](#4-navigation-flow)
5. [UI Patterns](#5-ui-patterns)
6. [Design Rules](#6-design-rules)
7. [Screenshots](#screenshots)
8. See [`android-parity.md`](./android-parity.md) for the Web vs Android comparison.

---

## 1. Design Specification (tokens)

**Toolchain:** Tailwind CSS `^3.4.7` + `tailwindcss-animate`. The repo only extends `theme` for
colors/fonts/animations and overrides `theme.screens`; **spacing, base font-size, font-weight,
border-radius and shadow scales are the stock Tailwind v3.4.7 defaults** (not redefined). Values
tagged _(TW default)_ are inherited.

### 1.1 Colors

**Brand — `primary` (iOS blue)** · `tailwind.config.ts:41` · also `--primary` `globals.css:8`
`DEFAULT #007AFF` · 50 `#E5F1FF` · 100 `#CCE3FF` · 200 `#99C8FF` · 300 `#66ACFF` · 400 `#3391FF` · 500 `#007AFF` · 600 `#0062CC` · 700 `#004999` · 800 `#003166` · 900 `#001833`

**Brand — `accent` (orange)** · `tailwind.config.ts:42` · also `--accent` `globals.css:9`
`DEFAULT #FF9500` · 50 `#FFF4E5` · 100 `#FFE9CC` · 200 `#FFD399` · 300 `#FFBD66` · 400 `#FFA733` · 500 `#FF9500` · 600 `#CC7700` · 700 `#995900` · 800 `#663C00` · 900 `#331E00`

**Neutrals — Tailwind default `gray`** _(TW default; used pervasively, e.g. `dark:bg-gray-950`)_
50 `#f9fafb` · 100 `#f3f4f6` · 200 `#e5e7eb` · 300 `#d1d5db` · 400 `#9ca3af` · 500 `#6b7280` · 600 `#4b5563` · 700 `#374151` · 800 `#1f2937` · 900 `#111827` · **950 `#030712`** (dark theme color, `layout.tsx:31`)

**Semantic (success/error/warning/info):** **no custom tokens** — the app uses Tailwind stock
`red-* / green-* / yellow-* / blue-*` utilities directly. Do not invent semantic tokens on native.

**shadcn/admin HSL tokens** (`globals.css:20-50`, consumed via `hsl(var(--…))` `tailwind.config.ts:45-53`) — used by Back Office; light `:root` + full `.dark` set: `--background`, `--foreground`, `--card`, `--popover`, `--muted(-foreground)`, `--secondary(-foreground)`, `--border`, `--input`, `--ring`, `--radius: 0.5rem`.

**Brand hero accents (hardcoded, `globals.css`):** gold slogan text `#FCE29C` (`:226,232`); `.brand-title` gradient `linear-gradient(120deg,#f4f8fb,#aac0d6,#f9e8c4,#d8b06c,#cdddee)` (`:215`); dividers `rgba(226,232,240,0.85)` (`:193`).

### 1.2 Typography

- **Fonts (Google Fonts `@import`, `globals.css:5` — no `next/font`):** **Inter** (400/500/600/700) body; **Orbitron** (700/900) for `.brand-title`; **Cinzel** (400/500/600) for `.brand-slogan`/`.explore-tag`.
  - `font-sans` = `['Inter','system-ui','sans-serif']` (`tailwind.config.ts:62`).
  - `.brand-title` → Orbitron 900, letter-spacing `0.06em` (`globals.css:212-214`).
  - `.brand-slogan`/`.explore-tag` → Cinzel, letter-spacing `0.015em` (`globals.css:225-232`).
- **Weights used:** 400, 500 (`font-medium`), 600 (`font-semibold`), 700 (`font-bold`), 900 (Orbitron).
- **Font-size scale** _(TW default — size / line-height):_
  `text-xs` 12/16 · `text-sm` 14/20 · `text-base` 16/24 · `text-lg` 18/28 · `text-xl` 20/28 · `text-2xl` 24/32 · `text-3xl` 30/36 · `text-4xl` 36/40 · `text-5xl` 48/1 · `text-6xl` 60/1 · `text-7xl` 72/1.
- **Additive fluid `clamp()` scale** (`tailwind.config.ts:33-39`): `text-fluid-display` `clamp(1.75rem,4vw,2.75rem)`/1.1 · `text-fluid-h1` `clamp(1.5rem,3vw,2rem)`/1.2 · `text-fluid-h2` `clamp(1.25rem,2.2vw,1.5rem)`/1.25 · `text-fluid-h3` `clamp(1.05rem,1.6vw,1.25rem)`/1.3 · `text-fluid-body` `clamp(1rem,1.2vw,1.125rem)`/1.6.
- Message/content line-height `1.6` (`globals.css:164`).

### 1.3 Spacing _(TW default: 1 unit = 4px)_
`0.5`=2 · `1`=4 · `1.5`=6 · `2`=8 · `2.5`=10 · `3`=12 · `4`=16 · `5`=20 · `6`=24 · `8`=32 · `10`=40 · `12`=48 · `16`=64 (px).
**Conventions (measured):** buttons `py-3 px-6` = **12/24px** (`globals.css:62-63`); page gutters `px-4 sm:px-6 lg:px-8` = **16/24/32px** (`:250-254`); icon toggle `w-8 h-8` = **32px** (`Header.tsx:82`); list-item margin `4px` (`:166`).
**Container max-widths** (`tailwind.config.ts:25-31`): `container-compact` 448px · `container-content` 768px · `container-wide` 1024px · `container-feed` 1280px · `container-full` 1536px.

### 1.4 Border radius _(TW default)_
`sm` 2 · `` (base) 4 · `md` 6 · `lg` 8 · `xl` 12 · `2xl` 16 · `3xl` 24 · `full` 9999 (px).
**Convention:** buttons & cards → `rounded-2xl` (**16px**) (`globals.css:62-64`); pills & avatars → `rounded-full` (`:58`, `Header.tsx:82`). Admin: `rounded-admin-lg/md/sm` = 8/6/4px (`tailwind.config.ts:57-61`).

### 1.5 Shadows / elevation _(TW default)_
Product uses `shadow-sm` on cards (`globals.css:64`): `0 1px 2px 0 rgb(0 0 0 / 0.05)`. Full scale sm→2xl available. Custom glow (not tokens): brand-title `text-shadow 0 0 22px rgba(252,226,156,0.35)` + `drop-shadow 0 2px 6px rgba(0,0,0,0.3)` (`:220-221`); slogan `text-shadow 0 2px 10px rgba(0,0,0,0.55)` (`:228`).

### 1.6 Breakpoints (overridden, `tailwind.config.ts:13-22`)
`xs` 480 · `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536 · `3xl` 1920 · `4xl` 2560 (px).

### 1.7 Animation / motion
**Tailwind (`tailwind.config.ts:63-64`):** `animate-fade-in` `fadeIn .2s ease-in-out` · `animate-slide-up` `slideUp .3s ease-out` (translateY 10→0 + fade) · `animate-pulse-dot` `1.4s infinite` · `animate-shake` `.4s` (error, translateX ±6/±4) · `animate-heart-pop` `heartPop .7s forwards` (double-tap like: scale 0.8→1.3→1→fade). Plus `tailwindcss-animate` (`animate-in/out`, `fade/zoom/slide-in-from`, `duration-*` — Radix/shadcn).
**CSS (`globals.css`):** `.typing-dot` pulseDot 1.4s + nth-child delays 0.2/0.4s (`:67-70`); `.streaming-cursor` blink 1s (`:72-80`); `.animate-pop-in` popIn `.28s cubic-bezier(.22,1,.36,1)` (`:82-83`); **Tappy mascot** poses `tappyFloat/Think/Search/Speak/Delivery/Spa/Success/Sorry` (`:84-163`, disabled under `prefers-reduced-motion`). Buttons `transition-all duration-150` (`:62-63`); `html scroll-behavior:smooth`.

### 1.8 Dark mode
**Class-based** (`darkMode:'class'`, `tailwind.config.ts:4`) — NOT media-query. Manual toggle in `Header.tsx:35-47`: reads `localStorage['theme']`, falls back to `prefers-color-scheme`, toggles `documentElement.classList('dark')`, persists. Sun/Moon button (`:82-83`). `<html suppressHydrationWarning>`. Dark `themeColor` `#030712`. The app is authored dark-first for the app shell/reviews; `dark:` variants used pervasively.

---

## 2. Screens

> Populated from a per-feature source audit (each screen: URL · function · main components ·
> states · overlays). See sub-sections below. _(This section is being assembled from the source
> enumeration; the Auth + Chat cluster is complete, remaining feature clusters are appended as
> the audit finishes.)_

### 2.1 Auth & entry
| URL | Screen | Function | Key components | States | Chrome |
|---|---|---|---|---|---|
| `/login` | Login | Passwordless/OAuth hub (Google · Facebook¹ · Zalo · Email OTP) + in-app-browser fallback | logo, hero (Unsplash bg), `EXPLORE_TAGS` chips, `FEATURES` list, `EmailOtpBlock` (email→code step machine), `TappyMascot`, terms/privacy links | per-provider spinners (`Loader2`); OTP error text; `?error=` handling; "copied" checkmark; **no** modal/toast | standalone full-screen |
| `/register` | Register | Email+password+name signup (`supabase.auth.signUp`) | logo, form (name/email/password), back-to-login link | `loading` spinner; red error banner; **`done` → "check your email" inline panel** | standalone |
| `/onboarding` | Onboarding | 2-step: interests → city → `/api/onboarding` | logo, 2-seg progress bar, interest grid, city grid + custom input | `loading`; step-1 vs step-2 (`animate-fade-in`); Next disabled until valid; skip buttons | standalone |
| `/auth/zalo-finish` | Zalo finish | Client-side Zalo profile fetch (VN IP) → `/complete` → redirect | centered status, `Loader2` | loading spinner; error → `/login?error=zalo_failed` after 2.5s | standalone |
| `/subscription` | Subscription | Free vs Pro plans, status, remaining daily msgs, Stripe entry | `Header(showBack)`, `BottomNav`, Free/Pro cards, `StripeCheckoutButton`/`ManageSubscriptionButton`, FAQ | auth-gate → `/login`; `isPro` branch banners/CTA; no skeleton | Header + BottomNav |
| `/chat` | New Chat | Fresh session → POST `/api/conversations` → `/chat/[id]` | `Header(showBack, category title)`, `ChatInterface`, `BottomNav` | `<Suspense>` spinner fallback (uses `useSearchParams`) | Header + BottomNav |
| `/chat/[id]` | Conversation | Load saved convo (auth+ownership) → chat UI, PUT to save | `Header`, `ChatInterface`, `BottomNav` | server auth-gate → `/login?returnTo=`; `notFound()` if missing; `force-dynamic` | Header + BottomNav |

¹ Facebook is config-gated (`AUTH_PROVIDERS.facebook.enabled`). Auth callbacks: `/auth/callback` (OAuth PKCE), `/auth/confirm` (email OTP + native `tappyai://` fragment return) — GET route handlers, no UI.

**Auth-cluster observations:** the auth-flow pages are standalone full-screen (no Header/BottomNav); `/subscription` `/chat` `/chat/[id]` carry `Header` + `BottomNav`. No modal/dialog/bottom-sheet/toast/drawer primitives in the auth cluster — transient feedback is inline (copied checkmark, OTP step wizard, "check email" panel).

### 2.2 Home
| URL | Screen | Function | Key components | States |
|---|---|---|---|---|
| `/` | Home | Launchpad: greeting hero + AI ask box + category pills + fortune/scan/together/recommendations/tools/content-writer/AI-suggestions/recent | `Header`, hero (`SearchBar variant="hero"`), **`CategoryPills`** (right under ask box, `HomeView.tsx:75`), fortune tiles, feature cards, `BottomNav` | global `loading.tsx` skeleton; empty-chat state |

Order (HomeView.tsx): Header → Hero(SearchBar) → **CategoryPills** → Fortune → Scan → Tappy-Together → Recommendations+Music → Tools → Content-writer → AI-Suggestions → Recent → BottomNav. Category pills = `food shopping entertainment travel spa` (emoji + label) → `/chat?category=<id>`.

### 2.3 Explore / Reviews (TikTok-style, dark `#fe2c55`) — `src/app/reviews/page.tsx` (SPA, own chrome)
In-page tabs via `?tab=` (not routes): **home** (vertical feed), **explore** (search: places OR users), **profile** (self ProfileTab), **inbox** (notifications). Feed switcher: Following / For-You / Latest.
| URL | Screen | Function | Key components / states |
|---|---|---|---|
| `/reviews` | Feed / Explore | Full-screen snap feed (video/photo-carousel/text/share-only); own TikNav + desktop Sidebar | `Post`, `Carousel`, `VideoPlayer`, right `RAction` rail, `CommentDrawer`, `ShareModal`, `SoundSheet`, `ProfileTab`, `NotifRow`, `TikNav`, `Sidebar`. Gestures: single-tap pause, double-tap like + `heart-pop` burst |
| `/reviews/[id]` | Post Detail | Server-rendered detail (hero media, rating/place/author, action bar, extra photos, Ask-Tappy CTA) | `VideoPlayer`/`next/image`, `ReviewLike/Comment/Save/ShareButton`, `ReviewMusicCard`; `notFound()`; ReviewCommentButton bottom-sheet |
| `/reviews/new` | Create Post | Composer: photo/video/URL(YouTube/TikTok/FB) + rating/place/music/AI-hashtags | media-mode tabs, dropzones, video multi-step (thumb→video→ai→done) w/ progress, `MusicPickerSheet` (bottom sheet), success screen w/ `TappyMascot` |
| `/reviews/creator/[id]` | Creator Profile (dark) | Social + content-analytics stats, follow, 3-col post grid | `Loader2`, empty "Chưa có bài viết", optimistic follow |
| `/users/[id]` | Public Profile (light) | Profile card + stats + follow + reviews list | `Header`, `StarRating`, empty "Chưa có review nào", `BottomNav` |

### 2.4 Deals & commerce
| URL | Screen | Function | Key components / states |
|---|---|---|---|
| `/deals` | Deals | Daily curated deals; every card external `<a target=_blank>` | `DealsView`, `TappyMascot`, `DealNotifyButton` (push subscribe), category badges; server-fetched (no skeleton) |
| `/service/[id]` | Service Detail | Place detail: info cards (address/phone/hours/price), community reviews, user bookings, `BookingForm` | `Header`, `BookingForm` (loading/success/error, native share); auth-gate → `/login` |
| `/subscription` | Subscription | Free vs Pro, status, remaining daily msgs | `StripeCheckoutButton`/`ManageSubscriptionButton`, `isPro` branch |
| `/split-bill` | Split Bill | Local calculator (equal/custom + tip) | segmented mode toggle; empty prompt; no network |

### 2.5 Profile / Me / Settings / Notifications (`/profile/*`)
`/profile` (Me: `Header` + avatar + `QRProfileButton` + Account/Settings `MenuItem` groups + `BottomNav`). Sub-pages (all auth-gated, most `Header(showBack)` + `BottomNav`):
`/account` (read-only info) · `/edit` (avatar upload + name + bio, loading/saving/error) · `/history` (conversations + delete; empty) · `/bookings` (status badges + share/review; empty) · `/favorites` (places + saved reviews; **skeleton** + error + empty) · `/preferences` (prefs/gender/budget/cuisine/dietary; loading; save) · `/price-watches` (list + delete + refresh; empty) · `/tappy-knows` (AI memory cards + response-style + clear; inline confirm; empty) · `/integrations` (connect/disconnect; `ToastMessage` banner) · `/notifications` (`NotificationSettings`) · `/settings` (menu + `LanguageSwitcher` + `SignOutButton` + version) · `/posts` (My Posts 3-col grid incl hidden; **BottomSheet** action panel + native `confirm` delete) · `/privacy` `/terms` (static).

### 2.6 Discovery categories — NOT routes
Categories are **query params on `/chat`** (`/chat?category=<id>`), surfaced via `CategoryPills` + `CategoryGrid` on Home. Canonical 5: `food shopping entertainment travel spa` (`lib/utils.ts:20-26`). `hotel` appears only in `/service/[id]` display metadata. There is **no** `/food`, `/spa`, etc. route. `ChatInterface` reads `category` to pick the `TappyAvatar`.

### 2.7 Tools & Fortune
Tools: `/music` (library: search/tabs/list; upload at `/music/upload`) · `/sound/[trackId]` (sound detail + **report bottom-sheet**) · `/scan` (OCR: capture→scan→copy/txt/docx/share) · `/translate` (30 langs + TTS; custom dropdown) · `/currency` (12 currencies + swap; fallback notice) · `/game` + `/game/supertux` (WASM iframe) · `/viet-content` (caption writer).
Fortune (`/boi`): hub → `/boi/tarot` (draw 1/3 cards) · `/boi/tu-vi` (Can Chi + readings, accordions) · `/boi/cung-hoang-dao` (western zodiac). All client-computed (no API), form→result with `animate-fade-in`.

### 2.8 Global states & overlays
- **Skeleton:** only `src/app/loading.tsx` (Home) + `/profile/favorites` + admin analytics KPI cards. Everywhere else loading = `Loader2 animate-spin`.
- **Error:** `src/app/error.tsx` (😵 + retry/home) · **NotFound:** `not-found.tsx` (🔍 + home).
- **Global modal:** `LanguagePicker` (first-visit, `layout.tsx:41`) — the ONLY app-wide overlay.
- **Toast:** `sonner` `Toaster` mounted **only in `/admin`**. Consumer app has **no toast** — feedback is inline optimistic state / native `confirm()`.
- **Bottom sheets (hand-rolled, `bg-[#1a1a1a] rounded-t-3xl`):** `CommentDrawer`, `ShareModal`, `SoundSheet`, `MusicPickerSheet`, `/profile/posts` action panel, ReviewCommentButton.
- `src/components/ui/dialog.tsx` (Radix) exists but is **unused** by the consumer app.

---

## 3. Component Inventory

> **Two parallel design languages, deliberately never shared:** (A) **light gray + `primary`/`accent`**
> (Header, BottomNav, Home, Deals, Recs, Chat, Profile) vs (B) **black + TikTok `#fe2c55`/teal `#69c9d0`**
> (all of `src/app/reviews/*`). **No dedicated product-level Avatar / Chip / Tabs / FAB / Toast component**
> — those are hand-rolled inline. The only Button/Badge/Card/Dialog/Table/Toast *primitives* live in
> `src/components/ui/*` and are **admin-theme only** (shadcn, `rounded-admin-*`, HSL tokens) — the consumer app does not use them.

### 3.1 Global product chrome (`src/components/`)
| Component | File | Spec (measured) |
|---|---|---|
| **Header** | `Header.tsx:17` | `sticky top-0 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b`, inner `container-content h-14`. Back = `text-primary-500 text-sm` + ChevronLeft 20. Logo h-9. Title `font-semibold text-center truncate`. Dark toggle `w-8 h-8 rounded-full` Sun/Moon 16. Avatar `w-8 h-8 rounded-full ring-2 ring-primary-500/20`, gradient-initial fallback |
| **BottomNav** | `BottomNav.tsx:16` | `fixed bottom-0 z-40 bg-white/90 dark:bg-gray-950/90 backdrop-blur-md border-t`, `max-w-container-content h-16 justify-around`. 5 tabs (Home/Chat/Explore/Deals/Profile), **null on `/reviews`**. Tab `flex-col gap-1 px-3 py-2 rounded-2xl`; icon 22 (strokeWidth 2.5/1.8, active scale-110); label `text-xs` → `font-semibold` active; active `text-primary-500`, inactive `text-gray-400` |
| **SearchBar** | `SearchBar.tsx:23` | hero: `bg-white dark:bg-gray-900 rounded-2xl pl-11 pr-[130px] py-4 text-base shadow-lg`; Sparkles 18; right cluster `w-9 h-9 rounded-xl` emoji/mic/submit; mic listening `bg-[#FF9500] animate-pulse`. default: `bg-gray-100 dark:bg-gray-800 rounded-2xl py-3` |
| **CategoryPills** | `CategoryPills.tsx:7` | row `flex gap-2 overflow-x-auto sm:flex-wrap scrollbar-hide`; pill `flex-shrink-0 gap-1.5 rounded-full border bg-white dark:bg-gray-900 px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm active:scale-95`; emoji `text-base` |
| **CategoryGrid** | `CategoryGrid.tsx:6` | `grid grid-cols-5 gap-2`; tile `flex-col gap-2 p-3 rounded-2xl active:scale-95`; emoji `text-2xl`, label `text-xs` |
| **MenuItem** | `MenuItem.tsx:14` | row `flex gap-3 px-4 py-3 hover:bg-gray-50`; icon chip `w-9 h-9 rounded-xl bg-gray-100` (danger red); label `text-sm font-medium`; desc `text-xs text-gray-400`; "Sắp có" badge / ChevronRight 16 |
| **TappyMascot** | `TappyMascot.tsx:39` | 18 poses, `/tappy/<pose>.png` size×size (default 40), `tappy-motion-<pose>` when animated, emoji fallback at size×0.72 |
| **LanguagePicker** | `LanguagePicker.tsx:13` | overlay `fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm`; card `max-w-sm rounded-3xl bg-white p-6 shadow-2xl`; mascot 72; option `w-full gap-3 px-4 py-3.5 rounded-2xl border-2 active:scale-[0.98]` |

### 3.2 Reviews (TikTok) components — `src/app/reviews/*`
| Component | File | Spec |
|---|---|---|
| **TikNav** | `page.tsx:797` | `fixed bottom-0 z-30 bg-black/90 backdrop-blur border-t border-gray-800 h-[60px]`; items icon 24 + `text-[10px]`, active `text-white`; Post btn stacked teal `#69c9d0`+red `#fe2c55` `rounded-lg` + white center Plus 20 |
| **Sidebar** (desktop) | `page.tsx:835` | `aside hidden md:flex w-[240px] fixed border-r border-gray-800`; rows `gap-4 px-3 py-2.5 rounded-xl text-[15px]`, active `bold bg-white/10`; Post CTA `bg-[#fe2c55] rounded-xl py-2.5` |
| **Post** (feed slide) | `page.tsx:235` | `w-full h-dvh snap-start bg-black`; gesture layer (tap pause / double-tap like); heart burst `Heart 112 fill-[#fe2c55] animate-heart-pop`; feed tabs top `text-xs` active `border-b-2 border-white`; right rail; bottom info handle `font-bold text-[15px]` + body `line-clamp-3` + place + amber stars |
| **RAction** (rail btn) | `page.tsx:451` | `flex-col gap-1 active:scale-90`; icon + `text-white text-xs font-semibold drop-shadow-md`. Like Heart 28 (fill `#fe2c55`), Comment 26, Bookmark 24 (fill amber-400), Share 24 |
| **Carousel** | `page.tsx:91` | next/image cover + `from-black/80`; dots `h-0.5 rounded-full` active `w-6 bg-white`; chevrons `w-7 h-7 bg-black/40 rounded-full`; count pill |
| **CommentDrawer** | `page.tsx:110` | sheet `fixed bottom-[60px] md:w-[390px] bg-[#1a1a1a] rounded-t-3xl max-h-[60vh]`; grab handle; row avatar `w-8 h-8`, name `text-xs font-semibold`, delete Trash2 14; input `bg-gray-800 rounded-full`, send `text-pink-500` |
| **ShareModal** | `page.tsx:205` | sheet `bg-[#1a1a1a] rounded-t-3xl`; actions `w-14 h-14 bg-gray-800 rounded-full text-2xl` (📋/🔗); URL box `bg-gray-800 rounded-xl text-xs` |
| **SoundSheet** | `SoundSheet.tsx:25` | mobile `bottom-0 rounded-t-3xl max-h-[75dvh]`, desktop centered `md:w-[480px] md:rounded-2xl`; Use-sound pill `bg-gradient-to-r from-primary-500 to-accent-500 rounded-full`; video grid `grid-cols-4 aspect-[9/16]` |
| **ReviewMusicDisc / MusicCard** | `ReviewMusicDisc.tsx:5` / `ReviewMusicCard.tsx:20` | disc `w-10 h-10 rounded-full border-2 border-white/30 bg-black/50` Music 16; card `bg-black/40 backdrop-blur rounded-xl` MusicThumbnail 32 + progress `h-0.5` |
| **ProfileTab / NotifRow / ClipViewer** | `page.tsx:561 / 863 / 463` | ProfileTab gradient header, avatar `w-24 h-24 ring-2`, 3-tab `border-b-2`, grid `grid-cols-3 gap-px`; NotifRow `border-l-[3px]` colored + avatar stack; ClipViewer full-screen reuses Post |

### 3.3 Media
| **VideoPlayer** | `explore/VideoPlayer.tsx:47` | `forwardRef{togglePlay}`; native video `absolute inset-0 object-cover` muted/loop + `from-black/80`; play overlay `w-16 h-16 bg-white/20 rounded-full backdrop-blur` Play 28; sourceType upload(native)/youtube(iframe on-view)/tiktok+facebook(thumbnail + external pill); `active`-driven watchdog |

### 3.4 Cards (light theme)
| Card | File | Spec |
|---|---|---|
| **Deal card** | `DealsView.tsx:68` | `flex gap-3.5 p-3.5 rounded-2xl bg-white border shadow-sm hover:border-orange-200 active:scale-[0.99]`; emoji chip `w-12 h-12 rounded-xl bg-orange-50 text-2xl`; title `text-sm font-semibold line-clamp-1`; category pill + HOT/MỚI badge `rounded-md`; ExternalLink 14 |
| **Recommendation card** | `recommendations/page.tsx:89` | `rounded-2xl bg-white border p-4 shadow-sm`; rank `w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500`; signal chips `text-[11px] rounded-full bg-gray-100`; CTA `text-xs text-primary-600` |
| **Home feature card** | `HomeView.tsx` | `group rounded-2xl bg-white dark:bg-gray-900 border p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5`; icon chip `w-11/12/14 rounded-xl/2xl bg-gradient-to-br`; **Hero** `rounded-3xl bg-gradient-to-br from-primary-500 via-primary-600 to-accent-500 p-6 shadow-lg`, title `text-2xl sm:text-3xl font-black` |
| **TripPlanCard** | `TripPlanCard.tsx:46` | `rounded-2xl border bg-white shadow-sm`; header gradient primary→accent; day tabs `border-b-2`; timeline `time w-10 font-mono`; share footer `rounded-xl bg-primary-500` |

### 3.5 Chat action bar
| **MessageActionBar** | `chat/MessageActionBar.tsx:54` | button base `p-1.5 rounded-lg text-gray-400 hover:bg-gray-100`, icons 14 (Copy→green Check, Share, Like green, Dislike red, TTS primary, Regenerate, More); More dropdown `w-44 rounded-xl bg-white shadow-xl`; TTS player bar `rounded-xl bg-gray-100` w/ skip pills + progress `h-1 bg-primary-500` |

### 3.6 Admin-theme primitives (`src/components/ui/`, NOT used by consumer app)
`Button` (CVA: default/destructive/outline/secondary/ghost/link × default/sm/lg/icon, `rounded-admin-md h-9`) · `Badge` (`rounded-full px-2.5 py-0.5 text-xs`, default/secondary/muted/success/warning/destructive/outline) · `Card` (`rounded-admin-lg border bg-card shadow-sm`, Header/Title/Content/Footer p-6) · `Dialog` (Radix, `bg-black/60` overlay + centered `max-w-lg rounded-admin-lg`) · `Input` (`h-9 rounded-admin-md border`) · `Select` (Radix) · `Table` (static) · `Toaster` (sonner, admin-only).

### 3.7 Global states
`loading.tsx` skeleton (`animate-pulse`, only global skeleton) · `error.tsx` (😵 + retry/home `rounded-xl min-h-[48px]`) · `not-found.tsx` (🔍 + home).

---

## 4. Navigation Flow
**Primary bottom nav (5 tabs)** — `src/components/BottomNav.tsx:8-14`:
`Trang chủ` `/` · `Chat` `/chat` · `Khám phá` `/reviews` · `Deals` `/deals` · `Tôi` `/profile`.
(BottomNav hides itself on `/reviews`, which renders its own in-page TikNav.)
- **Auth flow:** `/login` → (OAuth `/auth/callback` | Email `/auth/confirm` | Zalo `/auth/zalo-finish`) → onboarding gate (`profiles.onboarded`) → `/onboarding` (new) or app root `/`.
- **Reviews sub-nav (in-page tabs):** feed (home) · search (explore) · profile · inbox; sub-routes `/reviews/[id]` (detail), `/reviews/new` (composer), `/users/[id]`.
- **Home → Chat:** category pill → `/chat?category=<id>`; ask box → `/chat?q=<text>`.

---

## 5. UI Patterns
- **App shell = dark-first**; iOS-blue primary (`#007AFF`) + orange accent (`#FF9500`).
- **Cards & buttons:** `rounded-2xl` (16px) + `shadow-sm`; buttons `py-3 px-6`, `transition-all duration-150`.
- **Pills/chips:** `rounded-full`; category pills = emoji + label, horizontal scroll.
- **External CTAs only** (deals/reviews link out via `target=_blank`) — never a fake in-app booking.
- **Transient feedback is inline**, not toast (copied checkmark, inline error text, `shake` on error).
- **Anonymous gating:** interactions on Reviews bounce to `/login?returnTo=`.
- **Motion:** `animate-fade-in`/`slide-up` on entry; double-tap-like uses `heart-pop`; Tappy mascot poses per context.

---

## 6. Design Rules
1. **Web is the Design Source of Truth.** Every native screen/component/spacing must match a Web equivalent.
2. **No invented UI, no invented components, no invented tokens** (esp. no custom semantic colors — use Web's `red/green/yellow/blue` usage).
3. **Don't remove** a component Web has; **don't add** one Web lacks.
4. Use the **exact token values** in §1 (colors, `rounded-2xl`, `px-6`/`py-3`, `text-sm`, Inter weights).
5. **Same tab set, order, labels, icons** as Web's BottomNav (§4).
6. **Same states** per screen (loading/empty/error) as Web (§2).
7. Native platform idioms are allowed **only** where they don't change layout/flow/labeling (e.g. a native top bar vs an in-content header) — flagged case-by-case in `android-parity.md`.

---

## Screenshots
**Location:** `docs/design-baseline/screenshots/<feature>/<screen>.<desktop|mobile>.png`

⚠️ **Tooling limitation (honest note):** the available browser-automation tools return screenshots
**inline** (for viewing) and do **not** write full-page PNG files to an arbitrary repo path
(`save_to_disk` produced no readable file). So this baseline captures the **exact design values
from source** (§1, the authoritative "measurement") and uses live browsing for verification, but
the PNG files are not auto-saved.

**To populate `screenshots/` (owner or a run with a headless capture tool):** for each screen in
§2, capture full-page at **Desktop 1440px** and **Mobile 390px** and save as
`screenshots/<feature>/<screen>.desktop.png` / `.mobile.png`. Screen list + URLs are in §2 and §4.
The Web build is dark-first; capture in the app's default (dark) theme, plus light where the toggle matters.
