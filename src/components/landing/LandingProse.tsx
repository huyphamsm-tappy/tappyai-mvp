'use client'

import { useTranslation } from '@/lib/i18n/useTranslation'

// Body copy for the narrative sections (What is TappyAI, Vision, About).
export default function LandingProse({ paragraphKeys }: { paragraphKeys: string[] }) {
  const { t } = useTranslation()

  return (
    <div className="mt-5 space-y-4">
      {paragraphKeys.map((key) => (
        <p key={key} className="text-fluid-body leading-relaxed text-gray-300">
          {t(key)}
        </p>
      ))}
    </div>
  )
}
