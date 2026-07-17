# ADR-009 — Media

**Status:** Accepted · **Date:** 2026-07-10

## Context
The Reviews feed is the highest-risk surface: parent-driven active playback, muted-start, global gesture-unlocked sound, a 300ms self-healing watchdog, only active ±1 items mount a player, no mute button (`03`, `06`, R4). Music includes pointer-sounds whose `audioUrl` may be a **video** file. Capture/upload has strict limits. SuperTux needs SharedArrayBuffer.

## Decision
Use **AVFoundation**: `AVQueuePlayer`/`AVPlayer` for the feed and music; **strict ±1 player window** (reuse/release players offscreen) for memory/perf (R11/R13). Reproduce the feed state machine exactly: active-index driven, muted start, a single global `audioUnlocked` flag set on first user gesture, watchdog re-issuing `play()` on the active item, drop-to-muted on unexpected pause. Manage **`AVAudioSession`** categories (ambient → playback on unlock; coordinate feed vs music). Pointer-sounds that are video URLs are played by extracting the audio track via AVPlayer. Capture via **PhotosUI/AVCaptureSession**; enforce size/type/duration/magic-byte before requesting a Blob token. **SuperTux runs in `WKWebView`** (COOP/COEP + SharedArrayBuffer, iOS ≥15.2) — the only WebView-bound feature (R17). Maps are **outbound Google Maps links** (no embedded map — parity).

## Alternatives Considered
- **VideoPlayer (SwiftUI) for the feed** — rejected: insufficient control over the precise state machine; use AVPlayer directly (optionally in a UIKit page controller).
- **Per-cell visibility-driven playback** — rejected: Web is *parent/active-index* driven; visibility-driven re-introduces the historical "stuck paused" bugs.
- **Native game reimplementation / MapKit places** — rejected: exceeds parity; SuperTux stays WebView, maps stay outbound links.

## Consequences
- Faithful feed behavior + controlled memory.
- Audio-session coordination is non-trivial (background, interruptions) — must be tested on device (R6).
- SuperTux acceptability on iOS must be confirmed early (R14/R17).

## Amendment — 2026-07-10 review (F7, F8)
**Player lifecycle across tabs (F8) · Required before Phase 3.** Because `TabView` retains all tabs, feed `AVPlayer`s must be torn down / paused when the feed tab is **deselected** and on **`scenePhase` background/inactive**, not only on cell visibility. Release players when the feed tab is not the active tab to prevent phantom audio and memory pressure (R8/R13).

**Feed media buffering (F7) · Required before Phase 3 (prefetch) / Long-term optimization (HLS).** Web serves progressive **MP4** from Vercel Blob; parity means AVPlayer streams the same. For MVP, implement **±1-item prefetch with a bounded buffer window and a cap on concurrent loads** (range requests) to reduce re-download/jank on fast scroll. A **backend HLS transcode** is the long-term fix — it is a backend/product change, not an iOS-only hack; log it, don't build client-side workarounds beyond prefetch.

## Future Evolution
If WKWebView SAB support proves unreliable, escalate SuperTux to owner as a platform gap (do not silently drop). Consider `AVPlayerLooper` refinements for feed smoothness.
