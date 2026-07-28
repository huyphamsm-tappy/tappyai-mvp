import type { PlaybackController, PlaybackStatus, TransportCapabilities, TransportState } from './types'

/**
 * YouTube transport over the official IFrame Player API, spoken as raw
 * postMessage (WEB-EXPLORE-YOUTUBE-001, architecture v3 §4).
 *
 * No SDK script is loaded: the production CSP `script-src` forbids it, so we talk
 * to the frame directly. The embed already carries `enablejsapi=1`, and this
 * bridge is proven — it is how tap-to-unmute already reaches the player.
 *
 * Before this controller the bridge was WRITE-ONLY (only unMute/setVolume were
 * ever sent) and nothing listened, which is why YouTube clips could not be
 * paused by any route. Here we add the transport commands AND the inbound
 * `listening` handshake so playback state comes from the real player rather than
 * from locally inferred intent.
 */

const YT_ORIGIN = 'https://www.youtube.com'

/** YouTube's numeric player states → our transport vocabulary. */
function mapState(info: number): PlaybackStatus {
  switch (info) {
    case -1: return 'idle'      // unstarted
    case 0: return 'ended'
    case 1: return 'playing'
    case 2: return 'paused'
    case 3: return 'buffering'
    case 5: return 'idle'       // cued
    default: return 'idle'
  }
}

export class YouTubeController implements PlaybackController {
  readonly capabilities: TransportCapabilities = {
    canReportPosition: true,
    canSeek: true,
    // Real state arrives via onStateChange/infoDelivery — never inferred.
    stateIsAuthoritative: true,
  }

  private state: TransportState = { status: 'idle', muted: true }
  private disposed = false
  private handshakeTimer: ReturnType<typeof setInterval> | null = null
  private handshakeAttempts = 0

  /**
   * [getFrame] is a getter, not the element itself: the iframe is mounted and
   * unmounted by the render layer as slides scroll, so the controller must
   * always read the CURRENT frame rather than capture a stale reference.
   */
  constructor(private readonly getFrame: () => HTMLIFrameElement | null) {
    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.onMessage)
      this.startHandshake()
    }
  }

  // ── Inbound: real player state ──────────────────────────────────────────
  /**
   * Security (architecture v3 §4, mandatory): accept messages ONLY from the
   * official YouTube origin AND only from the frame we own, and treat the
   * payload as untrusted. Without these checks any frame on the page could
   * inject fake player state.
   */
  private onMessage = (event: MessageEvent) => {
    if (this.disposed) return
    if (event.origin !== YT_ORIGIN) return
    const frame = this.getFrame()
    if (!frame || event.source !== frame.contentWindow) return

    let data: unknown
    try {
      data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
    } catch {
      return // malformed payload — ignore
    }
    if (!data || typeof data !== 'object') return

    const msg = data as { event?: unknown; info?: unknown }
    // The player answered, so the handshake succeeded.
    this.stopHandshake()

    if (msg.event === 'onStateChange' && typeof msg.info === 'number') {
      this.state = { ...this.state, status: mapState(msg.info) }
      return
    }

    if (msg.event === 'infoDelivery' && msg.info && typeof msg.info === 'object') {
      const info = msg.info as { playerState?: unknown; currentTime?: unknown; duration?: unknown; muted?: unknown }
      const next: TransportState = { ...this.state }
      if (typeof info.playerState === 'number') next.status = mapState(info.playerState)
      if (typeof info.currentTime === 'number') next.positionSec = info.currentTime
      if (typeof info.duration === 'number' && info.duration > 0) next.durationSec = info.duration
      if (typeof info.muted === 'boolean') next.muted = info.muted
      this.state = next
    }
  }

  /**
   * The frame may not exist or be ready when the controller is created, so the
   * `listening` handshake is retried briefly and stops as soon as the player
   * answers (or after a bounded number of attempts, so a clip that never loads
   * cannot leave a timer running).
   */
  private startHandshake() {
    this.stopHandshake()
    this.handshakeAttempts = 0
    const tick = () => {
      if (this.disposed) return this.stopHandshake()
      this.handshakeAttempts += 1
      if (this.handshakeAttempts > 25) return this.stopHandshake() // ~10s
      this.post('listening')
    }
    tick()
    this.handshakeTimer = setInterval(tick, 400)
  }

  private stopHandshake() {
    if (this.handshakeTimer !== null) {
      clearInterval(this.handshakeTimer)
      this.handshakeTimer = null
    }
  }

  // ── Outbound: commands ──────────────────────────────────────────────────
  private post(event: 'command' | 'listening', func?: string, args: unknown[] = []) {
    if (this.disposed) return
    const win = this.getFrame()?.contentWindow
    if (!win) return
    try {
      const payload = event === 'listening'
        ? JSON.stringify({ event: 'listening' })
        : JSON.stringify({ event: 'command', func, args })
      win.postMessage(payload, YT_ORIGIN)
    } catch {
      // A cross-origin frame that isn't ready can throw; playback is best-effort.
    }
  }

  private cmd(func: string, args: unknown[] = []) {
    this.post('command', func, args)
  }

  play() { this.cmd('playVideo') }
  pause() { this.cmd('pauseVideo') }
  stop() { this.cmd('stopVideo') }
  seek(seconds: number) { this.cmd('seekTo', [seconds, true]) }

  /** Sound is applied only after the page's audio session unlocks (Session policy). */
  applyAudioUnlocked() {
    this.cmd('unMute')
    this.cmd('setVolume', [100])
  }

  getState(): TransportState {
    return this.state
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.stopHandshake()
    if (typeof window !== 'undefined') window.removeEventListener('message', this.onMessage)
  }
}
