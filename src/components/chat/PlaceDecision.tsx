'use client'

import { useMemo, useState } from 'react'
import { MapPin, Clock, Star, Utensils, Map as MapIcon, ChevronRight, Phone } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { cn } from '@/lib/utils'
import { actionLabel } from '@/lib/recommendation/actionLabel'
import { reportCommerceHandoff } from '@/lib/recommendation/handoff'
import { placesRenderOrder, type LivePlace, type PlaceFlag, type PlacesLiveView } from '@/lib/recommendation/liveView'

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

/**
 * The row is a HORIZONTAL, SWIPEABLE carousel (owner decision 2026-09-17, web + Android): every
 * row the active filter admits is a card, in the engine's order, one card per snap stop with the
 * next one peeking in. The filter chips stay above it. `VISIBLE` is how many cards fit a desktop
 * viewport before scrolling — it only decides when the chip row must show a count.
 */
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

/** The Google Places photo CDN. A size suffix makes a second, smaller request that is not a cache hit. */
const LH3_RE = /^https:\/\/lh3\.googleusercontent\.com\//
export const PHOTO_RETRY_SUFFIX = '=w400-h300'
export const PHOTO_RETRY_DELAY_MS = 1200

/**
 * The card photo, with ONE proportionate retry.
 *
 * Measured 2026-09-18/19 (pre-release A.4): the `lh3.googleusercontent.com/gps-cs-s` photos loaded
 * 100 % from Node, from headless Chromium (6 loads x 30 images, with and without Referer) and from
 * the desktop pane today, while the day before the same pane got 5–12 of 16 with intermittent
 * 429s that cleared after ~30 s. The failures track bursts from one address over time, not the
 * Referer (Referer set to our origin: 80/80 → 200). So the fix is cause-agnostic: on error, retry
 * ONCE after a short delay with the "=w400-h300" size suffix — a distinct URL (never a cached
 * failure) and ~40 % fewer bytes — and only then collapse the band. No referrer policy is changed:
 * the evidence does not support one.
 */
function CardPhoto({ src }: { src: string }) {
  const [attempt, setAttempt] = useState<0 | 1 | 2>(0)
  if (attempt === 2) return <div className="h-6 w-full" data-testid="place-photo-failed" />
  const url = attempt === 1 && LH3_RE.test(src) && !/=[ws]\d/.test(src) ? src + PHOTO_RETRY_SUFFIX : src
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      data-attempt={attempt}
      onError={() => {
        if (attempt === 0 && LH3_RE.test(src) && !/=[ws]\d/.test(src)) setTimeout(() => setAttempt(1), PHOTO_RETRY_DELAY_MS)
        else setAttempt(2)
      }}
      className="h-32 w-full object-cover"
    />
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
          <CardPhoto src={p.image} />
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

        {p.tappyRating && (
          // Tappy's OWN review aggregate. Carried on the entity since the
          // canonical model was built and never rendered — a second real rating,
          // from a source we own, dropped at the last step. Labelled "Tappy" so
          // it can never be mistaken for the provider's rating above.
          <p className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300" data-testid="tappy-rating">
            <Star size={13} className="flex-shrink-0 text-sky-400" aria-hidden="true" />
            <span className="tabular-nums font-medium">
              {t('placeDecision.tappyRating', {
                avg: String(p.tappyRating.avg),
                count: String(p.tappyRating.count),
              })}
            </span>
          </p>
        )}

        {p.address && (
          <p className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <MapPin size={12} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span className="min-w-0">{p.address}</span>
          </p>
        )}

        {p.phone && (
          // The NUMBER, not just the dialler. A call button is an action; the
          // printed number is information — it is what a user copies, checks
          // against a listing, or reads out. Google shows both, and the entity
          // has carried `phone` all along while only the button used it.
          <p className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400" data-testid="place-phone">
            <Phone size={12} className="flex-shrink-0" aria-hidden="true" />
            <span className="tabular-nums">{p.phone}</span>
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

        {p.priceRangeText && (
          // The provider's OWN band. Shown plainly, with no "reference price"
          // hedge, because unlike `priceSignal` below it is a structured field
          // rather than a number spotted in search prose.
          <p className="text-xs text-gray-600 dark:text-gray-400 tabular-nums" data-testid="price-range-text">
            {p.priceRangeText}
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

        {p.reasons && p.reasons.length > 0 && (
          // WHY this one. The ranker produces these and the payload has carried
          // them since the live view was built; the card showed only the
          // trade-off, so the engine's positive case — the half that explains
          // the recommendation — never reached the user.
          <p className="pt-0.5 text-xs text-emerald-700 dark:text-emerald-300" data-testid="place-reasons">
            {t('placeDecision.why')}: {p.reasons.map(r => r.evidence).filter(Boolean).join(' · ')}
          </p>
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
  // Item 2 (2026-09-19): three cards above the fold — the model's picks first (pick, then its
  // alternatives, in prose order), then the engine's order. The rest of the payload stays behind
  // "Xem thêm": opening it is a client action, never a new turn or a new search.
  const [expanded, setExpanded] = useState(false)
  const order = useMemo(() => (view ? placesRenderOrder(view) : { visible: [], hidden: [] }), [view])

  if (!view || items.length === 0) return null

  const filter = filters.find(f => f.id === active) ?? filters[0]
  // A filter shows every admitted row (a chip that could only choose among three is decoration);
  // "all" shows the fold. Filtering never reorders beyond the picks-first order.
  const ordered = [...order.visible, ...order.hidden]
  const folded = active === 'all' && !expanded && order.hidden.length > 0
  const shown = (folded ? order.visible : ordered).filter(filter.match)
  const hiddenCount = folded ? order.hidden.filter(filter.match).length : 0

  return (
    <div className={cn('mt-3 animate-fade-in', view.preliminary && 'opacity-80')} data-testid="place-decision" data-domain={view.domain} data-pick-unmatched={view.pickUnmatched ? 'true' : undefined} data-preliminary={view.preliminary ? 'true' : undefined}>
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

      <div
        data-testid="place-carousel"
        role="list"
        aria-label={t('placeDecision.carousel')}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth pb-2 [scrollbar-width:thin]"
      >
        {shown.map((p) => (
          <div key={p.id} role="listitem" className="w-[85%] flex-none snap-start sm:w-[320px]">
            {/* A.4 (2026-09-19): when the reply named venues and none matched a row, the order is the
                engine's, not the model's — no "#1" and no lead, exactly as an unranked set. */}
            <PlaceCard p={p} position={ordered.indexOf(p)} ranked={view.ranked !== false && !view.pickUnmatched} />
          </div>
        ))}
      </div>

      {(hiddenCount > 0 || (expanded && order.hidden.length > 0 && active === 'all')) && (
        <button
          type="button"
          data-testid="place-show-more"
          aria-expanded={expanded}
          onClick={() => setExpanded(v => !v)}
          className="mt-2 w-full rounded-xl border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {expanded ? t('placeDecision.showLess') : t('placeDecision.showMore', { count: String(hiddenCount) })}
        </button>
      )}

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
