# Web YouTube Playback Architecture (Production, `src/`)

Scope: exact behavior of YouTube-sourced clips inside the Explore/Reviews feed and
the Review Detail hero, as implemented in the current `src/` tree. This document
reports only what the code contains; every "ABSENT" line is a confirmed absence,
not an omission.

---

## 1. Overview

A review/post can be a native uploaded video (`source_type: 'upload'`) or a link
to an external platform (`source_type: 'youtube' | 'tiktok' | 'facebook'`,
`content_type: 'video'`, `media_url` = the external URL). All four cases are
rendered by one shared component, `VideoPlayer` (`src/components/explore/VideoPlayer.tsx`),
which switches on `sourceType` and returns a different JSX subtree per branch.

For YouTube specifically:
- A `<div>` container (`ytContainerRef`) always renders, holding a poster
  `<img>` at all times.
- A real `<iframe>` pointed at `youtube.com/embed/...` is conditionally mounted
  only while a local boolean state `ytActive` is `true`.
- `ytActive` is driven by a **per-component `IntersectionObserver`** attached to
  the container div — this is a different mechanism from the `active` prop that
  drives the native `<video>` branch's play/pause logic. The `active` prop
  itself is **not read at all** inside the `sourceType === 'youtube'` branch.

---

## 2. File-by-file breakdown

### 2.1 `src/components/explore/VideoPlayer.tsx` (entire file read)

**Props** (`VideoPlayerProps`, lines 5-17):
| prop | type | default |
|---|---|---|
| `url` | `string` | required |
| `thumbnail` | `string?` | — |
| `sourceType` | `string?` | `'upload'` |
| `sourceUrl` | `string?` | — |
| `active` | `boolean?` | `false` |
| `onWatchProgress` | `(seconds: number, completionRate: number) => void` | — |
| `onDurationKnown` | `(d: number) => void` | — |

Imperative handle (lines 19-23): `{ togglePlay: () => void }`, exposed via
`useImperativeHandle`. `togglePlay` early-returns if `sourceType !== 'upload'`
(line 160) — so it has **no effect for YouTube clips**.

**Module-level global audio-unlock singleton** (lines 25-45): a module-scope
`feedAudioUnlocked` boolean plus a `Set` of subscriber callbacks (`audioSubs`).
A single `window` `click` listener (capture, passive) sets
`feedAudioUnlocked = true` and notifies subscribers. This mechanism only
affects the native `<video>` branch (muted/unmuted play); it has no code path
into the YouTube iframe (the iframe URL always hardcodes `mute=1`, see §5).

**State/refs declared** (lines 51-64):
- `videoRef` (native `<video>` only)
- `startRef`, `watchedRef`, `playing`, `showPlayIcon`, `userPausedRef`,
  `activeRef` (mirrors `active` prop every render, line 57-58)
- `onWatchProgressRef` (ref-mirrors the `onWatchProgress` prop)
- `ytContainerRef: useRef<HTMLDivElement>(null)` (line 63) — attached to the
  outer `<div>` of the YouTube branch (line 191)
- `ytActive: useState(false)` (line 64)

**`ytActive` IntersectionObserver effect** (lines 68-78), quoted in full:
```js
useEffect(() => {
  if (sourceType !== 'youtube') return
  const el = ytContainerRef.current
  if (!el) return
  const observer = new IntersectionObserver(
    ([entry]) => setYtActive(entry.isIntersecting && entry.intersectionRatio >= 0.5),
    { threshold: 0.5 }
  )
  observer.observe(el)
  return () => observer.disconnect()
}, [sourceType])
```
- Dependency array: `[sourceType]` only — it does **not** depend on `active`,
  `url`, or `videoId`. It is created once per mount (or when `sourceType`
  changes) and torn down on unmount (`observer.disconnect()` in the cleanup).
- Observer options: `{ threshold: 0.5 }`. No `root` specified (defaults to the
  browser viewport). No `rootMargin` specified (defaults to `'0px'`).
- Callback logic: `setYtActive(entry.isIntersecting && entry.intersectionRatio >= 0.5)`
  — true only when the container is intersecting AND at least 50% visible;
  otherwise false. This is the **sole** driver of `ytActive`; there is no other
  place in the file that calls `setYtActive`.
- This is a genuine per-video-instance `IntersectionObserver` targeting the
  browser viewport as root — it exists **specifically and only** for the
  YouTube branch. (The file's own top-of-component comment, lines 10-13,
  explains that a per-video observer was deliberately *removed* for the native
  `<video>` playback path in favor of the feed's own `active` prop — that
  removal does not apply to the YouTube branch, which still uses its own
  observer.)

**Native `<video>` playback effect** (lines 84-135) — gated
`if (!v || sourceType !== 'upload') return` (line 86), so **does not run for
`sourceType === 'youtube'`** at all. (Full watchdog/self-healing-play logic
documented here only for completeness/contrast — it is irrelevant to YouTube.)

**Audio-unlock reactive effect** (lines 141-154) and **`handlePause`**
(lines 176-183): both operate on `videoRef`/native `<video>` only; guarded by
`if (!v || ...)` so no-ops when there is no native `<video>` element (i.e. for
YouTube).

**YouTube render branch** (lines 186-205), quoted in full:
```jsx
if (sourceType === 'youtube') {
  const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/)?.[1]
  if (!videoId) return <div className="absolute inset-0 bg-black" />
  const ytThumb = thumbnail || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
  return (
    <div ref={ytContainerRef} className="absolute inset-0 bg-black">
      <img src={ytThumb} alt="" className={`absolute inset-0 w-full h-full object-cover ${ytActive ? 'opacity-30' : 'opacity-100'}`} />
      {ytActive && (
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1&loop=1&playlist=${videoId}&controls=0&modestbranding=1`}
          className="absolute inset-0 w-full h-full"
          allow="autoplay; encrypted-media"
          allowFullScreen
          title="video"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />
    </div>
  )
}
```
No `key` prop on the `<iframe>`. No `ref` on the `<iframe>`. No `onLoad`/
`onError` handler on the `<iframe>`. No `sandbox` attribute. No `loading`
attribute. No `enablejsapi`, `origin`, or `rel` query params.

**Non-YouTube branches** (for contrast, not relevant to this doc's subject):
`tiktok`/`facebook` (lines 208-235) render only a static thumbnail + external
link (`<a target="_blank">`), never an iframe or player of any kind. The
default/`upload` branch (lines 239-269) renders a native `<video>` element.

### 2.2 Callers of `VideoPlayer` (grep-confirmed; exactly 2 call sites + the component file itself)

#### a) `src/app/reviews/page.tsx` — `Post` component (the Explore/main feed card), lines 336-344:
```jsx
<VideoPlayer
  ref={videoHandleRef}
  url={r.media_url}
  thumbnail={r.thumbnail ?? undefined}
  sourceType={r.source_type ?? 'upload'}
  sourceUrl={r.source_url ?? undefined}
  active={active}
  onDurationKnown={d => { durationRef.current = d }}
/>
```
This call only renders when `renderVideo` is true (line 335:
`r.content_type === 'video' && r.media_url ? (renderVideo ? <VideoPlayer .../> : <thumbnail-only div>) : ...`).
Off-window slides (`renderVideo === false`) get a plain thumbnail `<img>` with
no `VideoPlayer` mounted, no iframe, no `<video>`.

`Post`'s own props (declared lines 235-251) include `active?: boolean` and
`renderVideo: boolean`, both passed down from the parent feed (see §3).
`onWatchProgress` is **not** passed at this call site (absent).

#### b) `src/app/reviews/[id]/ReviewDetailView.tsx` — Review Detail hero, lines 95-100:
```jsx
<VideoPlayer
  url={review.media_url!}
  thumbnail={review.thumbnail ?? undefined}
  sourceType={review.source_type ?? 'upload'}
  sourceUrl={review.source_url ?? undefined}
/>
```
Rendered only when `isVideo` (`review.content_type === 'video' && !!review.media_url`,
line 84) is true, inside a `h-[55vh]` hero div (line 90). Notably:
- **No `active` prop is passed** — `VideoPlayer`'s default `active = false`
  applies (this affects only the native-`<video>` playback effect; it has
  **no effect on the YouTube branch**, since that branch never reads `active`).
- **No `onDurationKnown`, no `onWatchProgress`, no `ref`** are passed.
- There is exactly one `VideoPlayer` invocation in this file; there is no
  separate/alternate YouTube handling in Review Detail — the same shared
  component and the same iframe-embed branch (§2.1) is used.

---

## 3. Feed active-slide logic (drives the `active` / `renderVideo` props into `Post`/`VideoPlayer`)

`reviews/page.tsx` contains **two** independent feed-scroller implementations
that both follow the identical pattern; both feed `Post` (and hence
`VideoPlayer`) the same two derived props: `renderVideo={Math.abs(i - activeIndex) <= 1}`
and `active={i === activeIndex}`.

### a) Main home feed (component starting ~line 1079)
- `const [activeIndex, setActiveIndex] = useState(0)` (line 1079).
- Scroll container: `<div ref={containerRef} className="h-dvh overflow-y-scroll snap-y snap-mandatory" style={{ scrollbarWidth: 'none' }}>` (line 1461).
- A `scroll` event listener is attached imperatively in a `useEffect` (lines
  1335-1352), not inline via `onScroll=`:
  ```js
  const onScroll = () => {
    const idx = Math.round(c.scrollTop / c.clientHeight)
    setActiveIndex(prev => (prev === idx ? prev : idx))
    if (hasMore.current && c.scrollTop + c.clientHeight >= c.scrollHeight - c.clientHeight * 0.5) {
      hasMore.current = false
      pageRef.current += 1
      fetch_(pageRef.current, true, feedType)
    }
  }
  c.addEventListener('scroll', onScroll, { passive: true })
  ```
  Registered with `{ passive: true }`. Active index is computed purely by
  arithmetic on `scrollTop`/`clientHeight` (each slide = exactly one viewport,
  via `h-dvh` + CSS scroll-snap) — **no IntersectionObserver** is used for
  this top-level active-slide computation.
- Programmatic navigation (`scrollFeed`, lines 1269-1276, used by the
  desktop up/down arrow buttons) does `c.scrollTo({ top: next * c.clientHeight, behavior: 'auto' })`
  (explicitly non-smooth — comment at lines 1266-1268 explains that
  `scroll-snap-type: mandatory` cancels smooth scrolls) and calls
  `setActiveIndex(next)` synchronously in the same call.
- Render call (line 1462):
  ```jsx
  <Post key={r.id} r={r} me={me} feedType={feedType}
    renderVideo={Math.abs(i - activeIndex) <= 1} active={i === activeIndex}
    onFeedTypeChange={handleFeedTypeChange} onLike={like} onLikeDouble={likeOnly}
    onSave={save} onComment={setCommentOf} onShare={handleShare} onDelete={del}
    onSoundTap={setSoundTrackId} />
  ```

### b) `ClipViewer` modal (profile-grid clip viewer, opens a swipeable overlay; lines 463-555)
- Same state shape: `const [activeIndex, setActiveIndex] = useState(startIndex)` (line 465).
- Scroll container here uses **inline** `onScroll` (line 536):
  ```jsx
  <div ref={containerRef}
    onScroll={e => { const c = e.currentTarget; const idx = Math.round(c.scrollTop / c.clientHeight); setActiveIndex(prev => (prev === idx ? prev : idx)) }}
    className="h-dvh overflow-y-scroll snap-y snap-mandatory" style={{ scrollbarWidth: 'none' }}>
  ```
  Identical arithmetic (`Math.round(scrollTop / clientHeight)`), identical
  guard against redundant `setState`.
- On open, jumps straight to the tapped clip (lines 472-475):
  `c.scrollTo({ top: startIndex * c.clientHeight, behavior: 'auto' })`.
- `scrollFeed` (lines 520-527) is the same instant-jump pattern as (a).
- Render call (lines 539-542) passes the same `renderVideo`/`active` formula.

**Conclusion for §3**: in both feed implementations, "is this slide active" is
pure scroll-position arithmetic (`round(scrollTop / clientHeight) === i`), not
an `IntersectionObserver`, not a `data-index` lookup, and not any kind of
video-readiness signal. This `active` boolean is what `Post` forwards into
`VideoPlayer`'s `active` prop — but as shown in §2.1, `VideoPlayer` ignores
`active` entirely for `sourceType === 'youtube'`; the YouTube iframe's mount/
unmount is controlled solely by that component's own internal
`IntersectionObserver`-driven `ytActive` state, independently of what the feed
computed.

---

## 4. Wrappers / providers / headers / CSP / referrer

### 4.1 `next.config.mjs` (full `headers()` config read)
Content-Security-Policy directives relevant to embeds (lines 42-60):
- `"frame-src 'self' https://www.youtube.com"` — only `youtube.com` (not
  `www.youtube-nocookie.com`) is whitelisted as an embeddable frame source.
- `"frame-ancestors 'self'"` — clickjacking guard for this app's own pages
  (unrelated to embedding YouTube, but present).
- `"img-src 'self' data: blob: https:"` — any `https:` origin is allowed for
  `<img>`, which is how the `i.ytimg.com` poster thumbnail loads without a
  separate CSP entry.
- `"connect-src 'self' https://*.supabase.co wss://*.supabase.co https://us.i.posthog.com https://us-assets.i.posthog.com https://nominatim.openstreetmap.org https://vitals.vercel-insights.com https://*.public.blob.vercel-storage.com https://blob.vercel-storage.com"`
  — does **not** list any YouTube/Google domain; the iframe itself is not a
  `connect-src` resource so this doesn't block it, but it means no XHR/fetch
  to YouTube APIs (e.g. IFrame Player API's postMessage-based control) is
  network-permitted from this origin's JS in the sense of `connect-src` (note:
  `connect-src` doesn't actually gate `postMessage`, but there is no such API
  usage in the code regardless — see §6 ABSENT list).

Additional security headers applied to every route (lines 63-73):
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(self), microphone=(self), geolocation=(self), browsing-topics=()`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`

None of these headers carry any YouTube-specific exception or override; the
`Referrer-Policy` above is the one and only referrer-policy mechanism found
(see §6 — no per-tag `referrerpolicy` attribute and no `<meta name="referrer">`
tag exist anywhere in `src/`).

### 4.2 Playback session/controller wrapper
No dedicated "playback session" or "playback controller" module was found
(searched for `VideoPlayer` usage across `src/`; only the two call sites in
§2.2 exist). There is no context provider, no singleton player manager, and no
shared ref-registry coordinating multiple `VideoPlayer` instances beyond the
module-level `feedAudioUnlocked`/`audioSubs` singleton described in §2.1,
which — as noted — has no interaction with the YouTube iframe branch.

---

## 5. The exact embed contract

### 5.1 Iframe `src` URL — query parameter table
Base: `https://www.youtube.com/embed/${videoId}`

| param | value | notes |
|---|---|---|
| `autoplay` | `1` | |
| `mute` | `1` | hardcoded; always muted, unconditionally, regardless of the page's global `feedAudioUnlocked` audio-unlock state |
| `playsinline` | `1` | |
| `loop` | `1` | combined with `playlist` param below (YouTube requirement for single-video looping) |
| `playlist` | `${videoId}` | set to the same video id, required by YouTube's embed API for `loop=1` to work on a single video |
| `controls` | `0` | native YouTube controls hidden |
| `modestbranding` | `1` | |

### 5.2 Iframe element attributes
| attribute | value |
|---|---|
| `src` | (per §5.1) |
| `className` | `absolute inset-0 w-full h-full` |
| `allow` | `"autoplay; encrypted-media"` |
| `allowFullScreen` | present (boolean prop) |
| `title` | `"video"` |

### 5.3 `videoId` extraction regex (identical in two places)
- `src/components/explore/VideoPlayer.tsx` line 187:
  `url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/)?.[1]`
- `src/app/reviews/new/page.tsx` line 42-44, function `extractYoutubeId`:
  `url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/)?.[1] ?? null`

Matches only `youtube.com/watch?v=<id>` or `youtu.be/<id>` URL shapes. Does
**not** match `youtube.com/shorts/<id>`, `youtube.com/embed/<id>`, or any URL
carrying additional path segments before the id in another form. Capture
group `[^&?/]+` stops the id at the first `&`, `?`, or `/`.

### 5.4 `source_type === 'youtube'` decision path (post-creation time, not playback time)
In `src/app/reviews/new/page.tsx`:
- `detectSource(url)` (lines 35-40):
  ```js
  function detectSource(url: string): 'youtube' | 'tiktok' | 'facebook' | null {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
    if (url.includes('tiktok.com')) return 'tiktok'
    if (url.includes('facebook.com') || url.includes('fb.com') || url.includes('fb.watch')) return 'facebook'
    return null
  }
  ```
- Called from `handleUrlChange` (line 462-470) as the user types/pastes a URL
  into the "url" media-mode input; sets `source_type` state and, if detected
  as `'youtube'`, computes the poster via `extractYoutubeId` +
  `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` (line 469) for the compose-time
  preview.
- On submit (`handleSubmit`, lines 541-555): for `mediaMode === 'url'`, the
  payload sent to the backend sets `content_type: 'video'`, `media_url: source_url`
  (the raw pasted URL, unchanged), `source_type: source_type`, `source_url: source_url`,
  `thumbnail: urlMeta?.thumbnail_url || ''`.
- At **playback time**, `VideoPlayer` never re-derives `source_type` — it only
  ever reads whatever `sourceType` prop was passed in (from the review row's
  persisted `source_type` column, defaulted to `'upload'` if null/undefined at
  both call sites, §2.2). The `source_type === 'youtube'` check that selects
  the iframe-embed render branch is the literal `if (sourceType === 'youtube')`
  at `VideoPlayer.tsx` line 186.

---

## 6. `ytActive` lifecycle — state machine

| State | Trigger | Effect |
|---|---|---|
| Component mounts, `sourceType === 'youtube'` | React commit | `useEffect` (lines 68-78) creates `new IntersectionObserver(cb, { threshold: 0.5 })`, calls `observer.observe(ytContainerRef.current)`. `ytActive` starts `false` (initial `useState(false)`). Poster `<img>` renders at `opacity-100`; no iframe. |
| Container div crosses ≥50% visibility (entering) | Observer callback fires with `entry.isIntersecting === true` and `entry.intersectionRatio >= 0.5` | `setYtActive(true)` → re-render mounts the `<iframe>` (React creates a **new** DOM iframe element — there is no pooling/reuse; every mount is a fresh `<iframe>` with a fresh `src`, since the `{ytActive && <iframe .../>}` conditional fully unmounts/remounts it) → poster `<img>` opacity flips from `100` to `30` (still rendered underneath, never removed) |
| Container div drops below 50% visibility (leaving), or fully leaves | Observer callback fires with `isIntersecting === false` or `intersectionRatio < 0.5` | `setYtActive(false)` → re-render **unmounts** the `<iframe>` entirely (React removes it from the DOM — this is the only teardown mechanism; there is no explicit `postMessage({event:'command', func:'pauseVideo'})` or any other stop command sent to the YouTube player) → poster `<img>` opacity flips back to `100` |
| Component unmounts | React unmount | Effect cleanup: `observer.disconnect()` (line 77). If an iframe happened to be mounted at that moment, it is removed as part of the normal React unmount of the returned JSX tree — no separate manual iframe-removal code exists. |
| `sourceType` prop changes away from `'youtube'` | Re-render | Effect cleanup runs (`observer.disconnect()`), then the effect body's guard `if (sourceType !== 'youtube') return` skips creating a new observer. `ytActive` state is **not reset to false** by any code (no explicit `setYtActive(false)` on this transition) — but since the returned JSX now takes a different branch (`upload`/`tiktok`/`facebook`), the stale `ytActive` value is simply unused/irrelevant unless `sourceType` later flips back to `'youtube'` on the same mounted instance (which does not happen in either real caller, since `sourceType` is derived from static review data, not user interaction). |

No `setTimeout`/`setInterval`/debounce is used anywhere in the `ytActive` path
(contrast with the native-video watchdog's `setInterval(ensurePlaying, 300)`,
which is scoped to `sourceType === 'upload'` only, line 127).

---

## 7. Visibility / IntersectionObserver — consolidated details

Exactly one `IntersectionObserver` construction exists in `VideoPlayer.tsx`
(lines 72-75), and it is **only** created when `sourceType === 'youtube'`:
- `root`: not specified → defaults to the browser viewport.
- `rootMargin`: not specified → defaults to `'0px'` on all sides.
- `threshold`: `0.5` (single number, not an array).
- Observed target: the outer `<div ref={ytContainerRef}>` that wraps the
  poster image + iframe + gradient overlay (i.e. the whole YouTube slide's
  footprint, not the iframe itself — the iframe doesn't exist yet the first
  time `observe()` is called, since it only mounts after `ytActive` flips
  true).
- Callback receives entries destructured as `([entry])` — only the first
  (and only, since one target is observed) entry is used.
- Condition for "active": `entry.isIntersecting && entry.intersectionRatio >= 0.5`
  — note this is technically redundant (if `intersectionRatio >= 0.5` then
  `isIntersecting` is necessarily true for a single non-zero-area target), but
  both conditions are explicitly written in the source.

This observer is entirely separate from, and uncoordinated with, the feed's
own scroll-position-based `activeIndex` (§3). A YouTube slide could in
principle be `active` (per the feed's `activeIndex`) while `ytActive` is still
`false` (if it hasn't reached 50% viewport visibility yet under the observer's
own timing), or vice versa near boundary conditions — no code in the file
reconciles the two signals for the YouTube branch.

---

## 8. Thumbnail / poster logic

```js
const ytThumb = thumbnail || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
```
(line 189)
- If the review row has a persisted `thumbnail` value (set at compose time in
  `reviews/new/page.tsx`, itself computed the same way —
  `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, line 469), that value is
  used verbatim.
- Otherwise, falls back to constructing the `maxresdefault.jpg` URL directly
  from the extracted `videoId` at render time.
- **No fallback chain past `maxresdefault`** — e.g. no attempt at
  `hqdefault.jpg`/`mqdefault.jpg`/`sddefault.jpg` if `maxresdefault.jpg` 404s
  (YouTube returns a 404 for `maxresdefault.jpg` on some videos that lack a
  high-res thumbnail). The `<img>` tag has no `onError` handler in the
  YouTube branch (contrast: the compose-time preview `<img>` in
  `reviews/new/page.tsx` line 795 *does* have
  `onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}`,
  but that is a different `<img>`, only used in the composer preview, not in
  playback).
- The poster `<img>` is **never removed from the DOM** while the YouTube
  branch is rendered — it persists underneath the iframe at all times, only
  its Tailwind opacity class toggles between `opacity-100` (iframe absent) and
  `opacity-30` (iframe present, dimmed backdrop visible through/behind it).

---

## 9. Mount / unmount + cleanup — summary across the component

- **`IntersectionObserver` mount/unmount**: created in a `useEffect` keyed on
  `[sourceType]`; torn down (`observer.disconnect()`) in that same effect's
  cleanup function, which fires on unmount or whenever `sourceType` changes
  before the next effect run.
- **Iframe mount/unmount**: purely a function of the `{ytActive && <iframe .../>}`
  JSX conditional — no manual DOM manipulation, no `ref` held on the iframe, no
  imperative creation/removal code. Every time `ytActive` flips `true→false→true`,
  a brand-new iframe (and therefore a brand-new embedded YouTube player
  session, restarting playback from the beginning since `autoplay=1` reloads
  fresh) is created; there is no persistence of playback position across
  toggles.
- **No `pagehide`/`visibilitychange`/`beforeunload` handling** exists anywhere
  in `VideoPlayer.tsx` for the YouTube branch (the file has no listener for
  any of those three events at all — the only `window` listener in the whole
  file is the module-level `click` listener for `feedAudioUnlocked`, §2.1).
- **No cleanup message is ever sent into the iframe** (no `postMessage` calls
  targeting the iframe's `contentWindow`) before or during unmount; teardown
  relies entirely on the browser discarding the iframe's document/context when
  React removes the DOM node.

---

## 10. Headers / CSP / referrer — findings (see §4 for full detail)

- CSP `frame-src` allows exactly `'self' https://www.youtube.com`.
- No `frame-ancestors` exception exists for embedding *this* site inside
  something else in relation to YouTube (irrelevant direction; `frame-ancestors`
  governs who may iframe this site, not what this site may iframe).
- `Referrer-Policy: strict-origin-when-cross-origin` is a blanket header on
  `/:path*`; nothing overrides it specifically for the reviews/explore routes
  or for the iframe tag itself.
- No route-specific headers exist for `/reviews` or `/reviews/[id]` beyond the
  global `securityHeaders` block; the only route with bespoke headers is
  `/game/supertux` (COOP/COEP, unrelated to YouTube).

---

## 11. Explicit ABSENT list

The following do **not** exist anywhere in the reachable code path
(`VideoPlayer.tsx`, its two callers, `next.config.mjs`, and
`reviews/new/page.tsx`'s source-detection logic):

- No YouTube IFrame Player API script (`https://www.youtube.com/iframe_api`)
  is loaded anywhere in `src/`.
- No `enablejsapi=1` parameter on the embed URL.
- No `origin=` parameter on the embed URL.
- No use of `youtube-nocookie.com` (privacy-enhanced mode) — the domain used
  is always `www.youtube.com`, both in the iframe `src` and in the CSP
  `frame-src` allow-list.
- No `postMessage`-based communication with the iframe (no play/pause/seek
  commands, no state-change listener, no `window.addEventListener('message', ...)`
  anywhere in `VideoPlayer.tsx` or its callers).
- No `<meta name="referrer">` tag anywhere in `src/` (confirmed via
  repository-wide search — zero matches).
- No per-iframe `referrerpolicy` HTML attribute on the `<iframe>` element
  itself (the only referrer policy in force is the global HTTP response
  header, §10).
- No `sandbox` attribute on the iframe.
- No `loading="lazy"` (or any `loading` attribute) on the iframe.
- No `key` prop on the iframe (React default reconciliation applies; since the
  iframe is conditionally rendered via `&&`, it is fully unmounted/remounted
  anyway, so a `key` would be moot here).
- No debouncing/throttling of the `IntersectionObserver` callback (no
  `setTimeout` delay before applying `setYtActive`).
- No coordination between the YouTube-specific `IntersectionObserver` and the
  feed-level `activeIndex`/`active` prop — they are fully independent signals
  for this branch.
- No fallback thumbnail resolution chain beyond a single `maxresdefault.jpg`
  attempt (no `hqdefault`/`sddefault`/`mqdefault` fallback, no `onError`
  handler on the poster `<img>` in the playback path).
- No explicit pause-on-tab-hidden / pause-on-`pagehide` logic for the YouTube
  branch (no `visibilitychange`, `pagehide`, or `beforeunload` listeners in
  `VideoPlayer.tsx` at all).
- No mute/unmute control exposed for YouTube clips — the embed URL always
  hardcodes `mute=1` and there is no UI element, prop, or effect anywhere that
  changes it; the page-wide `feedAudioUnlocked` singleton (used for native
  `<video>` unmuting) is never read inside the YouTube branch.
- `togglePlay` (the imperative handle used by the feed's single-tap
  gesture layer) is a no-op for YouTube clips (guarded by
  `sourceType !== 'upload'` early return) — single-tap pause/resume, present
  for native uploaded videos, does **not** work on YouTube-sourced clips.
- `onWatchProgress` / watch-time tracking is never invoked for the YouTube
  branch (that logic lives entirely inside the native-`<video>`-only playback
  effect, gated on `sourceType !== 'upload'` returning early).
- `onDurationKnown` is never invoked for the YouTube branch either (it is
  wired only to the native `<video>` element's `onLoadedMetadata`, which
  doesn't exist for the iframe branch).
- Review Detail (`ReviewDetailView.tsx`) passes no `active` prop to
  `VideoPlayer` at all — irrelevant to the YouTube branch's own observer, but
  confirms there is no alternate/parallel YouTube-playback code path specific
  to Review Detail; it is the identical shared component and branch.
