'use client'

import type { ComponentProps } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { ArrowRight, Info, Moon, Orbit, Sparkles, Star, Sun, Wand2, type LucideIcon } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { SMART_TOOLS_HREF } from '@/lib/tools/registry'

// ── Xem bói hub (/boi) — the V3 cosmic skin ─────────────────────────────────
//
// The same three destinations, the same routes, the same copy keys. What
// changed (2026-09-12) is the composition: a real hero, three feature cards
// with their own identities, and the disclaimer the sub-pages already show.
//
// 🚨 THE CHIPS NAME READINGS THAT EXIST. The reference drew "Tình yêu / Công
// việc / Hướng đi" on Tarot and "Công danh" on tử vi; neither is a mode this
// product has. Tarot draws 1 or 3 cards in a Past / Present / Future spread
// (`TarotDraw`), and both birth-date readings render Love / Career / Money /
// Health (`TuViForm`, `CungHoangDaoForm`). Those are the chips, and they are
// decorative labels inside the link — not controls that filter anything.
//
// 🚨 NO IMAGE ASSETS. The tarot plates, rings, planet, wheel and star-field are
// CSS in `globals.css` (`.v3-boi-*`). Nothing moves on its own.

type Hue = 'violet' | 'amber' | 'blue'

const FEATURES: {
  href: string
  hue: Hue
  icon: LucideIcon
  titleKey: string
  descKey: string
  /** Labels of readings the destination really renders. */
  chipKeys: string[]
  motif: 'plate' | 'rings' | 'wheel'
}[] = [
  {
    href: '/boi/tarot',
    hue: 'violet',
    icon: Wand2,
    titleKey: 'fortune.tarotTitle',
    descKey: 'fortune.tarotDesc',
    chipKeys: ['fortune.tarotPast', 'fortune.tarotPresent', 'fortune.tarotFuture'],
    motif: 'plate',
  },
  {
    href: '/boi/tu-vi',
    hue: 'amber',
    icon: Moon,
    titleKey: 'fortune.tuviTitle',
    descKey: 'fortune.tuviDesc',
    chipKeys: ['fortune.love', 'fortune.career', 'fortune.money', 'fortune.health'],
    motif: 'rings',
  },
  {
    href: '/boi/cung-hoang-dao',
    hue: 'blue',
    icon: Orbit,
    titleKey: 'fortune.zodiacTitle',
    descKey: 'fortune.zodiacDesc',
    chipKeys: ['fortune.love', 'fortune.career', 'fortune.money', 'fortune.health'],
    motif: 'wheel',
  },
]

// Client view for the fortune-telling hub so all text reacts to the language
// toggle. The server page still does auth + profile fetch and passes user down.
export default function BoiLandingView({ user }: { user: ComponentProps<typeof Header>['user'] }) {
  const { t } = useTranslation()

  return (
    // `v3-theme` brings the shared tokens (page ground, panel, text hierarchy) to
    // a page that keeps its legacy header and bottom nav.
    <div className="v3-theme v3-boi-page min-h-dvh pb-24">
      {/* Back pops in-app history (Smart Tools, Home, …); a deep link falls back to /tools. */}
      <Header user={user} showBack backFallbackHref={SMART_TOOLS_HREF} title={t('fortune.headerTitle')} />

      <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-8" data-boi-main>
        {/* ── Hero ── */}
        <section className="v3-boi-hero" aria-labelledby="boi-hero-title" data-boi-hero>
          <div className="v3-boi-stars" aria-hidden="true" />
          {/* The scene: rings, a planet and three tarot plates. Decorative; from `md` up
              it takes the right half, below that it fades behind the copy. */}
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[52%] md:block" aria-hidden="true">
            <span className="v3-boi-ring" style={{ width: 420, height: 420, right: '-6%', top: '-40%' }} />
            <span className="v3-boi-ring" style={{ width: 300, height: 300, right: '8%', top: '-18%', borderColor: 'rgba(251,191,36,0.25)' }} />
            <span className="v3-boi-planet" style={{ width: 64, height: 64, right: '7%', top: '18%' }} />
            <span className="v3-boi-tarot" style={{ width: 96, height: 140, left: '20%', top: '22%', transform: 'rotate(-14deg)' }}><Star size={26} /></span>
            <span className="v3-boi-tarot" style={{ width: 104, height: 152, left: '38%', top: '14%', transform: 'rotate(-2deg)', zIndex: 1 }}><Sun size={30} /></span>
            <span className="v3-boi-tarot" style={{ width: 96, height: 140, left: '57%', top: '24%', transform: 'rotate(12deg)' }}><Moon size={26} /></span>
          </div>

          <div className="relative px-5 py-7 sm:px-8 sm:py-10 md:max-w-[52%] lg:py-12">
            <span className="v3-boi-eyebrow inline-flex min-h-[36px] items-center gap-2 rounded-full px-4 text-[13px] font-medium">
              <Sparkles size={14} aria-hidden="true" />
              {t('fortune.heroEyebrow')}
            </span>
            <h1 id="boi-hero-title" className="mt-4 text-[30px] font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-[40px] lg:text-[46px]">
              {t('fortune.heroTitleLine1')}
              <br />
              <span className="v3-boi-hero-accent">{t('fortune.heroTitleLine2')}</span>
            </h1>
            <p className="v3-boi-hero-muted mt-4 max-w-[46ch] text-[14.5px] leading-relaxed sm:text-[16px]">
              {t('fortune.heroDesc')}
            </p>
          </div>
        </section>

        {/* ── The three experiences ── */}
        <ul className="mt-5 space-y-4 sm:mt-6" data-boi-features>
          {FEATURES.map((f) => (
            <li key={f.href}>
              {/* The whole card is the link it always was; the arrow and chips are decorative. */}
              <Link href={f.href} data-boi-feature={f.href} className="v3-boi-card group items-center gap-4 p-4 sm:gap-6 sm:p-6 lg:p-7" data-hue={f.hue}>
                <span className="v3-boi-tile h-16 w-16 sm:h-[104px] sm:w-[104px]" aria-hidden="true">
                  <f.icon size={30} strokeWidth={1.9} className="sm:hidden" />
                  <f.icon size={44} strokeWidth={1.7} className="hidden sm:block" />
                </span>

                <span className="relative z-10 min-w-0 flex-1">
                  {/* Below `sm` the arrow floats top-right, so the title keeps clear of it. */}
                  <span className="block pr-12 text-[19px] font-extrabold leading-tight tracking-[-0.01em] sm:pr-0 sm:text-[26px]">{t(f.titleKey)}</span>
                  <span className="v3-boi-card-desc mt-1.5 block text-[13.5px] leading-snug sm:text-[15.5px]">{t(f.descKey)}</span>
                  <span className="mt-3 flex flex-wrap gap-2">
                    {f.chipKeys.map((key) => (
                      <span key={key} className="v3-boi-chip">{t(key)}</span>
                    ))}
                  </span>
                </span>

                {/* Motif, right side, from `md`. */}
                <span className="v3-boi-motif hidden md:block" aria-hidden="true">
                  {f.motif === 'plate' && <span className="v3-boi-motif-plate block"><Sun size={40} strokeWidth={1.2} /></span>}
                  {f.motif === 'rings' && <span className="v3-boi-motif-rings block"><Moon size={40} strokeWidth={1.2} /></span>}
                  {f.motif === 'wheel' && (
                    <span className="relative block h-[210px] w-[210px]">
                      <span className="v3-boi-motif-wheel absolute inset-0 block" />
                      <span className="v3-boi-motif-wheel-inner"><Star size={36} strokeWidth={1.2} /></span>
                    </span>
                  )}
                </span>

                <span className="v3-boi-arrow absolute right-4 top-4 z-10 h-10 w-10 sm:relative sm:right-auto sm:top-auto sm:h-16 sm:w-16" aria-hidden="true">
                  <ArrowRight size={22} />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {/* ── The shared disclaimer, the one the sub-pages already show ── */}
        <div className="mt-6 flex justify-center sm:mt-8">
          <p className="v3-boi-note flex max-w-[64ch] items-start gap-3 px-4 py-3 text-[13px] leading-snug sm:items-center sm:px-5" data-boi-disclaimer>
            <Info size={18} className="mt-0.5 flex-shrink-0 sm:mt-0" style={{ color: 'var(--v3-accent)' }} aria-hidden="true" />
            <span>{t('fortune.disclaimer')}</span>
          </p>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
