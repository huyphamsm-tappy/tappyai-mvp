'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import LandingHeroBackdrop from './LandingHeroBackdrop'
import { HERO_SCREENSHOT } from './config'

export default function LandingHero() {
  const { t } = useTranslation()

  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden">
      <LandingHeroBackdrop />

      <div className="relative z-10 mx-auto grid max-w-container-wide items-center gap-12 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:pt-24">
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
