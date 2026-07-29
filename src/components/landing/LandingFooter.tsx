'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { BRAND_NAME, LOGO } from './config'

// Legal links point at the existing production pages — no new routes.
const LEGAL_LINKS = [
  { href: '/terms', key: 'landing.footer.terms' },
  { href: '/privacy', key: 'landing.footer.privacy' },
  { href: '/copyright', key: 'landing.footer.copyrightPolicy' },
]

export default function LandingFooter() {
  const { t } = useTranslation()

  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto flex max-w-container-wide flex-col items-center gap-5 px-5 py-10 text-center sm:flex-row sm:justify-between sm:px-8 sm:text-left">
        <div className="flex items-center gap-2.5">
          <Image src={LOGO} alt="" width={24} height={24} className="h-6 w-6 rounded-[22%] object-cover" />
          <span className="font-semibold">{BRAND_NAME}</span>
        </div>

        <nav
          aria-label={t('landing.footer.legalNavLabel')}
          className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-content-secondary"
        >
          {LEGAL_LINKS.map(({ href, key }) => (
            <Link key={href} href={href} className="hover:text-white">
              {t(key)}
            </Link>
          ))}
        </nav>

        <p className="text-sm text-content-secondary">{t('landing.footer.rights')}</p>
      </div>
    </footer>
  )
}
