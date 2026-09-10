'use client'

import { Star, Bell } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { formatVndRange, type PriceLocale } from '@/lib/format/vndPrice'
import type { SynthesisView, SynthesisEntityView, SynthesisOfferView } from '@/lib/ai/consultative/synthesisView'
import MatchBadge from '@/components/chat/structured/MatchBadge'
import OfferRow, { offerDestination, offerActionLabel } from '@/components/chat/structured/OfferRow'
import { reasonList } from '@/lib/recommendation/reasonText'

// ── Phase 9: render the DECISION, not the catalogue ─────────────────────────
//
// Consumes the SynthesisView parsed from the [TAPPY_SHOPPING] marker — the
// backend's OWN grouping/recommendation (see synthesisView.ts). It groups NOTHING
// and infers NOTHING: every config, price range, match verdict and recommendation
// is read straight from the view. Missing values render as an honest "chưa rõ",
// never a fabricated number. All labels come from i18n so an English session gets
// an English decision, matching the localised prose above it.
//
// MatchBadge and OfferRow used to live here. They were EXTRACTED to `structured/`
// (DD-008) so a place, product or merchant entity can reuse the same badge and
// the same offer row without a second implementation.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THE AUDIT CHANGED, AND WHY
//
// 🚨 1. A CONFIGURATION WAS STANDING IN FOR THE PRODUCT'S NAME. The card's
//    heading was `configLabel`, so anything the Apple-silicon matcher did not
//    recognise — every Dell, Asus, Lenovo — was introduced to the reader as
//    "chip ? · 16GB · 512GB". The listing's own title is the name; the
//    configuration is a secondary line, and now a set of labelled chips.
//
// 🚨 2. THE FACTS THE USER CAME FOR WERE IN THE PROSE, NOT THE CARD. Rating and
//    review count were retrieved on every turn and reached the UI only inside an
//    English reason string ("rated 4.9 · 1500 reviews"). They are product
//    metadata and render as metadata; the reasons are localised at source now.
//
// 🚨 3. AN ALTERNATIVE WITH NO ACTION IS NOT AN ALTERNATIVE. The other
//    configurations rendered as config + price + a seller COUNT, with no image,
//    no name and nothing to click — a row you cannot act on is a row you cannot
//    choose. They now carry the same identity and the same real destination as
//    the lead, at a smaller size.
//
// 🚨 4. NO WINNER IS NOT NO ANSWER. `derivePick` declining used to erase the
//    whole surface (route.ts). It now renders the ranker's order under a heading
//    that says exactly that, and crowns nobody: `recommended` stays reserved for
//    a genuine deterministic Pick, and this component never computes one.
// ─────────────────────────────────────────────────────────────────────────────

/** The offer a card speaks for: the recommended seller's, else the first. */
function featuredOffer(e: SynthesisEntityView, seller?: string | null): SynthesisOfferView | null {
  if (seller) {
    const match = e.offers.find(o => o.seller && o.seller === seller)
    if (match) return match
  }
  return e.offers[0] ?? null
}

/**
 * The listing's rating — never the entity's.
 *
 * Serper puts rating and review count on the ROW, so they belong to one seller's
 * listing. This renders the rating of the offer the card is actually featuring,
 * which is what keeps a seller's stars from appearing beside another's price.
 */
function Rating({ o }: { o: SynthesisOfferView | null }) {
  const { t, locale } = useTranslation()
  if (!o || typeof o.rating !== 'number') return null
  const count = typeof o.ratingCount === 'number' && o.ratingCount > 0
    ? o.ratingCount.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')
    : null
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400" data-testid="product-rating">
      <Star size={12} className="fill-amber-400 text-amber-400" aria-hidden="true" />
      <span className="tabular-nums">
        {count
          ? t('shoppingDecision.ratingLine', { value: String(o.rating), count })
          : t('shoppingDecision.ratingOnly', { value: String(o.rating) })}
      </span>
    </span>
  )
}

/**
 * The stated configuration, labelled and localised. Nothing stated → nothing rendered.
 *
 * 🚨 A MARKER OUTLIVES THE CODE THAT WROTE IT. The decision is persisted inside
 * the message text, so a conversation saved before `specs` / `condition` / `name`
 * existed is re-parsed by TODAY's component. Every new field is read defensively
 * for that reason: an old reply must render as it did, never crash the thread.
 */
function Specs({ e }: { e: SynthesisEntityView }) {
  const { t } = useTranslation()
  const chips = [
    ...(e.specs ?? []).map(s => ({ id: s.key, text: t('shoppingDecision.spec.' + s.key, { value: String(s.value) }) })),
    ...(e.condition
      ? [{
        id: 'condition',
        // The seller's own wording is the fallback: a label with no dictionary
        // entry is still what the listing said, and saying it beats dropping it.
        text: e.condition.key ? t('shoppingDecision.condition.' + e.condition.key) : e.condition.label,
      }]
      : []),
  ].filter(c => c.text.trim().length > 0)
  if (chips.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-1" data-testid="product-specs">
      {chips.map(c => (
        <span key={c.id} className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          {c.text}
        </span>
      ))}
    </div>
  )
}

/**
 * One product, compact but complete: image, name, price, match, seller, action.
 * Every non-lead entity, in both the Pick and the no-Pick composition.
 */
function ProductRow({ e, showMatch }: { e: SynthesisEntityView; showMatch: boolean }) {
  const { t, locale } = useTranslation()
  const offer = featuredOffer(e)
  const dest = offerDestination(offer?.url ?? null, offer?.seller ?? null)
  return (
    <div className="flex gap-2.5 rounded-xl border border-gray-200 p-2.5 dark:border-gray-700" data-testid="product-row">
      {e.image && (
        <img
          src={e.image}
          alt={e.name || e.config}
          loading="lazy"
          onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none' }}
          className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 text-sm font-medium text-gray-900 dark:text-gray-100">{e.name || e.config}</span>
          {showMatch && <MatchBadge m={e.matchesRequest} />}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span className="tabular-nums font-medium text-gray-800 dark:text-gray-200">
            {formatVndRange(e.priceLow, e.priceHigh, locale as PriceLocale, t('shoppingDecision.noPrice'))}
          </span>
          {offer?.seller && <span className="truncate">{offer.seller}</span>}
          <Rating o={offer} />
        </div>
        <Specs e={e} />
        {offer?.url && (
          <a
            href={offer.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-block text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
          >
            {dest ? offerActionLabel(dest, t) : t('shoppingDecision.view')}
          </a>
        )}
      </div>
    </div>
  )
}

export default function ShoppingDecision({
  view,
  heroImage,
  onPriceWatch,
}: {
  view: SynthesisView
  heroImage?: string | null
  /**
   * Prefills the composer with the shipped price-watch phrasing, so the action
   * runs through the existing `save_price_watch` flow rather than a new one.
   * Optional: tests and any other host may omit it, and the button then does not
   * render at all rather than rendering as a dead control.
   */
  onPriceWatch?: (productName: string) => void
}) {
  const { t, locale } = useTranslation()
  const entities = view.entities
  if (!entities || entities.length === 0) return null

  const rec = view.recommendation
  // `recommended` is the backend's flag, never this component's opinion.
  const recommended = entities.find(e => e.recommended) ?? null
  const others = entities.filter(e => e !== recommended)
  const reasons = rec && recommended && rec.entityKey === recommended.key ? rec.reasons : []

  /**
   * The badge answers "does this match what you asked for" — so it is offered
   * only when the user asked for something. `requested` is null when the turn
   * named no configuration (see SynthesisView), and a view stored before that
   * field existed keeps today's behaviour by falling back to showing it.
   */
  const showMatch = view.requested !== null
  const recOffer = recommended ? featuredOffer(recommended, rec?.seller) : null
  const restOffers = recommended ? recommended.offers.filter(o => o !== recOffer) : []
  // The entity's own representative photo (from the marker) is authoritative; the
  // scraped `heroImage` from injected prose is only a fallback for older replies.
  const hero = recommended?.image ?? heroImage ?? null
  const watchName = recommended ? (recommended.name || recommended.config) : ''
  const canWatch = !!onPriceWatch && !!recommended && !!watchName
    && (typeof recommended.priceLow === 'number' || typeof recOffer?.price === 'number')

  return (
    <div className="mt-3 animate-fade-in" data-testid="shopping-decision">
      {recommended ? (
        <div
          className="overflow-hidden rounded-2xl border border-primary-200 bg-primary-50/50 dark:border-primary-800 dark:bg-primary-900/10"
          data-testid="recommended-entity"
        >
          <div className="flex gap-3 p-3">
            {hero && (
              <img
                src={hero}
                alt={recommended.name || recommended.config}
                data-zoomable="true"
                loading="lazy"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                className="h-20 w-20 flex-shrink-0 cursor-zoom-in rounded-xl object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">{t('shoppingDecision.recommended')}</div>
              <div className="mt-0.5 flex flex-wrap items-start gap-2">
                <span className="font-semibold text-gray-900 dark:text-gray-100">{recommended.name || recommended.config}</span>
                {showMatch && <MatchBadge m={recommended.matchesRequest} />}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium tabular-nums text-gray-800 dark:text-gray-200">
                  {formatVndRange(recommended.priceLow, recommended.priceHigh, locale as PriceLocale, t('shoppingDecision.noPrice'))}
                </span>
                <Rating o={recOffer} />
              </div>
              <Specs e={recommended} />
              {reasons.length > 0 && (
                <ul className="mt-2 space-y-0.5" data-testid="pick-reasons">
                  {reasonList(reasons, t, locale).map((text, i) => (
                    <li key={i} className="flex gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                      <span className="text-primary-500">·</span><span className="min-w-0">{text}</span>
                    </li>
                  ))}
                </ul>
              )}
              {rec?.tradeOff && (
                <div className="mt-1.5 text-xs text-amber-700 dark:text-amber-300" data-testid="pick-tradeoff">
                  {t('shoppingDecision.tradeOff')}: {reasonList([rec.tradeOff], t, locale)[0]}
                </div>
              )}
              {rec?.conditional && (
                <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{t('shoppingDecision.conditional')}</div>
              )}
            </div>
          </div>
          <div className="divide-y divide-gray-100 border-t border-primary-100 px-3 dark:divide-gray-800 dark:border-primary-900/40">
            {recOffer && <OfferRow o={recOffer} />}
            {restOffers.map((o, i) => <OfferRow key={i} o={o} />)}
          </div>
          {canWatch && (
            <div className="border-t border-primary-100 px-3 py-2 dark:border-primary-900/40">
              <button
                type="button"
                onClick={() => onPriceWatch!(watchName)}
                data-testid="price-watch-action"
                className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100/60 dark:text-primary-300 dark:hover:bg-primary-900/30"
              >
                <Bell size={13} aria-hidden="true" />
                {t('shoppingDecision.priceWatch')}
              </button>
            </div>
          )}
        </div>
      ) : (
        // No deterministic winner. Say so, and rank — never crown.
        <div data-testid="shortlist-header">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('shoppingDecision.shortlistTitle')}</div>
          <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t('shoppingDecision.shortlistNote')}</div>
        </div>
      )}

      {others.length > 0 && (
        <div className="mt-3">
          {recommended && (
            <div className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">{t('shoppingDecision.otherOptions')}</div>
          )}
          <div className="space-y-2">
            {others.map(e => <ProductRow key={e.key} e={e} showMatch={showMatch} />)}
          </div>
        </div>
      )}
    </div>
  )
}
