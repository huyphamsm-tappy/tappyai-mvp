import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// POST /api/notifications/subscribe — upsert a Web Push subscription for the current user
export async function POST(req: Request) {
  try {
    const { user, supabase } = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

    // ── ANONYMOUS SESSIONS MAY NOT REGISTER A DEVICE ─────────────────────────
    //
    // 🚨 THIS IS THE ONLY PATH THAT CREATES AN ENABLED SUBSCRIPTION. Audited on
    // `ff419cd`: every other writer to `notification_subscriptions` either reads
    // it or sets `enabled = false` (the dead-endpoint prune in `send.ts`, the
    // disown in DELETE). So this one line is where the whole population comes
    // from, and closing it closes creation entirely.
    //
    // WHY IT MATTERS FOR BROADCAST. The audience excludes accounts with no
    // `profiles` row, which is how anonymous identities are recognised since
    // `20260808c` — the signup trigger stops creating profiles for them. But
    // that migration deleted nothing, so an anonymous account created BEFORE
    // 2026-08-08 still holds a profile and would pass the audience filter. The
    // authoritative signal, `auth.users.is_anonymous`, is unreachable from
    // PostgREST, which is why the audience uses a proxy at all.
    //
    // ⚠️ PREVENTIVE, NOT CURATIVE — and the difference matters. This guarantees
    // no NEW anonymous claim can be created. It does not remove one that already
    // exists. Production measured 1 enabled subscription, belonging to a real
    // authenticated account, so the legacy set is currently empty — but "empty
    // today" is a measurement, not an invariant, and only a read of
    // `auth.users` could prove it stays that way.
    //
    // 🔑 DELETE IS DELIBERATELY NOT GUARDED. It only ever sets `enabled = false`.
    // Refusing an anonymous caller there would strand a claim rather than
    // protect anything — the opposite of the point.
    const anonRefusal = refuseAnonymousSocialWrite(req, user)
    if (anonRefusal) return anonRefusal

    const body = await req.json()

    // Two transports, one contract. `notification_subscriptions` was created with a `provider`
    // column and a JSON payload for exactly this, so Android's FCM token registers here rather
    // than through a second endpoint with its own auth. The provider comes from the request; the
    // USER always comes from the verified session, never from the body.
    let provider: string
    let subscription_data: Record<string, unknown>

    if (body?.provider === 'fcm') {
      const { token } = body
      // Treated as a bounded opaque string: never parsed, never trusted for identity, only stored.
      // The bounds exist so a client cannot use this row as arbitrary storage.
      if (
        typeof token !== 'string' ||
        token.length < 20 ||
        token.length > 4096 ||
        !/^[A-Za-z0-9_:.\-]+$/.test(token)
      ) {
        return NextResponse.json({ error: 'invalid_input', message: serverMessage('notif.invalidSubscription', requestLocale(req)) }, { status: 400 })
      }
      provider = 'fcm'
      subscription_data = { token }
    } else {
      const { endpoint, keys } = body
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return NextResponse.json({ error: 'invalid_input', message: serverMessage('notif.invalidSubscription', requestLocale(req)) }, { status: 400 })
      }
      provider = 'webpush'
      subscription_data = { endpoint, keys }
    }

    const { error } = await supabase
      .from('notification_subscriptions')
      .upsert(
        {
          user_id: user.id,
          provider,
          subscription_data,
          enabled: true,
        },
        { onConflict: 'user_id,provider' }
      )

    if (error) {
      // Code and message only — NEVER the whole error object. A unique-violation
      // from notification_subscriptions_one_owner_per_credential carries the
      // offending key in `details`, and that key IS the push credential.
      console.error('[subscribe] Upsert error:', error.code ?? error.message)
      return NextResponse.json({ error: 'save_failed', message: serverMessage('notif.saveFailed', requestLocale(req)) }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[subscribe] Error:', e)
    return NextResponse.json({ error: 'server_error', message: serverMessage('server.error', requestLocale(req)) }, { status: 500 })
  }
}

// DELETE /api/notifications/subscribe — disable the subscription for the current user
//
// Body: { provider?: 'webpush' | 'fcm' }, defaulting to 'webpush'.
//
// 🚨 THE FILTER STAYS. Before this, DELETE was hard-wired to 'webpush', so an
// Android FCM row could never be switched off through the app at all. The fix is
// to make the provider selectable — NOT to drop the filter: without it, turning
// push off on the web would silently switch off the same person's Android
// notifications, which nothing in the UI says it does.
//
// The default keeps a client that sends no body behaving exactly as it did.
//
// It also accepts `credential`, and both client call sites now send it:
//
//   { provider?: 'webpush' | 'fcm', credential?: string }
//
// 🔑 WHY THE CREDENTIAL MATTERS HERE. One account holds at most one webpush row
// (UNIQUE(user_id, provider)). If somebody subscribed on a second browser
// afterwards, that row points at the OTHER device while this browser still holds
// a stale local subscription — and a provider-only DELETE from here would switch
// off push on the device they are still using. Naming the credential makes the
// statement say what it means: release THIS device.
//
// It stays OPTIONAL rather than required, deliberately. Somebody who cleared
// site data no longer has a credential to name, and making it mandatory would
// leave them permanently unable to switch their own stale row off through the
// app. Absent, the old provider-scoped behaviour applies.
//
// 🚨 The credential NARROWS; it never widens. `user_id = <session>` is applied
// first and unconditionally, so no body can reach another account's row — the
// same rule POST already pins.
export async function DELETE(req: Request) {
  try {
    const { user, supabase } = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

    // The provider names a TRANSPORT, never an identity — the user still comes
    // from the verified session, exactly as in POST.
    const body = await req.json().catch(() => null)
    const requested = body?.provider
    if (requested !== undefined && requested !== 'webpush' && requested !== 'fcm') {
      return NextResponse.json({ error: 'invalid_input', message: serverMessage('notif.invalidSubscription', requestLocale(req)) }, { status: 400 })
    }
    const provider = requested ?? 'webpush'

    const rawCredential = body?.credential
    if (
      rawCredential !== undefined &&
      (typeof rawCredential !== 'string' || !rawCredential.trim() || rawCredential.length > 4096)
    ) {
      return NextResponse.json({ error: 'invalid_input', message: serverMessage('notif.invalidSubscription', requestLocale(req)) }, { status: 400 })
    }
    const credential = typeof rawCredential === 'string' ? rawCredential.trim() : null

    let query = supabase
      .from('notification_subscriptions')
      .update({ enabled: false })
      .eq('user_id', user.id)
      .eq('provider', provider)

    if (credential) {
      // Where the credential lives differs by transport, which is exactly why
      // the provider is resolved first.
      query = query.eq(
        provider === 'fcm' ? 'subscription_data->>token' : 'subscription_data->>endpoint',
        credential,
      )
    }

    const { error } = await query

    if (error) {
      console.error('[subscribe] Disable error:', error.code ?? error.message)
      return NextResponse.json({ error: 'disable_failed', message: serverMessage('notif.disableFailed', requestLocale(req)) }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[subscribe] Error:', e)
    return NextResponse.json({ error: 'server_error', message: serverMessage('server.error', requestLocale(req)) }, { status: 500 })
  }
}
