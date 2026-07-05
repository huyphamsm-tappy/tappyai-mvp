import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const groupId = params.id
  if (!groupId) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Auth required — joining writes member data (budget/dietary/area) into a
  // group and must be attributed to the caller. Anonymous joins are rejected.
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 })

  let name: string, budget: string, food_preferences: string, dietary_restrictions: string, area: string
  try {
    const body = await req.json()
    name = (body.name || '').trim()
    budget = (body.budget || '').trim()
    food_preferences = (body.food_preferences || '').trim()
    dietary_restrictions = (body.dietary_restrictions || '').trim()
    area = (body.area || '').trim()
    if (!name || !area) throw new Error('missing fields')
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  }

  const { count } = await supabase
    .from('group_members')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId)

  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: 'Nhóm đã đầy (tối đa 10 người)' }, { status: 400 })
  }

  const { error } = await supabase
    .from('group_members')
    .insert({ group_id: groupId, user_id: user.id, name, budget, food_preferences, dietary_restrictions, area })

  if (error) {
    // Unique (group_id, user_id) violation → already a member; treat as success.
    if (error.code === '23505') return NextResponse.json({ ok: true, alreadyJoined: true })
    return NextResponse.json({ error: 'Không thể tham gia nhóm' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
