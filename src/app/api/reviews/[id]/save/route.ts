import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 })

  const { data: existing } = await supabase
    .from('review_saves').select('id').eq('review_id', params.id).eq('user_id', user.id).maybeSingle()

  if (existing) {
    await supabase.from('review_saves').delete().eq('id', existing.id)
    return NextResponse.json({ saved: false })
  } else {
    await supabase.from('review_saves').insert({ review_id: params.id, user_id: user.id })
    return NextResponse.json({ saved: true })
  }
}
