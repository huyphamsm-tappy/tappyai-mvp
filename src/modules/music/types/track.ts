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
}
