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
      <ul className="mt-10 grid gap-5 sm:grid-cols-3">
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
          <Image
            src="/branding/founder.jpg"
            alt={t('landing.contact.founder.name')}
            width={539}
            height={960}
            className="h-14 w-14 rounded-full border border-white/10 object-cover object-[50%_28%]"
          />
          <h3 className="mt-4 font-semibold">{t('landing.contact.founder.name')}</h3>
          <p className="mt-1 text-sm text-gray-300">{t('landing.contact.founder.label')}</p>
          <a
            href={`mailto:${FOUNDER_EMAIL}`}
            className="mt-1 block break-all text-sm text-primary-400 hover:underline"
          >
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
    </LandingSection>
  )
}
