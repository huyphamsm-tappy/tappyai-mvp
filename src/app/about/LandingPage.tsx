'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  BadgePercent,
  BarChart3,
  Bot,
  Clapperboard,
  Database,
  Globe,
  Languages,
  Mail,
  MessageSquare,
  Music2,
  PlayCircle,
  ScanLine,
  Smartphone,
  Sparkles,
  User,
  Wrench,
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

// Presentation only — every visible string comes from src/lib/i18n/landing.ts.
// Contact endpoints are data (not copy), kept in one place here.
const SITE_URL = 'https://www.tappyai.com'
const SITE_HOST = 'www.tappyai.com'
const SUPPORT_EMAIL = 'huypham.sm@gmail.com'
const FOUNDER_EMAIL = 'huypham.sm@gmail.com'

const PRODUCT_CARDS: Array<{ icon: LucideIcon; key: string }> = [
  { icon: Bot, key: 'assistant' },
  { icon: Clapperboard, key: 'community' },
  { icon: Wrench, key: 'tools' },
]

const FEATURES: Array<{ icon: LucideIcon; key: string }> = [
  { icon: MessageSquare, key: 'chat' },
  { icon: PlayCircle, key: 'reviews' },
  { icon: Music2, key: 'sounds' },
  { icon: BadgePercent, key: 'deals' },
  { icon: ScanLine, key: 'tools' },
  { icon: Languages, key: 'bilingual' },
]

// Real production captures (public/landing/), 390x844 viewport @2x.
const SCREENSHOTS: Array<{ key: string; src: string; width: number; height: number }> = [
  { key: 'chat', src: '/landing/screen-chat.webp', width: 780, height: 1688 },
  { key: 'reviews', src: '/landing/screen-reviews.webp', width: 780, height: 1688 },
  { key: 'music', src: '/landing/screen-music.webp', width: 780, height: 1688 },
  { key: 'deals', src: '/landing/screen-deals.webp', width: 780, height: 1688 },
]

const TECH: Array<{ icon: LucideIcon; key: string }> = [
  { icon: Globe, key: 'web' },
  { icon: Smartphone, key: 'mobile' },
  { icon: Sparkles, key: 'ai' },
  { icon: Database, key: 'data' },
  { icon: BarChart3, key: 'ops' },
]

export default function LandingPage() {
  const { t, locale, setLocale } = useTranslation()

  return (
    <div className="min-h-dvh bg-gray-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-gray-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-container-wide items-center justify-between px-5 sm:px-8">
          <Link href="/about" className="flex items-center gap-2.5" aria-label="TappyAI">
            <Image src="/logo.png" alt="" width={32} height={32} className="h-8 w-8 object-contain" />
            <span className="text-lg font-bold tracking-tight">TappyAI</span>
          </Link>
          <div className="flex items-center gap-3">
            <div
              role="group"
              aria-label={t('landing.nav.langLabel')}
              className="flex rounded-full border border-white/15 p-0.5 text-xs font-semibold"
            >
              <button
                onClick={() => setLocale('en')}
                aria-pressed={locale === 'en'}
                className={`rounded-full px-3 py-1.5 transition-colors ${
                  locale === 'en' ? 'bg-white text-gray-900' : 'text-gray-300 hover:text-white'
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setLocale('vi')}
                aria-pressed={locale === 'vi'}
                className={`rounded-full px-3 py-1.5 transition-colors ${
                  locale === 'vi' ? 'bg-white text-gray-900' : 'text-gray-300 hover:text-white'
                }`}
              >
                VI
              </button>
            </div>
            <Link
              href="/"
              className="hidden rounded-full bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-600 xs:inline-flex"
            >
              {t('landing.nav.openApp')}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* 1. Hero */}
        <section className="relative overflow-hidden" aria-labelledby="hero-heading">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(0,122,255,0.18),transparent)]"
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
                  className="inline-flex items-center gap-2 rounded-full bg-primary-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
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
                  src="/landing/screen-home.webp"
                  alt={t('landing.hero.screenshotAlt')}
                  width={780}
                  height={1498}
                  priority
                  sizes="(min-width: 640px) 16rem, 14rem"
                  className="h-auto w-full"
                />
              </div>
            </div>
          </div>
        </section>

        {/* 2. What is TappyAI */}
        <section
          id="what-is-tappyai"
          aria-labelledby="what-heading"
          className="scroll-mt-20 border-t border-white/10"
        >
          <div className="mx-auto max-w-container-content px-5 py-16 sm:px-8 sm:py-20">
            <h2 id="what-heading" className="text-fluid-h1 font-bold">{t('landing.what.title')}</h2>
            <p className="mt-5 text-fluid-body leading-relaxed text-gray-300">{t('landing.what.p1')}</p>
            <p className="mt-4 text-fluid-body leading-relaxed text-gray-300">{t('landing.what.p2')}</p>
          </div>
        </section>

        {/* 3. Vision */}
        <section aria-labelledby="vision-heading" className="border-t border-white/10 bg-gray-900/40">
          <div className="mx-auto max-w-container-content px-5 py-16 sm:px-8 sm:py-20">
            <h2 id="vision-heading" className="text-fluid-h1 font-bold">{t('landing.vision.title')}</h2>
            <p className="mt-5 text-fluid-body leading-relaxed text-gray-300">{t('landing.vision.p1')}</p>
            <p className="mt-4 text-fluid-body leading-relaxed text-gray-300">{t('landing.vision.p2')}</p>
          </div>
        </section>

        {/* 4. Product overview */}
        <section aria-labelledby="product-heading" className="border-t border-white/10">
          <div className="mx-auto max-w-container-wide px-5 py-16 sm:px-8 sm:py-20">
            <h2 id="product-heading" className="text-fluid-h1 font-bold">{t('landing.product.title')}</h2>
            <p className="mt-3 text-fluid-body text-gray-400">{t('landing.product.intro')}</p>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {PRODUCT_CARDS.map(({ icon: Icon, key }) => (
                <article key={key} className="rounded-3xl border border-white/10 bg-gray-900/60 p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-500/15">
                    <Icon size={22} className="text-primary-400" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-fluid-h3 font-semibold">{t(`landing.product.${key}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-400">{t(`landing.product.${key}.desc`)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 5. Key features */}
        <section aria-labelledby="features-heading" className="border-t border-white/10 bg-gray-900/40">
          <div className="mx-auto max-w-container-wide px-5 py-16 sm:px-8 sm:py-20">
            <h2 id="features-heading" className="text-fluid-h1 font-bold">{t('landing.features.title')}</h2>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, key }) => (
                <li key={key} className="flex gap-4 rounded-3xl border border-white/10 bg-gray-950/60 p-5">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-500/15">
                    <Icon size={20} className="text-primary-400" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{t(`landing.features.${key}.title`)}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-400">{t(`landing.features.${key}.desc`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 6. Product screenshots */}
        <section aria-labelledby="shots-heading" className="border-t border-white/10">
          <div className="mx-auto max-w-container-wide px-5 py-16 sm:px-8 sm:py-20">
            <h2 id="shots-heading" className="text-fluid-h1 font-bold">{t('landing.shots.title')}</h2>
            <p className="mt-3 text-fluid-body text-gray-400">{t('landing.shots.caption')}</p>
            <ul className="mt-10 grid grid-cols-2 gap-5 lg:grid-cols-4">
              {SCREENSHOTS.map((shot) => (
                <li key={shot.key}>
                  <figure>
                    <div className="overflow-hidden rounded-3xl border border-white/15 bg-gray-900">
                      <Image
                        src={shot.src}
                        alt={t(`landing.shots.${shot.key}.alt`)}
                        width={shot.width}
                        height={shot.height}
                        loading="lazy"
                        sizes="(min-width: 1024px) 15rem, 45vw"
                        className="h-auto w-full"
                      />
                    </div>
                    <figcaption className="mt-3 text-center text-sm font-medium text-gray-400">
                      {t(`landing.shots.${shot.key}.label`)}
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 7. Technology */}
        <section aria-labelledby="tech-heading" className="border-t border-white/10 bg-gray-900/40">
          <div className="mx-auto max-w-container-wide px-5 py-16 sm:px-8 sm:py-20">
            <h2 id="tech-heading" className="text-fluid-h1 font-bold">{t('landing.tech.title')}</h2>
            <p className="mt-3 text-fluid-body text-gray-400">{t('landing.tech.intro')}</p>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2">
              {TECH.map(({ icon: Icon, key }) => (
                <li key={key} className="flex gap-4 rounded-3xl border border-white/10 bg-gray-950/60 p-5">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-500/15">
                    <Icon size={20} className="text-primary-400" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{t(`landing.tech.${key}.title`)}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-400">{t(`landing.tech.${key}.desc`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 8. About TappyAI */}
        <section aria-labelledby="about-heading" className="border-t border-white/10">
          <div className="mx-auto max-w-container-content px-5 py-16 sm:px-8 sm:py-20">
            <h2 id="about-heading" className="text-fluid-h1 font-bold">{t('landing.about.title')}</h2>
            <p className="mt-5 text-fluid-body leading-relaxed text-gray-300">{t('landing.about.p1')}</p>
            <p className="mt-4 text-fluid-body leading-relaxed text-gray-300">{t('landing.about.p2')}</p>
          </div>
        </section>

        {/* 9. Contact & support */}
        <section aria-labelledby="contact-heading" className="border-t border-white/10 bg-gray-900/40">
          <div className="mx-auto max-w-container-wide px-5 py-16 sm:px-8 sm:py-20">
            <h2 id="contact-heading" className="text-fluid-h1 font-bold">{t('landing.contact.title')}</h2>
            <ul className="mt-10 grid gap-5 sm:grid-cols-3">
              <li className="rounded-3xl border border-white/10 bg-gray-950/60 p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/15">
                  <Mail size={20} className="text-primary-400" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-semibold">{t('landing.contact.support.label')}</h3>
                <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-1 block break-all text-sm text-primary-400 hover:underline">
                  {SUPPORT_EMAIL}
                </a>
              </li>
              <li className="rounded-3xl border border-white/10 bg-gray-950/60 p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/15">
                  <User size={20} className="text-primary-400" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-semibold">{t('landing.contact.founder.label')}</h3>
                <p className="mt-1 text-sm text-gray-300">{t('landing.contact.founder.name')}</p>
                <a href={`mailto:${FOUNDER_EMAIL}`} className="mt-1 block break-all text-sm text-primary-400 hover:underline">
                  {FOUNDER_EMAIL}
                </a>
              </li>
              <li className="rounded-3xl border border-white/10 bg-gray-950/60 p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/15">
                  <Globe size={20} className="text-primary-400" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-semibold">{t('landing.contact.website.label')}</h3>
                <a href={SITE_URL} className="mt-1 block text-sm text-primary-400 hover:underline">
                  {SITE_HOST}
                </a>
              </li>
            </ul>
          </div>
        </section>
      </main>

      {/* 10. Footer */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-container-wide flex-col items-center gap-5 px-5 py-10 text-center sm:flex-row sm:justify-between sm:px-8 sm:text-left">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="" width={24} height={24} className="h-6 w-6 object-contain" />
            <span className="font-semibold">TappyAI</span>
          </div>
          <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-gray-400">
            <Link href="/terms" className="hover:text-white">{t('landing.footer.terms')}</Link>
            <Link href="/privacy" className="hover:text-white">{t('landing.footer.privacy')}</Link>
            <Link href="/copyright" className="hover:text-white">{t('landing.footer.copyrightPolicy')}</Link>
          </nav>
          <p className="text-sm text-gray-500">{t('landing.footer.rights')}</p>
        </div>
      </footer>
    </div>
  )
}
