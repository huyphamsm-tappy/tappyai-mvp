'use client'

import { useTranslation } from '@/lib/i18n/useTranslation'

// Phase 7 closeout CP7 — the global AI disclaimer is a UI CONTRACT, rendered by the product itself (never left to the model to say).
// One component, one dictionary key: under the chat composer, in the app footer and in the public footer.
export default function AiDisclaimer({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <p data-testid="ai-disclaimer" className={`text-center text-[11px] leading-snug text-gray-500 dark:text-gray-400 ${className}`}>
      {t('ai.disclaimer')}
    </p>
  )
}
