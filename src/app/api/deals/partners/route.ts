import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { affiliatePartnerCards } from '@/lib/deals/affiliatePartners'
import { commerceActorHash, refreshProviderConfig, hasProviderConfigSource } from '@/lib/ccp'
import { sealIdentity } from '@/lib/ccp/tracking/clickLink'
import { installProviderConfigSource } from '@/lib/commerce/providerConfigSource'

// GET /api/deals/partners — booking cards for the affiliate providers that are really implemented
// (src/lib/deals/affiliatePartners.ts). Web-only companion of GET /api/deals (that feed is shared with
// Android/iOS and is left untouched). Per-visitor, so never cached: the links carry the visitor's sealed identity.
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    let identityId: string | null = null
    try {
      const { data } = await createClient().auth.getUser()
      identityId = data.user?.id ?? null
    } catch { /* no session: the link is still tracked, just not attributable to an identity */ }
    if (!hasProviderConfigSource()) installProviderConfigSource()
    await refreshProviderConfig()
    const lang = new URL(req.url).searchParams.get('lang')
    const partners = affiliatePartnerCards({
      locale: lang === 'en' ? 'en' : 'vi',
      actorHash: commerceActorHash(identityId),
      actorSeal: sealIdentity(identityId),
    })
    return NextResponse.json({ success: true, partners }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ success: true, partners: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
}
