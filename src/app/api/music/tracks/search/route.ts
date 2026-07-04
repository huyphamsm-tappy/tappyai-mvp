import { NextRequest, NextResponse } from 'next/server'
import { parseSearchQuery } from '@/modules/music/api'
import { searchTracks } from '@/modules/music/services/musicService'

// GET /api/music/tracks/search?q=&page=&limit=
export async function GET(req: NextRequest) {
  const filter = parseSearchQuery(req.nextUrl.searchParams)
  const result = await searchTracks(filter)
  return NextResponse.json(result)
}
