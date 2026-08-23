import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { pw, resolveUserLang } from '@/lib/priceWatch/messages'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// STEP 13: user-facing strings are localised through the shared Price Watch
// message layer. The language comes from `profiles.language` — the stored UI
// preference (nullable; NULL means "not set", which resolves to Vietnamese, so
// every existing caller keeps today's behaviour). No new request parameter, no
// client change, no migration.
//
// Auth semantics, user scoping, the 10-watch ceiling, target-price validation,
// persistence, cancellation and every HTTP status code are unchanged.

// GET — list user's price watches
export async function GET(req: Request) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  const lang = await resolveUserLang(supabase, user.id)

  const { data, error } = await supabase
    .from('price_watches')
    .select('id, product_name, target_price, current_price, status, last_checked, notified_at, created_at')
    .eq('user_id', user.id)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) { console.error('[price-watch]', error); return NextResponse.json({ error: 'server_error', message: pw.dbError(lang) }, { status: 500 }) }
  return NextResponse.json({ watches: data })
}

// POST — create a new price watch
export async function POST(req: Request) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  // 🚨 F03 — a price watch is not an inert private row, and that is why it is refused here while
  // favourites, bookings and preferences are not. Every active watch is picked up by the daily
  // `/api/cron/price-check` worker, which spends a paid Serper search AND a paid model call on it,
  // every day, until it triggers or is cancelled. Anonymous identities are mintable without limit
  // and the per-identity ceiling is 10, so the cost has no upper bound — and because the worker
  // orders by `last_checked` with `nullsFirst: true`, freshly created watches go to the FRONT of
  // its 100-row daily budget, displacing real users' watches rather than merely adding to them.
  //
  // 🔑 Before the body is read and before any query runs, so a refused call creates no row, no
  // scheduled work and no upstream spend. Moving it below the insert would make the guard a
  // formality — `priceWatchAccess.test.ts` mutation-tests exactly that.
  const refusal = refuseAnonymousSocialWrite(req, user)
  if (refusal) return refusal
  const lang = await resolveUserLang(supabase, user.id)

  const { product_name, target_price, search_query } = await req.json()
  if (!product_name || !target_price || !search_query) {
    return NextResponse.json({ error: 'missing_fields', message: pw.missingFields(lang) }, { status: 400 })
  }

  // Max 10 active watches per user
  const { count } = await supabase
    .from('price_watches')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'active')

  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: 'limit_reached', message: pw.limitReached(lang) }, { status: 429 })
  }

  const { data, error } = await supabase
    .from('price_watches')
    .insert({
      user_id: user.id,
      product_name,
      target_price: Math.round(Number(target_price)),
      search_query,
    })
    .select('id')
    .single()

  if (error) { console.error('[price-watch]', error); return NextResponse.json({ error: 'server_error', message: pw.dbError(lang) }, { status: 500 }) }
  return NextResponse.json({ id: data.id, ok: true })
}

// DELETE — cancel a watch
export async function DELETE(req: Request) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  // An anonymous identity can no longer own a watch, so it has nothing here to cancel. Refusing
  // rather than letting it run keeps ONE answer to "may this identity mutate price watches?" —
  // a guard on create alone would leave the mutating surface half-covered.
  const refusalD = refuseAnonymousSocialWrite(req, user)
  if (refusalD) return refusalD
  const lang = await resolveUserLang(supabase, user.id)

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'missing_id', message: pw.missingId(lang) }, { status: 400 })

  const { data, error } = await supabase
    .from('price_watches')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')

  // Never report success if the cancel failed or matched nothing (wrong id / not owner).
  if (error) return NextResponse.json({ error: 'cancel_failed', message: pw.cancelFailed(lang) }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'not_found', message: pw.notFound(lang) }, { status: 404 })

  return NextResponse.json({ ok: true })
}
