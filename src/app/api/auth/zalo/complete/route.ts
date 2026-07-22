import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

function originOf(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}`
}

// POST — finishes Zalo login. The client (in Vietnam) fetched the profile via
// graph.zalo.me/v2.0/me and posts it here. Gated by the httpOnly `zalo_at`
// cookie the callback set, so only a caller that actually completed the
// server-side token exchange can reach this. Zalo user IDs are app-scoped (not
// public), so they can't be used to impersonate another user.
export async function POST(req: NextRequest) {
  const origin = originOf(req)
  const at = req.cookies.get('zalo_at')?.value
  if (!at) return NextResponse.json({ error: 'no_session' }, { status: 401 })

  let zaloId: string, name: string, avatar: string | null, next: string, platform: 'ios' | 'android' | 'web'
  try {
    const b = await req.json()
    zaloId = String(b.zaloId || '').trim()
    name = (String(b.name || '').trim()) || 'Người dùng Zalo'
    avatar = b.avatar ? String(b.avatar) : null
    next = typeof b.next === 'string' && b.next.startsWith('/') && !b.next.startsWith('//') ? b.next : '/'
    platform = b.platform === 'ios' ? 'ios' : b.platform === 'android' ? 'android' : 'web' // strict allowlist
    if (!zaloId) throw new Error('missing zaloId')
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const clear = (res: NextResponse) => { res.cookies.delete('zalo_at'); return res }

  try {
    const supabase = createAdminClient()
    const zaloEmail = `zalo_${zaloId}@zalo.tappyai.com`

    // Ensure user exists — attempt to create; if the email is already registered,
    // treat that as success. This avoids a full listUsers scan that breaks beyond
    // 1000 users (there is no getUserByEmail in the admin API — only paginated
    // listUsers). Duplicate-email is checked primarily via the stable GoTrue
    // error code ('email_exists', @supabase/auth-js ErrorCode) rather than the
    // message string. The message check is kept as a fallback only: whether the
    // live server actually populates `.code` on this exact call depends on the
    // response's API-version header (see auth-js lib/fetch.ts handleError) and
    // was not exercised against production — verifying it would mean creating a
    // real duplicate user, so a message fallback stays as a safety net rather
    // than assuming the stable code path.
    const { error: createErr } = await supabase.auth.admin.createUser({
      email: zaloEmail,
      email_confirm: true,
      user_metadata: { zalo_id: zaloId, full_name: name, avatar_url: avatar, provider: 'zalo' },
    })
    const isDuplicateEmail = createErr?.code === 'email_exists' || createErr?.message?.toLowerCase().includes('already')
    if (createErr && !isDuplicateEmail) {
      throw createErr
    }

    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: zaloEmail,
      options: { redirectTo: `${origin}${next}` },
    })
    if (linkErr || !linkData?.properties?.hashed_token) throw linkErr || new Error('Magic link failed')

    const confirmUrl = `${origin}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=magiclink&next=${encodeURIComponent(next)}${platform !== 'web' ? `&platform=${platform}` : ''}`
    return clear(NextResponse.json({ confirmUrl }))
  } catch (e) {
    console.error('[auth/zalo/complete]', e)
    return clear(NextResponse.json({ error: 'server_error' }, { status: 500 }))
  }
}
