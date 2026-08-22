import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { searchParam } from '@/lib/http/searchParams'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

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
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkSearchRL(ip)) return NextResponse.json({ error: 'rate_limit', message: serverMessage('rate.tooFast', requestLocale(req)) }, { status: 429 })

  const q = searchParam(req, 'q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ users: [] })

  const isEmail = q.includes('@')
  const isPhone = /^[\d\s\+\-\(\)]{8,}$/.test(q)
  let matchedIds: string[] = []

  // Email/phone search uses admin API — only runs if SUPABASE_SERVICE_ROLE_KEY is configured
  if ((isEmail || isPhone) && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const admin = createAdminClient()

      /**
       * 🚨 C03. This used to be a single `listUsers({ perPage: 200 })` — page ONE only. Searching
       * the exact email of account #201 returned nothing, and the UI showed "no results", which
       * is indistinguishable from "that person is not on TappyAI". Measured on production: page 1
       * was already full at 200 users, of which 192 were anonymous — so the real accounts a person
       * would actually search for were mostly beyond the cap.
       *
       * Paging is bounded rather than unbounded: this runs on a user-facing request, and an
       * account base that grows past the ceiling should degrade into "slower to find" rather than
       * "the search endpoint is now a full table scan". The ceiling is generous enough that the
       * bug is gone and small enough that the request stays predictable.
       */
      const PER_PAGE = 200
      const MAX_PAGES = 25 // 5 000 accounts
      const clean = q.replace(/\D/g, '')
      const matches: string[] = []

      for (let page = 1; page <= MAX_PAGES && matches.length < 20; page++) {
        const { data: authUsers } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE })
        const users = authUsers?.users ?? []
        if (users.length === 0) break

        for (const u of users) {
          // EXACT match on email/phone (not substring) so a partial value like
          // "gmail.com" can't enumerate users — you must know the full address/number.
          const hit = isEmail
            ? u.email?.toLowerCase() === q.toLowerCase()
            : !!u.phone && u.phone.replace(/\D/g, '') === clean
          if (hit && u.id !== user.id) matches.push(u.id)
        }
        if (users.length < PER_PAGE) break // last page
      }
      matchedIds = matches.slice(0, 20)
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
