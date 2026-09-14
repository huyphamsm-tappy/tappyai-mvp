'use client'

import { useMemo, useState } from 'react'
import { MapPin, Clock, Star, Utensils, Map as MapIcon, ChevronRight, Phone } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { actionLabel } from '@/lib/recommendation/actionLabel'
import { reportCommerceHandoff } from '@/lib/recommendation/handoff'
import type { LivePlace, PlaceFlag, PlacesLiveView } from '@/lib/recommendation/liveView'

// ── The place decision, as the approved Food composition renders it ─────────
//
// 🚨 THE DEFECT THIS REPLACES. Every fact a place turn retrieves — rating, review
// count, address, opening hours, price band, distance, the order link — used to
// reach the user only if the model wrote it into a sentence. The reply read
// "quán này 4.8 sao, mở tới 22:30, giá hợp lý, có thể đặt qua GrabFood…", which
// is five facts a person has to read a paragraph to extract, followed by the
// same links again underneath.
//
// The split the approved design makes:
//
//   · THESE CARDS own facts, attributes and actions — scannable in two seconds;
//   · THE PROSE above them owns interpretation — why this one, for this person,
//     and what the trade-off is.
//
// Nothing here ranks, groups, scores or formats money. The order is the engine's
// (`liveView.items`, best first) and the filters only choose WHICH of those rows
// to show — never a different order. A field the payload did not carry renders
// NOTHING: no dash, no zero, no "chưa rõ", because a placeholder inside a
// recommendation reads as a fact about the place.

/** How many cards the row shows at once. The payload carries the rest for the filters. */
const VISIBLE = 3
/** Enough Google ratings that "popular" is a description rather than a flourish. */
const POPULAR_MIN_RATINGS = 100

/** Google's 0–4 band, rendered as the familiar money glyphs. Never derived from a price. */
function priceBand(level: number | undefined): string | null {
  if (typeof level !== 'number' || level < 1 || level > 4) return null
  return '₫'.repeat(level)
}

type FilterId = 'all' | 'open' | PlaceFlag | 'rated'

interface Filter {
  id: FilterId
  label: string
  match: (p: LivePlace) => boolean
}

/**
 * The filter row, derived from the rows themselves.
 *
 * 🚨 A FILTER THAT IS NOT IN THE DATA IS A LIE ABOUT THE DATA. The approved
 * screenshot shows chips for qualities no provider field carries (how quiet a
 * place is, how good the view is), so those are not built here. A chip appears
 * only when at least one row satisfies it AND at least one does not — a filter
 * every row passes changes nothing and is pure noise.
 */
function buildFilters(items: LivePlace[], t: (k: string, v?: Record<string, string>) => string): Filter[] {
  const candidates: Filter[] = [
    { id: 'open', label: t('placeDecision.filterOpen'), match: p => p.openNow === true },
    { id: 'rated', label: t('placeDecision.filterRated'), match: p => typeof p.rating === 'number' && p.rating >= 4.5 },
    { id: 'wifi', label: t('placeDecision.flagWifi'), match: p => !!p.flags?.includes('wifi') },
    { id: 'outdoorSeating', label: t('placeDecision.flagOutdoor'), match: p => !!p.flags?.includes('outdoorSeating') },
    { id: 'vegetarian', label: t('placeDecision.flagVegetarian'), match: p => !!p.flags?.includes('vegetarian') },
  ]
  const useful = candidates.filter(f => {
    const n = items.filter(f.match).length
    return n > 0 && n < items.length
  })
  return [
    { id: 'all', label: t('placeDecision.filterAll', { count: String(items.length) }), match: () => true },
    ...useful,
  ]
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-gray-200 px-2 py-0.5 text-[11px] text-gray-600 dark:border-gray-700 dark:text-gray-300">
      {children}
    </span>
  )
}

/** One ranked merchant card: photo, identity, the facts, then the actions. */
/**
 * 🚨 `ranked` DECIDES WHETHER A POSITION MEANS ANYTHING.
 *
 * When the engine could not score the set, the order is the provider's and a
 * "#1" badge would assert a decision nobody made — the exact claim RANK-07
 * forbids. The card still renders (real retrieved places belong in the product's
 * own composition, not dumped into prose), it simply stops numbering them and
 * stops styling the first row as a lead.
 */
function PlaceCard({ p, position, ranked }: { p: LivePlace; position: number; ranked: boolean }) {
  const { t } = useTranslation()
  const popular = ranked && position === 0 && typeof p.ratingCount === 'number' && p.ratingCount >= POPULAR_MIN_RATINGS
  const band = priceBand(p.priceLevel)
  const flagLabel: Record<PlaceFlag, string> = {
    wifi: t('placeDecision.flagWifi'),
    outdoorSeating: t('placeDecision.flagOutdoor'),
    vegetarian: t('placeDecision.flagVegetarian'),
  }
  // CCP Phase 8 (owner-like UAT R1, P2-2): the commerce handoff the user ASKED for — the
  // action the canonical list already ranks first (priority −1) — leads the card too. The
  // presentation used to put maps first and file the reservation among "others", which is
  // how a verified reservation hold once rendered after two search links.
  const lead = p.actions.find(a => a.commerce?.primary === true)
  // Then maps, then ordering; anything else becomes a secondary button. Every entry already
  // has a real destination (liveView drops the rest), so nothing here can render a dead button.
  const maps = p.actions.find(a => a !== lead && (a.kind === 'maps' || a.kind === 'directions'))
  const orders = p.actions.filter(a => a !== lead && (a.kind === 'order' || a.kind === 'delivery'))
  const others = p.actions.filter(a => a !== lead && a !== maps && !orders.includes(a))

  return (
    <div
      data-testid="place-card"
      data-rank={ranked ? position + 1 : undefined}
      data-lead={ranked && position === 0 ? 'true' : undefined}
      className={
        ranked && position === 0
          ? 'overflow-hidden rounded-2xl border border-primary-300 bg-white dark:border-primary-700 dark:bg-gray-900'
          : 'overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'
      }
    >
      <div className="relative">
        {p.image ? (
          <img
            src={p.image}
            alt=""
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            className="h-32 w-full object-cover"
          />
        ) : (
          // No photo collapses to a plain band rather than a grey box pretending
          // something is still loading.
          <div className="h-6 w-full" />
        )}
        {ranked && (
          <span className="absolute left-2 top-2 rounded-lg bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">
            #{position + 1}
          </span>
        )}
        {popular && (
          <span
            data-testid="popular-badge"
            className="absolute right-2 top-2 rounded-lg bg-amber-500/90 px-2 py-0.5 text-[11px] font-semibold text-white"
          >
            🔥 {t('placeDecision.popular')}
          </span>
        )}
      </div>

      <div className="space-y-1.5 p-3">
        <h4 className="font-semibold text-gray-900 dark:text-gray-100">{p.name}</h4>

        {typeof p.rating === 'number' && (
          <p className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
            <Star size={13} className="flex-shrink-0 text-amber-400" aria-hidden="true" />
            <span className="tabular-nums font-medium">{p.rating}</span>
            {typeof p.ratingCount === 'number' && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({t('placeDecision.ratingCount', { count: String(p.ratingCount) })})
              </span>
            )}
          </p>
        )}

        {typeof p.rating !== 'number' && typeof p.stars === 'number' && (
          // A hotel CLASS, said as a class. Shown only when there is no guest
          // rating to show, so the two can never be read as the same number.
          <p className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300" data-testid="stay-stars">
            <Star size={13} className="flex-shrink-0 text-amber-400" aria-hidden="true" />
            <span className="tabular-nums font-medium">{t('placeDecision.stars', { count: String(p.stars) })}</span>
          </p>
        )}

        {p.address && (
          <p className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <MapPin size={12} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span className="min-w-0">{p.address}</span>
          </p>
        )}

        {(p.openingHours || typeof p.openNow === 'boolean') && (
          <p className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <Clock size={12} className="flex-shrink-0" aria-hidden="true" />
            {p.openingHours && <span>{p.openingHours}</span>}
            {typeof p.openNow === 'boolean' && (
              <span className={p.openNow ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-500'}>
                · {p.openNow ? t('placeDecision.openNow') : t('placeDecision.closedNow')}
              </span>
            )}
          </p>
        )}

        {(band || typeof p.distanceKm === 'number') && (
          <p className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            {band && <span className="tabular-nums">{band}</span>}
            {typeof p.distanceKm === 'number' && (
              <span className="tabular-nums">{p.distanceKm} km {t('placeDecision.away')}</span>
            )}
          </p>
        )}

        {p.priceSignal && (
          // Snippet money is weak evidence and must never read as a fact — the
          // same qualifier the prompt requires of the model.
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('placeDecision.referencePrice')}: {p.priceSignal}
          </p>
        )}

        {(p.flags?.length || p.categories?.length) && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {p.flags?.map(f => <Chip key={f}>{flagLabel[f]}</Chip>)}
            {p.categories?.slice(0, 2).map(c => <Chip key={c}>{c}</Chip>)}
          </div>
        )}

        {p.tradeOff && (
          <p className="pt-0.5 text-xs text-amber-700 dark:text-amber-300">
            {t('placeDecision.tradeOff')}: {p.tradeOff.evidence}
          </p>
        )}
      </div>

      <div className="space-y-2 px-3 pb-3">
        {lead && (
          <a
            data-testid="commerce-lead"
            href={lead.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => reportCommerceHandoff(lead)}
            className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-primary-300 bg-primary-50 text-sm font-semibold text-primary-800 transition-colors hover:bg-primary-100 dark:border-primary-700 dark:bg-primary-900/20 dark:text-primary-300 dark:hover:bg-primary-900/40"
          >
            {actionLabel(lead, t)}
          </a>
        )}
        {maps && (
          <a
            href={maps.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <MapIcon size={14} aria-hidden="true" /> {t('v3.action.maps')}
          </a>
        )}
        {(orders.length > 0 || others.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {orders.map(a => (
              <a
                key={a.url}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={a.commerce ? () => reportCommerceHandoff(a) : undefined}
                className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-300 px-3 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30"
              >
                <Utensils size={12} aria-hidden="true" /> {actionLabel(a, t)}
              </a>
            ))}
            {others.map(a => {
              // A dialler is not a web page: `tel:` opens the phone app in place,
              // so it takes neither a new tab nor the cross-origin rel.
              const isCall = a.kind === 'call'
              return (
                <a
                  key={a.url}
                  href={a.url}
                  target={isCall ? undefined : '_blank'}
                  rel={isCall ? undefined : 'noopener noreferrer'}
                  // A commerce handoff reports its opaque ids on the way out (CCP event 6); every other action is untouched.
                  onClick={a.commerce ? () => reportCommerceHandoff(a) : undefined}
                  className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {isCall && <Phone size={12} aria-hidden="true" />}
                  {actionLabel(a, t)}
                </a>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function PlaceDecision({ view }: { view: PlacesLiveView | null }) {
  const { t } = useTranslation()
  // Memoised together so the filter row is not rebuilt on every keystroke elsewhere
  // in the chat; `view` is a stable object for the life of the message.
  const items = useMemo(() => view?.items ?? [], [view])
  const filters = useMemo(() => buildFilters(items, t), [items, t])
  const [active, setActive] = useState<FilterId>('all')

  if (!view || items.length === 0) return null

  const filter = filters.find(f => f.id === active) ?? filters[0]
  // Filtering NEVER reorders: it removes rows the chip excludes and the engine's
  // order carries through whatever is left.
  const shown = items.filter(filter.match).slice(0, VISIBLE)

  return (
    <div className="mt-3 animate-fade-in" data-testid="place-decision" data-domain={view.domain}>
      {/* The row shows when a chip can actually change the result, and also when
          the payload holds more rows than fit — the count is then the honest
          answer to "is this all of them?". */}
      {(filters.length > 1 || items.length > VISIBLE) && (
        <div className="mb-3 flex flex-wrap gap-2" data-testid="place-filters">
          {filters.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActive(f.id)}
              aria-pressed={f.id === active}
              className={
                f.id === active
                  ? 'rounded-full bg-interactive px-3 py-1.5 text-xs font-medium text-white'
                  : 'rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((p) => <PlaceCard key={p.id} p={p} position={items.indexOf(p)} ranked={view.ranked !== false} />)}
      </div>

      {view.mapsSearchUrl && (
        <a
          data-testid="place-map-explore"
          href={view.mapsSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center gap-3 rounded-2xl border border-gray-200 px-3 py-3 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          <MapIcon size={18} className="flex-shrink-0 text-primary-500" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-primary-600 dark:text-primary-400">
              {t('placeDecision.exploreMap')}
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              {t('placeDecision.exploreMapHint')}
            </span>
          </span>
          <ChevronRight size={16} className="flex-shrink-0 text-gray-400" aria-hidden="true" />
        </a>
      )}
    </div>
  )
}
