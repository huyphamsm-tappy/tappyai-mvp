export interface MusicTrack {
  id: string
  title: string
  artist: string | null
  durationSec: number
  audioUrl: string
  previewUrl: string | null
  coverUrl: string | null
  categoryId: string | null
  providerId: string
  /** The track's licence as recorded at ingest (e.g. 'CC-BY 3.0'); null when unrecorded. */
  license: string | null
  /** The canonical page to credit/link (CC-BY requires it); null when unrecorded. */
  sourceUrl: string | null
}
