'use client'

import { Phone, ShieldAlert } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { SCAM_REPORT_HOTLINE } from '@/lib/scam-shield/hotline'

/**
 * The emergency card (Web equivalent of the iOS card: "think you were scammed?"). It sits after the hero and before the tools, so a person who has
 * already lost money or shared an OTP finds the way to the police before anything else.
 *
 * The hotline and the official source come from ONE place (`scam-shield/hotline.ts`). The call button is a plain `tel:` link: one tap opens
 * the phone handler, nothing to copy. The source line shows ONLY the agency name as the link; the long URL is never rendered as text.
 */
export default function ScamHelpCard() {
  const { t } = useTranslation()
  return (
    <section className="v3-scam-tool p-4 sm:p-5" aria-labelledby="scam-help-title" data-scam-help>
      <div className="flex items-start gap-3">
        <span className="v3-scam-feat-icon flex-shrink-0" aria-hidden="true"><ShieldAlert size={22} /></span>
        <div className="min-w-0 flex-1">
          <h2 id="scam-help-title" className="text-[16px] font-extrabold leading-tight sm:text-[18px]">{t('v3.scam.help.title')}</h2>
          <p className="mt-1 text-[14px] leading-snug sm:text-[15px]">{t('v3.scam.help.body')}</p>
        </div>
      </div>
      <a
        href={SCAM_REPORT_HOTLINE.tel}
        className="v3-scam-brand v3-scam-cta mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl px-6 text-[15px] font-semibold sm:w-auto sm:inline-flex"
        data-scam-help-call
      >
        <Phone size={17} aria-hidden="true" />
        {t('v3.scam.help.call', { phone: SCAM_REPORT_HOTLINE.display })}
      </a>
      <p className="mt-3 text-[12.5px] leading-snug opacity-80" data-scam-help-hotline>
        <strong>{t('v3.scam.help.hotlineTitle')}</strong> — {t('v3.scam.help.agency')}. {t('v3.scam.help.hotlineDesc')}
      </p>
      <p className="mt-1 text-[12.5px] leading-snug opacity-80" data-scam-help-source>
        {t('v3.scam.help.sourceLabel')}{' '}
        <a href={SCAM_REPORT_HOTLINE.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{t('v3.scam.help.sourceName')}</a>
      </p>
    </section>
  )
}
