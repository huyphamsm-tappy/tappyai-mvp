'use client'

import { useState } from 'react'
import { Star, MapPin, ChevronDown, ChevronUp, CalendarDays, Users, Wallet, Route } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import type { ShareArtifact } from '@/lib/share/shareArtifact'
import { BRAND } from '@/lib/share/openGraph'
import { brochureOf, type PlanShareSnapshot } from '@/lib/plans/share/planShare'
import { fill, planBrochureStrings } from '@/lib/i18n/planBrochure'
import TappyLockup, { TappyWordmark } from '@/components/brand/TappyLockup'

// ── WHAT THE RECIPIENT WILL SEE, SHOWN BEFORE IT IS SENT ─────────────────────
//
// The preview is rendered FROM THE ARTIFACT, never from the card the user is
// looking at. That is the guarantee: if a field is not in `SharedPlace`, it is
// not on this preview, and it is not in the message. What you see is what leaves.
//
// Branding: the plan mini-brochure carries the shipped lockup (`TappyLockup` —
// the app icon plus "Tappy" white / "AI" blue, as the sidebar renders it); the
// recommendation strip keeps its `/logo.svg` + `BRAND.name` identity row. No new
// wordmark, no mascot pose picked here (art is the owner's domain).

const PREVIEW_PLACES = 3

export default function SharePreview({ artifact }: { artifact: ShareArtifact }) {
  const { t, locale } = useTranslation()
  const [showAll, setShowAll] = useState(false)
  const shown = artifact.places.slice(0, PREVIEW_PLACES)
  const more = artifact.places.length - shown.length

  // A plan previews as the brochure it will become — the same snapshot the
  // page renders from, so nothing shows here that the recipient will not see.
  if (artifact.kind === 'plan' && artifact.plan) {
    return (
      <PlanMiniBrochure snapshot={artifact.plan} url={artifact.url} lang={locale === 'en' ? 'en' : 'vi'}>
        {/* Published: the LINK is what leaves (the page is the brochure), and it is already on the
            card, so there is no text block to inspect. Unpublished: the text channels carry the
            brochure TEXT, and it stays inspectable so nobody is surprised by what was sent. */}
        {!artifact.planLink && (
          <>
            <button type="button" onClick={() => setShowAll(v => !v)} className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: '#8FB8FF' }} aria-expanded={showAll}>
              {showAll ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {t('share.previewHint')}
            </button>
            {showAll && (
              <pre data-testid="share-preview-text" className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg p-2 text-[11px] leading-snug" style={{ background: 'rgba(255,255,255,0.05)', color: '#F4F6FB', border: '1px solid rgba(255,255,255,0.1)' }}>
                {artifact.text}
              </pre>
            )}
          </>
        )}
      </PlanMiniBrochure>
    )
  }

  return (
    <div
      data-testid="share-preview"
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: 'var(--v3-border, #e5e7eb)', background: 'var(--v3-panel-elevated, #f9fafb)' }}
    >
      {/* Identity strip */}
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--v3-border, #e5e7eb)' }}>
        {/* Plain <img>: a local SVG needs no next/image pipeline. */}
        <img src="/logo.svg" alt="" aria-hidden="true" width={22} height={22} className="rounded-md" />
        <span className="text-sm font-semibold" style={{ color: 'var(--v3-fg, #111827)' }}>{BRAND.name}</span>
        <span className="text-xs" style={{ color: 'var(--v3-fg-muted, #6b7280)' }}>· {t('share.previewFrom')}</span>
      </div>

      <div className="px-3 py-2.5 space-y-2">
        <p className="text-sm font-medium leading-snug" style={{ color: 'var(--v3-fg, #111827)' }}>{artifact.subject}</p>

        {artifact.kind === 'places' && shown.length > 0 && (
          <ul className="space-y-1.5">
            {shown.map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex gap-2 text-xs" data-testid="share-preview-place">
                {p.image ? (
                  <img src={p.image} alt="" aria-hidden="true" width={36} height={36} className="h-9 w-9 flex-shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="h-9 w-9 flex-shrink-0 rounded-lg" style={{ background: 'var(--v3-border, #e5e7eb)' }} aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="font-medium truncate" style={{ color: 'var(--v3-fg, #111827)' }}>{i + 1}. {p.name}</p>
                  <p className="flex flex-wrap items-center gap-x-2" style={{ color: 'var(--v3-fg-muted, #6b7280)' }}>
                    {typeof p.rating === 'number' && (
                      <span className="inline-flex items-center gap-0.5 tabular-nums">
                        <Star size={10} className="text-amber-400" aria-hidden="true" />{p.rating}
                        {typeof p.ratingCount === 'number' && <span>({p.ratingCount})</span>}
                      </span>
                    )}
                    {p.category && <span>{p.category}</span>}
                  </p>
                  {p.address && (
                    <p className="flex items-start gap-1 truncate" style={{ color: 'var(--v3-fg-muted, #6b7280)' }}>
                      <MapPin size={10} className="mt-0.5 flex-shrink-0" aria-hidden="true" /><span className="truncate">{p.address}</span>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {more > 0 && (
          <p className="text-xs" style={{ color: 'var(--v3-fg-muted, #6b7280)' }}>{t('share.morePlaces', { n: String(more) })}</p>
        )}

        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium"
          style={{ color: 'var(--v3-accent, #2563eb)' }}
          aria-expanded={showAll}
        >
          {showAll ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {t('share.previewHint')}
        </button>
        {showAll && (
          <pre
            data-testid="share-preview-text"
            className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg p-2 text-[11px] leading-snug"
            style={{ background: 'var(--v3-panel, #fff)', color: 'var(--v3-fg, #111827)', border: '1px solid var(--v3-border, #e5e7eb)' }}
          >
            {artifact.text}
          </pre>
        )}
      </div>
    </div>
  )
}

const PREVIEW_DAYS = 3
const PREVIEW_STOPS_PER_DAY = 3

/**
 * The mini brochure: the same composition as /plan/<shareId>, at card size.
 *
 * Hero from the plan's own first canonical photo — and, 🚨 THE IMAGE RULE, a
 * text header with no image frame when there is none (no placeholder icon, no
 * stock art, no clip thumbnail, nothing borrowed) — the eyebrow, title and real
 * counts, the first days as "time · name" lines, the link it will carry, and the
 * attribution. Every value is a snapshot field or a count of them — the page can
 * only show more of the same.
 */
function PlanMiniBrochure({ snapshot, url, lang, children }: { snapshot: PlanShareSnapshot; url: string; lang: 'vi' | 'en'; children?: React.ReactNode }) {
  const s = planBrochureStrings(lang)
  const { hero, dayCount, stopCount } = brochureOf(snapshot)
  const days = snapshot.days.slice(0, PREVIEW_DAYS)
  const moreDays = snapshot.days.length - days.length
  const link = url.replace(/^https?:\/\//, '')

  return (
    <div data-testid="share-preview" data-plan-preview className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--v3-border, #e5e7eb)', background: '#0B1220', color: '#F4F6FB' }}>
      {hero ? (
        <div className="relative h-32 w-full overflow-hidden" data-plan-preview-hero data-has-photo="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- allow-listed CDN photo from the plan itself */}
          <img src={hero} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(7,10,18,0.05) 0%, rgba(7,10,18,0.85) 100%)' }} aria-hidden="true" />
          <div className="absolute left-3 top-2.5"><MiniBrand /></div>
          <div className="absolute bottom-2.5 left-3 right-3"><MiniTitle eyebrow={s.eyebrow} title={snapshot.title} /></div>
        </div>
      ) : (
        <div className="px-3 pb-1 pt-2.5" data-plan-preview-hero data-has-photo="false" style={{ background: 'linear-gradient(160deg, rgba(51,145,255,0.16), rgba(139,92,246,0.16)), #0B1220' }}>
          <MiniBrand />
          <div className="mt-2.5"><MiniTitle eyebrow={s.eyebrow} title={snapshot.title} /></div>
        </div>
      )}

      <div className="space-y-2 px-3 py-2.5">
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium" style={{ color: 'rgba(244,246,251,0.8)' }} data-plan-preview-meta>
          <li className="inline-flex items-center gap-1"><CalendarDays size={11} aria-hidden="true" />{fill(s.days, dayCount)}</li>
          <li className="inline-flex items-center gap-1"><Route size={11} aria-hidden="true" />{fill(s.stops, stopCount)}</li>
          {snapshot.people && <li className="inline-flex items-center gap-1"><Users size={11} aria-hidden="true" />{fill(s.people, snapshot.people)}</li>}
          {snapshot.budget_total && <li className="inline-flex items-center gap-1"><Wallet size={11} aria-hidden="true" />{snapshot.budget_total}</li>}
        </ul>

        <ol className="space-y-1.5">
          {days.map((d, i) => (
            <li key={i} data-plan-preview-day>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#8FB8FF' }}>{d.label}</p>
              <p className="truncate text-[11px]" style={{ color: 'rgba(244,246,251,0.85)' }}>
                {d.items.slice(0, PREVIEW_STOPS_PER_DAY).map(it => [it.time, it.name].filter(Boolean).join(' ')).join(' · ')}
                {d.items.length > PREVIEW_STOPS_PER_DAY ? ` · +${d.items.length - PREVIEW_STOPS_PER_DAY}` : ''}
              </p>
            </li>
          ))}
        </ol>
        {moreDays > 0 && <p className="text-[11px]" style={{ color: 'rgba(244,246,251,0.6)' }}>+{fill(s.days, moreDays)}</p>}

        <div className="flex items-center justify-between gap-2 border-t pt-2 text-[10.5px]" style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(244,246,251,0.6)' }}>
          <span>{s.madeBy} <TappyWordmark fontSize={11} /></span>
          <span className="truncate" data-plan-preview-link>{link}</span>
        </div>
        {children}
      </div>
    </div>
  )
}

/** The shipped lockup at card size — the app icon plus "Tappy" white / "AI" blue, never a text stand-in. */
function MiniBrand() {
  return <TappyLockup size={20} />
}

function MiniTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: '#8FB8FF' }}>{eyebrow}</p>
      <p className="mt-0.5 truncate text-base font-extrabold leading-tight" data-plan-preview-title>{title}</p>
    </>
  )
}
