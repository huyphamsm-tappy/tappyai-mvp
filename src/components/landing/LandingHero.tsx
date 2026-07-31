'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { HERO_SCREENSHOT } from './config'

// Hero composition follows the Owner-approved reference (2026-07-31): eyebrow →
// two-tone headline (white lead + orange closing clause) → subtitle → CTA pair on
// the left; one large floating device on the right; the cinematic Vietnam
// skyline artwork behind everything, with the glowing dot-map kept visible in
// the upper-left. Layout is desktop-first and degrades to a centred single
// column on tablet/mobile.
export default function LandingHero() {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate flex min-h-[640px] items-center overflow-hidden lg:min-h-[780px]"
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
          className="object-cover object-[50%_72%]"
        />
        {/* Left legibility scrim, shaped rather than flat: deliberately LIGHT over
            the first ~12% (where the glowing Vietnam dot-map sits, so it reads as
            in the reference), strongest directly behind the headline, then clearing
            early so the Landmark 81 tower and skyline stay unobscured. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(2,6,23,0.32) 0%, rgba(2,6,23,0.80) 15%, rgba(2,6,23,0.56) 46%, rgba(2,6,23,0.10) 66%, rgba(2,6,23,0) 80%)',
          }}
        />
        {/* Bottom blend — shallow and short so the blue/orange light trails and the
            water reflection stay fully visible instead of being washed to black. */}
        <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-gray-950/85 to-transparent" />
      </div>

      {/* Wider than the page container on desktop only: the reference composition
          spreads text to the far left and the device to the far right, leaving the
          Landmark 81 tower visible between them. Page rhythm below is unchanged. */}
      <div className="relative z-10 mx-auto grid w-full max-w-container-wide items-center gap-12 px-5 py-20 sm:px-8 lg:max-w-[88rem] lg:grid-cols-[1fr_auto] lg:gap-16 lg:py-24">
        {/* ── Left: copy ─────────────────────────────────────────────── */}
        <div className="text-center lg:text-left">
          <p className="text-sm font-semibold text-[#5B9BF8] [text-shadow:0_1px_12px_rgba(2,6,23,0.7)] sm:text-base">
            {t('landing.hero.eyebrow')}
          </p>

          <h1
            id="hero-heading"
            className="mt-4 text-4xl font-extrabold leading-[1.06] tracking-tight text-white [text-shadow:0_2px_28px_rgba(2,6,23,0.6)] sm:text-5xl lg:text-6xl xl:text-[4.25rem]"
          >
            {t('landing.hero.headlineLead')}{' '}
            <span className="text-[#F5871F]">{t('landing.hero.headlineAccent')}</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-fluid-body leading-relaxed text-gray-200 [text-shadow:0_1px_16px_rgba(2,6,23,0.65)] lg:mx-0">
            {t('landing.hero.subtitle')}
          </p>

          <div className="mt-9 flex flex-wrap justify-center gap-4 lg:justify-start">
            <a
              href="#what-is-tappyai"
              className="inline-flex items-center gap-2 rounded-full bg-interactive px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition-colors hover:bg-interactive-hover sm:text-base"
            >
              {t('landing.hero.learnMore')}
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/15 sm:text-base"
            >
              {t('landing.hero.viewProduct')}
            </Link>
          </div>
        </div>

        {/* ── Right: floating device ─────────────────────────────────── */}
        <div className="flex justify-center lg:justify-end">
          {/* Perspective wrapper: the reference device is turned very slightly so
              its left edge catches light. Kept subtle so the screenshot inside
              stays legible, and disabled below lg where the phone is centred. */}
          <div className="relative lg:[perspective:1600px]">
            {/* Ambient glow grounding the device in the scene (decorative) */}
            <div
              aria-hidden="true"
              className="absolute -inset-10 -z-10 rounded-full bg-blue-500/25 blur-3xl"
            />
            {/* Floor bloom under the device — sells the "floating above the city"
                read from the reference (decorative). */}
            <div
              aria-hidden="true"
              className="absolute inset-x-6 -bottom-8 -z-10 h-16 rounded-[50%] bg-blue-400/25 blur-2xl"
            />
            {/* Device frame: dark bezel + edge highlight, mirroring the premium
                titanium look of the reference mockup. */}
            <div className="relative rounded-[2.5rem] border-[6px] border-gray-800 bg-gray-900 p-[2px] shadow-[0_45px_90px_-25px_rgba(0,0,0,0.9)] ring-1 ring-white/25 sm:rounded-[3rem] sm:border-[8px] lg:[transform:rotateY(-7deg)_rotateX(1.5deg)] lg:[transform-style:preserve-3d]">
              <div className="overflow-hidden rounded-[2.1rem] sm:rounded-[2.5rem]">
                <Image
                  src={HERO_SCREENSHOT.src}
                  alt={t('landing.hero.screenshotAlt')}
                  width={HERO_SCREENSHOT.width}
                  height={HERO_SCREENSHOT.height}
                  priority
                  sizes="(min-width: 1280px) 23rem, (min-width: 1024px) 20rem, (min-width: 640px) 17rem, 15rem"
                  className="h-auto w-[15rem] sm:w-[17rem] lg:w-[20rem] xl:w-[23rem]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
