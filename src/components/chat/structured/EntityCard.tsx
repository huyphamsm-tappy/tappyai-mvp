'use client'

import type { ReactNode } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import MatchBadge, { type MatchVerdict } from './MatchBadge'

// ── P4-16 · EntityCard — the entity-agnostic base shape (DD-013) ────────────
//
// V3 FOUNDATION, not commerce. Commerce is FUTURE: no cart, no checkout, no catalogue, no
// merchant onboarding, no CS-Cart vocabulary anywhere in this file. What exists here is only the
// CARD SHAPE, so that when a product or merchant entity eventually arrives it does not force a
// rewrite of the recommendation UI.
//
// The variant is a label, not a behaviour. `place` is the only one V3 renders; `product` and
// `merchant` exist so the type is honest about where this is going, and they change nothing about
// what the component does today.
//
// THE HONESTY RULE. Every optional slot collapses when absent — a missing image leaves no grey
// placeholder box, a missing price shows the explicit unknown, and no slot is ever filled with a
// derived or plausible-looking value. A card renders what the backend supplied and nothing else.

export type EntityVariant = 'place' | 'product' | 'merchant'

export interface EntityAction {
  label: string
  onClick?: () => void
  href?: string
  /** External destinations open in a new tab and are marked as leaving the app. */
  external?: boolean
}

export interface EntityCardProps {
  variant?: EntityVariant
  /** Required. A card with no title is not a card. */
  title: string
  summary?: string | null
  image?: string | null
  /** At most three; more is noise on a phone. Absent entries are dropped, never shown blank. */
  metadata?: Array<string | null | undefined>
  /** Pre-formatted by the caller — this component never formats or computes money. */
  price?: string | null
  match?: MatchVerdict | null
  /** Exactly one primary action (UX spec §5.1). */
  primaryAction?: EntityAction
  /** At most one secondary action. */
  secondaryAction?: EntityAction
  /** Rendered under the card body — offers, reasons, whatever the caller owns. */
  children?: ReactNode
  highlighted?: boolean
  /**
   * Whether an absent price is worth SAYING is unknown.
   *
   * 🚨 DEFAULT TRUE, BECAUSE FOR A PRODUCT IT IS. A listing with no price is a
   * gap the buyer must notice, so the card says so rather than leaving a blank.
   * A cafe is the opposite case: Google publishes a price band for a minority of
   * venues, so an explicit unknown under every second place is noise about
   * nothing, and the honesty rule ("a slot collapses when it has nothing to
   * say") is better served by omitting it. Callers opt out; the default stands.
   */
  showUnknownPrice?: boolean
}

const MAX_METADATA = 3

function ActionButton({ action, primary }: { action: EntityAction; primary: boolean }) {
  const cls = primary
    ? 'inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-interactive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-interactive-hover'
    : 'inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'

  if (action.href) {
    return (
      <a
        href={action.href}
        target={action.external ? '_blank' : undefined}
        rel={action.external ? 'noopener noreferrer' : undefined}
        className={cls}
      >
        {action.label}
      </a>
    )
  }
  return (
    <button type="button" onClick={action.onClick} className={cls}>
      {action.label}
    </button>
  )
}

export default function EntityCard({
  variant = 'place',
  title,
  summary = null,
  image = null,
  metadata = [],
  price = null,
  match = null,
  primaryAction,
  secondaryAction,
  children,
  highlighted = false,
  showUnknownPrice = true,
}: EntityCardProps) {
  const { t } = useTranslation()
  const meta = metadata.filter((m): m is string => typeof m === 'string' && m.length > 0).slice(0, MAX_METADATA)

  return (
    <div
      data-testid="entity-card"
      data-variant={variant}
      className={
        highlighted
          ? 'overflow-hidden rounded-2xl border border-primary-200 bg-primary-50/50 dark:border-primary-800 dark:bg-primary-900/10'
          : 'overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'
      }
    >
      <div className="flex gap-3 p-3">
        {/* A missing image collapses. It never becomes a grey rectangle pretending something is
            loading, and it never becomes a stock photo of something else. */}
        {image && (
          <img
            src={image}
            alt=""
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            className="h-20 w-20 flex-shrink-0 rounded-xl object-cover"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
            {match && <MatchBadge m={match} />}
          </div>

          {summary && (
            <p className="mt-0.5 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">{summary}</p>
          )}

          {meta.length > 0 && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{meta.join(' · ')}</p>
          )}

          {(price || showUnknownPrice) && (
            <p className="mt-1 text-sm tabular-nums text-gray-700 dark:text-gray-300">
              {price ?? t('entity.unknown')}
            </p>
          )}
        </div>
      </div>

      {children}

      {(primaryAction || secondaryAction) && (
        <div className="flex flex-wrap gap-2 border-t border-gray-100 px-3 py-3 dark:border-gray-800">
          {primaryAction && <ActionButton action={primaryAction} primary />}
          {secondaryAction && <ActionButton action={secondaryAction} primary={false} />}
        </div>
      )}
    </div>
  )
}

/**
 * The `place` variant as a consultative reply renders it.
 *
 * A thin alias rather than a second component: the UX spec calls this shape a RecommendationCard,
 * and naming it keeps call sites readable, but there is deliberately only one implementation to
 * keep in step.
 */
export function RecommendationCard(props: Omit<EntityCardProps, 'variant'>) {
  return <EntityCard {...props} variant="place" highlighted={props.highlighted ?? true} />
}
