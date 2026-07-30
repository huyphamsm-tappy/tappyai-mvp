'use client'

import Image from 'next/image'
import { Globe, Linkedin, Mail } from 'lucide-react'
import LandingSection from './LandingSection'
import { useTranslation } from '@/lib/i18n/useTranslation'
import {
  FOUNDER_EMAIL,
  FOUNDER_LINKEDIN_LABEL,
  FOUNDER_LINKEDIN_URL,
  SITE_HOST,
  SITE_URL,
  SUPPORT_EMAIL,
} from './config'

export default function LandingContact() {
  const { t } = useTranslation()
  const founderName = t('landing.contact.founder.name')

  return (
    <LandingSection id="contact" titleKey="landing.contact.title">
      {/* Founder profile — full width so the biography reads comfortably.
          Centered on mobile, left-aligned from sm up. */}
      <div className="mt-10 rounded-3xl border border-white/10 bg-gray-950/60 p-6 sm:p-8">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:gap-6 sm:text-left">
          <Image
            src="/branding/founder.jpg"
            alt={founderName}
            width={539}
            height={960}
            className="h-20 w-20 shrink-0 rounded-full border border-white/10 object-cover object-[50%_28%] sm:h-24 sm:w-24"
          />
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{founderName}</h3>
            <p className="mt-0.5 text-sm text-primary-400">{t('landing.contact.founder.label')}</p>
            <div className="mx-auto mt-4 max-w-3xl space-y-3 text-sm leading-relaxed text-gray-300 sm:mx-0">
              <p>{t('landing.contact.founder.bio1')}</p>
              <p>{t('landing.contact.founder.bio2')}</p>
              <p>{t('landing.contact.founder.bio3')}</p>
              <p>{t('landing.contact.founder.bio4')}</p>
            </div>

            {/* Executive profile contact info — Email + LinkedIn. Subtle, not
                social buttons. Each row is a single clickable link. */}
            <div className="mt-6 flex flex-col items-center gap-3 sm:items-start">
              <a
                href={`mailto:${FOUNDER_EMAIL}`}
                aria-label={`Email ${FOUNDER_EMAIL}`}
                className="group inline-flex items-center gap-3 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-300 transition-colors group-hover:border-white/20 group-hover:text-white">
                  <Mail size={16} aria-hidden="true" />
                </span>
                <span className="text-left">
                  <span className="block text-[11px] font-medium uppercase tracking-wider text-gray-500">
                    Email
                  </span>
                  <span className="block break-all text-sm text-gray-200 group-hover:text-white">
                    {FOUNDER_EMAIL}
                  </span>
                </span>
              </a>

              <a
                href={FOUNDER_LINKEDIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${founderName} on LinkedIn (opens in a new tab)`}
                className="group inline-flex items-center gap-3 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-300 transition-colors group-hover:border-white/20 group-hover:text-white">
                  <Linkedin size={16} aria-hidden="true" />
                </span>
                <span className="text-left">
                  <span className="block text-[11px] font-medium uppercase tracking-wider text-gray-500">
                    LinkedIn
                  </span>
                  <span className="block break-all text-sm text-gray-200 group-hover:text-white">
                    {FOUNDER_LINKEDIN_LABEL}
                  </span>
                </span>
              </a>
            </div>
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
