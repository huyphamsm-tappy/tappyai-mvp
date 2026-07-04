import { NextRequest, NextResponse } from 'next/server'
import { parseTracksQuery } from '@/modules/music/api'
import { browseTracks } from '@/modules/music/services/musicService'

// GET /api/music/tracks?categoryId=&page=&limit=
export async function GET(req: NextRequest) {
  const filter = parseTracksQuery(req.nextUrl.searchParams)
  const result = await browseTracks(filter)
  return NextResponse.json(result)
}
