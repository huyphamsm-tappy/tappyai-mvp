'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import '@/components/chat/v206.css'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { planBadgeLabel } from '@/lib/chat/v206Look'
import { SHELL_REF } from '@/lib/chat/shellRef'
import ShellHeader from './ShellHeader'

// The mockup's product header (80 px, above the three columns): logo, "TappyAI" with the REAL plan badge, tagline. The badge is the person's active plan (GET /api/payments/me, the same
// source as the account page); no active plan, a guest, or the subscriptions switched off = no badge. Nothing else is drawn: no verification pill, no partner banner.

export default function ProductHeader({ historyOpen = true, onToggleHistory }: { historyOpen?: boolean; onToggleHistory?: () => void } = {}) {
  // NEXT_PUBLIC_SHELL_REF (default off): the first layout's header; every hook of the old header stays below the early return's component boundary
  if (SHELL_REF && onToggleHistory) return <ShellHeader historyOpen={historyOpen} onToggleHistory={onToggleHistory} />
  return <MockupHeader />
}

function MockupHeader() {
  const { t } = useTranslation()
  const [badge, setBadge] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    fetch('/api/payments/me', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (live) setBadge(planBadgeLabel(b?.subscription)) })
      .catch(() => {})
    return () => { live = false }
  }, [])
  return (
    <header data-testid="v206-product-header" className="v206-product h-20 min-h-[80px] shrink-0 items-center rounded-2xl border border-blue-500/25 bg-[#091022]/90 px-6 shadow-xl shadow-blue-950/70">
      <Link href="/" aria-label={t('v206.product.home')} className="group flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- the app's own logo in /public/branding */}
        <img src="/branding/otter-logo.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-[22%] border border-blue-400/30 object-cover shadow-md shadow-blue-500/30 transition-transform group-hover:scale-105" />
        <span className="flex flex-col">
          <span className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-white transition-colors group-hover:text-blue-300">TappyAI</span>
            {badge && <span data-testid="v206-plan-badge" className="rounded border border-blue-500/30 bg-blue-500/20 px-1.5 font-mono text-[10px] font-bold leading-4 text-sky-300">{badge}</span>}
          </span>
          <span className="text-[11px] font-medium text-blue-300/80">{t('v206.product.tagline')}</span>
        </span>
      </Link>
    </header>
  )
}
