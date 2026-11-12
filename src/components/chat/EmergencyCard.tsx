'use client'

import { Phone } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import type { SafetyAnnotation } from '@/lib/safety/emergencyResponse'
import { vi as VI, en as EN, zh as ZH } from '@/lib/i18n/w5/safetyEmergency'

// R13 §10.5 (SAFETY_EMERGENCY): the verified emergency numbers of an emergency answer, as tappable buttons above the answer's own plain text. The numbers come from the server's annotation
// (VERIFIED_HOTLINES) and nothing else; hours and "free" are shown only when the card carries them. No annotation, or no card, renders nothing: the text alone is the answer.
// Labels follow the language of the EMERGENCY TURN (view.lang, vi / en / zh), so the card never contradicts the text above it; an annotation without a language uses the UI language.
const DICT = { vi: VI, en: EN, zh: ZH } as const

export default function EmergencyCard({ view }: { view: SafetyAnnotation }) {
  const { t: ui } = useTranslation()
  if (!view.cards.length) return null
  const dict = view.lang ? DICT[view.lang] : null
  const t = (key: string, vars?: Record<string, string>): string => (dict && dict[key] ? Object.entries(vars ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, v), dict[key]) : ui(key, vars))
  return (
    <section role="alert" aria-label={t('safety.emergency.cardsTitle')} lang={view.lang === 'zh' ? 'zh-Hans' : view.lang} className="mb-2 rounded-xl border border-red-300 bg-red-50 p-3 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-50">
      <p className="mb-2 text-sm font-semibold">{t('safety.emergency.cardsTitle')}</p>
      <ul className="flex flex-col gap-2">
        {view.cards.map(c => (
          <li key={c.hotlineId} className="flex items-center justify-between gap-3">
            <span className="text-sm">
              {c.displayName}
              {c.operatingHours ? <span className="ml-1 opacity-80">· {t('safety.emergency.hours', { hours: c.operatingHours })}</span> : null}
              {c.freeOfCharge ? <span className="ml-1 opacity-80">· {t('safety.emergency.free')}</span> : null}
            </span>
            <a href={`tel:${c.phoneNumber}`} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white">
              <Phone className="h-4 w-4" aria-hidden="true" />
              {t('safety.emergency.call', { number: c.phoneNumber })}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
