'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Lock } from 'lucide-react'
import { useAuthStatus } from '@/hooks/useAuthStatus'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { loginPathFor } from '@/lib/auth/returnTo'

// Owner 28/11/2026: everything except the chat with Tappy needs an account; without one a visitor may look, not use.
// For a tool that runs entirely in the browser (nothing to refuse on the server) this wraps the page: a visitor sees it, inert, under a sign-in banner;
// a member gets the page untouched. While the session is still being read nothing is locked, so a member never sees a flash of the banner.
// Server-backed features do not rely on this: their API refuses a visitor (src/lib/auth/accountRequired.ts).
export default function AccountGate({ children }: { children: React.ReactNode }) {
  const status = useAuthStatus()
  const pathname = usePathname()
  const { t } = useTranslation()
  if (status !== 'visitor') return <>{children}</>
  // `inert` is not typed by React 18: set as an empty-string attribute, which is how React 18 passes it through to the DOM.
  const inert = { inert: '' } as Record<string, string>
  return (
    <div>
      <div
        data-testid="account-gate-banner"
        role="status"
        className="mx-auto mb-3 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/50 bg-amber-50 px-4 py-3 text-sm text-gray-900 dark:bg-amber-500/10 dark:text-white"
      >
        <span className="inline-flex items-center gap-2"><Lock size={16} aria-hidden="true" />{t('v3.gate.banner')}</span>
        <Link href={loginPathFor(pathname || '/')} className="rounded-full bg-[#007AFF] px-4 py-1.5 font-semibold text-white">{t('v3.gate.cta')}</Link>
      </div>
      <div data-testid="account-gate-content" aria-disabled="true" className="pointer-events-none select-none opacity-60" {...inert}>{children}</div>
    </div>
  )
}
