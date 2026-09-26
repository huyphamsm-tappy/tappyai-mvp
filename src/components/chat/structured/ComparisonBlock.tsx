'use client'

import { useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'

// ── P4-03 · ComparisonBlock (DD-005) ────────────────────────────────────────
//
// Resolves several viable options into ONE decision. It is a block inside the thread, never a
// route (DD-005: "Do NOT create a comparison route") — comparison is a moment in a decision, not
// a destination.
//
// It computes NOTHING about which option is better. `recommendedKey` and `reason` come from the
// backend, exactly as ShoppingDecision reads its recommendation from the synthesis view. The only
// judgements this component makes are presentational: which rows differ, and which to collapse.
//
// HONESTY RULE. A missing value renders as an explicit "chưa rõ" / "unknown" — never a blank cell,
// never a dash (which reads as "none"), never an inferred value. An attribute missing for EVERY
// entity is dropped entirely rather than shown as a row of unknowns, because a row that says
// nothing about anything is noise, not honesty.

export interface ComparisonEntity {
  /** Stable identity — also what `recommendedKey` points at. */
  key: string
  label: string
  /** Attribute values by attribute key. `null`/absent means genuinely unknown. */
  values: Record<string, string | null | undefined>
  /** Optional per-entity action. */
  action?: { label: string; onClick: () => void }
}

export interface ComparisonAttribute {
  key: string
  label: string
}

export interface ComparisonBlockProps {
  entities: ComparisonEntity[]
  attributes: ComparisonAttribute[]
  /** The backend's recommendation. Null when it did not make one. */
  recommendedKey?: string | null
  /** Why that option is recommended. A recommendation without a reason is not shipped (DD-005). */
  reason?: string | null
  /** Rendered collapsed-with-a-toggle when true (Web is inline+expandable). */
  collapsible?: boolean
  defaultExpanded?: boolean
}

/** DD-005 caps. Beyond these, comparison stops helping and starts overwhelming. */
export const MAX_ENTITIES = 4
export const MAX_ATTRIBUTES = 6

/**
 * Selects the attributes worth showing.
 *
 * Three rules, in order:
 *   1. drop an attribute no entity has a value for — it says nothing about anything;
 *   2. separate attributes where every entity shares one value ("same for all") from the ones that
 *      actually differ, so the differences are what the eye lands on;
 *   3. cap the differing rows at MAX_ATTRIBUTES.
 *
 * Exported for direct testing: this is the only judgement the component makes, so it is the part
 * worth pinning independently of the DOM.
 */
export function selectAttributes(
  entities: ComparisonEntity[],
  attributes: ComparisonAttribute[],
): { differing: ComparisonAttribute[]; identical: ComparisonAttribute[] } {
  const differing: ComparisonAttribute[] = []
  const identical: ComparisonAttribute[] = []

  for (const attr of attributes) {
    const raw = entities.map(e => e.values[attr.key])
    const known = raw.filter((v): v is string => typeof v === 'string' && v.length > 0)
    if (known.length === 0) continue // nobody has a value — drop the row entirely

    const allKnown = known.length === entities.length
    const allSame = known.every(v => v === known[0])
    if (allKnown && allSame) identical.push(attr)
    else differing.push(attr)
  }

  return { differing: differing.slice(0, MAX_ATTRIBUTES), identical }
}

export default function ComparisonBlock({
  entities,
  attributes,
  recommendedKey = null,
  reason = null,
  collapsible = true,
  defaultExpanded = false,
}: ComparisonBlockProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(defaultExpanded || !collapsible)

  // Comparison is not offered below two entities — there is nothing to compare.
  const shown = entities.slice(0, MAX_ENTITIES)
  if (shown.length < 2) return null

  const { differing, identical } = selectAttributes(shown, attributes)
  if (differing.length === 0 && identical.length === 0) return null

  const count = String(shown.length)

  if (collapsible && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        data-testid="comparison-expand"
        className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl border border-gray-200 px-4 py-2 text-sm font-medium text-link transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
      >
        {t('comparison.expand', { count })}
      </button>
    )
  }

  return (
    <section
      className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
      data-testid="comparison-block"
      aria-label={t('comparison.title', { count })}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('comparison.title', { count })}
        </h3>
        {collapsible && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            data-testid="comparison-collapse"
            className="min-h-[44px] px-2 text-xs font-medium text-link"
          >
            {t('comparison.collapse')}
          </button>
        )}
      </div>

      {/* Wide content scrolls inside its own container; the page never scrolls sideways. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{t('comparison.title', { count })}</caption>
          <thead>
            <tr className="border-y border-gray-100 dark:border-gray-800">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-white px-4 py-2 text-left text-xs font-medium text-gray-500 dark:bg-gray-900 dark:text-gray-400"
              >
                {t('comparison.attribute')}
              </th>
              {shown.map(e => (
                <th
                  key={e.key}
                  scope="col"
                  className="whitespace-nowrap px-4 py-2 text-left font-semibold text-gray-900 dark:text-gray-100"
                >
                  <span className="flex items-center gap-1.5">
                    {e.label}
                    {e.key === recommendedKey && (
                      // Colour is never the only signal — the badge carries text too.
                      <span
                        data-testid="comparison-recommended-badge"
                        className="rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-medium text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
                      >
                        ✓ {t('comparison.recommended')}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {differing.map(attr => (
              <tr key={attr.key} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-white px-4 py-2 text-left text-xs font-medium text-gray-500 dark:bg-gray-900 dark:text-gray-400"
                >
                  {attr.label}
                </th>
                {shown.map(e => {
                  const v = e.values[attr.key]
                  const known = typeof v === 'string' && v.length > 0
                  return (
                    <td
                      key={e.key}
                      className={
                        known
                          ? 'px-4 py-2 tabular-nums text-gray-900 dark:text-gray-100'
                          : 'px-4 py-2 italic text-gray-500 dark:text-gray-400'
                      }
                    >
                      {known ? v : t('comparison.unknown')}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {identical.length > 0 && (
        <p className="px-4 pt-2 text-xs text-gray-500 dark:text-gray-400" data-testid="comparison-identical">
          {t('comparison.sameForAll')}: {identical.map(a => a.label).join(' · ')}
        </p>
      )}

      {recommendedKey && reason && (
        <p
          className="border-t border-gray-100 px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300"
          data-testid="comparison-reason"
        >
          <span className="font-medium">{t('comparison.reason')}:</span> {reason}
        </p>
      )}

      {shown.some(e => e.action) && (
        <div className="flex flex-wrap gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
          {shown.map(e =>
            e.action ? (
              <button
                key={e.key}
                type="button"
                onClick={e.action.onClick}
                className={
                  e.key === recommendedKey
                    ? 'min-h-[44px] rounded-2xl bg-interactive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-interactive-hover'
                    : 'min-h-[44px] rounded-2xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                }
              >
                {e.action.label}
              </button>
            ) : null,
          )}
        </div>
      )}
    </section>
  )
}
