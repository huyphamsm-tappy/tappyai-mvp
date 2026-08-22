import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { rebuildProfile } from '@/lib/preferences/profileCache'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  // B17 — an anonymous session is authenticated but is not an account; social writes need one.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  const { data: existing } = await supabase
    .from('review_saves').select('id').eq('review_id', params.id).eq('user_id', user.id).maybeSingle()

  if (existing) {
    const { error } = await supabase.from('review_saves').delete().eq('id', existing.id)
    if (error) return NextResponse.json({ error: 'unsave_failed', message: serverMessage('saved.removeFailed', requestLocale(req)) }, { status: 500 })
    rebuildProfile(user.id, supabase).catch(() => {})
    return NextResponse.json({ saved: false })
  } else {
    const { error } = await supabase.from('review_saves').insert({ review_id: params.id, user_id: user.id })
    if (error) return NextResponse.json({ error: 'save_failed', message: serverMessage('server.saveFailed', requestLocale(req)) }, { status: 500 })
    rebuildProfile(user.id, supabase).catch(() => {})
    return NextResponse.json({ saved: true })
  }
}
