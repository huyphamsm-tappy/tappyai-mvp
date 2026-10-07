import { NextRequest, NextResponse } from 'next/server'
import { parseTracksQuery } from '@/modules/music/api'
import { browseTracks } from '@/modules/music/services/musicService'
import { requestSearchParams } from '@/lib/http/searchParams'
import { gone } from '@/lib/http/gone'

// The catalogue is DATA seeded independently of deploys; never freeze it at build time.
export const dynamic = 'force-dynamic'

// GET /api/music/tracks?categoryId=&page=&limit= — browse the Music LIBRARY.
//
// Phase 7 restored the library half of what F-024 retired. The repository serves
// only `music_type IN ('royalty_free','licensed')`: a curated, licensed track a
// person picks as a soundtrack. A user's clip audio (`original_sound`) is never
// listed here — "use this sound" stays withdrawn.
export async function GET(req: NextRequest) {
  const filter = parseTracksQuery(requestSearchParams(req))
  const result = await browseTracks(filter)
  return NextResponse.json(result)
}

// POST — publishing a user-owned "Original Sound" (UGC upload) was the reuse
// path and stays withdrawn (F-024). 410, not 404: it existed and was removed.
export function POST() { return gone('music-reuse:tracks') }
