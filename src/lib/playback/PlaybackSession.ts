import type { PlaybackController, PlaybackSession, TransportState } from './types'

/**
 * Playback policy, lifecycle and Feed↔Controller synchronization
 * (WEB-EXPLORE-YOUTUBE-001, architecture v3 §1/§5/§7).
 *
 * One session per rendered slide. This is the ONLY place that decides whether
 * media should be playing; controllers just execute. Every bug this ticket
 * touches existed because those rules were scattered across provider-guarded
 * effects instead of living in one function.
 *
 * The Feed talks only to this object — it never sees the controller.
 */
export class DefaultPlaybackSession implements PlaybackSession {
  private active = false
  private inWindow = true
  private userPaused = false
  private audioUnlocked = false
  private visible = true
  private disposed = false
  /** Last transport command issued, so reconcile() never re-sends the same one. */
  private last: 'play' | 'pause' | 'stop' | null = null

  constructor(
    readonly slideId: string,
    private readonly controller: PlaybackController,
  ) {}

  // ── Reads ────────────────────────────────────────────────────────────────
  getPlaybackState(): TransportState { return this.controller.getState() }
  isUserPaused() { return this.userPaused }
  isAudioUnlocked() { return this.audioUnlocked }
  isDocumentVisible() { return this.visible }
  /** Derived, never stored: the clip may play only if all three hold. */
  isAutoplayEligible() { return this.active && this.visible && !this.userPaused }

  // ── Inputs from the Feed / app ───────────────────────────────────────────
  setActive(active: boolean) {
    if (this.active === active) return
    this.active = active
    // Leaving the active slide clears a user's pause: the next time this clip
    // comes back it should autoplay like any other, not stay silently paused.
    if (!active) this.userPaused = false
    this.reconcile()
  }

  setInRenderWindow(inWindow: boolean) {
    if (this.inWindow === inWindow) return
    this.inWindow = inWindow
    this.reconcile()
  }

  /** Sticky user intent — only another toggle clears it (never the lifecycle). */
  onUserPauseToggle() {
    if (!this.active) return
    this.userPaused = !this.userPaused
    this.reconcile()
  }

  onAudioUnlocked() {
    this.audioUnlocked = true
    // Sound belongs to the clip the user is actually watching.
    if (this.active && this.visible) this.controller.applyAudioUnlocked()
  }

  /**
   * Backgrounding is a SYSTEM pause: it must not set userPaused, otherwise the
   * clip would stay paused after the user returns to the tab.
   */
  onVisibilityChange(visible: boolean) {
    if (this.visible === visible) return
    this.visible = visible
    this.reconcile()
  }

  onPageHide() {
    this.issue('stop')
  }

  // ── The decision function (architecture v3 §5) ───────────────────────────
  private reconcile() {
    if (this.disposed) return

    // Outside the render window the slide is being torn down: release, don't retain.
    if (!this.inWindow) return this.issue('stop')

    // Inside the window but not the active slide → pause, keep position for a
    // fast resume when the user scrolls back.
    if (!this.active) return this.issue('pause')

    // Active but the tab is hidden → system pause (userPaused untouched).
    if (!this.visible) return this.issue('pause')

    // Active, visible, but the user deliberately paused → respect it, no command.
    if (this.userPaused) return this.issue('pause')

    this.issue('play')
  }

  private issue(cmd: 'play' | 'pause' | 'stop') {
    if (this.disposed || this.last === cmd) return
    this.last = cmd
    if (cmd === 'play') {
      this.controller.play()
      // Re-apply sound on resume: the page may have unlocked audio while this
      // clip was paused or inactive.
      if (this.audioUnlocked) this.controller.applyAudioUnlocked()
    } else if (cmd === 'pause') {
      this.controller.pause()
    } else {
      this.controller.stop()
    }
  }

  dispose() {
    if (this.disposed) return
    this.controller.stop()
    this.disposed = true
    this.controller.dispose()
  }
}
