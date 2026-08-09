import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { rateLimit, clientIp } from '@/lib/security/rateLimit'

// POST /api/auth/claim-anonymous — carry an anonymous session's conversations into the
// account the user just signed into.
//
// CONTRACT
//   Authorization: Bearer <access token of the NEWLY AUTHENTICATED account>
//   body: { "anonymous_access_token": "<access token of the OLD anonymous session>" }
//   200  { ok: true, moved: <number of conversations transferred> }
//
// The client never sends a user id. Both identities are resolved server-side from tokens
// verified against Supabase Auth, and only then handed to a service-role RPC. See
// supabase/migrations/20260808b_anon_claim_conversations.sql for why that RPC may take
// uuids as parameters without repeating the BL-C7-01 mistake.
//
// WHY THE ANONYMOUS TOKEN IS THE CAPABILITY
// The anonymous identity cannot be asserted by id — anyone could name someone else's uuid.
// Requiring the anonymous ACCESS TOKEN makes the claim a proof of possession: you can only
// carry over a session you actually held. This is what stops a signed-in user from
// harvesting an unrelated anonymous user's conversations.
//
// IDEMPOTENT. The transfer is a single UPDATE keyed on the anonymous uid; replaying the
// call moves 0 rows. Safe to retry after a crash or a lost response — which the Android
// client relies on, since it persists the pending claim until it succeeds.
export async function POST(req: NextRequest) {
  // Cheap flood guard. A claim is a once-per-sign-in action; anything faster is abuse or a
  // retry storm. Keyed by IP because the caller's identity is not yet established here.
  const flood = rateLimit(`claim-anon:${clientIp(req)}`, 10, 60_000)
  if (!flood.ok) {
    return NextResponse.json(
      { error: 'rate_limit' },
      { status: 429, headers: { 'Retry-After': String(flood.retryAfter) } },
    )
  }

  // 1. The claiming (target) identity — verified by the shared Bearer pipeline.
  const { user: target } = await getRequestUser(req)
  if (!target) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  // Claiming INTO an anonymous session would let one anonymous identity absorb another's
  // history, which is exactly the cross-user claim this endpoint exists to prevent.
  if (target.is_anonymous) {
    return NextResponse.json({ error: 'target_not_authenticated' }, { status: 403 })
  }

  // 2. The anonymous (source) identity — verified independently, never trusted from a body
  //    field. A malformed/expired/revoked token resolves to no user and is rejected here.
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const anonToken = (body as { anonymous_access_token?: unknown } | null)?.anonymous_access_token
  if (typeof anonToken !== 'string' || anonToken.length === 0) {
    return NextResponse.json({ error: 'anonymous_token_required' }, { status: 400 })
  }

  const verifier = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { data: anonData, error: anonErr } = await verifier.auth.getUser(anonToken)
  const source = anonData?.user
  if (anonErr || !source) {
    // Covers malformed, expired and revoked tokens alike. The reason is deliberately not
    // echoed back — it would let a caller probe token validity.
    return NextResponse.json({ error: 'invalid_anonymous_token' }, { status: 401 })
  }
  if (!source.is_anonymous) {
    // A real account's token is not a claimable anonymous session; allowing it would turn
    // this endpoint into an account-merge primitive nobody designed or reviewed.
    return NextResponse.json({ error: 'source_not_anonymous' }, { status: 403 })
  }
  if (source.id === target.id) {
    return NextResponse.json({ error: 'same_identity' }, { status: 400 })
  }

  // 3. Transfer. Both uuids come from tokens this route verified; none came from the body.
  try {
    const admin = createAdminClient()
    const { data: moved, error } = await admin.rpc('fn_claim_anonymous_conversations', {
      p_anon_id: source.id,
      p_target_id: target.id,
    })
    if (error) {
      // Log the code only — never the tokens, never conversation content.
      console.error('[auth/claim-anonymous] rpc failed:', error.code, error.message)
      return NextResponse.json({ error: 'claim_failed' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, moved: typeof moved === 'number' ? moved : 0 })
  } catch (e) {
    console.error('[auth/claim-anonymous]', e instanceof Error ? e.message : 'unknown error')
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
