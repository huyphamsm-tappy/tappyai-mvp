'use client'

import Image from 'next/image'
import { useTranslation } from '@/lib/i18n/useTranslation'

// Controller V2 — premium empty state for an authenticated actor with no
// department membership (mode 'none'). Authentication ≠ authorization: they can
// reach the Controller shell but have no department workspace yet.
export function NoWorkspace() {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col items-center justify-center rounded-admin-md border border-dashed border-border bg-card px-6 py-14 text-center">
      <Image src="/branding/otter-logo.png" alt="" width={64} height={64} className="mb-4 rounded-full opacity-90" aria-hidden />
      <h2 className="text-base font-semibold text-foreground">{t('admin.home.none.title')}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{t('admin.home.none.note')}</p>
    </section>
  )
}
