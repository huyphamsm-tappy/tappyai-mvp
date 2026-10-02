import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { searchParam } from '@/lib/http/searchParams'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { isServableMediaUrl } from '@/lib/media/servableMedia'

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

  // S-1. Read through the service role, keyed by the id the caller supplied.
  //
  // The share link IS the capability — `/group/{uuid}` is what the page tells
  // the creator to send — and this route has always been the way a link holder
  // reads the group. What it used to rely on was the RLS policy
  // `"Anyone can read group members" USING (true)`, and that policy could not
  // tell "asked for one id" from "asked for every row": with the PUBLIC anon
  // key it also served `GET /rest/v1/group_members?select=*`, i.e. every
  // member's name, area, budget and dietary restrictions, platform-wide, to
  // anyone. 20260904_group_read_boundary.sql closes that path.
  //
  // So the capability moves to where it can be checked — a UUID this handler
  // requires and filters on — instead of a policy that granted it to everyone.
  // Both reads below are pinned to that single id; nothing here can enumerate.
  const supabase = createAdminClient()

  const { data: group, error: groupError } = await supabase
    .from('groups')
    // `avatar_url`: the group's own picture (20260922_groups_avatar_url), set by the creator
    // through POST /api/group/[id]/avatar. Only a servable URL leaves — a retired-host URL
    // would render as a broken image on every member's screen.
    .select('id, name, creator_id, status, suggestion, created_at, avatar_url')
    .eq('id', id)
    .single()

  if (groupError || !group) return NextResponse.json({ error: 'group_not_found', message: serverMessage('group.notFound', requestLocale(req)) }, { status: 404 })
  group.avatar_url = isServableMediaUrl(group.avatar_url) ? group.avatar_url : null

  const { data: members } = await supabase
    .from('group_members')
    .select('id, name, budget, food_preferences, dietary_restrictions, area, created_at')
    .eq('group_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ ...group, members: members || [] })
}
