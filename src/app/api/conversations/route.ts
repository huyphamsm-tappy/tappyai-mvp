import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.from('conversations').select('id, title, category, updated_at, messages').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { title, category, messages } = await req.json()
  const { data, error } = await supabase.from('conversations').insert({ user_id: user.id, title: title || 'Cuộc trò chuyện mới', category: category || 'general', messages: messages || [] }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: Request) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, title, messages } = await req.json()
  const { data, error } = await supabase.from('conversations').update({ title, messages, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// Lets the user erase their own chat history (MFS 6.5 History: private, controllable,
// and erasable). Scoped to the owner by user_id (defence-in-depth beyond RLS).
export async function DELETE(req: Request) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let id = new URL(req.url).searchParams.get('id')
  if (!id) { try { id = (await req.json())?.id } catch { /* no body */ } }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('conversations').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
