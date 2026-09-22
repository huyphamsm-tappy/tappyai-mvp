import { NextResponse } from 'next/server'
import { getProviders } from '@/modules/music/services/musicService'

// Providers are seeded DATA; a param-less GET is cached by default (see categories route).
export const dynamic = 'force-dynamic'

// GET /api/music/providers
export async function GET() {
  const providers = await getProviders()
  return NextResponse.json({ providers })
}
