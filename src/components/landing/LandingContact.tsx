'use client'

import Image from 'next/image'
import { Globe, Mail } from 'lucide-react'
import LandingSection from './LandingSection'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { FOUNDER_EMAIL, SITE_HOST, SITE_URL, SUPPORT_EMAIL } from './config'

export default function LandingContact() {
  const { t } = useTranslation()

  return (
    <LandingSection id="contact" titleKey="landing.contact.title">
      {/* Founder profile — full width so the biography reads comfortably */}
      <div className="mt-10 rounded-3xl border border-white/10 bg-gray-950/60 p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
          <Image
            src="/branding/founder.jpg"
            alt={t('landing.contact.founder.name')}
            width={539}
            height={960}
            className="h-20 w-20 shrink-0 rounded-full border border-white/10 object-cover object-[50%_28%] sm:h-24 sm:w-24"
          />
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{t('landing.contact.founder.name')}</h3>
            <p className="mt-0.5 text-sm text-primary-400">{t('landing.contact.founder.label')}</p>
            <div className="mt-4 max-w-3xl space-y-3 text-sm leading-relaxed text-gray-300">
              <p>{t('landing.contact.founder.bio1')}</p>
              <p>{t('landing.contact.founder.bio2')}</p>
              <p>{t('landing.contact.founder.bio3')}</p>
              <p>{t('landing.contact.founder.bio4')}</p>
            </div>
            <a
              href={`mailto:${FOUNDER_EMAIL}`}
              className="mt-4 inline-block break-all text-sm text-primary-400 hover:underline"
            >
              {FOUNDER_EMAIL}
            </a>
          </div>
        </div>
      </div>

      {/* Support + official website */}
      <ul className="mt-5 grid gap-5 sm:grid-cols-2">
        <li className="rounded-3xl border border-white/10 bg-gray-950/60 p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/15">
            <Mail size={20} className="text-primary-400" aria-hidden="true" />
          </div>
          <h3 className="mt-4 font-semibold">{t('landing.contact.support.label')}</h3>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="mt-1 block break-all text-sm text-primary-400 hover:underline"
          >
            {SUPPORT_EMAIL}
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
    </LandingSection>
  )
}
