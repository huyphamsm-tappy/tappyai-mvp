'use client'

import { ExternalLink } from 'lucide-react'
import type { SynthesisView, SynthesisEntityView, SynthesisOfferView } from '@/lib/ai/consultative/synthesisView'

// ── Phase 9: render the DECISION, not the catalogue ─────────────────────────
//
// Consumes `_tappy_synthesis_view` — the backend's OWN grouping/recommendation,
// projected for display (see synthesisView.ts). It groups NOTHING and infers
// NOTHING: every config, price range, match verdict and recommendation is read
// straight from the view. One recommended configuration leads; the other groups
// are kept as compact rows so a valid alternative is never hidden, but no offer
// is ever shown as a full-size product card. Missing values render as an honest
// "chưa rõ", never a fabricated number.

const MATCH: Record<SynthesisEntityView['matchesRequest'], { label: string; cls: string }> = {
  khop:    { label: 'Đúng cấu hình bạn cần', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  khac:    { label: 'Khác cấu hình',         cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  chua_ro: { label: 'Chưa rõ cấu hình',      cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
}

/** VND → "25,8 triệu" style. A missing number is honest, never invented. */
function money(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return 'chưa rõ giá'
  if (n >= 1_000_000) {
    const tr = n / 1_000_000
    const s = (Math.round(tr * 10) / 10).toString().replace('.', ',')
    return `${s} triệu`
  }
  return `${n.toLocaleString('vi-VN')}₫`
}

function priceRange(e: SynthesisEntityView): string {
  if (e.priceLow === null && e.priceHigh === null) return 'chưa rõ giá'
  if (e.priceLow !== null && e.priceHigh !== null && e.priceLow !== e.priceHigh) {
    return `${money(e.priceLow)} – ${money(e.priceHigh)}`
  }
  return money(e.priceLow ?? e.priceHigh)
}

function MatchBadge({ m }: { m: SynthesisEntityView['matchesRequest'] }) {
  const meta = MATCH[m]
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${meta.cls}`}>{meta.label}</span>
}

function OfferRow({ o }: { o: SynthesisOfferView }) {
  const seller = o.seller ?? 'Người bán chưa rõ'
  const cond = o.condition ? ` · ${o.condition}` : ''
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="min-w-0 truncate text-gray-700 dark:text-gray-300">
        {seller}<span className="text-gray-400 dark:text-gray-500">{cond}</span>
      </span>
      <span className="flex items-center gap-2 flex-shrink-0">
        <span className="tabular-nums font-medium text-gray-900 dark:text-gray-100">{money(o.price)}</span>
        {o.url && (
          <a
            href={o.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:underline"
          >
            Xem<ExternalLink className="w-3 h-3" />
          </a>
        )}
      </span>
    </div>
  )
}

/** A non-recommended configuration, kept compact so alternatives stay visible. */
function AltEntity({ e }: { e: SynthesisEntityView }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{e.config}</span>
        <MatchBadge m={e.matchesRequest} />
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="tabular-nums">{priceRange(e)}</span>
        <span>·</span>
        <span>{e.offers.length} nơi bán</span>
      </div>
    </div>
  )
}

export default function ShoppingDecision({ view, heroImage }: { view: SynthesisView; heroImage?: string | null }) {
  const entities = view.entities
  if (!entities || entities.length === 0) return null

  const recommended = entities.find(e => e.recommended) ?? null
  const others = entities.filter(e => e !== recommended)
  const rec = view.recommendation
  const reasons = rec && recommended && rec.entityKey === recommended.key ? rec.reasons : []

  // The offer to feature: the recommended seller's, else the entity's first.
  const recOffer =
    recommended && rec
      ? (recommended.offers.find(o => o.seller && rec.seller && o.seller === rec.seller) ?? recommended.offers[0] ?? null)
      : null
  const restOffers = recommended ? recommended.offers.filter(o => o !== recOffer) : []

  return (
    <div className="mt-3 animate-fade-in" data-testid="shopping-decision">
      {recommended ? (
        <div
          className="rounded-2xl border border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/10 overflow-hidden"
          data-testid="recommended-entity"
        >
          <div className="flex gap-3 p-3">
            {heroImage && (
              <img
                src={heroImage}
                alt={recommended.config}
                data-zoomable="true"
                loading="lazy"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                className="w-20 h-20 rounded-xl object-cover flex-shrink-0 cursor-zoom-in"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">Nên chọn</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-gray-900 dark:text-gray-100">{recommended.config}</span>
                <MatchBadge m={recommended.matchesRequest} />
              </div>
              <div className="mt-1 text-sm tabular-nums text-gray-700 dark:text-gray-300">{priceRange(recommended)}</div>
              {reasons.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {reasons.map((r, i) => (
                    <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex gap-1.5">
                      <span className="text-primary-500">·</span><span className="min-w-0">{r.evidence}</span>
                    </li>
                  ))}
                </ul>
              )}
              {rec?.tradeOff && (
                <div className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
                  Đánh đổi: {rec.tradeOff.evidence}
                </div>
              )}
              {rec?.conditional && (
                <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">Tùy nhu cầu của bạn.</div>
              )}
            </div>
          </div>
          <div className="border-t border-primary-100 dark:border-primary-900/40 px-3 divide-y divide-gray-100 dark:divide-gray-800">
            {recOffer && <OfferRow o={recOffer} />}
            {restOffers.map((o, i) => <OfferRow key={i} o={o} />)}
          </div>
        </div>
      ) : (
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Các lựa chọn phù hợp</div>
      )}

      {others.length > 0 && (
        <div className="mt-3">
          {recommended && (
            <div className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">Lựa chọn khác</div>
          )}
          <div className="space-y-2">
            {others.map(e => <AltEntity key={e.key} e={e} />)}
          </div>
        </div>
      )}
    </div>
  )
}
