'use client'

import { useTranslation } from '@/lib/i18n/useTranslation'

// Shared section shell for the startup landing page: semantic <section>, an
// accessible heading association, and the alternating dark surfaces. Section
// components pass translation keys only — no copy lives here.
export default function LandingSection({
  id,
  titleKey,
  introKey,
  tone = 'base',
  children,
  width = 'wide',
}: {
  id: string
  titleKey: string
  introKey?: string
  tone?: 'base' | 'raised'
  children?: React.ReactNode
  width?: 'wide' | 'content'
}) {
  const { t } = useTranslation()
  const headingId = `${id}-heading`

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`scroll-mt-16 border-t border-white/10 ${tone === 'raised' ? 'bg-gray-900/40' : ''}`}
    >
      <div
        className={`mx-auto px-5 py-16 sm:px-8 sm:py-20 ${
          width === 'content' ? 'max-w-container-content' : 'max-w-container-wide'
        }`}
      >
        <h2 id={headingId} className="text-fluid-h1 font-bold">
          {t(titleKey)}
        </h2>
        {/* Decorative accent rule — the design system's orange, no content */}
        <span aria-hidden="true" className="mt-4 block h-1 w-12 rounded-full bg-accent-500" />
        {introKey && <p className="mt-5 text-fluid-body text-gray-400">{t(introKey)}</p>}
        {children}
      </div>
    </section>
  )
}
