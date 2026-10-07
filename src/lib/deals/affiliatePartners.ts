// Deals page — partner booking cards for providers whose AFFILIATE link is really implemented.
//
// Used only when the admin-managed `partner_deals` feed has nothing to show, so the page is never an
// empty shell while real, attributable booking deeplinks exist. Nothing is invented here:
//   * the provider set is fixed to the two travel providers docs/audit/DATA-SOURCE-RESOLUTION.md lists
//     as "affiliate APPROVED, tracked deep links live" (Traveloka, Vexere). Pending / unknown programmes
//     (Agoda, Shopee, Booking.com, ...) are never listed;
//   * the URL is resolved by the same CCP resolver the chat uses (host allow-list, ACCESSTRADE
//     deep link, param echo, /go/at click link with a fresh sub1 per click). A provider whose link comes
//     back WITHOUT affiliate tracking (no ACCESSTRADE_PUBLISHER_ID, campaign off, provider inactive, CCP
//     off) is dropped: an untracked outbound link is not an attributed partner card;
//   * no price, discount or availability is claimed. These are booking front doors, labelled as such.

import { resolveCommerce } from '@/lib/ccp'
import type { IntentType } from '@/lib/ccp'

export interface AffiliatePartnerCard {
  providerId: 'traveloka' | 'vexere'
  partnerName: string
  /** i18n key of the one-line description (no price / discount claim). */
  descriptionKey: 'deals.partner.traveloka' | 'deals.partner.vexere'
  /** Already the tracked link (/go/at when the visitor is identified, else the ACCESSTRADE deep link). */
  url: string
}

const PARTNERS: ReadonlyArray<{ providerId: AffiliatePartnerCard['providerId']; partnerName: string; intentType: IntentType; descriptionKey: AffiliatePartnerCard['descriptionKey'] }> = [
  { providerId: 'traveloka', partnerName: 'Traveloka', intentType: 'book_hotel', descriptionKey: 'deals.partner.traveloka' },
  { providerId: 'vexere', partnerName: 'Vexere', intentType: 'book_transport', descriptionKey: 'deals.partner.vexere' },
]

export interface PartnerContext {
  actorHash?: string
  actorSeal?: string
  locale?: 'vi' | 'en'
}

/** Resolve the partner cards. Pure (no I/O): the caller refreshes the runtime provider table first. */
export function affiliatePartnerCards(ctx: PartnerContext = {}, resolve: typeof resolveCommerce = resolveCommerce): AffiliatePartnerCard[] {
  const out: AffiliatePartnerCard[] = []
  for (const p of PARTNERS) {
    try {
      const res = resolve({
        domain: 'travel',
        intentType: p.intentType,
        subject: p.partnerName,
        constraints: { merchantAllowList: [p.providerId] },
        context: {
          ...(ctx.locale ? { locale: ctx.locale } : {}),
          platform: 'web',
          ...(ctx.actorHash ? { actorHash: ctx.actorHash } : {}),
          ...(ctx.actorSeal ? { actorSeal: ctx.actorSeal } : {}),
          allowTracking: true,
        },
      })
      if (!('links' in res)) continue
      const link = res.links.find(l => l.providerId === p.providerId && l.tracking.mode === 'affiliate')
      if (link) out.push({ providerId: p.providerId, partnerName: p.partnerName, descriptionKey: p.descriptionKey, url: link.url })
    } catch { /* a provider that cannot resolve is simply not listed */ }
  }
  return out
}
