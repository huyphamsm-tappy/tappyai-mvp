import { createClient } from '@/lib/supabase/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let name: string
  try {
    const body = await req.json()
    name = (body.name || '').trim()
    if (!name) throw new Error('missing name')
  } catch {
    return NextResponse.json({ error: 'Tên nhóm không hợp lệ' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('groups')
    .insert({ name, creator_id: user.id })
    .select('id, name')
    .single()

  if (error) return NextResponse.json({ error: 'Không thể tạo nhóm' }, { status: 500 })
  return NextResponse.json(data)
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = createClient()

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, name, creator_id, status, suggestion, created_at')
    .eq('id', id)
    .single()

  if (groupError || !group) return NextResponse.json({ error: 'Không tìm thấy nhóm' }, { status: 404 })

  const { data: members } = await supabase
    .from('group_members')
    .select('id, name, budget, food_preferences, dietary_restrictions, area, created_at')
    .eq('group_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ ...group, members: members || [] })
}
