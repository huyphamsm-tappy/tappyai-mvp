'use client'

import Link from 'next/link'
import { Store, Tag, MessageCircle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import V3Shell, { V3Footer } from '@/components/v3/V3Shell'

// ── V3 Web redesign · §5 Marketplace — RESERVED, NOT BUILT ──────────────────
//
// The V3 shell puts Marketplace in the sidebar and the tab bar, which means the
// destination has to exist — a nav entry that 404s is worse than no entry. This
// route is that destination and NOTHING MORE.
//
// 🚨 THIS PAGE IS DELIBERATELY EMPTY OF COMMERCE. No catalogue, no product tile,
// no price, no cart, no checkout, no payment, no merchant onboarding, no CS-Cart
// surface, and no backend call of any kind. Commerce is FUTURE (DD-001, DD-013);
// reserving the place is in scope, implementing it is not.
//
// 🚨 AND NOTHING IS FABRICATED. A greyed-out "sample product" or a placeholder
// price would be a product claim and a price claim about a store that does not
// exist. The page says plainly that it is not open, then points at the two real
// capabilities a user came here for — Deals, which does exist today, and the
// assistant, which can already help them shop.
//
// No promise is made about WHEN. The page states the present ("not open yet"),
// never a date the product has not committed to.

export default function MarketplaceReserved() {
  const { t } = useTranslation()

  return (
    <V3Shell title={t('v3.nav.marketplace')} subtitle={t('v3.page.subtitle')} activeTab="/marketplace">
      <div className="space-y-4">
        <section className="v3-panel">
          <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <span
              className="flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ background: 'rgba(245,158,11,0.14)', color: 'var(--v3-amber)' }}
              aria-hidden="true"
            >
              <Store size={30} />
            </span>

            <h2 className="text-xl font-bold" style={{ color: 'var(--v3-fg)' }}>
              {t('v3.marketplace.title')}
            </h2>
            <p className="max-w-md text-[13px] leading-relaxed" style={{ color: 'var(--v3-fg-secondary)' }}>
              {t('v3.marketplace.body')}
            </p>

            {/* The two doors that ARE open. Both are existing routes. */}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2.5">
              <Link
                href="/deals"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold text-white"
                style={{ background: 'var(--v3-accent)' }}
              >
                <Tag size={15} aria-hidden="true" />
                {t('deals.title')}
              </Link>
              <Link
                href="/chat"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-4 text-[13px] font-semibold"
                style={{ borderColor: 'var(--v3-border-strong)', background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg)' }}
              >
                <MessageCircle size={15} aria-hidden="true" />
                {t('nav.chat')}
              </Link>
            </div>
          </div>
        </section>

        <V3Footer />
      </div>
    </V3Shell>
  )
}
