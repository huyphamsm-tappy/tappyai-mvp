import { createClient } from '@/lib/supabase/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { searchParam } from '@/lib/http/searchParams'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'

export async function POST(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  // B17 — an anonymous session is authenticated but is not an account; social writes need one.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  let name: string
  try {
    const body = await req.json()
    name = (body.name || '').trim()
    if (!name) throw new Error('missing name')
  } catch {
    return NextResponse.json({ error: 'invalid_name', message: serverMessage('group.invalidName', requestLocale(req)) }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('groups')
    .insert({ name, creator_id: user.id })
    .select('id, name')
    .single()

  if (error) return NextResponse.json({ error: 'create_failed', message: serverMessage('group.createFailed', requestLocale(req)) }, { status: 500 })
  return NextResponse.json(data)
}

export async function GET(req: NextRequest) {
  const id = searchParam(req, 'id')
  if (!id) return NextResponse.json({ error: 'missing_fields', message: serverMessage('validation.missingFields', requestLocale(req)) }, { status: 400 })

  const supabase = createClient()

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, name, creator_id, status, suggestion, created_at')
    .eq('id', id)
    .single()

  if (groupError || !group) return NextResponse.json({ error: 'group_not_found', message: serverMessage('group.notFound', requestLocale(req)) }, { status: 404 })

  const { data: members } = await supabase
    .from('group_members')
    .select('id, name, budget, food_preferences, dietary_restrictions, area, created_at')
    .eq('group_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ ...group, members: members || [] })
}
