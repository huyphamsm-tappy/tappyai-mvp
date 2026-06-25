import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const PROVIDERS = ['google_calendar', 'zalo']

// GET /api/integrations → list all integrations (connected or not) for current user
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 })

  const { data: rows } = await supabase
    .from('user_integrations')
    .select('provider, metadata, connected_at, expires_at')
    .eq('user_id', user.id)
    .in('provider', PROVIDERS)

  const connectedMap = new Map((rows ?? []).map(r => [r.provider, r]))

  const integrations = PROVIDERS.map(provider => {
    const row = connectedMap.get(provider)
    return {
      provider,
      connected: !!row,
      metadata: row?.metadata ?? null,
      connected_at: row?.connected_at ?? null,
    }
  })

  return NextResponse.json({ integrations })
}
