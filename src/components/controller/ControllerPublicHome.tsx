'use client'

import Link from 'next/link'
import {
  Lock,
  Globe,
  Menu,
  ArrowRight,
  BarChart3,
  ShieldCheck,
  Users,
  Sparkles,
  LineChart,
  Database,
  ShoppingBag,
  Code2,
  Shield,
  Headphones,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { TappyMascot } from '@/components/TappyMascot'

// Controller V2 — Public Home (Owner-approved design, 2026-08-21).
//
// The Controller's front door: the only Controller screen an anonymous visitor
// can reach. It sells nothing and asks for nothing — it states what the product
// is and offers ONE way in, `/login`.
//
// 🔑 THE PAGE IS A DEAD END BY DESIGN. Every interactive element is either the
// sign-in link or the language toggle. There are no buttons that "do nothing
// yet", no forms, no fake dashboard controls — a visitor who cannot sign in has
// nothing here to be misled by.
//
// ⚠️ THIS COMPONENT IS OUTSIDE `src/lib/controller/`, so the Architecture Guard's
// consumer-import rule does not apply to it — which is why it may use the shared
// `TappyMascot` and `useTranslation`. It is a VIEW; it holds no Controller
// domain logic, makes no authorization decision, and reads no platform data.

const FEATURES: { key: string; Icon: LucideIcon }[] = [
  { key: 'monitor', Icon: BarChart3 },
  { key: 'secure', Icon: ShieldCheck },
  { key: 'insight', Icon: Users },
  { key: 'decide', Icon: Sparkles },
]

const TEAMS: { key: string; Icon: LucideIcon }[] = [
  { key: 'marketing', Icon: LineChart },
  { key: 'data', Icon: Database },
  { key: 'sales', Icon: ShoppingBag },
  { key: 'engineering', Icon: Code2 },
  { key: 'security', Icon: Shield },
  { key: 'support', Icon: Headphones },
]

const FEATURES_ID = 'controller-public-home-features'

/** The brand lockup — "TappyAI" in white, "Controller" in the accent blue. */
function Brand({ stacked = false }: { stacked?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#2E7BF6] to-[#1B4FD8] text-lg font-black text-white shadow-lg shadow-[#1B4FD8]/30"
      >
        T
      </span>
      <span className={stacked ? 'flex flex-col leading-tight' : 'flex items-baseline gap-2'}>
        <span className="text-lg font-bold tracking-tight text-white">
          {t('admin.publicHome.headlineBrand')}
        </span>
        <span className="text-lg font-semibold text-[#4C9AFF]">{t('admin.shell.badge')}</span>
      </span>
    </div>
  )
}

/** The language toggle. Two buttons, no dropdown — it is a binary choice. */
function LocaleToggle() {
  const { t, locale, setLocale } = useTranslation()
  return (
    <div
      className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1"
      role="group"
      aria-label={t('admin.publicHome.language')}
    >
      <Globe aria-hidden="true" className="h-4 w-4 text-white/60" />
      {(['vi', 'en'] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          aria-pressed={locale === code}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase transition-colors ${
            locale === code ? 'bg-[#2E7BF6] text-white' : 'text-white/70 hover:text-white'
          }`}
        >
          {code === 'vi' ? 'VI' : 'EN'}
        </button>
      ))}
    </div>
  )
}

/** The one call to action. A LINK, never a button — it navigates. */
function SignInLink({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <Link
      href="/login"
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#2E7BF6] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#1B4FD8]/30 transition-colors hover:bg-[#1B4FD8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4C9AFF] ${className}`}
    >
      <Lock aria-hidden="true" className="h-4 w-4" />
      {t('admin.publicHome.signIn')}
    </Link>
  )
}

/**
 * The product preview beside the mascot.
 *
 * ⚠️ DELIBERATELY NUMBERLESS. The approved design shows sample metrics inside
 * this frame. Rendering invented platform statistics ("532 new users today,
 * +12%") on a PUBLIC page would be fabricated data about the real product, so
 * the frame keeps the design's layout and chrome and leaves the values as
 * neutral shapes. Flagged to the Owner as the one intentional deviation.
 */
function ProductPreview() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none rounded-2xl border border-white/10 bg-[#0E1A33]/80 p-3 shadow-2xl backdrop-blur-sm"
    >
      <div className="flex gap-3">
        <div className="hidden w-28 shrink-0 flex-col gap-2 border-r border-white/5 pr-3 sm:flex">
          {[3, 2, 3, 2].map((count, group) => (
            <div key={group} className="flex flex-col gap-1.5">
              <div className="h-1.5 w-10 rounded-full bg-white/15" />
              {Array.from({ length: count }).map((_, row) => (
                <div
                  key={row}
                  className={`h-4 rounded-md ${
                    group === 0 && row === 0 ? 'bg-[#2E7BF6]/40' : 'bg-white/5'
                  }`}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="h-2 w-24 rounded-full bg-white/20" />
          <div className="grid grid-cols-3 gap-2">
            {['#3ECF8E', '#3ECF8E', '#3ECF8E'].map((dot, i) => (
              <div key={i} className="rounded-lg border border-white/5 bg-white/[0.03] p-2">
                <span
                  className="mb-1.5 block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: dot }}
                />
                <div className="h-1 w-full rounded-full bg-white/10" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5">
                <div className="mb-2 h-1 w-12 rounded-full bg-white/10" />
                <div className="h-3 w-16 rounded bg-white/20" />
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5">
            <div className="mb-2 h-1 w-16 rounded-full bg-white/10" />
            <svg viewBox="0 0 120 32" className="h-10 w-full" preserveAspectRatio="none">
              <polyline
                points="0,26 15,20 30,24 45,12 60,16 75,7 90,13 105,4 120,9"
                fill="none"
                stroke="#4C9AFF"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ControllerPublicHome() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-[#070E1F] text-white">
      {/* Ambient glow — decoration only, never intercepts a click. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(46,123,246,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(46,123,246,0.10),transparent_50%)]"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 sm:px-8">
        <header className="flex items-center justify-between gap-4 py-6">
          <Brand stacked />
          {/* ONE locale toggle, shown at every width. Rendering a second copy
              for mobile put two identical controls in the DOM at once — the
              same trap `aria-label` duplication always is: a screen reader
              announces two language switchers, and "the language toggle" stops
              naming one thing. Visibility is CSS's job, not the DOM's. */}
          <div className="flex items-center gap-2 sm:gap-3">
            <LocaleToggle />
            <SignInLink className="hidden md:inline-flex" />
            {/* Mobile: the design shows a menu affordance. There is nothing to
                put behind it on a one-page site, so it links to the section
                that exists rather than opening an empty drawer. */}
            <Link
              href={`#${FEATURES_ID}`}
              aria-label={t('admin.publicHome.openMenu')}
              className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/80 md:hidden"
            >
              <Menu aria-hidden="true" className="h-5 w-5" />
            </Link>
          </div>
        </header>

        <main className="flex-1">
          <section className="grid items-center gap-10 py-8 lg:grid-cols-[1.05fr_1fr] lg:py-16">
            <div>
              <span className="inline-flex items-center rounded-lg border border-[#2E7BF6]/30 bg-[#2E7BF6]/10 px-3 py-1.5 text-xs font-semibold text-[#7FB4FF]">
                {t('admin.publicHome.badge')}
              </span>

              <h1 className="mt-6 text-4xl font-black leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                {t('admin.publicHome.headline')}
                <br />
                <span className="text-[#4C9AFF]">{t('admin.publicHome.headlineBrand')}</span>
              </h1>

              {/* Two sentences, two elements. Splitting one text node with a
                  <br> reads identically but makes each line unaddressable —
                  to a screen reader, a translator, and a test alike. */}
              <p className="mt-5 max-w-lg text-base leading-relaxed text-white/70">
                <span className="block">{t('admin.publicHome.tagline')}</span>
                <span className="block">{t('admin.publicHome.subtagline')}</span>
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
                <SignInLink className="px-8 py-3.5 text-base" />
                <Link
                  href={`#${FEATURES_ID}`}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/85 transition-colors hover:text-white"
                >
                  {t('admin.publicHome.learnMore')}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="relative flex items-end justify-center lg:justify-end">
              <TappyMascot
                pose="wave"
                size={260}
                eager
                alt={t('admin.publicHome.mascotAlt')}
                className="relative z-10 max-w-[45%] drop-shadow-2xl lg:max-w-[42%]"
              />
              <div className="-ml-8 w-full max-w-md flex-1 lg:-ml-12">
                <ProductPreview />
              </div>
            </div>
          </section>

          <section
            id={FEATURES_ID}
            data-testid={FEATURES_ID}
            className="scroll-mt-8 rounded-3xl border border-white/10 bg-[#0B1428]/70 px-6 py-10 sm:px-10"
          >
            <h2 className="text-center text-xl font-bold sm:text-2xl">
              {t('admin.publicHome.featuresTitle')}
            </h2>
            <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
              {FEATURES.map(({ key, Icon }) => (
                <div key={key} className="flex gap-4 lg:block">
                  <span
                    aria-hidden="true"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#2E7BF6]/15 text-[#4C9AFF] lg:mb-4"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold">
                      {t(`admin.publicHome.feature.${key}.title`)}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-white/60">
                      {t(`admin.publicHome.feature.${key}.body`)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="py-12">
            <h2 className="text-center text-sm font-semibold text-white/70">
              {t('admin.publicHome.trustedBy')}
            </h2>
            <ul className="mt-6 flex flex-wrap justify-center gap-3">
              {TEAMS.map(({ key, Icon }) => (
                <li
                  key={key}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white/80"
                >
                  <Icon aria-hidden="true" className="h-4 w-4 text-white/50" />
                  {t(`admin.publicHome.team.${key}`)}
                </li>
              ))}
            </ul>
          </section>
        </main>

        <footer className="border-t border-white/10 py-6 text-center text-sm text-white/50">
          {t('admin.publicHome.footer')}
        </footer>
      </div>
    </div>
  )
}
