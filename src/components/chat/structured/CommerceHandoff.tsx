'use client'

import { ExternalLink } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { actionLabel } from '@/lib/recommendation/actionLabel'
import { reportCommerceHandoff } from '@/lib/recommendation/handoff'
import type { SynthesisCommerceView } from '@/lib/ai/consultative/synthesisView'

// ── The Shopping card's commerce handoff (CCP Phase 8, owner-like UAT R1 P1-5) ─
//
// The Shopping card renders from the `[TAPPY_SHOPPING]` marker, not from the
// canonical live view, so the Commerce Link the seam attached to the row needs
// its own rendering here. It is the SAME action the live view would show — the
// same label resolver ("Mua trên Điện Máy Xanh", with the login boundary stated
// when the merchant has one) and the same handoff beacon (opaque ids only) — so
// the two surfaces make one promise. Nothing here composes a URL or a price: the
// destination is the resolver's, and the merchant page shows its own price.

export default function CommerceHandoff({ c, size }: { c: SynthesisCommerceView; size: 'sm' | 'md' }) {
  const { t } = useTranslation()
  const search = c.kind === 'SEARCH_HANDOFF'
  const action = { kind: 'purchase' as const, urlKind: search ? ('search' as const) : ('direct' as const), url: c.url, platform: c.merchantName, commerce: c }
  const label = actionLabel(action, t)
  const cls = search
    ? 'inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:underline dark:text-gray-300'
    : size === 'md'
    ? 'inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-primary-300 bg-primary-50 px-3 text-sm font-semibold text-primary-800 transition-colors hover:bg-primary-100 dark:border-primary-700 dark:bg-primary-900/20 dark:text-primary-300 dark:hover:bg-primary-900/40'
    : 'inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline dark:text-primary-300'
  return (
    <a
      href={c.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => reportCommerceHandoff(action)}
      data-testid={search ? 'commerce-search' : 'commerce-handoff'}
      data-provider={c.providerId}
      className={cls}
    >
      {label}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  )
}
