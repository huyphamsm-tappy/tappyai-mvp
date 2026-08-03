# Games — Postponed to Tappy Arcade V2

**Status:** Removed from V1 production codebase 2026-08-03. Documentation only — no executable
code from this feature remains in the app.

## Decision

SuperTux (and the Game tab surfacing it) is postponed to a future **Tappy Arcade V2** initiative.
This is an intentional product decision, not a bug fix, and not a reflection on SuperTux itself.

## Reason for removal

- Vercel Blob Data Transfer exceeded the project's Hobby plan quota. Investigation traced this to
  the SuperTux WASM/data assets (`supertux2.data` ~245 MB, `supertux2.wasm` ~5.7 MB) being served
  from the same Vercel Blob store (`y5ozy0i9wdb73mam`) used for all review video/photo/avatar
  uploads. Every device that opened `/game/supertux` streamed a large chunk of that quota.
- Observability confirmed SuperTux assets were the dominant bandwidth consumer on the store.
- Product scope for TappyAI V1 is AI Chat, Food, Travel, Explore, Reviews, and Social — a
  full-featured platformer game is out of scope for that focus and not worth the shared
  infrastructure risk (a single feature was capable of exhausting a quota shared with core
  upload paths like avatars and reviews).

Earlier iterations tried to contain the cost without removing the feature: Games was first hidden
behind a `SHOW_GAMES` visibility flag (owner decision 2026-08-02) with the runtime code left in
place. That approach no longer suffices once the underlying asset delivery itself is the problem —
a hidden entry point doesn't stop the flagged-off code from staying in the deployed bundle, and
doesn't address the Blob quota risk from any residual traffic (direct URL hits, crawlers, stale
mobile app builds still pointing at `/games/supertux`). V2 planning should assume the same
constraint will exist next time: **large game assets cannot share a Blob store (or bandwidth
budget) with core product upload paths.**

## Original architecture (for future reference)

### Web (Next.js)
- `/game` — hub page (`src/app/game/page.tsx`), a single SuperTux card (all prior mini-games had
  already been removed in three earlier waves — SuperTux was the last one standing).
- `/game/supertux` — iframe wrapper page (`SuperTuxView.tsx`) with COOP `same-origin` +
  COEP `credentialless` headers (needed for `SharedArrayBuffer`, which the Emscripten pthreads
  build required).
- `/games/supertux` — a route handler (not a static file) that read `supertux2.html` from
  `public/games/supertux/`, string-injected several patches (mobile viewport/touch fixes, a debug
  XHR logger, a canvas resize hook, an onerror handler with better diagnostics, and a
  `Module.locateFile` override pointing `supertux2.data`/`supertux2.wasm` at Vercel Blob URLs), and
  served the result with COOP `same-origin` + COEP `require-corp`.
- `middleware.ts` set the same COOP/COEP pair on `/games/supertux*` and `/game/supertux` (public/
  static files can't carry headers from `next.config.mjs`, hence the middleware special-case).
- `vercel.json` mirrored the COOP/COEP headers for the static asset path.
- A service worker (`public/games/supertux-sw.js`, cache name `supertux-assets-v1`) cached the two
  large binaries after first load.
- `SupertuxPreload.tsx` warmed that same cache in the background from the hub page.
- CSP needed `'wasm-unsafe-eval'` in `script-src` (WASM instantiation) and `frame-src 'self'` (the
  iframe) purely for this feature — both removed now that nothing else in the app uses WASM.
- Assets originally lived in git (LFS), then were migrated to Vercel Blob storage on 2026-06-20
  (`scripts/upload-supertux-blob.mjs`) because Vercel's Git LFS proxy had unreliable Range-request
  support (intermittent 502s) for a 245 MB file; Blob CDN has proper Range support + edge caching.
  `NEXT_PUBLIC_SUPERTUX_DATA_URL` / `NEXT_PUBLIC_SUPERTUX_WASM_URL` held the resulting URLs.
- An Apple Universal Links entry (`/game*`) existed in the AASA route for the (never-shipped) iOS
  app's Games tab.

### Android
- `GamesScreen.kt` — not a native reimplementation. It loaded the *same* `/games/supertux` URL
  Web serves, inside a WebView, specifically because the Emscripten runtime's COOP/COEP
  requirement is a same-origin web concern, not something worth reimplementing natively.
- This never worked in production: Android's WebView does not expose `SharedArrayBuffer` even when
  the page is correctly cross-origin isolated (verified: server sent the right headers, WebView
  still refused). The engine's own JS showed a "browser does not support SharedArrayBuffer" message
  and the game never started, while the identical URL played fine in the device's actual Chrome —
  a WebView platform limitation, not a routing or header bug. This was never resolved.
- `GamesRoute.kt` + a nested-NavHost destination in `HomeTabHost.kt`, reached from a Home
  quick-action tile (`QuickActionsSection` in `HomeScreen.kt`).
- The Home tile itself was removed from the visible quick-actions list on 2026-08-01 (Finalization
  Sprint) once the WebView/SharedArrayBuffer limitation was confirmed unfixable in the short term —
  the screen/route/nav-graph plumbing was left wired but unreachable at the time. All of it is now
  deleted outright as part of this V1 removal.

### iOS
No Swift implementation ever existed. Only planning/spec documents under `docs/ios/` mention a
Games tab; those are historical planning artifacts and were left untouched by this removal.

## What was removed (2026-08-03)

- Web: `src/app/game/`, `src/app/games/`, `src/components/SupertuxPreload.tsx`,
  `src/lib/i18n/w3/game.ts`, `public/games/` (including the two large binaries, which were
  gitignored/not tracked in git), `scripts/upload-supertux-blob.mjs`.
- Web wiring: the Home hub card (`HomeView.tsx`), the AASA `/game*` entry, the COOP/COEP header
  rules in `next.config.mjs`/`vercel.json`/`middleware.ts`, the `wasm-unsafe-eval` CSP directive,
  the `home.gamesTitle`/`home.gamesDesc` i18n keys, the `NEXT_PUBLIC_SUPERTUX_*` env vars, and the
  now-dead `.gitignore`/`.vercelignore`/`.gitattributes` entries that only existed to support the
  removed binaries.
- Android: `com.tappyai.app.games` package (`GamesScreen.kt`, `GamesRoute.kt`), the nav-graph
  destination and Home screen wiring (`HomeTabHost.kt`, `HomeScreen.kt`), `strings_games.xml`
  (both locales), and the dead `home_quick_games` string.

## Future migration notes (for Tappy Arcade V2)

1. **Do not reuse the same Blob store for game assets and user uploads.** Either a dedicated Blob
   store (or bucket/project) for game binaries, or a paid tier with headroom, or serve large game
   assets from a CDN outside Vercel Blob's bandwidth accounting entirely.
2. **Solve the Android WebView SharedArrayBuffer gap before re-adding an Android entry point.**
   Options worth evaluating: a native port of the target game (avoids WASM entirely), a
   single-threaded (non-pthreads) Emscripten build that doesn't need SAB, or shipping the game via
   a Custom Tab / real Chrome instance instead of an in-app WebView (Chrome supports SAB where
   WebView does not — this was proven true during the 2026-08 investigation).
3. **Reconsider whether a 245 MB asset belongs behind a casual Home tile at all**, independent of
   the hosting question — that's a lot of mobile data for an impulse tap regardless of where it's
   served from. A lighter game, or an explicit "download over Wi-Fi" gate, would reduce both cost
   and the WebView-store risk if the game ever returns to Android.
4. If SuperTux specifically is revived, the GPL-licensed upstream build and the injected
   mobile/debug/resize patches described above are the starting point — they solved real,
   non-obvious problems (viewport scaling, touch handling, cross-origin isolation, a genuinely
   broken 2-arg `set_resolution` cwrap signature) that a fresh integration would otherwise have to
   rediscover.
