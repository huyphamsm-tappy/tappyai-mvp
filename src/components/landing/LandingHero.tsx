'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { HERO_SCREENSHOT } from './config'

export default function LandingHero() {
  const { t } = useTranslation()

  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden">
      {/* Cinematic hero backdrop — a blue→orange light flow with a fine tech
          grid and particles. Decorative only (aria-hidden, pointer-events-none),
          it sits behind the content. Blooms are colored but kept dark enough
          that the white heading and gray-300 subtitle stay high-contrast; the
          grid/particles are masked to fade out before the text column. */}
      {/* Base lift — a deep navy so the field reads as lit space, not flat black */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(140%_100%_at_50%_-20%,rgba(9,20,48,0.95),transparent_65%)]"
      />
      {/* Primary blue bloom, upper-left — the start of the light flow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_65%_at_18%_4%,rgba(0,122,255,0.40),transparent_60%)]"
      />
      {/* Blue accent, center-top */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_55%_at_52%_0%,rgba(51,145,255,0.22),transparent_60%)]"
      />
      {/* Warm orange spotlight behind the phone mockup (right) — cinematic key light */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(48%_58%_at_84%_38%,rgba(255,149,0,0.34),transparent_60%)]"
      />
      {/* Orange fall-off, lower-right — completes the diagonal flow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(42%_50%_at_98%_82%,rgba(255,110,0,0.20),transparent_60%)]"
      />
      {/* Fine technology grid, masked so it fades before the text column */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(75% 65% at 62% 24%, #000 25%, transparent 82%)',
          WebkitMaskImage: 'radial-gradient(75% 65% at 62% 24%, #000 25%, transparent 82%)',
        }}
      />
      {/* Soft technology particles */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1.6px)',
          backgroundSize: '30px 30px',
          maskImage: 'radial-gradient(62% 55% at 32% 32%, #000, transparent 78%)',
          WebkitMaskImage: 'radial-gradient(62% 55% at 32% 32%, #000, transparent 78%)',
        }}
      />
      {/* Gentle bottom depth fade back into the page surface */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-gray-950"
      />

      <div className="relative mx-auto grid max-w-container-wide items-center gap-12 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:pt-24">
        <div className="text-center lg:text-left">
          <h1 id="hero-heading" className="text-fluid-display font-extrabold tracking-tight">
            {t('landing.hero.headline')}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-fluid-body text-gray-300 lg:mx-0">
            {t('landing.hero.subtitle')}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
            <a
              href="#what-is-tappyai"
              className="inline-flex items-center gap-2 rounded-full bg-interactive px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-interactive-hover"
            >
              {t('landing.hero.learnMore')}
              <ArrowRight size={16} aria-hidden="true" />
            </a>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              {t('landing.hero.viewProduct')}
            </Link>
          </div>
        </div>

        <div className="flex justify-center">
          <div className="w-56 overflow-hidden rounded-[2rem] border border-white/15 shadow-2xl shadow-primary-900/40 sm:w-64">
            <Image
              src={HERO_SCREENSHOT.src}
              alt={t('landing.hero.screenshotAlt')}
              width={HERO_SCREENSHOT.width}
              height={HERO_SCREENSHOT.height}
              priority
              sizes="(min-width: 640px) 16rem, 14rem"
              className="h-auto w-full"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
