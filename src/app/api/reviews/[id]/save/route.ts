import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { rebuildProfile } from '@/lib/preferences/profileCache'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Can dang nhap' }, { status: 401 })

  const { data: existing } = await supabase
    .from('review_saves').select('id').eq('review_id', params.id).eq('user_id', user.id).maybeSingle()

  if (existing) {
    await supabase.from('review_saves').delete().eq('id', existing.id)
    rebuildProfile(user.id, supabase).catch(() => {})
    return NextResponse.json({ saved: false })
  } else {
    await supabase.from('review_saves').insert({ review_id: params.id, user_id: user.id })
    rebuildProfile(user.id, supabase).catch(() => {})
    return NextResponse.json({ saved: true })
  }
}
