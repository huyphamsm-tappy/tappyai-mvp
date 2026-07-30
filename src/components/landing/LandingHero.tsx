'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { HERO_SCREENSHOT } from './config'

export default function LandingHero() {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate flex min-h-[600px] items-center overflow-hidden lg:min-h-[720px]"
    >
      {/* Cinematic Hero Background Environment — one dedicated artwork behind the
          HTML layer. Purely decorative (empty alt); scrims keep text legible and
          blend the artwork into the page below without hiding the skyline. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <Image
          src="/branding/hero-bg.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[66%_46%]"
        />
        {/* Left legibility: headline/subtitle/CTA sit over the calm left area */}
        <div className="absolute inset-0 bg-gradient-to-r from-gray-950 via-gray-950/55 to-transparent" />
        {/* Bottom blend into the page background + extra mobile legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/10 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-container-wide items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
        <div className="text-center lg:text-left">
          <h1
            id="hero-heading"
            className="text-fluid-display font-extrabold tracking-tight [text-shadow:0_2px_28px_rgba(2,6,23,0.55)]"
          >
            {t('landing.hero.headline')}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-fluid-body text-gray-200 [text-shadow:0_1px_16px_rgba(2,6,23,0.6)] lg:mx-0">
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
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/10"
            >
              {t('landing.hero.viewProduct')}
            </Link>
          </div>
        </div>

        <div className="flex justify-center lg:justify-end">
          <div className="w-56 overflow-hidden rounded-[2rem] border border-white/15 shadow-2xl shadow-black/50 sm:w-64">
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
