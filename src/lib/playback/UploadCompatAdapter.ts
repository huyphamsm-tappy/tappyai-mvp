import type { PlaybackController, PlaybackStatus, TransportCapabilities, TransportState } from './types'

/**
 * The seam that lets uploaded clips satisfy PlaybackController WITHOUT touching
 * their playback logic (Phase 1; architecture v3 §7 / implementation plan §1.4).
 *
 * Upload is the highest-traffic path and currently works, so Phase 1 deliberately
 * does not refactor it. The legacy <video> implementation remains the SINGLE
 * OWNER of upload playback state — its `active`-driven effect, its 300ms
 * self-healing watchdog, its user-pause intent flag, its attached-sound engine.
 *
 * DELEGATION RULE: this adapter delegates and mirrors, it does not command.
 * pause()/play() go through the legacy component's own toggle so the legacy
 * intent flag stays correct. Calling video.pause() directly would be invisible
 * to that flag and the watchdog would resume the clip within 300ms — the exact
 * "clip won't stay paused" regression this rule exists to prevent.
 *
 * Phase 3 replaces this adapter with a first-class HTMLVideoController and moves
 * ownership into PlaybackSession.
 */

/**
 * The minimal surface the legacy player must expose. Deliberately tiny: the
 * adapter reads the element for state and uses the component's own toggle for
 * intent — nothing else is reached into.
 */
export interface LegacyUploadHandle {
  /** The component's existing user pause/resume path (owns the intent flag). */
  togglePlay(): void
  /** Read-only access for state reporting. */
  getVideo(): HTMLVideoElement | null
}

function statusOf(v: HTMLVideoElement | null): PlaybackStatus {
  if (!v) return 'idle'
  if (v.error) return 'error'
  if (v.ended) return 'ended'
  if (v.paused) return 'paused'
  if (v.readyState < 3) return 'buffering'
  return 'playing'
}

export class UploadCompatAdapter implements PlaybackController {
  readonly capabilities: TransportCapabilities = {
    canReportPosition: true,
    canSeek: true,
    // A <video> can be read synchronously — state is the element's own truth.
    stateIsAuthoritative: true,
    /**
     * Phase 1 (owner decision, Option B): the legacy implementation already
     * drives upload activation, so PlaybackSession must NOT issue lifecycle
     * commands here — only user-initiated ones. Two writers would fight: a
     * lifecycle pause routed through the legacy toggle would raise the play-icon
     * (VideoPlayer.tsx:316), and nothing resets that icon on re-activation,
     * leaving a play badge over a playing clip. Flipped to false in Phase 3 when
     * HTMLVideoController takes ownership.
     */
    ownsLifecycle: true,
  }

  constructor(private readonly getHandle: () => LegacyUploadHandle | null) {}

  private get video(): HTMLVideoElement | null {
    return this.getHandle()?.getVideo() ?? null
  }

  /** Resume only if actually paused — toggling a playing clip would pause it. */
  play() {
    const v = this.video
    if (!v || !v.paused) return
    this.getHandle()?.togglePlay()
  }

  /** Pause only if actually playing, and via the legacy toggle (see DELEGATION RULE). */
  pause() {
    const v = this.video
    if (!v || v.paused) return
    this.getHandle()?.togglePlay()
  }

  /**
   * Halt and reset. Only reached when the slide leaves the render window (the
   * element is being torn down), so resetting position is safe.
   */
  stop() {
    this.pause()
    const v = this.video
    if (v) {
      try { v.currentTime = 0 } catch { /* not seekable yet */ }
    }
  }

  seek(seconds: number) {
    const v = this.video
    if (!v) return
    try { v.currentTime = seconds } catch { /* not seekable yet */ }
  }

  /**
   * No-op by design. The legacy implementation already subscribes to the global
   * audio-unlock signal and applies sound itself, including the iOS rule that the
   * unmute must happen inside the click call stack. Duplicating it here would
   * mean two writers for one behaviour.
   */
  applyAudioUnlocked() {}

  getState(): TransportState {
    const v = this.video
    return {
      status: statusOf(v),
      muted: v ? v.muted : true,
      positionSec: v ? v.currentTime : undefined,
      durationSec: v && Number.isFinite(v.duration) && v.duration > 0 ? v.duration : undefined,
    }
  }

  /** The legacy component owns its own teardown; nothing extra to release here. */
  dispose() {}
}
