'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { goBack } from '@/lib/nav/inAppBack'
import { useTranslation } from '@/lib/i18n/useTranslation'

// Back for V3 pages that sit under a parent (Account and Settings under /profile). Pops the app's own history when
// there is some, otherwise goes to the declared parent: never walks out of the site (lib/nav/inAppBack).
export default function V3BackButton({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter()
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={() => goBack(router, fallbackHref)}
      aria-label={t('common.back')}
      className="-ml-1 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
      style={{ color: 'var(--v3-fg-muted)' }}
    >
      <ChevronLeft size={20} aria-hidden="true" />
    </button>
  )
}
