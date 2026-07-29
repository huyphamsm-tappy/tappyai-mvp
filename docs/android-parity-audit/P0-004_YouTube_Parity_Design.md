# P0-004 — YouTube Playback: Web Parity Design (Phase 2)

**Status:** DESIGN / AUDIT ONLY. No implementation approved. Describes WHAT Web Production does; not HOW Android should do it.
**Golden Master audited:** `main` @ `8a1be53` (frozen Web Production).
**Primary source:** `src/components/explore/VideoPlayer.tsx` (the `sourceType === 'youtube'` branch) + `src/lib/links/platforms.ts` + `src/app/reviews/feedShared.tsx` (feed host) + production CSP.
**Parity target on Android:** `ReviewCard.kt` video branch (currently routes YouTube → static poster; see P0-004 RCA).

> This document is the behavioral contract Android must match. Each section states the **Web behavior (the contract)** and, where relevant, the **parity requirement** (a constraint any Android implementation must satisfy) — without prescribing the mechanism.

---

## 1. Playback lifecycle

**Web behavior:**
- The YouTube clip is **not** a persistent player. It is a `<div>` containing (a) an always-present poster `<img>` and (b) an `<iframe>` that is **conditionally mounted** only while the clip is at least 50% in view.
- Lifecycle: scroll clip into view (≥50%) → `ytActive=true` → iframe mounts → autoplays muted → scroll away (<50%) → `ytActive=false` → **iframe unmounts entirely** (embed torn down, poster returns to full opacity).
- There is **no** manual play/pause, no watchdog, no watch-progress tracking, and no `togglePlay` for YouTube — those exist only for native `upload` `<video>`. YouTube playback is purely view-driven.

**Parity requirement:** playback presence is bound to the in-view state; leaving view must release the embed, not just pause it.

## 2. Autoplay policy

**Web behavior:**
- Embed URL: `autoplay=1&mute=1&playsinline=1&loop=1&playlist={id}&controls=0&modestbranding=1`.
- Autoplay is **muted** (the only mode browsers allow without a gesture). `loop=1` requires `playlist={sameId}` to actually loop a single video.
- Autoplay begins the moment the iframe mounts (which only happens when in view).

**Parity requirement:** in-view YouTube clip starts playing automatically, muted, looping, chromeless.

## 3. Mute / unmute behavior

**Web behavior:**
- Starts **muted** (browser policy).
- A single **page-global audio unlock**: `feedAudioUnlocked` flips `true` on the **first user click anywhere** (window `click`, capture phase, passive). This signal is **shared** across native `<video>` clips AND YouTube clips — one Set of subscribers (`audioSubs`).
- On unlock, the YouTube clip's `applyAudio` runs `ytCmd('unMute')` then `ytCmd('setVolume', [100])` — but only if the clip is currently `ytActive`.
- Also unmutes on the iframe's `onLoad` if the page was already unlocked (covers the case where audio was unlocked before this clip scrolled in).
- **No mute button.** Once the page is unlocked, sound is always on (owner's TikTok-style choice).

**Parity requirement:** YouTube must honor the same one-time, page-wide "audio unlocked on first tap" signal the native feed uses, and unmute the in-view player when it fires.

## 4. Active-item policy

**Web behavior — two distinct signals (important):**
- **Native `upload` `<video>`** is driven by the feed's `active` prop — computed by the feed host from exact scroll position (`feedShared.tsx`, `snap-start` full-height slides). Deterministic; avoids observer races.
- **YouTube** is driven by the component's **own `IntersectionObserver`** (`threshold: 0.5`, `intersectionRatio >= 0.5`) on `ytContainerRef` → `ytActive`. It does **not** read the `active` prop for playback.
- Consequence: at most the one in-view YouTube clip has a live iframe; all others are poster-only.

**Parity requirement:** exactly one YouTube embed active at a time, selected by in-view state; the policy may differ from the native-video active mechanism (as it does on Web) as long as only the visible clip streams.

## 5. Fullscreen behavior

**Web behavior:**
- The iframe carries `allowFullScreen` and `allow="autoplay; encrypted-media"`.
- `controls=0` + `modestbranding=1` hide native YouTube chrome, so there is **no in-player fullscreen button** surfaced; fullscreen is only available via the `allowFullScreen` capability (not exposed through UI). Practically, the feed presents a chromeless, full-bleed clip and does not offer an explicit fullscreen affordance.

**Parity requirement:** chromeless, full-bleed presentation; no bespoke fullscreen UI is required to match Web.

## 6. iframe communication

**Web behavior:**
- Uses the **official YouTube IFrame Player API over `postMessage`**, enabled by `enablejsapi=1` on the embed URL.
- **No YouTube SDK script is loaded** — the production CSP `script-src` forbids external scripts, so commands are sent **directly** to the frame: `iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*')`.
- Commands used: `unMute`, `setVolume [100]`. Communication is **one-way / fire-and-forget** — the code does not subscribe to player events back from the frame.

**Parity requirement:** Android needs an equivalent way to send `unMute`/`setVolume` to the in-view embedded player on the shared audio-unlock signal, without loading an external SDK. (Mechanism = Phase 3 decision.)

## 7. YouTube ID extraction

**Web behavior (`src/lib/links/platforms.ts`):**
```
extractYouTubeId(url): 
  /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/  → group 1, else null
```
- Accepts `watch?v=`, `shorts/`, `embed/`, `live/`, and `youtu.be/` forms; the id is exactly **11 chars** `[A-Za-z0-9_-]`.
- If extraction returns `null` → the component renders **poster only**, no iframe (graceful, never a broken player).
- The embed is built from the **extracted id**, not the raw `url` — this is important because the stored `media_url`/`source_url` for a YouTube review is the full watch URL with extra params (e.g. `…?v=Z95t57HyYTE&list=…&start_radio=1`), which must NOT be passed to `/embed/` verbatim.

**Parity requirement:** Android must extract the 11-char id from `sourceUrl`/`mediaUrl` using the same accepted forms, and fall back to poster-only on no-match.

## 8. State management

**Web behavior:**
- Per-clip: `ytActive` (React state, drives mount) + `ytActiveRef` (ref mirror, read inside async callbacks), `ytFrameRef` (iframe handle for `postMessage`).
- Module-global (shared by ALL clips): `feedAudioUnlocked: boolean` and `audioSubs: Set<() => void>`; a single capture-phase window `click` listener sets the flag and notifies all subscribers.
- Effects: (a) IntersectionObserver effect gated on `sourceType === 'youtube'`, sets `ytActive`; (b) audio effect subscribes `applyAudio` to `audioSubs`, unsubscribes on unmount.
- Poster opacity is derived from `ytActive` (100% when inactive/poster-only, 30% when the iframe is live behind it).

**Parity requirement:** a shared, app-level audio-unlock signal (not per-clip) plus per-clip in-view state; the in-view clip's player handle must be reachable from the unlock callback.

## 9. Performance considerations

**Web behavior:**
- The iframe is mounted **only while in view** and **unmounted on scroll-away** — the explicit reason (code comment): otherwise "every mounted card autoplayed its own iframe simultaneously (bandwidth/CPU/battery drain)." So at most **one** live embed.
- The poster is a single `<img>` with an `onError` fallback to `placeholderFor('youtube')`; the reliable thumbnail is `https://i.ytimg.com/vi/{id}/hqdefault.jpg` (`hqdefault` exists for every public video, unlike `maxresdefault` which 404s for many Shorts).
- No SDK download (CSP-driven); embed uses `modestbranding` + no controls to minimize chrome/overhead.

**Parity requirement:** never run more than one YouTube embed at once; tear down off-screen embeds; prefer `hqdefault` for posters.

## 10. API compatibility / platform constraints

**Web behavior / environment:**
- **CSP:** production sends `frame-src 'self' https://www.youtube.com` (verified live) — the embed host is explicitly allowlisted. `img-src … https:` covers the `i.ytimg.com` poster. `script-src` does **not** allow youtube, which is why the raw-`postMessage` (no-SDK) approach is used.
- **Embed origin:** `https://www.youtube.com/embed/{id}` (not `youtube-nocookie`).
- **Params contract:** `enablejsapi=1&autoplay=1&mute=1&playsinline=1&loop=1&playlist={id}&controls=0&modestbranding=1`.
- **Data contract:** feed/detail rows carry `content_type='video'`, `source_type='youtube'`, `source_url`/`media_url` = full YouTube watch URL, `thumbnail` (may be null → poster fallback). Android already parses all of these (`ReviewNetworkDtos.kt`, `ReviewSourceType.YouTube`).

**Parity requirement (Android):** whatever renders the embed must be allowed to load `https://www.youtube.com/embed/*` and reach `i.ytimg.com`; it must support autoplay of an embedded muted video and a channel to send unmute/volume commands. Concrete mechanism is deferred to Phase 3.

---

## 11. Failure behaviour / fallback contract

**Verified from production code (`VideoPlayer.tsx`@`8a1be53`), not assumption.** The YouTube branch has exactly **two** app-level defensive layers:
1. `extractYouTubeId(url) === null` → early `return <img poster>` (no iframe ever created).
2. The poster `<img>` has `onError` → swaps to `placeholderFor('youtube')`.

It has **no `onError` on the `<iframe>`**, and it **does not subscribe to YouTube IFrame Player events** (`onStateChange`/`onError`) — communication is one-way, fire-and-forget (Section 6). Therefore **every runtime embed failure is invisible to the app**: the app shows whatever YouTube renders inside the frame (its own error card) or a blank frame, with the poster sitting at `opacity-30` behind it. There is **no retry and no "watch on YouTube" link** in the YouTube branch (that external-link affordance exists only in the separate legacy `sourceType !== 'upload'` branch, not for `youtube`).

| Case | Visual state | Playback state | User interaction | Fallback behavior |
|---|---|---|---|---|
| **Invalid YouTube URL** | Poster only (thumbnail, or `placeholderFor('youtube')`); **no iframe** | None (iframe never mounts) | None (static image) | ✅ **Handled** — `!videoId` early-return to poster |
| **`extractYouTubeId()` failure** | Same as above | None | None | ✅ **Handled** — function returns `null` (pure regex, cannot throw) → poster |
| **iframe load failure** (network error loading the embed) | Blank/empty iframe over poster at `opacity-30` | No playback | None; nothing to tap | ❌ **Not handled** — no iframe `onError`; frame stays mounted blank; poster partly visible behind; no retry |
| **CSP rejection** | With current CSP (`frame-src … https://www.youtube.com`) the embed is **allowed**, so this does not occur in production. If it did: browser blocks the frame → blank, same as iframe load failure | No playback | None | ❌ **Not handled** in code — relies entirely on CSP being correct |
| **Embedding disabled** (owner disallowed embeds) | YouTube's **own** "Video unavailable / Watch on YouTube" card renders *inside* the iframe; poster at `opacity-30` behind | Autoplay does not start | User could tap YouTube's in-frame link (YouTube's UI, not the app's) | ❌ **App cannot detect it** (no event listening); shows YouTube's in-frame error; no app fallback |
| **Removed / private video** | YouTube in-frame "Video unavailable" | No playback | Same (YouTube's in-frame UI only) | ❌ App cannot detect; YouTube's error shown; no app fallback |
| **Age-restricted video** | YouTube in-frame "Sign in to confirm your age" (embedded playback blocked) | No playback | YouTube's in-frame prompt only | ❌ App cannot detect; no app fallback |
| **Geo-restricted video** | YouTube in-frame "not available in your country" | No playback | YouTube's in-frame UI only | ❌ App cannot detect; no app fallback |
| **Network timeout** | iframe never fires `onLoad`; blank frame over poster (poster itself falls back to placeholder via its `onError`) | No playback | None | ❌ **Not handled** — no timeout/`onError` on iframe; no retry. Only the *poster* image degrades gracefully |
| **Offline mode** | Feed generally fails to load first (feed-level error UI). If a YouTube card is already mounted and then goes offline: iframe blank, poster/placeholder shown | No playback | None | ❌ No component-level offline handling; relies on feed-level error state + poster/placeholder |

**Honest summary of the contract:** Web Production **gracefully handles only the URL/ID-extraction failure path** (→ poster-only) and a **broken poster image** (→ placeholder). For **all embed-runtime failures** (load fail, embedding disabled, removed/private, age/geo-restricted, timeout, offline-while-mounted) it has **no detection and no app-level fallback** — it defers to YouTube's own in-frame error UI (or shows a blank frame) with the poster faintly behind. **Matching Web parity means matching this thin contract.** Any richer failure handling on Android (e.g. detecting embed errors, offering a "watch on YouTube" link, retry) would be a **deliberate improvement beyond parity** — an owner decision, not part of matching the Golden Master.

---

## 12. Single-iframe guarantee — verified from production code

**Claim to verify:** at most one YouTube `<iframe>` can exist at a time.

**Finding: the guarantee holds in steady state, but it is an *emergent* property of three layers — there is NO explicit global singleton guard in code.** A brief **transient of two** is possible at the exact scroll crossover.

**Where it is enforced (three composed layers):**
1. **Feed windowing** — `feedShared.tsx:298`: *"Only the active slide (± 1 neighbour) mounts a real `<video>`"* (`renderVideo`). Off-screen slides render a static `LinkPoster`, **not** a `VideoPlayer`, so the YouTube branch (and its iframe) doesn't even exist for them. → at most **3** `VideoPlayer` instances mounted.
2. **Per-clip in-view gate** — within a mounted `VideoPlayer`, the iframe is conditionally rendered: `{ytActive && <iframe/>}`. `ytActive` is set by that instance's own `IntersectionObserver` (`threshold: 0.5`, `intersectionRatio >= 0.5`).
3. **Full-height snap layout** — `feedShared.tsx:406`: each slide is `h-dvh … snap-start`, so in steady state exactly **one** slide is ≥50% in view → exactly one `ytActive === true`.

**Lifecycle:**
- **Mount:** iframe added to the DOM when `ytActive` becomes `true` (clip scrolled to ≥50% in view within the render window).
- **Unmount:** iframe removed when `ytActive` becomes `false` (scrolled below 50%) — React removes the `<iframe>` node, tearing down the embed.
- **Component unmount:** when feed windowing drops the card (no longer active±1), the whole `VideoPlayer` unmounts, removing the iframe.

**Cleanup / observer disconnect:**
- The IntersectionObserver is created in a `useEffect` gated on `sourceType === 'youtube'` and **disconnected in that effect's cleanup**: `return () => observer.disconnect()`. Keyed on `[sourceType]`, so it disconnects on unmount.
- The audio subscription (`audioSubs.add(applyAudio)`) is likewise removed on cleanup (`audioSubs.delete`).
- **No explicit stop command** is sent to the frame on teardown (no `postMessage('stopVideo')`); playback stops because the iframe node is removed from the DOM.

**Unmount timing:**
- iframe removal is **synchronous with the React re-render** in which `ytActive` flips to `false`.
- Observer disconnect + component teardown happen when the feed's windowing re-renders without this card.

**Honest caveat (transient two):** because the gate is `intersectionRatio >= 0.5` per clip, at the **exact 50/50 scroll midpoint** both the outgoing and incoming slides can momentarily satisfy `>= 0.5`, so **two iframes can co-exist for a brief transition frame**. Steady state is always one. The code does **not** enforce a hard "exactly one" invariant; it relies on geometry (full-screen slides) + windowing. **Parity requirement:** Android must guarantee **at most one embed active in steady state** and tear down off-screen embeds; it need not replicate the transient, and (unlike Web) *could* choose a stricter single-instance guard — again, a Phase-3 HOW decision, not required for parity.

---

## Parity gap summary (Web contract vs current Android)

| Aspect | Web Production (contract) | Android today (`ReviewCard.kt`) |
|---|---|---|
| YouTube render | `<iframe>` embed, autoplays muted, loops | Static poster + decorative play icon (no playback) |
| In-view gating | IntersectionObserver ≥0.5 mounts/unmounts iframe | n/a (poster only) |
| Audio unlock | Shared page-wide first-tap → unMute via IFrame API | n/a |
| ID extraction | `extractYouTubeId` (watch/shorts/embed/live/youtu.be) | n/a (uses `media_url` only for `upload`) |
| Poster | `hqdefault` + onError fallback | uses `thumbnail` (may be null) |
| Data model | source_type/source_url present | ✅ already parsed (`ReviewSourceType.YouTube`) |

**Only the render/playback layer is missing on Android; the data contract is already in place.** No behavioral aspect above requires a decision here — Section 6 (comm mechanism) and the Android render primitive are the open **HOW** questions for Phase 3, pending owner approval.

**No code written. No implementation approved. Awaiting owner review of this design before Phase 3.**
