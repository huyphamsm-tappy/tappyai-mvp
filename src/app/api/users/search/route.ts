import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Best-effort in-memory rate limit: 30 searches / 60s / IP — throttles enumeration
// brute-force while leaving normal friend-search UX untouched. Same inline pattern
// as the reviews route (no shared framework).
const searchRL = new Map<string, { windowStart: number; count: number }>()
function checkSearchRL(ip: string): boolean {
  const now = Date.now()
  const e = searchRL.get(ip)
  if (!e || now - e.windowStart > 60_000) { searchRL.set(ip, { windowStart: now, count: 1 }); return true }
  if (e.count >= 30) return false
  e.count++
  return true
}

// GET /api/users/search?q=...
// Search users by name (partial), or by EXACT email / phone.
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkSearchRL(ip)) return NextResponse.json({ error: 'Bạn tìm kiếm quá nhanh, thử lại sau chút nhé' }, { status: 429 })

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ users: [] })

  const isEmail = q.includes('@')
  const isPhone = /^[\d\s\+\-\(\)]{8,}$/.test(q)
  let matchedIds: string[] = []

  // Email/phone search uses admin API — only runs if SUPABASE_SERVICE_ROLE_KEY is configured
  if ((isEmail || isPhone) && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const admin = createAdminClient()
      const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 200 })
      if (authUsers?.users) {
        // EXACT match on email/phone (not substring) so a partial value like
        // "gmail.com" can't enumerate users — you must know the full address/number.
        const clean = q.replace(/\D/g, '')
        matchedIds = authUsers.users
          .filter(u => {
            if (isEmail) return u.email?.toLowerCase() === q.toLowerCase()
            return !!u.phone && u.phone.replace(/\D/g, '') === clean
          })
          .map(u => u.id)
          .filter(id => id !== user.id)
          .slice(0, 20)
      }
    } catch {
      // Admin unavailable — falls back to name-only search
    }
  }

  // Name search uses regular client (profiles table needs public SELECT policy in Supabase)
  const { data: nameResults } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, follower_count, following_count')
    .ilike('full_name', `%${q}%`)
    .neq('id', user.id)
    .limit(20)

  const nameIds = (nameResults || []).map(p => p.id)
  const allIds = [...new Set([...matchedIds, ...nameIds])]
  if (allIds.length === 0) return NextResponse.json({ users: [] })

  const { data: profiles } = await supabase
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
  const users = profiles.map(p => ({ ...p, is_following: followingSet.has(p.id) }))
  return NextResponse.json({ users })
}
