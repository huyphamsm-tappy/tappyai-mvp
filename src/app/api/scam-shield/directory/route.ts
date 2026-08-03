import { NextResponse } from 'next/server'
import { directory } from '@/lib/scam-shield'

export async function GET() {
  const entities = await directory.getAll()
  return NextResponse.json(
    { entities },
    { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200' } },
  )
}
