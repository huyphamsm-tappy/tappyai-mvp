// F-024 — music reuse removed. This sheet was the sound detail / "use this sound" surface (play,
// save, follow, browse clips using a sound); the whole reuse path is withdrawn, so it renders
// nothing and its callers close immediately. Inert stub kept so render sites need no change.
import { useEffect } from 'react'

export default function SoundSheet({ onClose }: { trackId: string; onClose: () => void }) {
  useEffect(() => { onClose() }, [onClose])
  return null
}
