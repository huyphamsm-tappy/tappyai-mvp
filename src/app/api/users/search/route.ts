import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/users/search?q=...
// Search users by name, email, or phone
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Can dang nhap truoc' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ users: [] })

  const admin = createAdminClient()

  const isEmail = q.includes('@')
  const isPhone = /^[\d\s\+\-\(\)]{8,}$/.test(q)

  let matchedIds: string[] = []

  if (isEmail || isPhone) {
    const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 200 })
    if (authUsers?.users) {
      matchedIds = authUsers.users
        .filter(u => {
          if (isEmail) return u.email?.toLowerCase().includes(q.toLowerCase())
          if (isPhone) {
            const clean = q.replace(/\D/g, '')
            return u.phone?.replace(/\D/g, '').includes(clean)
          }
          return false
        })
        .map(u => u.id)
        .filter(id => id !== user.id)
        .slice(0, 20)
    }
  }

  const { data: nameResults } = await admin
    .from('profiles')
    .select('id, full_name, avatar_url, follower_count, following_count')
    .ilike('full_name', `%${q}%`)
    .neq('id', user.id)
    .limit(20)

  const nameIds = (nameResults || []).map(p => p.id)
  const allIds = [...new Set([...matchedIds, ...nameIds])]

  if (allIds.length === 0) return NextResponse.json({ users: [] })

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, avatar_url, follower_count, following_count')
    .in('id', allIds)
    .limit(30)

  if (!profiles || profiles.length === 0) return NextResponse.json({ users: [] })

  const { data: followRows } = await supabase
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', user.id)
    .in('following_id', profiles.map(p => p.id))

  const followingSet = new Set((followRows || []).map(r => r.following_id))

  const users = profiles.map(p => ({
    ...p,
    is_following: followingSet.has(p.id),
  }))

  return NextResponse.json({ users })
}
