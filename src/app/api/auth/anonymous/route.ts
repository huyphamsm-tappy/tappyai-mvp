import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, dailyRateLimit, clientIp } from '@/lib/security/rateLimit'

// POST /api/auth/anonymous — mint an anonymous session.
//
// STABLE CONTRACT (all clients; iOS decode tests lock this exact shape):
//   { "access_token": "...", "refresh_token": "...",
//     "anonymous_id": "...", "expires_at": <epoch seconds> }
//
// The implementation behind it is deliberately opaque to clients: today it is
// Supabase Anonymous Auth (a real auth.users row with is_anonymous=true, so the
// token flows through the SAME Bearer pipeline as logged-in users —
// getRequestUser needs no special case). If we ever swap to custom JWTs or an
// internal identity service, the contract above must not change.
//
// anonymous_id is the server-issued identity the backend keys anonymous state
// on (e.g. the chat daily quota). Clients only store and resend the tokens —
// they never compute or send quota information.
export async function POST(req: NextRequest) {
  // Each call mints a new identity (an auth.users row) — cap creation per IP so
  // a flood can't mass-mint identities to dodge quotas or bloat the user table.
  // Legit clients call this once and refresh the same session thereafter.
  const ip = clientIp(req)
  const flood = rateLimit(`anon-session:${ip}`, 5, 60_000)
  if (!flood.ok) {
    return NextResponse.json(
      { error: 'rate_limit', message: 'Vui lòng thử lại sau giây lát.' },
      { status: 429, headers: { 'Retry-After': String(flood.retryAfter) } },
    )
  }
  if (!dailyRateLimit(`anon-session-day:${ip}`, 30).ok) {
    return NextResponse.json(
      { error: 'rate_limit', message: 'Vui lòng thử lại vào ngày mai.' },
      { status: 429 },
    )
  }

  try {
    // Fresh, non-persisting anon-key client — this route only mints sessions.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error || !data.session || !data.user) {
      // Most likely cause: "Allow anonymous sign-ins" disabled in the Supabase
      // project settings. Log the real reason; clients get a stable error code.
      console.error('[auth/anonymous] sign-in failed:', error?.message)
      return NextResponse.json({ error: 'anonymous_unavailable' }, { status: 503 })
    }

    return NextResponse.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      anonymous_id: data.user.id,
      // Epoch seconds (Supabase's native unit) — iOS decodes with
      // Date(timeIntervalSince1970:).
      expires_at: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    })
  } catch (e) {
    console.error('[auth/anonymous]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
