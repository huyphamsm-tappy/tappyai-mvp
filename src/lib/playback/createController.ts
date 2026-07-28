import type { PlaybackController } from './types'
import { YouTubeController } from './YouTubeController'
import { UploadCompatAdapter, type LegacyUploadHandle } from './UploadCompatAdapter'

/**
 * The ONE place provider knowledge is permitted (architecture v3 §9).
 *
 * The Feed never reaches here — it only ever holds a PlaybackSession. Adding a
 * provider (Vimeo, TikTok, …) means adding a controller and one case below; no
 * Feed changes are required.
 */
export interface ControllerDeps {
  sourceType?: string
  getFrame: () => HTMLIFrameElement | null
  getLegacyUploadHandle: () => LegacyUploadHandle | null
}

export function createController({ sourceType, getFrame, getLegacyUploadHandle }: ControllerDeps): PlaybackController {
  if (sourceType === 'youtube') return new YouTubeController(getFrame)
  // Everything else is served by the legacy <video> path today (uploads, and the
  // legacy poster branch which simply never receives transport commands).
  return new UploadCompatAdapter(getLegacyUploadHandle)
}
