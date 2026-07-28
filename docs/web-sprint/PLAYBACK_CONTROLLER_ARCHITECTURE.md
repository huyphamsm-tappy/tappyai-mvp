# Unified Playback Architecture — **v3 (FINAL / APPROVED)**

**Ticket:** WEB-EXPLORE-YOUTUBE-001
**Status:** ARCHITECTURE APPROVED by owner. Design only — no code, no commits, no deployment.
**Baseline:** worktree `73ec5dc`; grounded in the approved *YouTube Transport Layer Audit*.
**Companion:** `PLAYBACK_IMPLEMENTATION_PLAN.md` (phases, risks, verification, rollback).

## Revision log

| Version | Change |
|---|---|
| v1 | Initial controller abstraction |
| v2 | Owner revision: introduced `PlaybackSession`; inverted rollout (YouTube first, upload adapter) |
| **v3** | **Owner FINAL**: decisions 1–9 locked. State model = **Option B**. Lifecycle pause/stop rule fixed. Visibility in Phase 1. New **Extensibility** section. All prior open questions **CLOSED**. |

---

## 1. Playback layering (FINAL)

```
Feed
  ↓
PlaybackSession
  ↓
PlaybackController
  ↓
Media Substrate  (<video> | YouTube iframe | future providers)
```

| Layer | Responsibility |
|---|---|
| **Feed** | **Determines the active slide only.** Nothing else. |
| **PlaybackSession** | Playback policy · lifecycle · `userPaused` · `autoplayEligible` · `audioUnlocked` · visibility state · slide identity · **synchronization between Feed and Controller** |
| **PlaybackController** | **Transport only** |
| Substrate | `<video>` element, YouTube iframe, … |

**Implementations:** `HTMLVideoController`, `YouTubeController`.

> **Hard rule: no policy logic is allowed inside controllers.** A controller must never read `active`, `userPaused`, visibility, or audio-unlock state, and must never decide *whether* to play — only *how*.

### Communication rule (FINAL — owner clarification)

> **The Feed communicates only with `PlaybackSession`.**
> **`PlaybackSession` owns the `PlaybackController`.**
> **The Feed must never communicate directly with any `PlaybackController` implementation.**

The Feed holds a reference to a `PlaybackSession` — never to a controller, never to a substrate element (`<video>`, iframe). It has no import of, and no type dependency on, any controller implementation. The Session exists precisely so the Feed carries no policy, transport, or synchronization burden.

## 2. Source independence (FINAL)

**The Feed must never branch on `sourceType` again.**

Forbidden anywhere in feed/render code:
```
if (sourceType === …)        ❌
switch (sourceType) …        ❌
sourceType !== 'upload'      ❌   ← the exact guard that caused this ticket
```

The Feed communicates **only with `PlaybackSession`** — never with a `PlaybackController` implementation, and never with a substrate element. Provider knowledge lives **only** inside the concrete controller and the factory that selects it.

*(Today this rule is violated in five places — `VideoPlayer.tsx:136, 193, 225, 308, 360` — each an effect guarded by `sourceType !== 'upload'`. Removing these guards is the structural goal of the work.)*

## 3. Playback authority (FINAL)

**`active` is the only playback authority.**

`ytActive` survives **only** as:
- an **iframe mount gate**, and
- a **performance optimization**.

> **It must never determine playback state.**

| Layer | Responsibility | Signal |
|---|---|---|
| Render window | which slides construct a Session | `Math.abs(i - activeIndex) <= 1` |
| **Playback authority** | which slide plays | **`active`** → `session.setActive()` |
| Embed mount (YT) | whether the iframe exists | mount gate (`ytActive`/`active`) — perf only |

Rationale (from the codebase's own history): the observer was replaced because it *"raced with the feed's own active-slide tracking and left some clips stuck paused."* A second authority recreates that race. Consequence: the single-embed guarantee becomes **explicit** rather than emergent, removing the two-embed transient at the 50/50 scroll midpoint.

## 4. YouTube state model — **Option B** (FINAL)

**Real player synchronization. Playback state comes from YouTube Player state events. Locally inferred state is NOT acceptable.**

- Enable the inbound channel: `enablejsapi=1` (already present) + the IFrame API **`listening` handshake**.
- Consume **`onStateChange`** and map YouTube's numeric states → `TransportState.status`:

| YT state | `status` |
|---|---|
| `-1` unstarted | `idle` |
| `0` ended | `ended` |
| `1` playing | `playing` |
| `2` paused | `paused` |
| `3` buffering | `buffering` |
| `5` cued | `idle` |

- `stateIsAuthoritative = true` for `YouTubeController`.
- Outbound transport remains **raw postMessage** — CSP `script-src` forbids loading the YouTube SDK. *(No new mechanism needed: the bridge already works today for `unMute`/`setVolume`.)*

### 🔒 Security requirement (mandatory, not optional)
Every inbound message handler **must validate the origin before processing**:

```
if (event.origin !== 'https://www.youtube.com') return   // ignore, do not parse
```

Additionally: verify the message came from the expected frame's `contentWindow`, and treat the payload as untrusted (defensive parse, never `eval`). Without origin validation any frame on the page could inject fake player state.

## 5. Playback lifecycle (FINAL)

Applies **consistently across all media types**:

| Condition | Action |
|---|---|
| Active slide, visible, not user-paused | `play()` |
| Active slide, user-paused | *no command* (respect user) |
| Active slide, document hidden | `pause()` — **system** pause, does **not** set `userPaused` |
| **Inside render window (±1), not active** | **`pause()`** |
| **Outside render window** | **`stop()` → unmount** |
| `pagehide` | `stop()` + release audio |

This table is the complete behavioural specification; it is evaluated in exactly one place (§7 decision function).

## 6. Visibility lifecycle (FINAL) — **in Phase 1**

`PlaybackSession` owns these policies. Supported:
- **`visibilitychange`** — hidden → system pause; visible → resume **only if** `!userPaused`.
- **`pagehide`** — `stop()` + release companion audio (prevents orphaned audio after navigation / bfcache eviction).

One **app-level** listener feeds Sessions; not one listener per clip. Listeners must be passive and must not block unload. *(Both are entirely absent today.)*

## 7. Contracts

### 7.1 `PlaybackController` — transport only
```
interface PlaybackController {
  play(): void
  pause(): void
  stop(): void
  seek(seconds: number): void
  getState(): TransportState
  readonly capabilities: TransportCapabilities
  dispose(): void
}

type TransportState = {
  status: 'idle' | 'buffering' | 'playing' | 'paused' | 'ended' | 'error'
  muted: boolean
  positionSec?: number
  durationSec?: number
}

type TransportCapabilities = {
  canReportPosition: boolean
  canSeek: boolean
  stateIsAuthoritative: boolean   // true for both after §4 (Option B)
}
```
**Not on the controller:** `userPaused`, `autoplayEligible`, `audioUnlocked`, visibility, slide identity, `active`.

### 7.2 `PlaybackSession` — policy, lifecycle, synchronization
```
interface PlaybackSession {
  readonly slideId: string
  readonly controller: PlaybackController

  getPlaybackState(): TransportState
  isUserPaused(): boolean
  isAutoplayEligible(): boolean
  isAudioUnlocked(): boolean
  isDocumentVisible(): boolean

  setActive(active: boolean): void
  setInRenderWindow(inWindow: boolean): void
  onUserPauseToggle(): void
  onAudioUnlocked(): void
  onVisibilityChange(visible: boolean): void
  onPageHide(): void

  dispose(): void
}
```

### 7.3 Decision function (single evaluation point)
Session recomputes on every input change and issues **at most one** transport command, per the §5 table. `autoplayEligible` is derived: `active && documentVisible && !userPaused`.

**`userPaused` is sticky and Session-owned.** A lifecycle-driven `play()` must never override an explicit user pause; only another user toggle clears it. *(Load-bearing: the upload watchdog actively resumes un-flagged pauses.)*

## 8. Autoplay, audio unlock, overlay parity

- **Autoplay** — observably unchanged: active clip autoplays **muted**, looping, chromeless (`controls=0` stays, so the app remains the only pause affordance). Session gates via `autoplayEligible`; controller executes.
- **Audio unlock** — signal stays page-global (a *page* capability): capture-phase window `click` → Sessions notified → `controller` applies sound (`<video>`: `muted=false` + replay ladder; YT: `unMute` + `setVolume(100)`). Notification must stay **synchronous** to preserve the iOS rule that unmute originates inside the click call stack. "No mute button; sound always on once unlocked" is unchanged.
- **Overlay parity** — the play/pause overlay is driven by Session state **regardless of substrate**, giving YouTube the same affordance as upload. With Option B the icon reflects the **real** player, so it cannot contradict the screen.

## 9. Extensibility (NEW — FINAL)

**`PlaybackController` is the stable abstraction of this system.**

Adding a media provider means adding **one controller implementation** and registering it with the controller factory. Future implementations may include:

- `HTMLVideoController`
- `YouTubeController`
- `VimeoController`
- `TikTokController`
- future providers

> **No Feed changes are required when introducing a new media provider.**

**Contract for any new controller:**
1. Implements `PlaybackController` in full (`play/pause/stop/seek/getState/capabilities/dispose`).
2. Contains **zero policy** — no `active`, no `userPaused`, no visibility, no autoplay decisions.
3. Declares its true `capabilities` honestly (never claim `stateIsAuthoritative` without real state events).
4. If it uses cross-origin messaging, it **must** validate `event.origin` (§4).
5. Fully releases resources in `dispose()`.

Provider selection is confined to a single factory (`sourceType → controller`). **This is the one and only place provider knowledge is permitted** — it is not a violation of §2, because the Feed never reaches it.

## 10. Scope boundary

**In:** controller + session abstraction, `YouTubeController` (Option B), `UploadCompatAdapter`, feed rewiring, visibility/pagehide, overlay parity, extensibility factory.
**Out (unchanged):** YouTube watch-progress analytics (never existed), attached-sound for YouTube (upload-only by design), `controls=0` chromeless presentation, no-mute-button policy, TikTok/Facebook legacy poster branch (a *poster*, not a player — a real `TikTokController` would be a future §9 addition).

## 11. Decision status — ALL CLOSED

| # | Decision | Final |
|---|---|---|
| 1 | Layering Feed → Session → Controller → Substrate | ✅ APPROVED |
| 2 | Feed never branches on `sourceType` | ✅ APPROVED |
| 3 | `active` = sole playback authority; `ytActive` = mount/perf only | ✅ APPROVED |
| 4 | YouTube state model | ✅ **Option B** + origin validation |
| 5 | Lifecycle: ±1 → `pause()`; outside → `stop()` → unmount | ✅ APPROVED |
| 6 | Visibility (`visibilitychange` + `pagehide`) | ✅ **Phase 1** |
| 7 | Upload: adapter in Phase 1, refactor in Phase 3 | ✅ APPROVED |
| 8 | Extensibility section | ✅ ADDED (§9) |
| 9 | Implementation order | ✅ see companion plan |

**No open architecture questions remain.**

---

**No code written. No commits. No push. No merge. No deployment.** Implementation awaits explicit owner approval of the companion implementation plan.
