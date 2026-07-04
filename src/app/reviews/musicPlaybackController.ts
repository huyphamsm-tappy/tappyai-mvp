// Owned by the Reviews feature (not the Music Module) — a single shared
// playback service so Feed, Detail, and any future consumer coordinate
// through exactly one HTMLAudioElement, never one per card/page.
//
// Plain singleton, not a React component: safe to import from a Server
// Component's module graph since it never touches `Audio`/`window` at
// module-eval time — only inside methods invoked later from client code.

export interface MusicPlaybackState {
  playKey: string | null
  isPlaying: boolean
  progress: number // 0-1, relative to (startSec -> durationSec)
}

type Listener = () => void

class MusicPlaybackController {
  private audio: HTMLAudioElement | null = null
  private state: MusicPlaybackState = { playKey: null, isPlaying: false, progress: 0 }
  private listeners = new Set<Listener>()
  private startSec = 0
  private durationSec = 0

  private ensureAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio()
      this.audio.preload = 'none'
      this.audio.addEventListener('timeupdate', this.handleTimeUpdate)
      this.audio.addEventListener('ended', this.handleEnded)
    }
    return this.audio
  }

  private handleTimeUpdate = () => {
    if (!this.audio) return
    const total = Math.max(this.durationSec - this.startSec, 0.001)
    const elapsed = this.audio.currentTime - this.startSec
    this.setState({ progress: Math.min(Math.max(elapsed / total, 0), 1) })
  }

  private handleEnded = () => {
    this.setState({ isPlaying: false, progress: 0, playKey: null })
  }

  private setState(partial: Partial<MusicPlaybackState>) {
    this.state = { ...this.state, ...partial }
    this.listeners.forEach((listener) => listener())
  }

  // Starts (or resumes) playback for `playKey`. Switching to a different key
  // always restarts from `startSec` — this is the "changing preview stops
  // the previous one" behavior, since only one key can ever be active.
  play(playKey: string, previewUrl: string, startSec: number, volume: number, durationSec: number) {
    const audio = this.ensureAudio()
    if (this.state.playKey !== playKey) {
      audio.pause()
      audio.src = previewUrl
      audio.currentTime = startSec
      this.startSec = startSec
      this.durationSec = durationSec
    }
    audio.volume = volume
    audio.play().catch(() => {})
    this.setState({ playKey, isPlaying: true })
  }

  pause() {
    this.audio?.pause()
    this.setState({ isPlaying: false })
  }

  // Full stop: pause, drop the source, reset progress. Called when a
  // playing card leaves the page (unmount) — see useMusicPlayback.
  stop() {
    if (this.audio) {
      this.audio.pause()
      this.audio.src = ''
    }
    this.setState({ playKey: null, isPlaying: false, progress: 0 })
  }

  // Only stops if `playKey` is the one currently active — an unrelated
  // card unmounting must not interrupt whatever else is playing.
  stopIfActive(playKey: string) {
    if (this.state.playKey === playKey) this.stop()
  }

  getState(): MusicPlaybackState {
    return this.state
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

export const musicPlaybackController = new MusicPlaybackController()
