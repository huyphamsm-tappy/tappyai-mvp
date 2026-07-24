'use client'

import { useEffect, useState } from 'react'
import DealNotifyButton from './DealNotifyButton'
import { ExternalLink, Loader2, Clock, Copy, Check } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { TappyMascot } from '@/components/TappyMascot'
import { getTappyPose } from '@/lib/TappyMascotState'
import { promoCountdown } from '@/lib/deals/countdown'

// Public deal shape from GET /api/deals (kept local so this client component
// never imports the server-only data layer). discountLabel/voucherCode/endAt are
// the only promo fields the API surfaces (extracted from metadata.promotion).
interface PartnerDeal {
  id: string
  partnerName: string
  category: string
  title: string
  description: string | null
  officialUrl: string
  bannerImage: string | null
  logoImage: string | null
  discountLabel: string | null
  voucherCode: string | null
  endAt: string | null
}

const CATEGORY_COLORS: Record<string, string> = {
  'Điện tử': 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'Mua sắm': 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
  'Ăn uống': 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300',
  'Du lịch': 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
  'Vận chuyển': 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
  'Tiết kiệm': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-300',
  'Thời trang': 'bg-pink-100 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300',
  'Làm đẹp': 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'Gia dụng': 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
  'Sách': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
  'Siêu thị': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
}

function categoryColor(cat: string) {
  return CATEGORY_COLORS[cat] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
}

function formatDate(locale: 'vi' | 'en') {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date())
}

// Deal cards load from the shared REST API (GET /api/deals) — the same endpoint
// Android/iOS consume. Deals are admin-managed content; no hardcoded pool.
export default function DealsView() {
  const { t, locale } = useTranslation()
  const [deals, setDeals] = useState<PartnerDeal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/deals')
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setDeals(Array.isArray(d?.deals) ? d.deals : []) })
      .catch(() => { if (!cancelled) setDeals([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <main className="min-h-screen pb-28 pt-4 px-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('deals.title')}</h1>
              <div className="w-8 h-8 rounded-lg overflow-hidden select-none"><TappyMascot pose={getTappyPose({ category: 'deals' })} size={32} eager animated /></div>
            </div>
            <p suppressHydrationWarning className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 capitalize">{formatDate(locale)}</p>
          </div>
          <DealNotifyButton />
        </div>
        {!loading && deals.length > 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            {t('deals.subtitle', { count: String(deals.length) })}
          </p>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      )}

      {/* Empty */}
      {!loading && deals.length === 0 && (
        <div className="text-center py-16 text-sm text-gray-400 dark:text-gray-500">
          {t('deals.empty')}
        </div>
      )}

      {/* Deal cards */}
      {!loading && deals.length > 0 && (
        <div className="space-y-2.5">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>
      )}

      {/* Footer — commercial-nature disclosure (MFS 3.10: disclose clearly, no false scarcity) */}
      {!loading && deals.length > 0 && (
        <div className="mt-6 text-center space-y-1.5">
          <p className="text-xs text-gray-400 dark:text-gray-600">
            {t('deals.footerHint')}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed max-w-md mx-auto">
            {t('deals.disclosurePrefix')}<span className="font-medium">{t('deals.disclosureEmphasis')}</span>{t('deals.disclosureSuffix')}
          </p>
        </div>
      )}
    </main>
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
      className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm hover:border-orange-200 dark:hover:border-orange-800 hover:shadow-md transition-all group active:scale-[0.99]"
    >
      {/* Logo (or partner-initial fallback) */}
      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center overflow-hidden text-lg font-bold text-orange-600 dark:text-orange-400">
        {deal.logoImage
          ? <img src={deal.logoImage} alt={deal.partnerName} className="w-full h-full object-cover" />
          : (deal.partnerName?.[0]?.toUpperCase() ?? '?')}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug line-clamp-1">
            {deal.title}
          </p>
          {/* Discount badge — rendered ONLY when a discountLabel exists */}
          {deal.discountLabel && (
            <span className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-md bg-red-500 text-white">
              {deal.discountLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryColor(deal.category)}`}>
            {deal.category}
          </span>
          {cd.kind === 'soon' && (
            <span className="text-xs font-semibold text-red-600 dark:text-red-400">{t('deals.endingSoon')}</span>
          )}
          {cd.kind === 'days' && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <Clock size={11} />
              {cd.days === 1 ? t('deals.dayLeft') : t('deals.daysLeft', { count: String(cd.days) })}
            </span>
          )}
          {deal.description && (
            <span className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{deal.description}</span>
          )}
        </div>
        {/* Voucher code — copy button never navigates (stopPropagation + preventDefault) */}
        {deal.voucherCode && (
          <button
            type="button"
            onClick={copyVoucher}
            title={copied ? t('deals.codeCopied') : t('deals.copyCode')}
            aria-label={t('deals.copyCode')}
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-dashed border-orange-300 dark:border-orange-700 bg-orange-50/60 dark:bg-orange-950/30 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/40"
          >
            <span className="text-gray-400 dark:text-gray-500 font-normal">{t('deals.voucherLabel')}:</span>
            <span className="font-mono tracking-wide">{deal.voucherCode}</span>
            {copied ? <Check size={12} className="text-green-600 dark:text-green-400" /> : <Copy size={12} />}
          </button>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('deals.viaSource', { source: deal.partnerName })}</p>
      </div>

      <ExternalLink
        size={14}
        className="flex-shrink-0 text-gray-300 dark:text-gray-600 group-hover:text-orange-400 transition-colors"
      />
    </a>
  )
}
