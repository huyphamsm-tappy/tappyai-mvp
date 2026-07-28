/**
 * Unified playback contracts (WEB-EXPLORE-YOUTUBE-001, architecture v3).
 *
 * Layering:  Feed → PlaybackSession → PlaybackController → media substrate
 *
 * The Feed talks ONLY to a PlaybackSession. It never holds a PlaybackController,
 * never touches a substrate element (<video>, iframe), and never branches on the
 * provider — that knowledge lives in the concrete controllers and in the factory
 * that picks one.
 */

/** What the substrate reports about itself. Transport-level only — no policy. */
export type PlaybackStatus = 'idle' | 'buffering' | 'playing' | 'paused' | 'ended' | 'error'

export interface TransportState {
  status: PlaybackStatus
  muted: boolean
  positionSec?: number
  durationSec?: number
}

/**
 * Honest capability reporting. The two substrates are NOT equally capable: a
 * <video> can be read synchronously, while a cross-origin YouTube iframe can only
 * be observed through asynchronous player events. Callers degrade off these flags
 * instead of assuming parity.
 */
export interface TransportCapabilities {
  canReportPosition: boolean
  canSeek: boolean
  /** true = state read from the substrate; false = inferred from issued commands. */
  stateIsAuthoritative: boolean
  /**
   * true = this controller's substrate ALREADY drives its own activation
   * lifecycle, so PlaybackSession must not issue lifecycle-driven commands to it
   * (activation, render-window, visibility, pagehide). User-initiated commands
   * are still delivered.
   *
   * Phase 1 only, and only for uploaded clips: the legacy <video> implementation
   * remains the single owner of upload playback, so Session delegates and mirrors
   * rather than commanding — two writers would fight (the 300ms watchdog and the
   * play-icon state). Phase 3 replaces the adapter with HTMLVideoController, at
   * which point this is false and Session owns the lifecycle for both substrates.
   */
  ownsLifecycle: boolean
}

/**
 * TRANSPORT ONLY. A controller answers "how do I play this thing", never
 * "should this be playing" — it must not read `active`, `userPaused`, document
 * visibility or audio-unlock state, and must not decide autoplay.
 */
export interface PlaybackController {
  play(): void
  pause(): void
  stop(): void
  seek(seconds: number): void
  getState(): TransportState
  /** Apply sound after the page's audio session unlocks (first user gesture). */
  applyAudioUnlocked(): void
  readonly capabilities: TransportCapabilities
  dispose(): void
}

/**
 * POLICY + LIFECYCLE + SYNCHRONIZATION. One session per rendered slide; it owns
 * the controller and is the only thing that decides whether media should play.
 */
export interface PlaybackSession {
  readonly slideId: string

  getPlaybackState(): TransportState
  isUserPaused(): boolean
  isAutoplayEligible(): boolean
  isAudioUnlocked(): boolean
  isDocumentVisible(): boolean

  /** The feed's single playback authority. */
  setActive(active: boolean): void
  /** Render-window membership (±1). Leaving it stops and releases. */
  setInRenderWindow(inWindow: boolean): void
  /** User tapped to pause/resume — sets sticky intent. */
  onUserPauseToggle(): void
  onAudioUnlocked(): void
  onVisibilityChange(visible: boolean): void
  onPageHide(): void

  dispose(): void
}
