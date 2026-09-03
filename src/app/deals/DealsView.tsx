'use client'

import { useEffect, useMemo, useState } from 'react'
import DealNotifyButton from './DealNotifyButton'
import BrandLogo from '@/components/ui/BrandLogo'
import { resolveBrand } from '@/config/brandRegistry'
import { ExternalLink, Loader2, Clock, Copy, Check } from 'lucide-react'
import { useTranslation, resolvedClientLocale } from '@/lib/i18n/useTranslation'
import { promoCountdown } from '@/lib/deals/countdown'
import AskTappyButton from '@/components/chat/AskTappyButton'
import V3Shell, { V3Footer } from '@/components/v3/V3Shell'
import { ChipRow } from '@/components/v3/Panel'

// ── V3 Web redesign · §4 Deals ──────────────────────────────────────────────
//
// Deals stays a SEPARATE top-level capability (OD-3) — it is not merged into
// Marketplace and gains no commerce behaviour. What changes is presentation: it
// used to be a light 768px column that looked like a different application from
// the V3 Home, so it now sits inside `V3Shell` and its cards are V3 tiles.
//
// 🚨 NOTHING ON A CARD IS INVENTED. The reference shows struck-through original
// prices; the deals API has no original price, so there is none here. A
// fabricated "was 250k" is a price claim, and this product does not make price
// claims it cannot source. Only fields the API actually returns are rendered —
// discountLabel, voucherCode, endAt, category, description — and each only when
// present.
//
// Filter chips are derived from the categories that are ACTUALLY loaded, not
// from a fixed list, so a chip never promises deals that do not exist.

// Public deal shape from GET /api/deals (kept local so this client component
// never imports the server-only data layer). discountLabel/voucherCode/endAt are
// the only promo fields the API surfaces (extracted from metadata.promotion).
interface PartnerDeal {
  id: string
  partnerName: string
  // `category` is localized for display; `categoryKey` is the stable vi label
  // used for the colour map so styling survives a language switch.
  category: string
  categoryKey: string
  title: string
  description: string | null
  officialUrl: string
  bannerImage: string | null
  logoImage: string | null
  discountLabel: string | null
  voucherCode: string | null
  endAt: string | null
}

// On the V3 ground the old light category pills disappeared, so each category
// carries a tint from the V3 palette instead. Colour is never the only signal —
// the category name is always spelled out next to it.
const CATEGORY_TONE: Record<string, string> = {
  'Điện tử': 'var(--v3-accent)',
  'Mua sắm': 'var(--v3-amber)',
  'Ăn uống': 'var(--v3-emerald)',
  'Du lịch': 'var(--v3-violet)',
  'Vận chuyển': 'var(--v3-accent)',
  'Tiết kiệm': 'var(--v3-amber)',
  'Thời trang': 'var(--v3-rose)',
  'Làm đẹp': 'var(--v3-rose)',
  'Gia dụng': 'var(--v3-emerald)',
  'Sách': 'var(--v3-violet)',
  'Siêu thị': 'var(--v3-emerald)',
}

function categoryTone(key: string) {
  return CATEGORY_TONE[key] ?? 'var(--v3-fg-secondary)'
}

function formatDate(locale: 'vi' | 'en') {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', {
    // C17 — en-GB, not en-US: this product is day-first everywhere else, and "Friday, 8/21"
    // is the only US-style date in the app.
    weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date())
}

// Deal cards load from the shared REST API (GET /api/deals) — the same endpoint
// Android/iOS consume. Deals are admin-managed content; no hardcoded pool.
export default function DealsView() {
  const { t, locale } = useTranslation()
  const [deals, setDeals] = useState<PartnerDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState(0)

  // Re-fetch whenever the app language changes so category/description switch
  // instantly (the API localizes server-side and returns the same shape). The
  // request carries the current locale; the server falls back to vi per field.
  useEffect(() => {
    // C40 — skip the hydration pass, when the store still reports the SSR default. Without this
    // every load costs two /api/deals requests and discards the first.
    const settled = resolvedClientLocale()
    if (settled && settled !== locale) return

    let cancelled = false
    setLoading(true)
    fetch(`/api/deals?lang=${encodeURIComponent(locale)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setDeals(Array.isArray(d?.deals) ? d.deals : []) })
      .catch(() => { if (!cancelled) setDeals([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [locale])

  // Chips describe what is on the page. Derived, never declared: a category only
  // appears once at least one loaded deal belongs to it.
  const categories = useMemo(() => {
    const seen = new Map<string, string>()
    for (const d of deals) if (!seen.has(d.categoryKey)) seen.set(d.categoryKey, d.category)
    return [...seen.entries()].map(([key, label]) => ({ key, label }))
  }, [deals])

  // Reset to "all" whenever the filtered category is no longer on the page — a
  // language switch re-fetches and can change the set.
  useEffect(() => { setFilter(0) }, [categories.length])

  const activeKey = filter === 0 ? null : categories[filter - 1]?.key ?? null
  const visible = activeKey ? deals.filter((d) => d.categoryKey === activeKey) : deals

  return (
    <V3Shell title={t('deals.title')} subtitle={formatDate(locale)} activeTab="/deals">
      {/* A dedicated route, not a Home panel: the top bar already carries the title, so
          wrapping the whole page in a panel of the same name would be a box around a box.
          The V3 card language lives in the tiles themselves. */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px]" style={{ color: 'var(--v3-fg-secondary)' }}>
            {!loading && deals.length > 0 ? t('deals.subtitle', { count: String(deals.length) }) : ''}
          </p>
          <DealNotifyButton />
        </div>

        {categories.length > 1 && (
          <ChipRow
            items={[t('v3.deals.all'), ...categories.map((c) => c.label)]}
            activeIndex={filter}
            onSelect={setFilter}
          />
        )}

        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--v3-fg-muted)' }} />
          </div>
        )}

        {!loading && visible.length === 0 && (
          <p className="py-16 text-center text-[13px]" style={{ color: 'var(--v3-fg-muted)' }}>
            {t('deals.empty')}
          </p>
        )}

        {!loading && visible.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </div>
        )}

        {/* Footer — commercial-nature disclosure (MFS 3.10: disclose clearly, no false scarcity) */}
        {!loading && deals.length > 0 && (
          <div className="space-y-1.5 pt-2 text-center">
            <p className="text-[11px]" style={{ color: 'var(--v3-fg-muted)' }}>
              {t('deals.footerHint')}
            </p>
            <p className="mx-auto max-w-md text-[11px] leading-relaxed" style={{ color: 'var(--v3-fg-secondary)' }}>
              {t('deals.disclosurePrefix')}<span className="font-medium">{t('deals.disclosureEmphasis')}</span>{t('deals.disclosureSuffix')}
            </p>
          </div>
        )}
      </div>

      <V3Footer />
    </V3Shell>
  )
}

// One promo card. Renders the discount badge (only when discountLabel exists),
// an endAt countdown, and a copy-able voucher chip. The whole card is a link;
// the voucher copy button stops propagation so it never opens the partner link.
function DealCard({ deal }: { deal: PartnerDeal }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const cd = promoCountdown(deal.endAt, Date.now())

  function copyVoucher(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!deal.voucherCode) return
    navigator.clipboard?.writeText(deal.voucherCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  return (
    <a
      href={deal.officialUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => { fetch(`/api/deals/${deal.id}/click`, { method: 'POST', keepalive: true }).catch(() => {}) }}
      className="group flex flex-col overflow-hidden rounded-2xl transition-all active:scale-[0.99]"
      style={{ background: 'var(--v3-panel-elevated)', border: '1px solid var(--v3-border)' }}
    >
      {/* 🚨 NO THUMBNAIL YET, deliberately. `bannerImage` is in the API payload and the V3
          reference shows a photo on every deal tile — but `androidDealsParity` derives Android's
          required field set FROM this file, and Android's DealDto does not decode `bannerImage`.
          Rendering it here would put Web ahead of Android silently, which is the exact drift that
          guard exists to stop, and Android is out of scope for the Web pass. Deferred to the
          Android/iOS parity pass; see V3_WEB_REDESIGN_AUDIT §4. */}
      <span className="flex flex-1 flex-col gap-2 p-3.5">
        <span className="flex items-start gap-3">
          {/* Official brand logo (registry) → per-deal DB image → partner-initial fallback.
              The registry wins for known partners so every card shows the official mark;
              the two fallbacks only ever apply to partners not yet in PARTNERS. */}
          {resolveBrand(deal.partnerName) ? (
            <BrandLogo partnerName={deal.partnerName} size={40} />
          ) : (
            <span
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl text-base font-bold"
              style={{ background: 'rgba(245,158,11,0.14)', color: 'var(--v3-amber)' }}
            >
              {deal.logoImage
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={deal.logoImage} alt={deal.partnerName} className="h-full w-full object-cover" />
                : (deal.partnerName?.[0]?.toUpperCase() ?? '?')}
            </span>
          )}

          <span className="min-w-0 flex-1">
            <span className="flex items-start gap-2">
              <span className="line-clamp-2 flex-1 text-[13px] font-semibold leading-snug" style={{ color: 'var(--v3-fg)' }}>
                {deal.title}
              </span>
              {/* Discount badge — rendered ONLY when a discountLabel exists. */}
              {deal.discountLabel && (
                <span
                  className="flex-shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold text-white"
                  style={{ background: 'var(--v3-rose)' }}
                >
                  {deal.discountLabel}
                </span>
              )}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ background: 'rgba(255,255,255,0.06)', color: categoryTone(deal.categoryKey) }}
              >
                {deal.category}
              </span>
              {cd.kind === 'soon' && (
                <span className="text-[10px] font-semibold" style={{ color: 'var(--v3-rose)' }}>{t('deals.endingSoon')}</span>
              )}
              {cd.kind === 'days' && (
                <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--v3-fg-secondary)' }}>
                  <Clock size={10} />
                  {cd.days === 1 ? t('deals.dayLeft') : t('deals.daysLeft', { count: String(cd.days) })}
                </span>
              )}
            </span>
          </span>
        </span>

        {deal.description && (
          <span className="line-clamp-2 text-[11px]" style={{ color: 'var(--v3-fg-secondary)' }}>{deal.description}</span>
        )}

        {/* Voucher code — copy button never navigates (stopPropagation + preventDefault) */}
        {deal.voucherCode && (
          <button
            type="button"
            onClick={copyVoucher}
            title={copied ? t('deals.codeCopied') : t('deals.copyCode')}
            aria-label={t('deals.copyCode')}
            className="inline-flex w-fit items-center gap-1.5 rounded-md border border-dashed px-2 py-1 text-[11px] font-semibold"
            style={{ borderColor: 'var(--v3-amber)', background: 'rgba(245,158,11,0.10)', color: 'var(--v3-amber)' }}
          >
            <span className="font-normal" style={{ color: 'var(--v3-fg-muted)' }}>{t('deals.voucherLabel')}:</span>
            <span className="font-mono tracking-wide">{deal.voucherCode}</span>
            {copied ? <Check size={11} style={{ color: 'var(--v3-emerald)' }} /> : <Copy size={11} />}
          </button>
        )}

        <span className="text-[10px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('deals.viaSource', { source: deal.partnerName })}</span>

        <span className="mt-auto flex items-center justify-between gap-2 pt-1">
          {/* P4-12 — the bridge into the assistant (DD-004). A deal used to dead-end at the
              partner's site; now the user can carry it into a conversation instead. The card
              itself is an <a>, so this button stops propagation the same way the voucher copy
              button above it does. Deals remains Deals — no commerce behaviour is added. */}
          <AskTappyButton
            subject={deal.title}
            category="shopping"
            className="border-[color:var(--v3-border-strong)] bg-[color:var(--v3-panel)] px-2.5 text-[12px] text-[color:var(--v3-accent)] hover:bg-white/5 dark:border-[color:var(--v3-border-strong)] dark:text-[color:var(--v3-accent)] dark:hover:bg-white/5"
          />
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--v3-amber)' }}>
            {t('v3.deals.get')}
            <ExternalLink size={12} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </span>
      </span>
    </a>
  )
}
