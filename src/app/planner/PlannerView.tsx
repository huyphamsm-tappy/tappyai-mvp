'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { ComponentProps } from 'react'
import type Header from '@/components/Header'
import {
  CalendarRange, MapPin, Users, Wallet, ChevronRight, ChevronDown, Sparkles, Route,
} from 'lucide-react'
import V3Shell, { V3Footer } from '@/components/v3/V3Shell'
import { ChipRow } from '@/components/v3/Panel'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { formatRelativeTime } from '@/lib/utils'
import { plannerFacets, type DerivedPlan, type PlanKind } from '@/lib/planner/derivePlans'

// ── V3 Web · AI Planner (My Plans) ──────────────────────────────────────────
//
// 🚨 EVERY VALUE ON THIS SCREEN CAME OUT OF A PLAN THE USER ALREADY RECEIVED.
//
// The reference mockup for this surface showed date ranges, status pills and cover photographs of
// Đà Lạt and Phú Quốc. `derivePlans` explains, field by field, why three of those four cannot be
// rendered honestly — plans carry no dates, no status and no plan-level image. What this page
// does instead is show what a plan REALLY contains, and show enough of it that the card is worth
// looking at: how many days, how many stops, for how many people, at what budget, through which
// kinds of place, and the first real photograph of a real stop when the enrichment step found one.
//
// 🚨 THE PAGE IS NOT A LIST OF LINKS. A planner that only says "you have 3 plans" and sends you
// elsewhere to read them is a table of contents. Each card OPENS IN PLACE into the actual
// itinerary — the same days, times, places, prices and map links the model produced — so the
// answer to "what was my Đà Lạt plan again?" is on this page. `TripPlanCard` still owns the
// in-thread rendering and is untouched; this is the same data at list altitude, in V3 chrome.
//
// 🚨 NOTHING HERE MUTATES A PLAN. There is no edit flow in this product — no API accepts a
// modified plan, and the marker lives inside an assistant message that the user does not author.
// Painting Edit / Duplicate / Archive controls would be drawing buttons over a capability that
// does not exist. Changing a plan means asking Tappy, which is exactly what the CTA does.

/** kind → the chip that names it. Two values, because the contract has two. */
const KIND_LABEL: Record<PlanKind, string> = {
  trip: 'v3.planner.travel',
  evening: 'v3.planner.evening',
}

export default function PlannerView({
  user,
  plans,
}: {
  user: ComponentProps<typeof Header>['user']
  plans: DerivedPlan[]
}) {
  const { t, locale } = useTranslation()
  const [filter, setFilter] = useState(0)

  // Only kinds the user actually has — see `plannerFacets`. An empty array means the chip row
  // does not render at all, which is right when there is nothing to narrow.
  const facets = useMemo(() => plannerFacets(plans), [plans])
  const activeKind = filter === 0 ? null : facets[filter - 1] ?? null
  const visible = activeKind ? plans.filter((p) => p.kind === activeKind) : plans

  const askHref = `/chat?q=${encodeURIComponent(t('v3.planner.prompt'))}`

  return (
    <V3Shell
      title={t('v3.planner.title')}
      subtitle={t('v3.planner.subtitle')}
      activeTab="/planner"
      user={user ? { name: user.full_name, avatarUrl: user.avatar_url } : null}
    >
      {/* The column-fills-the-viewport treatment `/profile/notifications` established: the list
          region takes the slack so a short page still puts the footer at the bottom instead of
          stranding it mid-screen. Scoped here, like it is there — the shell is not touched. */}
      <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - var(--v3-header-h) - 5.5rem)' }}>
        {/* ── Filters, the real count, and the one action this surface has ──────────── */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {facets.length > 0 && (
              <ChipRow
                className="min-w-0"
                items={[t('v3.planner.all'), ...facets.map((k) => t(KIND_LABEL[k]))]}
                activeIndex={filter}
                onSelect={setFilter}
              />
            )}
            {plans.length > 0 && (
              <span className="flex-shrink-0 text-[12px]" style={{ color: 'var(--v3-fg-muted)' }}>
                {t('v3.planner.count', { n: String(plans.length) })}
              </span>
            )}
          </div>

          {/* 🔑 The CTA is a LINK into chat with the prompt pre-filled — the same `/chat?q=`
              mechanism Home's chips use. Planning happens in the conversation; this page has no
              composer of its own and does not pretend to create anything. */}
          <Link
            href={askHref}
            className="inline-flex min-h-[36px] flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
            style={{ background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}
          >
            <Sparkles size={14} aria-hidden="true" />
            {t('v3.planner.cta')}
          </Link>
        </div>

        {/* ── The plans ─────────────────────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col gap-4 pt-4">
          {plans.length === 0 && <EmptyState text={t('v3.planner.empty')} ctaHref={askHref} ctaLabel={t('v3.planner.cta')} />}

          {plans.length > 0 && visible.length === 0 && <EmptyState text={t('v3.planner.emptyFiltered')} />}

          {visible.length > 0 && (
            <>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {visible.map((p) => (
                  <PlanCard key={p.id} plan={p} locale={locale} />
                ))}
              </div>
              {/* Says where the list comes from, so an older plan that has fallen outside the
                  scanned window is explained rather than simply missing. */}
              <p className="px-1 text-[11px]" style={{ color: 'var(--v3-fg-muted)' }}>
                {t('v3.planner.scope')}
              </p>
            </>
          )}
        </div>

        <V3Footer />
      </div>
    </V3Shell>
  )
}

/**
 * One plan.
 *
 * Collapsed it is a summary; expanded it is the itinerary. The expansion is the reason this page
 * is a planner rather than an index — see the note at the top.
 */
function PlanCard({ plan, locale }: { plan: DerivedPlan; locale: 'vi' | 'en' }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <article
      className="flex flex-col overflow-hidden rounded-2xl border transition-colors"
      style={{ background: 'var(--v3-panel)', borderColor: 'var(--v3-border)' }}
    >
      <div className="flex gap-3 p-3">
        {/* 🚨 THE THUMBNAIL IS A REAL PHOTOGRAPH OF A REAL STOP, or it is a glyph. `coverUrl` is
            `PlanItem.photo_url`, injected server-side from a matched place; there is no plan-level
            image in the contract and no placeholder pool standing in for one. A plan whose stops
            were never enriched gets the calendar mark — honest, and still composed. */}
        {plan.coverUrl ? (
          // Place photos are arbitrary remote URLs from the enrichment step, not a configured
          // next/image domain — the same reason `TripPlanCard` renders them with a plain <img>.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={plan.coverUrl}
            alt=""
            loading="lazy"
            onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
            className="h-[72px] w-[72px] flex-shrink-0 rounded-xl object-cover"
            style={{ background: 'var(--v3-panel-elevated)' }}
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-[72px] w-[72px] flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-violet)' }}
          >
            <CalendarRange size={22} />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h2 className="min-w-0 flex-1 text-[14px] font-semibold leading-snug" style={{ color: 'var(--v3-fg)' }}>
              {plan.title}
            </h2>
            {/* Rendered only when the payload actually said which kind it is. */}
            {plan.kind && (
              <span
                className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                style={{ background: 'color-mix(in srgb, var(--v3-violet) 16%, transparent)', color: 'var(--v3-violet)' }}
              >
                {t(KIND_LABEL[plan.kind])}
              </span>
            )}
          </div>

          {/* ── The facts, and only the ones this plan carries ──────────────────────
              Days and stops are counted from the itinerary, so they are always true. People and
              budget are optional in the contract and simply absent when the model did not record
              them. There is no default party size, because a default would be a claim about who
              is going — and nothing in the payload said. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]" style={{ color: 'var(--v3-fg-secondary)' }}>
            <Fact icon={<CalendarRange size={12} />} text={t('v3.planner.days', { n: String(plan.dayCount) })} />
            <Fact icon={<Route size={12} />} text={t('v3.planner.stops', { n: String(plan.stopCount) })} />
            {plan.people !== null && <Fact icon={<Users size={12} />} text={t('v3.planner.people', { n: String(plan.people) })} />}
            {plan.budgetTotal && <Fact icon={<Wallet size={12} />} text={plan.budgetTotal} />}
          </div>

          {/* A glance at what KIND of stops the plan is made of, using each stop's own emoji.
              Real per-item data; no invented iconography. */}
          {plan.stops.length > 0 && (
            <p className="mt-1.5 truncate text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>
              {plan.stops.map((s) => `${s.emoji || '📍'} ${s.name}`).join(' · ')}
              {plan.stopCount > plan.stops.length && ` · ${t('v3.planner.more', { n: String(plan.stopCount - plan.stops.length) })}`}
            </p>
          )}
        </div>
      </div>

      {/* ── Footer: when the thread last moved, and the two ways on ─────────────────── */}
      <div
        className="flex items-center justify-between gap-2 border-t px-3 py-2"
        style={{ borderColor: 'var(--v3-border)' }}
      >
        {/* 🚨 LABELLED AS THREAD ACTIVITY, NOT AS A PLAN DATE. `updatedAt` is the conversation's
            `updated_at`; there is no per-plan timestamp in the contract. The "Updated {when}"
            wording says what is true — a BARE date beside a trip title would be read as the
            travel date, which is the mockup's fabrication arriving by another route. */}
        <span className="truncate text-[11px]" style={{ color: 'var(--v3-fg-muted)' }}>
          {t('v3.planner.lastActivity', { when: formatRelativeTime(plan.updatedAt, t, locale) })}
        </span>

        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex min-h-[30px] items-center gap-1 rounded-full px-2.5 text-[11.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
            style={{ color: 'var(--v3-fg-secondary)' }}
          >
            {open ? t('v3.planner.collapse') : t('v3.planner.expand')}
            <ChevronDown
              size={13}
              aria-hidden="true"
              className="transition-transform"
              style={{ transform: open ? 'rotate(180deg)' : undefined }}
            />
          </button>
          <Link
            href={plan.href}
            className="inline-flex min-h-[30px] items-center gap-0.5 rounded-full px-2.5 text-[11.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2"
            style={{ color: 'var(--v3-accent)' }}
          >
            {t('v3.planner.open')}
            <ChevronRight size={13} aria-hidden="true" />
          </Link>
        </div>
      </div>

      {open && <Itinerary plan={plan} />}
    </article>
  )
}

function Fact({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden="true" style={{ color: 'var(--v3-fg-muted)' }}>{icon}</span>
      {text}
    </span>
  )
}

/**
 * The plan, opened.
 *
 * Days become tabs only when there is more than one — a lone tab above a lone day is chrome
 * pretending to be navigation. Each stop renders the fields the payload actually has, in
 * itinerary order: the model's time, its emoji, the place's real name, the price it estimated, and
 * the Google Maps link the tool returned. A missing field draws nothing.
 */
function Itinerary({ plan }: { plan: DerivedPlan }) {
  const { t } = useTranslation()
  const [day, setDay] = useState(0)
  const days = plan.plan.days
  const current = days[day] ?? days[0]

  return (
    <div className="border-t" style={{ borderColor: 'var(--v3-border)', background: 'var(--v3-panel-elevated)' }}>
      {days.length > 1 && (
        <div className="border-b px-3 py-2" style={{ borderColor: 'var(--v3-border)' }}>
          <ChipRow items={days.map((d) => d.label)} activeIndex={day} onSelect={setDay} />
        </div>
      )}

      <ol className="divide-y" style={{ borderColor: 'var(--v3-border)' }}>
        {(current?.items ?? []).map((item, i) => (
          <li key={i} className="flex gap-3 px-3 py-2.5">
            {/* The model's own time string, monospaced so a column of them lines up. Blank when it
                did not write one — never back-filled with a guess. */}
            <span
              className="w-10 flex-shrink-0 pt-0.5 font-mono text-[11px] leading-none"
              style={{ color: 'var(--v3-fg-muted)' }}
            >
              {item.time || ''}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium leading-snug" style={{ color: 'var(--v3-fg)' }}>
                <span aria-hidden="true">{item.emoji || '📍'}</span> {item.name}
                {item.price && (
                  <span className="ml-1.5 text-[11px] font-semibold" style={{ color: 'var(--v3-accent)' }}>
                    {item.price}
                  </span>
                )}
              </p>

              {item.description && (
                <p className="mt-0.5 text-[11.5px] leading-relaxed" style={{ color: 'var(--v3-fg-secondary)' }}>
                  {item.description}
                </p>
              )}

              {item.maps_link && (
                <a
                  href={item.maps_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
                  style={{ color: 'var(--v3-accent)' }}
                >
                  <MapPin size={11} aria-hidden="true" />
                  {t('v3.planner.map')}
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * Nothing to show, composed rather than left over — the shape `/profile/notifications` settled on
 * after getting it wrong in both directions: the REGION takes the slack so the footer stays at the
 * bottom, and the panel keeps its own modest size, centred in it.
 *
 * The all-empty case carries the CTA, because a planner with no plans has exactly one useful
 * next step. The filtered-empty case does not: the user has plans, just not of that kind, and the
 * action they want is another chip.
 */
function EmptyState({ text, ctaHref, ctaLabel }: { text: string; ctaHref?: string; ctaLabel?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div
        className="flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-9 text-center"
        style={{ borderColor: 'var(--v3-border)', color: 'var(--v3-fg-muted)' }}
      >
        <span
          aria-hidden="true"
          className="flex h-11 w-11 items-center justify-center rounded-full"
          style={{ background: 'var(--v3-panel)', color: 'var(--v3-fg-muted)' }}
        >
          <CalendarRange size={26} />
        </span>
        <p className="max-w-[34ch] text-[13px] leading-relaxed">{text}</p>
        {ctaHref && ctaLabel && (
          <Link
            href={ctaHref}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-4 text-[12.5px] font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}
          >
            <Sparkles size={14} aria-hidden="true" />
            {ctaLabel}
          </Link>
        )}
      </div>
    </div>
  )
}
