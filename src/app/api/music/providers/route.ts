import { NextResponse } from 'next/server'
import { getProviders } from '@/modules/music/services/musicService'

// GET /api/music/providers
export async function GET() {
  const providers = await getProviders()
  return NextResponse.json({ providers })
}
