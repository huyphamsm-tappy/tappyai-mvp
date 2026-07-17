# TappyAI — UI / UX Behavior Specification

> **Part of the `docs/ios/` design dossier** — canonical reference for the iOS build.
> **Source of truth:** the current production **Web + Backend** codebase. Android is an implementation being brought to parity, **not** authoritative. Where Android lags Web, iOS matches **Web** and the backend APIs.
> Generated 2026-07-10 from a direct read of production code; `file:line` citations retained inline.
>
> iOS should feel **native to iOS** (SwiftUI-idiomatic) while preserving the **same product behavior, navigation, and UX** as Web/Android.

---

# TappyAI — UI/UX Behavior Specification (Audit 12)

**Goal of this document:** Capture the *product behavior, navigation, and interaction patterns* of the current TappyAI web codebase (Next.js 14 App Router + Tailwind) so an iOS-native client can feel native to iOS while preserving identical behavior/navigation/UX. Everything below is derived from the CURRENT CODE only (repo root `C:\Users\Admin\Claude\Projects\TappyAI\tappyai-mvp`). File:line citations throughout.

A key structural fact drives the whole spec: **the app has two visually and behaviorally distinct shells** that never merge:
1. **App Shell** (light/dark, otter-brand, rounded cards) — Home, Chat, Deals, Profile, Tools, Fortune, etc.
2. **Reviews Feed Shell** (locked-dark, TikTok-clone) — everything under `/reviews`.

---

## 1. Navigation Hierarchy / Information Architecture

### 1.1 App-Shell bottom tab bar
`src/components/BottomNav.tsx:8-14` defines exactly **5 tabs**, in order:

| Order | Route | Icon (lucide) | Label key | Resolved label (vi/en via i18n) |
|-------|-------|---------------|-----------|--------------------------------|
| 1 | `/` | `Home` | `nav.home` | Trang chủ / Home |
| 2 | `/chat` | `MessageCircle` | `nav.chat` | Chat |
| 3 | `/reviews` | `Compass` | `nav.explore` | Khám phá / Explore |
| 4 | `/deals` | `Tag` | `nav.deals` | Ưu đãi / Deals |
| 5 | `/profile` | `User` | `nav.profile` | Cá nhân / Profile |

Behavior (`BottomNav.tsx:16-58`):
- **Hidden entirely on `/reviews`** — `if (pathname.startsWith('/reviews')) return null` (line 22), because Reviews ships its own nav (`TikNav`). This is the shell boundary.
- **Active tab logic** (line 25, 43): Home is active only on exact `pathname === '/'`; all others match `pathname.startsWith(href)`, so sub-routes (e.g. `/profile/settings`) keep the Profile tab lit.
- **Tap-active-tab = scroll-to-top** (lines 24-36): tapping the tab you're already on smooth-scrolls to top (`window.scrollTo`), and if on a sub-page it `router.push(href)` back to the section root. Tapping an inactive tab navigates.
- **Active styling**: `text-primary-500`, icon `strokeWidth 2.5` + `scale-110`, label `font-semibold` (lines 48-51). Inactive: gray.
- Fixed, `z-40`, translucent `bg-white/90 dark:bg-gray-950/90 backdrop-blur-md`, top border, `h-16`, `max-w-container-content` centered (lines 39-41).

### 1.2 App-Shell header — `src/components/Header.tsx`
Sticky, `z-40`, translucent blur, `h-14`, bottom border (`Header.tsx:51-52`). Three mutually-exclusive left-slot modes driven by props `{ user, showBack, backHref, title }`:
- **Default (home-like)**: shows logo (`/logo.png`) linking to `/` (lines 65-69).
- **Back mode** (`showBack`): if `backHref` given → `<Link>` to it; else → `router.back()` button. Chevron + localized "back" label, `text-primary-500` (lines 53-64). This is the standard detail-screen back affordance.
- **Title**: centered `<h1>` truncated (lines 71-75).
- **Right side (only when `user && !showBack`)**: time-of-day greeting (hidden `<sm`), a **dark-mode toggle button** (Sun/Moon), and avatar linking to `/profile` (lines 77-103). When `user && showBack && title`, right side shows just the avatar (lines 105-115).
- **Greeting** is computed client-only in `useEffect` to avoid SSR hydration mismatch (React #425/#422), recomputed on locale change (lines 27-32).

### 1.3 Back behavior (global)
- App shell: via `Header showBack` — either explicit `backHref` `<Link>` or `router.back()`.
- Chat screen sets `showBack backHref="/"` with category title (`src/app/chat/page.tsx:38`).
- Reviews detail (`/reviews/[id]`) uses a dedicated `ReviewBackButton.tsx`.
- Reviews ClipViewer/ProfileTab use in-shell close buttons (a `ChevronLeft` at top-left, `reviews/page.tsx:550`), not browser back.

### 1.4 Reviews Feed IA — `src/app/reviews/page.tsx`
Reviews is a **single-page tabbed SPA** (state `tab`), NOT route-based. Two nav surfaces:

**Mobile `TikNav`** (`reviews/page.tsx:815-850`) — fixed bottom, `h-[60px]`, `bg-black/90`, 6 slots:
| Slot | Target | Icon | Label key |
|------|--------|------|-----------|
| 1 | `/` (app Home, `<Link>`) | `Home` | `reviews.navHome` |
| 2 | tab `home` | `Compass` | `reviews.navDiscover` |
| 3 | tab `explore` | `Search` | `reviews.navSearch` |
| 4 | `/reviews/new` (`<Link>`) | dual-color `Plus` post button | — |
| 5 | tab `inbox` | `Bell` | `reviews.navInbox` |
| 6 | tab `profile` | `User` | `reviews.navProfile` |

Note (lines 819, 859): a hard product rule — **"TappyAI has exactly one Home: the AI Chat home at `/`. Reviews never redefines it."** The leftmost slot always escapes back to the App Shell.

**Desktop `Sidebar`** (`reviews/page.tsx:853-877`) — `hidden md:flex`, fixed left `w-[240px] xl:w-[260px]`, logo → `/`, same destinations minus inbox, plus a pink "Post" CTA. Content column is centered with `md:ml-[240px]` offset (line 1455).

### 1.5 Deep-link / route inventory (App Router pages under `src/app`)
Top-level: `/` (Home), `/chat` + `/chat/[id]`, `/reviews` + `/reviews/[id]` + `/reviews/new` + `/reviews/creator/[id]`, `/deals`, `/profile` (+ `/settings`, `/edit`, `/account`, `/favorites`, `/bookings`, `/history`, `/posts`, `/notifications`, `/preferences`, `/price-watches`, `/integrations`, `/tappy-knows`, `/privacy`, `/terms`), `/boi` (+ `/tarot`, `/tu-vi`, `/cung-hoang-dao`), `/scan`, `/currency`, `/translate`, `/split-bill`, `/game` (+ `/supertux`), `/viet-content`, `/music` (+ `/upload`), `/sound/[trackId]`, `/recommendations`, `/group/new` + `/group/[id]`, `/service/[id]`, `/users/[id]`, `/subscription`, `/login`, `/register`, `/onboarding`, `/copyright`, `/auth/zalo-finish`, `/admin/analytics`. Standard `error.tsx`, `not-found.tsx`, `loading.tsx` at root.

---

## 2. Search Interaction Model

Two entirely different search surfaces:

### 2.1 App-Shell `SearchBar` — `src/components/SearchBar.tsx`
Two variants (`variant: 'default' | 'hero'`, line 23):
- **`hero`** (Home hero, `HomeView.tsx:65`): rich composer. Sparkles icon, emoji panel button, voice-dictation mic, submit (ArrowUp). **Submit-based, not live** — on submit routes to `/chat?q=<query>` (line 53) unless an `onSearch` callback is supplied.
- **`default`** (line 289): plain box; shows an "Hỏi" (Ask) submit button only when non-empty (lines 299-303). Also submit-based → `/chat`.
- **Voice input** (lines 89-156): Web Speech API (`vi-VN`, interim results). Live transcript fills box; on end, a **2-second cancelable grace window** auto-submits (`pendingSend`), surfaced as a tappable "opening…" pill the user can cancel (lines 270-279). Listening state = pulsing orange mic + status pill (lines 264-269). Rich error strings for no-support/mic-perm/no-speech (lines 118-137).
- **Emoji panel** (lines 74-201): a fixed-position popover anchored to the button via `getBoundingClientRect`, with a full-screen click-outside catcher. 30-emoji grid.

### 2.2 Reviews search — `reviews/page.tsx:1496-1614` (tab `explore`)
- **Live/debounced**, not submit. `onChange` fires `doSearch` (400ms debounce, `reviews/page.tsx:1296-1313`) or `doUserSearch` (fires at ≥2 chars, no debounce, line 1316-1329).
- **Segmented control** toggles Places vs Users mode (lines 1516-1519).
- Places results → 2-col image grid (lines 1542-1562). Users results → follow-list rows with inline follow/unfollow (lines 1586-1604).
- Clear (X) button when non-empty (line 1509).
- Auto-focused input on open (line 1503).

---

## 3. Interaction-State Patterns (loading / skeleton / empty / error+retry)

There is **no shared component library** for these on web — each surface hand-rolls them. The Android DS *does* formalize them (§10), which is the model iOS should follow. Web inventory:

### 3.1 Skeletons
- **Route-level skeleton**: `src/app/loading.tsx` — full Home skeleton (`animate-pulse`, header + hero + category + suggestion placeholders). Rendered automatically by Next.js Suspense during Home server fetch.
- No other route ships a skeleton; other screens use spinners.

### 3.2 Loading spinners
- **Chat page Suspense fallback**: bordered spinner `animate-spin` (`chat/page.tsx:50`).
- **Reviews feed**: centered `Loader2 animate-spin` full-height (`reviews/page.tsx:1461`).
- **Comment drawer load**: `Loader2` (line 176). **Search results**: `Loader2` (lines 1525, 1573). **Profile grid**: `Loader2` (line 740).
- **Chat "thinking"**: rotating hint text (`THINK_HINTS`, `ChatInterface.tsx:596-604`) that swaps every 1.8s while waiting for first token; then **tool-specific hints** ("🔎 Đang tìm địa điểm…") keyed to the running tool (`TOOL_HINTS`, lines 613-634); the mascot animates the "searching" pose. Typing dots defined in `globals.css:27-30`.
- Inline button-loading uses `...` / `⌛` text (e.g. `ChatInterface.tsx:204, 325`).

### 3.3 Empty states
- **Home**: empty-chat (icon + CTA "chat now", `HomeView.tsx:259-267`); logged-out prompt (line 269-274).
- **Chat**: welcome empty state = mascot + mood chips + quick-prompt list (`ChatInterface.tsx:967-1013`).
- **Reviews feed empty**: emoji + message + context CTA ("see for-you" / "post now"), differs per feed type (`reviews/page.tsx:1467-1476`).
- **Reviews profile tabs empty**: per-tab icon + text + optional CTA (`emptyState` map, lines 663-667, rendered 746-751).
- **Search empty/no-results**: icon + localized "no results for {q}" (lines 1533-1538, 1580-1584); pre-query hint state with large faded icon (lines 1565-1569, 1605-1610).
- **Comments empty**: "be the first" text (line 178).

### 3.4 Error + retry
- **Global route error**: `src/app/error.tsx` — 😵 emoji, message, **"Thử lại" (retry) button calling `reset()`** + "Về trang chủ" link. This is the only true retry-by-re-render on web.
- **404**: `src/app/not-found.tsx` — 🔍 + home link (no retry).
- **Reviews feed error**: `AlertCircle` + message, **no retry button** (`reviews/page.tsx:1462-1466`) — user must change tab/reload.
- **Comment load/send errors**: inline `AlertCircle`/red text (lines 177, 194).
- **Search errors**: `AlertCircle` + generic message (lines 1527-1532, 1574-1578).
- Most mutation failures (like/save/follow) **fail silently with optimistic rollback** rather than surfacing an error (e.g. `reviews/page.tsx:1379-1428`, `1331-1349`).

**iOS note:** because retry affordances are inconsistent on web (only the global error boundary has one), the native client should standardize on a single "error card w/ retry" (mirroring Android's `TappyErrorState`, §10) and a single skeleton primitive.

---

## 4. Scroll / Refresh

- **Reviews main feed**: vertical **snap-scroll** paging (`snap-y snap-mandatory`, each slide `h-dvh snap-start`, `reviews/page.tsx:1478`, `332`). **Infinite scroll** via an `onScroll` listener that loads the next page when within 0.5 viewport of bottom (`reviews/page.tsx:1352-1369`); `hasMore` ref gate; also tracks `activeIndex` to decide which slide mounts a real `<video>` (only active ±1, iOS media-slot cap workaround — `reviews/page.tsx:236-243`, `1479`).
- **Reviews profile/liked/saved grids & search grids**: plain overflow scroll, one-shot fetch (limit 50/30/20), **no pagination**.
- **App Shell (Home/Deals/Profile/etc.)**: native document scroll, no infinite scroll, no explicit "load more" buttons.
- **Pull-to-refresh: NOT implemented anywhere.** `grep` for refresh/PullToRefresh returns only CSS `-webkit-overflow-scrolling` and unrelated token-refresh. Feeds refresh only by switching feed-type tabs (which resets `page=0`, `reviews/page.tsx:1273-1280`) or reload.
- **Desktop feed navigation**: no swipe on desktop → on-screen up/down arrow buttons scroll one slide (`reviews/page.tsx:1286-1293`, buttons 1482-1491; same in ClipViewer 565-570).

---

## 5. Overlays Inventory

All overlays are hand-rolled with fixed positioning + a full-screen click-catcher. No portal/modal library. Reviews sheets share a signature: `fixed bottom-[60px] … md:w-[390px] bg-[#1a1a1a] rounded-t-3xl` with a grab-handle pill.

| # | Overlay | Type | File:line | Trigger |
|---|---------|------|-----------|---------|
| 1 | **LanguagePicker** | Full-screen centered modal (`z-[100]`, backdrop blur, `animate-fade-in`) | `LanguagePicker.tsx:32-59` | First visit only (no stored locale) |
| 2 | **Chat OnboardingModal** | Bottom-sheet on mobile / centered card on desktop (`rounded-t-3xl sm:rounded-3xl`), backdrop dismiss | `ChatInterface.tsx:266-332` | First chat, if not onboarded |
| 3 | **Emoji panel** | Anchored popover + click-catcher | `SearchBar.tsx:175-201`; `ChatInterface.tsx` emoji panel | Emoji button |
| 4 | **Comment drawer** | Bottom sheet, grab-handle, scroll list + input | `reviews/page.tsx:166-202` | Comment icon |
| 5 | **Share modal** | Bottom sheet w/ backdrop, copy-link + native share | `reviews/page.tsx:206-233` | Share icon |
| 6 | **Post action sheet** (own post) | Bottom sheet: view/hide/delete | `reviews/page.tsx:782-804` | Grid tile long-context on own profile |
| 7 | **Post `MoreVertical` menu** | Anchored dropdown + catcher: delete/hide | `reviews/page.tsx:386-400` | ⋮ on own post in feed |
| 8 | **ClipViewer** | Full-screen `z-50` swipe viewer | `reviews/page.tsx:548-575` | Tap profile grid tile |
| 9 | **Image zoom** | Full-screen zoom overlay | `ChatInterface.tsx` (`zoomedImage` state, `setZoomedImage` line 1028) | Tap zoomable chat image |
| 10 | **Native confirm()** | Browser confirm dialog for destructive delete | `reviews/page.tsx:390, 638`; others | Delete post/comment |
| 11 | **Native `navigator.share`** | OS share sheet, falls back to clipboard | `reviews/page.tsx:211` | Share action |

**Toasts / snackbars: NO global system.** Transient confirmations are inline and self-resetting:
- Copy-link → "Đã sao chép" for 2s (`reviews/page.tsx:210`).
- Save-place → "✓" for 1.5s (`ChatInterface.tsx:180`).
- Integrations connect result → **URL-param-driven inline banner** (green/red), not a transient overlay (`profile/integrations/page.tsx:46-78`).

**iOS mapping (see §11)**: sheets #4–8 → `UISheetPresentationController` (detents); #1–2 → sheet/`fullScreenCover`; #10 → `UIAlertController`; #11 → `UIActivityViewController`; inline confirmations → a small transient toast/overlay.

---

## 6. Animation Inventory

Defined in `tailwind.config.ts:45-46` (keyframes) + `globals.css`. Each with trigger:

| Animation | Where defined | Trigger / usage |
|-----------|--------------|-----------------|
| `fade-in` (0.2s) | tailwind `fadeIn` | Modal/action-bar/empty-state entrances (`ChatInterface.tsx:968,1049`; `LanguagePicker.tsx:33`) |
| `slide-up` (0.3s) | tailwind `slideUp` | Assistant message entrance (`ChatInterface.tsx:1039`) |
| `pulse-dot` / `.typing-dot` | tailwind + `globals.css:27-30` | Chat typing indicator |
| `shake` (0.4s) | tailwind `shake` | Error emphasis (available; used for invalid states) |
| `heart-pop` / `animate-heart-pop` (0.7s) | tailwind `heartPop` | **Double-tap like heart burst** — 112px heart, key-remount replays (`reviews/page.tsx:368-372`) |
| `blink` / `.streaming-cursor` | `globals.css:32-40` | ChatGPT-style blinking cursor at tail of streaming reply (`ChatInterface.tsx:1043`) |
| `popIn` / `.animate-pop-in` (0.28s) | `globals.css:42-43` | Follow-up chips / action buttons entrance |
| **Typewriter reveal** (`useSmoothText`) | `ChatInterface.tsx:433-476` | Smooths burst token delivery into per-frame char reveal for streaming replies |
| **Spinning music disc** | `ReviewMusicDisc.tsx` (rendered in `reviews/page.tsx`) | **Navigation link** to `/sound/[trackId]`, rendered only when `music.origin` exists. No tap-to-play: every clip plays its OWN audio, and sound is always on after the user's first gesture. The horizontal "now playing" music bar was REMOVED from the feed. |
| **Tappy Mascot motion system** | `globals.css:44-123` | Per-pose GPU animations, applied via `tappy-motion-<pose>` (§8) |
| `animate-pulse` | Tailwind builtin | Skeleton (`loading.tsx:3`); listening mic (`SearchBar.tsx:243`) |
| `animate-spin` | Tailwind builtin | All `Loader2` spinners |
| `active:scale-*` micro-press | inline | Category pills/grid, action rail, buttons (`CategoryPills.tsx:15`, `RAction` line 473, etc.) |
| `hover:-translate-y-0.5` card lift | inline | Home cards (`HomeView.tsx` many) |

**Mascot poses & motions** (`globals.css:49-119`): `tappyFloat` (wave/welcome + default), `tappyThink` (breathing+glow), `tappySearch` (rotate), `tappySpeak`, `tappyDelivery`, `tappySpa`, `tappySuccess` (once), `tappySorry`. All gated by `@media (prefers-reduced-motion: reduce)` → `animation: none` (`globals.css:121-123`).

**Mascot state engine**: pose selection is centralized in `getTappyPose()` (`src/lib/TappyMascotState.ts`) with priority order **error → success → listening → searching (food → delivery variant) → streaming (thinking) → welcome → category → wave**. Pose set = 13 Phase-1 poses plus 5 Phase-2 poses (`reading`, `phone`, `speaking`, `delivery`, `spa`). `<TappyMascot>` takes an `animated` prop to enable the per-pose motion classes; assets live at `/public/tappy/<pose>.png` (288px) with an emoji fallback when an asset is missing.

---

## 7. Haptics

- **Only one call site**: `reviews/page.tsx:281` — `const buzz = (ms) => navigator.vibrate?.(ms)`, invoked on **double-tap like** (`buzz(20)`, line 287). Wrapped in try/catch for unsupported.
- No haptics elsewhere (nav taps, button presses, pull actions). **iOS opportunity**: the native client should add `UIImpactFeedbackGenerator` on tab switches, like/save, sheet present, and long-press, matching platform expectations — while keeping the like-buzz behavior identical.

---

## 8. Theme (Light / Dark) Rules

- **Mechanism**: Tailwind `darkMode: 'class'` (`tailwind.config.ts:4`) — dark styles apply when `<html>` has `.dark`.
- **Selection & persistence** (`Header.tsx:36-48`): on mount, read `localStorage['theme']`; if absent, fall back to `window.matchMedia('(prefers-color-scheme: dark)')`. Toggle button flips `document.documentElement.classList.toggle('dark')` and writes `localStorage`. **There is no separate ThemeProvider** — the toggle lives in the Header and mutates the root class directly.
- **Meta theme-color** set per color-scheme in `layout.tsx:30` (`#ffffff` light / `#030712` dark).
- **App-Shell screens**: fully themed — every surface has paired `bg-white dark:bg-gray-950`, `text-gray-900 dark:text-white`, etc. (Home, Chat, Deals, Profile, MenuItem, all cards).
- **Reviews Feed = LOCKED DARK** (the memory rule *"App Shell vs Reviews dark theme never merge"*): the entire `/reviews` tree uses hardcoded black/near-black (`bg-black`, `bg-[#1a1a1a]`, `text-white`, `#fe2c55` accent) with **no `dark:` variants and no light mode** (`reviews/page.tsx:1451`, all Post/Nav/Sidebar/Sheet code). It is a fixed dark cinematic surface regardless of the app theme.
- **Gotcha**: because the theme class is only initialized inside `Header` (`useEffect`), screens that don't render `Header` before paint can briefly show the wrong theme; `layout.tsx:35` uses `suppressHydrationWarning`.

**iOS mapping**: honor `UITraitCollection` for the App-Shell screens (respect a user override persisted the same way), but keep the **Reviews feed permanently dark** (`.overrideUserInterfaceStyle = .dark` on that view controller) so it never follows system light mode.

---

## 9. Responsive Rules

- **Breakpoints** (`tailwind.config.ts:13-22`): custom `xs:480`, then Tailwind defaults `sm:640 md:768 lg:1024 xl:1280 2xl:1536`, plus `3xl:1920 4xl:2560`.
- **Primary mobile↔desktop switch is `md` (768px)**:
  - Reviews: `TikNav` (mobile bottom) vs `Sidebar` (`hidden md:flex`, desktop left rail) — `reviews/page.tsx:856`, `818`. Content offsets left by rail width at `md`+.
  - Reviews desktop swipe→arrow buttons `hidden md:flex` (`reviews/page.tsx:1482`, `565`).
  - Feed column is capped `max-w-container-compact` (28rem/448px) and centered on desktop (`reviews/page.tsx:1456`).
- **App Shell**: single centered column at all sizes via `.container-content` (max 48rem/768px, responsive gutter `px-4 sm:px-6 lg:px-8`, `globals.css:211`). BottomNav persists at every width (no desktop rail in App Shell) — matches the Android guideline "no sidebar at any size" (Android `TappyBottomNavBar` doc, §10).
- **Semantic container tokens** (`tailwind.config.ts:25-31`): compact 448 / content 768 / wide 1024 / feed 1280 / full 1536 — mirrored 1:1 in Android `TappyContainers` (`WindowSize.kt:41-47`).
- Header greeting hidden `<sm` (`Header.tsx:79`). Category grid gaps scale `sm/lg` (`CategoryGrid.tsx:12`). Fluid `clamp()` type scale defined but additive/unused yet (`tailwind.config.ts:33-39`).
- **Safe-area utilities** exist (`.pt-safe`/`.pb-safe`/`min-h-screen-safe` using `env(safe-area-inset-*)`, `globals.css:217-222`) — additive, sparsely applied.
- **`min-h-dvh` / `h-dvh`** used everywhere for correct mobile viewport height (avoids iOS URL-bar jump).

---

## 10. Android Design-System Cross-Reference (behavior parity target)

Android already formalizes the state primitives the web hand-rolls — the iOS client should match this contract, and product behavior is identical across all three. From `android/core/designsystem/.../component/`:

- **`TappyBottomNavBar`** (`TappyBottomNavBar.kt:53-74`): Material `NavigationBar`, index-based, ≥48dp targets, Tab role + selected semantics; **routes deliberately live in `:app`, not the DS** (comment lines 23-40). Same 5-ish top-level destinations as web bottom nav.
- **`TappyNavRail`** (`TappyNavRail.kt:34-53`): Expanded-window counterpart of the bottom bar (tablet/foldable/ChromeOS), same `TappyNavItem` contract — caller swaps bottom↔rail purely on width class.
- **`TappyWindowWidthClass`** (`WindowSize.kt:22-33`): Compact <600 / Medium <840 / Expanded ≥840dp — the Android analogue of the web `md` switch.
- **`TappyEmptyState`** (`TappyEmptyState.kt:25-63`): 40dp icon + title + optional message + optional single action button. (Web equivalent hand-rolled per screen.)
- **`TappyErrorState`** (`TappyErrorState.kt:28-65`): matches EmptyState layout, error icon + title + message + **"Try again" retry**; never renders raw exception text.
- **`TappySkeleton`** (`TappySkeleton.kt:35-66`): shimmer placeholder, **honors reduced-motion** (static tone), TalkBack "Loading" label.
- **`TappyLoadingIndicator`** (`TappyLoadingIndicator.kt:21-32`): full-width centered spinner for screen/section loading (vs inline button loading).
- **`TappyBottomSheet`** (`TappyBottomSheet.kt:24-40`): `ModalBottomSheet`, rounded top, locks background scroll, respects reduced-motion — the formal version of web's hand-rolled reviews sheets.
- **`TappyDialog`** (`TappyDialog.kt:16-45`): centered `AlertDialog` for short confirm/cancel — the formal version of web's `confirm()`.
- Also present: `TappyComingSoonSheet`, `TappyChatBubble`, `TappyMarkdown`, `TappyAppBar`, `TappySearchBar`, `TappyMenuRow`, `TappyAvatar`, `TappyMediaCard`, `TappyCard`, `TappyButton` (`loading` param for inline).

The lesson for iOS: **build these as reusable primitives** (EmptyState, ErrorState+retry, Skeleton, LoadingIndicator, Sheet, Dialog, NavBar, SearchBar) rather than per-screen, so behavior is consistent — the web is the outlier here, not the model.

---

## 11. i18n Surface

- **Reactive store** (`src/lib/i18n/useTranslation.ts`): single module-level `current` locale + `useSyncExternalStore` (lines 21-76) so a language change re-renders the whole app instantly. `t(key, vars)` does `{var}` interpolation; falls back key→vi→literal (lines 66-70).
- **Locale detection/persistence**: `localStorage['tappy_lang']`; if none, `navigator.language` (`vi` prefix → vi, else en). SSR always renders `vi` for determinism, reconciles on client (lines 24-50).
- **First-visit LanguagePicker** (`LanguagePicker.tsx`): mounted globally in `layout.tsx:40`; shows once when `getStoredLocale() === null`. **Uses the otter mascot** `<TappyMascot pose="welcome" size={72} eager animated />` (line 37), bilingual title "Chọn ngôn ngữ / Choose your language", vi/en flag buttons; best-effort PATCH to `/api/profile` for logged-in sync (lines 20-28).
- Strings render via `t()` everywhere; **user-authored content and proper nouns stay untranslated** (e.g. chat quick-prompts have vi/en banks but keep VN dish names; `ChatInterface.tsx:39-57`). Some server-computed strings (greeting, dates) recomputed client-side to avoid hydration mismatch and marked `suppressHydrationWarning` (`DealsView.tsx:56`, `Header.tsx:27-32`).

**iOS mapping**: back the same two locales with `Localizable.strings` + a reactive locale object; keep the first-run mascot language sheet; persist to the same key semantics and sync to `/api/profile`.

---

## 12. Per-Pattern iOS-Native Equivalents (behavior preserved)

| Web pattern (current) | iOS-native equivalent | Preserve exactly |
|---|---|---|
| App-Shell `BottomNav` (5 fixed tabs, hide on /reviews, tap-active=scroll-top) | `UITabBarController` (SwiftUI `TabView`) | Same 5 tabs/labels/icons/routes; tab bar hidden on Reviews; re-tap scrolls to top + pops to section root |
| Reviews `TikNav` (6 slots incl. "escape to app Home") | Nested `UITabBar` **inside** the Reviews VC (or segmented custom bar); leftmost = programmatic pop to app tab bar | The single-Home rule: Reviews never becomes Home |
| Header back (`router.back()` / backHref) | `UINavigationController` back button / `NavigationStack` | Chevron + localized label; explicit-target when set |
| Header dark-mode toggle | Settings toggle writing the same persisted key | Manual override + system fallback |
| `loading.tsx` skeleton | Skeleton views (shimmer), reduced-motion aware | Same layout blocks |
| Screen spinners (`Loader2`) | `UIActivityIndicatorView` / `ProgressView` | Same placement |
| Chat "thinking"/tool hints + typewriter | Streaming label + character-reveal on incremental tokens | Rotating generic hint → tool-specific hint → blinking cursor; smooth reveal |
| Empty states (per screen) | One reusable EmptyState view (icon+title+msg+action) | Same copy + CTA behavior per surface |
| Error + retry (global `error.tsx`) | Reusable ErrorState view w/ Retry | Standardize retry across screens (web lacks it) |
| Snap-scroll TikTok feed + infinite scroll | Vertical paging `UICollectionViewCompositionalLayout` (`.paging`) / `UIPageViewController`; prefetch next page near end | 1-slide-per-viewport snap; active±1 video mounting; play/pause on active |
| Pull-to-refresh (absent) | `UIRefreshControl` — **add on feeds/lists** | New affordance; must not change data model, only re-fetch page 0 |
| Comment/Share/Action bottom sheets | `UISheetPresentationController` with detents (medium/large), grab handle | Same content, dismiss-on-backdrop, 60px-from-bottom offset feel |
| Onboarding modal (sheet mobile/card desktop) | `.sheet` (compact) / centered `.formSheet` (regular width) | 3-question flow + skip |
| LanguagePicker first-visit | `.sheet`/`fullScreenCover` with mascot | Show once; same persistence |
| `confirm()` destructive delete | `UIAlertController` (`.alert`, destructive style) | Same confirm-before-delete |
| `navigator.share` | `UIActivityViewController` | Native share; copy-link fallback |
| Emoji anchored popover | `UIMenu`/popover or inline keyboard emoji | Insert-at-cursor behavior |
| Inline transient confirmations ("copied 2s", "✓ 1.5s") | Small transient toast/overlay (auto-dismiss) | Same timing/semantics |
| Integrations URL-param banner | Post-OAuth in-app banner/toast | Same success/error copy |
| Double-tap like + `heart-pop` + `vibrate(20)` | Double-tap gesture + heart burst animation + `UIImpactFeedbackGenerator` | Identical: like-only, optimistic, haptic |
| Mascot pose motion system (reduced-motion gated) | Pose-keyed image + Core Animation, honor `UIAccessibility.isReduceMotionEnabled` | Same pose→situation mapping; PNG at `/tappy/<pose>.png`, 🤖 fallback |
| Voice dictation + 2s cancelable auto-send | `SFSpeechRecognizer` (vi-VN) + cancelable grace window | Same live-fill + cancel pill behavior |
| Theme: App-Shell adaptive, Reviews locked-dark | Adaptive `UITraitCollection` for App Shell; `overrideUserInterfaceStyle = .dark` on Reviews | Reviews never light |
| Responsive md switch (bottom↔rail) | Size-class driven (`compact` bottom bar / `regular` side layout), matching Android WindowWidthClass buckets | Same content, centered max-widths (448/768/1024/1280/1536) |

---

## Summary (5 lines)

1. **Two non-merging shells**: adaptive light/dark App-Shell (5-tab `BottomNav`, `Header` with back + theme toggle) and a **locked-dark** TikTok-clone Reviews feed (own `TikNav`/`Sidebar`, snap-scroll + infinite scroll, hand-rolled bottom sheets).
2. **State patterns are hand-rolled per screen on web** (skeleton only on Home route; spinners, per-screen empty/error, retry only in the global error boundary) — Android already formalizes them as DS primitives (`TappyEmptyState/ErrorState/Skeleton/LoadingIndicator/BottomSheet/Dialog`), which is the parity target for iOS.
3. **No pull-to-refresh and no global toast system exist**; transient confirms are inline self-resetting, share uses `navigator.share`, destructive deletes use native `confirm()` — clean iOS upgrade points (`UIRefreshControl`, transient toast, `UIActivityViewController`, `UIAlertController`).
4. **Signature interactions**: double-tap like (heart-pop + the app's *only* haptic `vibrate(20)`), streaming typewriter + tool-specific chat hints, otter-mascot pose motion system (reduced-motion gated), voice dictation with 2s cancelable auto-send, reactive `useSyncExternalStore` i18n with a first-visit mascot language sheet.
5. **Theme** = Tailwind `darkMode:'class'` toggled from the Header into `localStorage['theme']` (system fallback) for App-Shell; **Reviews stays permanently dark**; responsive switch pivots on `md`(768) mirroring Android's Compact/Medium/Expanded width classes and shared container max-widths.

