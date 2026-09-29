import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { newClickSub1, openClickUrl, withSub1 } from '@/lib/ccp/tracking/clickLink'
import { rateLimit } from '@/lib/security/rateLimit'

// GET /go/at — one click on a tracked affiliate link (Phương án C, owner 2026-09-29).
//
//   1. verify the signed click link (tracking/clickLink.ts): only an ACCESSTRADE deep link, unaltered;
//   2. draw a NEW RANDOM sub1 for THIS click;
//   3. record sub1 → identity / provider / destination in commerce_click_attributions (service role);
//   4. 302 to the deep link + sub1. ACCESSTRADE records the click there.
//
// The click is never blocked on bookkeeping: if the insert fails the user still reaches the merchant,
// WITHOUT a sub1 (an unrecorded sub1 would be an orphan nobody can reconcile). No cookie is needed —
// Android opens these links in the browser — the identity travels sealed in the link.
// Analytics are unchanged: GA4 `affiliate_click` and the handoff beacon fire on the tap in the client;
// this route counts nothing, so a click is never counted twice.

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const click = openClickUrl(req.nextUrl.searchParams)
  if (!click) return NextResponse.redirect(new URL('/', req.nextUrl.origin), 302)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!rateLimit(`go-at:${ip}`, 60, 60_000).ok) return NextResponse.redirect(click.wrapperUrl, 302)

  const sub1 = newClickSub1()
  let recorded = false
  try {
    const { error } = await createAdminClient().from('commerce_click_attributions').insert({
      sub1,
      identity_id: click.identityId,
      provider_id: click.providerId,
      target_url: click.wrapperUrl,
    })
    recorded = !error
    if (error) console.error(JSON.stringify({ type: 'tappyai_affiliate_click', step: 'record_failed', code: error.code ?? null }))
  } catch (e) {
    console.error(JSON.stringify({ type: 'tappyai_affiliate_click', step: 'record_threw', message: e instanceof Error ? e.message.slice(0, 120) : 'unknown' }))
  }
  console.log(JSON.stringify({ type: 'tappyai_affiliate_click', step: 'redirect', provider: click.providerId, identified: !!click.identityId, recorded }))
  const res = NextResponse.redirect(recorded ? withSub1(click.wrapperUrl, sub1) : click.wrapperUrl, 302)
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('Referrer-Policy', 'no-referrer')
  return res
}
