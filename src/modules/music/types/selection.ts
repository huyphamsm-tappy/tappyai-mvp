// Frozen contract: additive/optional-only going forward. Consuming features
// persist this value on their own rows — the Music Module never stores it.
export interface MusicSelection {
  trackId: string
  startSec: number
  volume: number
}
