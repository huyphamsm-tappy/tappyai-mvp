// F-024 — music reuse removed. This spinning disc opened the sound page ("use this sound"); that
// path is withdrawn, so it renders nothing. Inert stub to avoid touching every feed render site.
export default function ReviewMusicDisc(_props: { trackId?: string | null; onTap?: (trackId: string) => void }) {
  return null
}
