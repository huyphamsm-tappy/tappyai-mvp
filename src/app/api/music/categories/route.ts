// F-024 — music reuse removed. This endpoint powered the "use this sound" path (browse a
// sound, save/follow it, upload a reusable track, or attach one to a clip). The whole path is
// withdrawn; every method answers 410 Gone. A clip still plays its OWN audio, which never used
// this route. Deletion of the already-collected music rows is deferred to the owner.
import { gone } from '@/lib/http/gone'

export function GET() { return gone('music-reuse:categories') }
