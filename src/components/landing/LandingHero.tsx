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
      {/* Premium hero backdrop: layered blue/orange light flows + a faint
          technology particle grid + a depth vignette. Purely decorative —
          sits behind the content (aria-hidden, pointer-events-none) and never
          reduces text contrast: every layer is low-opacity and biased to the
          top/edges, and the particle grid is masked to fade before the text. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_-5%,rgba(0,122,255,0.22),transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_45%_at_88%_8%,rgba(255,149,0,0.12),transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_40%_at_10%_92%,rgba(0,98,204,0.10),transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1.5px)',
          backgroundSize: '24px 24px',
          maskImage: 'radial-gradient(80% 60% at 62% 18%, #000, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(80% 60% at 62% 18%, #000, transparent 75%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,transparent_55%,rgba(3,7,18,0.55))]"
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
