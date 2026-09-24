import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { createGraphZaloVerifier } from '@/lib/zalo/identity'

function originOf(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}`
}

// POST — finishes Zalo login.
//
// ── R-1 (2026-09-24): THE ACCOUNT IS DECIDED BY THE TOKEN, NEVER BY THE BODY ──
//
// 🚨 WHAT THIS ROUTE USED TO DO. It read `zaloId` from the request body and minted a Supabase
// magic link for `zalo_<zaloId>@zalo.tappyai.com`. The `zalo_at` cookie proved the CALLER had
// completed a Zalo login — it proved nothing about WHICH account they asked for. Any user who
// logged in with their own Zalo account could post somebody else's id and receive a working
// magic link for that person's TappyAI account. That is account takeover, and the cookie gate
// did not narrow it: the two checks answer different questions.
//
// The comment that stood here argued Zalo ids are "app-scoped (not public), so they can't be
// used to impersonate another user". App-scoping is not authorization. The id is handed to our
// own client on every login, so every user already holds at least their own, and any leak of
// one (a log, a support ticket, a shared payload) is a leak of that account. Secrecy of an
// identifier is not a control; binding the identifier to the credential is.
//
// 🔑 THE ID NOW COMES FROM ZALO. The access token in the httpOnly `zalo_at` cookie — the one
// only a caller that performed the server-side code exchange can hold — is resolved through
// `graph.zalo.me/v2.0/me` by the shared `createGraphZaloVerifier`, the same verifier the Mini
// App boundary uses. The body no longer carries an id at all, so there is nothing to forge.
//
// 🚨🚨 DEPLOYMENT CONSEQUENCE, STATED NOT BURIED. `graph.zalo.me/v2.0/me` answers only to
// VIETNAM IP addresses; from a US region it returns error -501. That restriction is exactly why
// the profile fetch was pushed to the user's browser in the first place (see the note in
// `api/auth/zalo/callback/route.ts`). So on a US deployment this route now answers 503
// `verification_unavailable` and ZALO LOGIN STOPS WORKING — it does not silently fall back to
// trusting the client, because that fallback IS the vulnerability. Making Zalo login work again
// requires resolving `/me` from a Vietnam egress; that is an owner infrastructure decision, the
// same one already recorded in `src/lib/zalo/identity.ts`. Nothing here can substitute for it:
// the token is opaque, and no other Zalo endpoint returns the id.
//
// `name` and `avatar` are still read from the body. They are DISPLAY fields written to the
// freshly created user's metadata, never identity: they select no account and grant no access,
// and the worst a caller can do with them is give their own new account a misleading name.
export async function POST(req: NextRequest) {
  const origin = originOf(req)
  const at = req.cookies.get('zalo_at')?.value
  if (!at) return NextResponse.json({ error: 'no_session' }, { status: 401 })

  let name: string, avatar: string | null, next: string, platform: 'ios' | 'android' | 'web'
  try {
    const b = await req.json()
    name = (String(b.name || '').trim()) || 'Người dùng Zalo'
    avatar = b.avatar ? String(b.avatar) : null
    next = typeof b.next === 'string' && b.next.startsWith('/') && !b.next.startsWith('//') ? b.next : '/'
    platform = b.platform === 'ios' ? 'ios' : b.platform === 'android' ? 'android' : 'web' // strict allowlist
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const clear = (res: NextResponse) => { res.cookies.delete('zalo_at'); return res }

  // Resolve the identity BEFORE touching Supabase, and fail closed on every outcome that is not
  // a confirmed id. `verify` returns null for a token Zalo rejects and THROWS when it cannot
  // answer at all (network, HTTP error, or the -501 region restriction) — the two are different
  // answers and must not collapse into one.
  let zaloId: string
  try {
    const resolved = await createGraphZaloVerifier().verify(at)
    if (!resolved) return clear(NextResponse.json({ error: 'invalid_token' }, { status: 401 }))
    zaloId = resolved
  } catch (e) {
    console.error('[auth/zalo/complete] identity verification unavailable:', e instanceof Error ? e.message : e)
    return clear(NextResponse.json({ error: 'verification_unavailable' }, { status: 503 }))
  }

  try {
    const supabase = createAdminClient()
    const zaloEmail = `zalo_${zaloId}@zalo.tappyai.com`

    // Ensure user exists — attempt to create; if the email is already registered
    // Supabase returns a "already been registered" message, which we treat as
    // success. This avoids a full listUsers scan that breaks beyond 1000 users.
    const { error: createErr } = await supabase.auth.admin.createUser({
      email: zaloEmail,
      email_confirm: true,
      user_metadata: { zalo_id: zaloId, full_name: name, avatar_url: avatar, provider: 'zalo' },
    })
    if (createErr && !createErr.message?.toLowerCase().includes('already')) {
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
