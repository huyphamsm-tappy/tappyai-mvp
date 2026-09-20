// F-024 — music reuse removed. This card was the "use this sound" link (to /sound/[trackId]);
// that path is withdrawn, so it renders nothing. A clip still plays its own audio via the shared
// VideoPlayer. The component is kept as an inert stub so existing render sites need no change.
interface ReviewMusicCardProps { playKey: string; trackId: string; startSec: number; volume: number }

export default function ReviewMusicCard(_props: ReviewMusicCardProps) {
  return null
}
