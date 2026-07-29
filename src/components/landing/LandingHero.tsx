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
      {/* Brand glow: primary blue with a warm accent edge */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(0,122,255,0.18),transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_40%_at_85%_10%,rgba(255,149,0,0.10),transparent)]"
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
