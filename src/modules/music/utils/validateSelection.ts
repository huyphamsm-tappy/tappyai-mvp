import type { MusicSelection } from '../types/selection'

export function validateSelection(selection: MusicSelection): boolean {
  const { trackId, startSec, volume } = selection
  if (!trackId || trackId.trim().length === 0) return false
  if (!Number.isFinite(startSec) || startSec < 0) return false
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) return false
  return true
}
