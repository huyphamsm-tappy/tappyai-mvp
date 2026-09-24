'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { ComponentProps } from 'react'
import type Header from '@/components/Header'
import {
  CalendarRange, MapPin, Users, Wallet, ChevronRight, ChevronDown, Sparkles, Route, Plane, Ticket,
  MessageSquareText, ListChecks, History, Plus, type LucideIcon,
} from 'lucide-react'
import V3Shell, { V3Footer } from '@/components/v3/V3Shell'
import { ChipRow } from '@/components/v3/Panel'
import { TappyMascot } from '@/components/TappyMascot'
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
//
// The 2026-09-13 reskin added a hero (the owner's `delivery` pose — Tappy on the scooter — with a
// road, pins, a plane and a ticket, all decoration), three feature tiles, a side CTA card and a
// composed empty state. The reference's "share with friends" tile has no producer on this surface
// and is not drawn; its "smart suggestions" and "keep memories" tiles became descriptions of what
// the page does: plans are made in the chat, opened here day by day, read from recent threads.

/** kind → the chip that names it. Two values, because the contract has two. */
const KIND_LABEL: Record<PlanKind, string> = {
  trip: 'v3.planner.travel',
  evening: 'v3.planner.evening',
}

/** Three tiles, each one true of this page: the chat CTA, the in-place itinerary, the source. */
const FEATURES: { titleKey: string; descKey: string; icon: LucideIcon; tone: 'blue' | 'cyan' | 'orange' }[] = [
  { titleKey: 'v3.planner.featPlan', descKey: 'v3.planner.featPlanDesc', icon: MessageSquareText, tone: 'blue' },
  { titleKey: 'v3.planner.featItinerary', descKey: 'v3.planner.featItineraryDesc', icon: ListChecks, tone: 'cyan' },
  { titleKey: 'v3.planner.featSource', descKey: 'v3.planner.featSourceDesc', icon: History, tone: 'orange' },
]

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
        {/* ── Hero ─────────────────────────────────────────────────────────────────── */}
        <section className="v3-planner-hero" aria-labelledby="planner-hero-title" data-planner-hero>
          <div className="v3-planner-stars" aria-hidden="true" />
          <div className="flex flex-col gap-5 px-5 pb-4 pt-6 sm:px-8 sm:pb-5 sm:pt-8 md:flex-row md:items-center md:gap-6 lg:gap-8">
            <div className="min-w-0 flex-1">
              <span className="v3-planner-eyebrow inline-flex min-h-[36px] items-center gap-2 rounded-full px-4 text-[12.5px] font-bold uppercase">
                <CalendarRange size={15} aria-hidden="true" />
                {t('v3.planner.title')}
              </span>
              {/* The line break after the comma is the reference's; it only fits once the text column is
                  wide enough (xl, with the shell's sidebar beside it). Below that the title wraps naturally. */}
              <h1 id="planner-hero-title" className="mt-4 text-[30px] font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-[38px] md:text-[32px] lg:text-[36px] xl:text-[42px]">
                {t('v3.planner.heroTitle1')}
                <br className="hidden xl:inline" />
                {' '}{t('v3.planner.heroTitle2')}{' '}
                <span className="v3-planner-hero-accent">{t('v3.planner.heroTitle3')}</span>
              </h1>
              {/* The body is the real loop: ask in chat, get a day-by-day itinerary, find it again here. */}
              <p className="v3-planner-hero-muted mt-4 max-w-[50ch] text-[14.5px] leading-relaxed sm:text-[16px]">
                {t('v3.planner.heroBody')}
              </p>
            </div>

            {/* The scene: the owner's `delivery` pose — Tappy on the scooter, helmet and goggles —
                on a road with pins, a plane and a ticket. Illustration only; nothing here is a plan. */}
            <div className="relative mx-auto h-[230px] w-full max-w-[400px] flex-shrink-0 sm:h-[280px] md:h-[330px] md:w-[46%] md:max-w-[470px]" aria-hidden="true" data-planner-scene>
              <span className="v3-planner-bloom" style={{ left: '10%', right: '6%', top: '20%', bottom: '-6%' }} />
              <svg className="v3-planner-road" viewBox="0 0 400 200" preserveAspectRatio="none" style={{ left: '-4%', right: '-4%', bottom: '2%', height: '58%', width: '108%' }}>
                <path d="M -10 190 C 90 120, 140 200, 220 130 S 360 60, 420 30" fill="none" stroke="rgba(147, 197, 253, 0.35)" strokeWidth="14" strokeLinecap="round" />
                <path d="M -10 190 C 90 120, 140 200, 220 130 S 360 60, 420 30" fill="none" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="2" strokeDasharray="10 12" strokeLinecap="round" />
              </svg>
              <span className="v3-planner-orb v3-planner-float" data-tone="orange" style={{ left: '8%', top: '10%' }}><MapPin size={20} /></span>
              <span className="v3-planner-orb v3-planner-float" data-tone="rose" data-delay="2" style={{ right: '6%', top: '4%' }}><MapPin size={20} /></span>
              <span className="v3-planner-orb v3-planner-float" data-tone="blue" data-delay="1" style={{ right: '22%', top: '22%' }}><Plane size={20} /></span>
              <span className="v3-planner-ticket v3-planner-float" data-delay="1" style={{ left: '0%', top: '58%', transform: 'rotate(-8deg)' }}><Ticket size={16} />TAPPY</span>
              <span className="v3-planner-spark" style={{ left: '30%', top: '4%' }}><Sparkles size={18} /></span>
              <span className="v3-planner-spark" style={{ right: '2%', top: '46%' }}><Sparkles size={14} /></span>
              <p className="v3-planner-bubble" style={{ left: '12%', top: '30%' }} data-planner-bubble>{t('v3.planner.bubble')}</p>
              <span className="v3-planner-mascot" style={{ width: '70%', left: '15%', bottom: '-4%' }}>
                <TappyMascot pose="delivery" size={288} eager />
              </span>
            </div>
          </div>
          <ul className="flex flex-wrap gap-2 px-5 pb-6 sm:grid sm:grid-cols-3 sm:gap-2.5 sm:px-8 sm:pb-8" data-planner-features>
            {FEATURES.map((f) => (
              <li key={f.titleKey} className="v3-planner-feat" data-tone={f.tone}>
                <span className="v3-planner-feat-icon" aria-hidden="true"><f.icon size={17} /></span>
                <span className="min-w-0">
                  <span className="v3-planner-feat-title block text-[13.5px] font-bold leading-tight">{t(f.titleKey)}</span>
                  <span className="v3-planner-feat-desc mt-0.5 hidden text-[12px] leading-snug sm:block">{t(f.descKey)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── List header: title, the real count, filters, and the one action this surface has ── */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3" data-planner-head>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <h2 className="v3-planner-list-title text-[20px] font-extrabold leading-tight sm:text-[22px]">{t('v3.planner.listTitle')}</h2>
            {plans.length > 0 && (
              <span className="v3-planner-count" data-planner-count>
                {t('v3.planner.count', { n: String(plans.length) })}
              </span>
            )}
            {facets.length > 0 && (
              <ChipRow
                className="min-w-0"
                items={[t('v3.planner.all'), ...facets.map((k) => t(KIND_LABEL[k]))]}
                activeIndex={filter}
                onSelect={setFilter}
              />
            )}
          </div>

          {/* 🔑 The CTA is a LINK into chat with the prompt pre-filled — the same `/chat?q=`
              mechanism Home's chips use. Planning happens in the conversation; this page has no
              composer of its own and does not pretend to create anything. */}
          <Link
            href={askHref}
            className="v3-planner-cta inline-flex min-h-[48px] flex-shrink-0 items-center gap-2 rounded-full px-5 text-[14px] font-bold"
            data-planner-cta
          >
            <Sparkles size={16} aria-hidden="true" />
            {t('v3.planner.cta')}
          </Link>
        </div>

        {/* ── The plans ─────────────────────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col gap-4 pt-4">
          {plans.length === 0 && <EmptyState title={t('v3.planner.emptyTitle')} text={t('v3.planner.empty')} ctaHref={askHref} ctaLabel={t('v3.planner.cta')} />}

          {plans.length > 0 && visible.length === 0 && <EmptyState text={t('v3.planner.emptyFiltered')} />}

          {visible.length > 0 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start" data-planner-grid>
              <div className="flex flex-col gap-4 lg:col-span-2">
                {visible.map((p) => (
                  <PlanCard key={p.id} plan={p} locale={locale} />
                ))}
                {/* Says where the list comes from, so an older plan that has fallen outside the
                    scanned window is explained rather than simply missing. */}
                <p className="v3-planner-note px-1 text-[12px]">
                  {t('v3.planner.scope')}
                </p>
              </div>

              {/* A second way into the same chat prompt — the reference's side card — so the
                  action stays in reach beside a long list. Same href as the header CTA. */}
              <aside className="v3-planner-side p-5 sm:p-6" aria-labelledby="planner-side-title" data-planner-side>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: 'rgba(255, 255, 255, 0.12)' }} aria-hidden="true">
                  <MapPin size={22} />
                </span>
                <h3 id="planner-side-title" className="mt-4 text-[20px] font-extrabold leading-tight">{t('v3.planner.sideTitle')}</h3>
                <p className="v3-planner-side-muted mt-2 text-[14px] leading-relaxed">{t('v3.planner.sideBody')}</p>
                <Link href={askHref} className="v3-planner-side-cta mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl px-5 text-[15px] font-bold">
                  <Plus size={18} aria-hidden="true" />
                  {t('v3.planner.cta')}
                </Link>
              </aside>
            </div>
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
    <article className="v3-planner-card flex flex-col overflow-hidden" data-planner-card>
      {/* Below `sm` the thumbnail becomes a banner above the text so the title keeps its width. */}
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:gap-4 sm:p-5">
        {/* 🚨 THE THUMBNAIL IS A REAL PHOTOGRAPH OF A REAL STOP, or it is a glyph. `coverUrl` is
            `PlanItem.photo_url`, injected server-side from a matched place; there is no plan-level
            image in the contract and no placeholder pool standing in for one. A plan whose stops
            were never enriched gets the calendar mark — honest, and still composed. */}
        <div className="v3-planner-thumb">
          {plan.coverUrl ? (
            // Place photos are arbitrary remote URLs from the enrichment step, not a configured
            // next/image domain — the same reason `TripPlanCard` renders them with a plain <img>.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={plan.coverUrl}
              alt=""
              loading="lazy"
              onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
            />
          ) : (
            <span aria-hidden="true" className="v3-planner-thumb-glyph">
              <CalendarRange size={30} />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <h2 className="v3-planner-title min-w-0 flex-1 text-[16px] font-extrabold leading-snug sm:text-[19px]">
              {plan.title}
            </h2>
            {/* Rendered only when the payload actually said which kind it is. */}
            {plan.kind && (
              <span className="v3-planner-kind">
                {t(KIND_LABEL[plan.kind])}
              </span>
            )}
          </div>

          {/* ── The facts, and only the ones this plan carries ──────────────────────
              Days and stops are counted from the itinerary, so they are always true. People and
              budget are optional in the contract and simply absent when the model did not record
              them. There is no default party size, because a default would be a claim about who
              is going — and nothing in the payload said. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5" data-planner-facts>
            <Fact icon={<CalendarRange size={15} />} text={t('v3.planner.days', { n: String(plan.dayCount) })} />
            <Fact icon={<Route size={15} />} text={t('v3.planner.stops', { n: String(plan.stopCount) })} />
            {plan.people !== null && <Fact icon={<Users size={15} />} text={t('v3.planner.people', { n: String(plan.people) })} />}
            {plan.budgetTotal && <Fact icon={<Wallet size={15} />} text={plan.budgetTotal} />}
          </div>

          {/* A glance at what KIND of stops the plan is made of, using each stop's own emoji.
              Real per-item data; no invented iconography. */}
          {plan.stops.length > 0 && (
            <p className="v3-planner-stops mt-2.5 truncate text-[13px]">
              {plan.stops.map((s) => `${s.emoji || '📍'} ${s.name}`).join(' · ')}
              {plan.stopCount > plan.stops.length && ` · ${t('v3.planner.more', { n: String(plan.stopCount - plan.stops.length) })}`}
            </p>
          )}
        </div>
      </div>

      {/* ── Footer: when the thread last moved, and the two ways on ─────────────────── */}
      <div className="v3-planner-card-foot flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
        {/* 🚨 LABELLED AS THREAD ACTIVITY, NOT AS A PLAN DATE. `updatedAt` is the conversation's
            `updated_at`; there is no per-plan timestamp in the contract. The "Updated {when}"
            wording says what is true — a BARE date beside a trip title would be read as the
            travel date, which is the mockup's fabrication arriving by another route. */}
        {/* `suppressHydrationWarning`: the relative label can cross a minute boundary between the
            server render and hydration; the text is re-rendered on the client either way. */}
        <span className="v3-planner-updated truncate text-[12.5px]" suppressHydrationWarning>
          {t('v3.planner.lastActivity', { when: formatRelativeTime(plan.updatedAt, t, locale) })}
        </span>

        <div className="flex max-w-full flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="v3-planner-btn inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold"
          >
            {open ? t('v3.planner.collapse') : t('v3.planner.expand')}
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          <Link
            href={plan.href}
            className="v3-planner-link inline-flex min-h-[40px] items-center gap-0.5 px-2 text-[13px] font-bold"
          >
            {t('v3.planner.open')}
            <ChevronRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>

      {open && <Itinerary plan={plan} />}
    </article>
  )
}

function Fact({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="v3-planner-fact">
      <span className="v3-planner-fact-icon" aria-hidden="true">{icon}</span>
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
    <div className="v3-planner-itin" data-planner-itinerary>
      {days.length > 1 && (
        <div className="v3-planner-itin-tabs px-4 py-2.5 sm:px-5">
          <ChipRow items={days.map((d) => d.label)} activeIndex={day} onSelect={setDay} />
        </div>
      )}

      <ol>
        {(current?.items ?? []).map((item, i) => (
          <li key={i} className="flex gap-3 px-4 py-3 sm:px-5">
            {/* The model's own time string, monospaced so a column of them lines up. Blank when it
                did not write one — never back-filled with a guess. */}
            <span className="v3-planner-itin-time w-12 flex-shrink-0 pt-0.5 font-mono text-[12px] leading-none">
              {item.time || ''}
            </span>

            <div className="min-w-0 flex-1">
              <p className="v3-planner-itin-name text-[14px] font-semibold leading-snug">
                <span aria-hidden="true">{item.emoji || '📍'}</span> {item.name}
                {item.price && (
                  <span className="v3-planner-itin-price ml-2 text-[12.5px] font-bold">
                    {item.price}
                  </span>
                )}
              </p>

              {item.description && (
                <p className="v3-planner-itin-desc mt-0.5 text-[12.5px] leading-relaxed">
                  {item.description}
                </p>
              )}

              {item.maps_link && (
                <a
                  href={item.maps_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="v3-planner-link mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold"
                >
                  <MapPin size={12} aria-hidden="true" />
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
 * Nothing to show, composed rather than left over. The REGION takes the slack so the footer stays
 * at the bottom, and the panel keeps its own modest size, centred in it.
 *
 * The all-empty case carries the CTA (and the scooter), because a planner with no plans has
 * exactly one useful next step. The filtered-empty case does not: the user has plans, just not of
 * that kind, and the action they want is another chip.
 */
function EmptyState({ title, text, ctaHref, ctaLabel }: { title?: string; text: string; ctaHref?: string; ctaLabel?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center" data-planner-empty>
      <div className="v3-planner-empty flex w-full max-w-lg flex-col items-center gap-3 px-6 py-8 text-center">
        {ctaHref ? (
          <span aria-hidden="true" className="block w-[160px] sm:w-[190px]" data-planner-empty-mascot>
            <TappyMascot pose="delivery" size={288} eager className="h-auto w-full" />
          </span>
        ) : (
          <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'var(--v3-accent-soft)', color: 'var(--v3-accent)' }}>
            <CalendarRange size={26} />
          </span>
        )}
        {title && <h3 className="v3-planner-empty-title text-[18px] font-extrabold leading-tight sm:text-[20px]">{title}</h3>}
        <p className="v3-planner-empty-text max-w-[36ch] text-[14px] leading-relaxed">{text}</p>
        {ctaHref && ctaLabel && (
          <Link href={ctaHref} className="v3-planner-cta mt-1 inline-flex min-h-[48px] items-center gap-2 rounded-full px-6 text-[14px] font-bold">
            <Sparkles size={16} aria-hidden="true" />
            {ctaLabel}
          </Link>
        )}
      </div>
    </div>
  )
}
