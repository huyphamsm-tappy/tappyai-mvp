'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Info } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

// The owner's layout (20/11/2026, picture 1): the top band is ONE row, and the partner banner sits INSIDE it between the logo and the bell: the Agoda mark, a headline, a "Quảng cáo" label and one button.
// Nothing is invented: the button goes to the tracked Agoda link the Deals page already uses (GET /api/deals/partners); no link = no banner. No price, discount or hotel count is claimed (Tappy has not
// verified any), only what the partner is for. Wide screens only; the picture-free band keeps the row quiet on a phone.
export default function HeaderPartnerBanner() {
  const { t } = useTranslation()
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    fetch('/api/deals/partners', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(b => {
        const hit = Array.isArray(b?.partners) ? b.partners.find((p: { providerId?: string; url?: string }) => p.providerId === 'agoda' && typeof p.url === 'string') : null
        if (live && hit) setUrl(hit.url)
      })
      .catch(() => {})
    return () => { live = false }
  }, [])
  if (!url) return null
  return (
    <div data-testid="header-partner-banner" className="relative mx-4 hidden h-[60px] min-w-0 max-w-[820px] flex-1 items-center gap-4 overflow-hidden rounded-2xl border border-blue-400/40 bg-gradient-to-r from-[#0b1d4a] via-[#123a8c] to-[#0b2a6b] px-4 shadow-lg shadow-blue-950/60 lg:flex">
      {/* eslint-disable-next-line @next/next/no-img-element -- the partner's own mark, a local file */}
      <img src="/brands/agoda.svg" alt="Agoda" height={26} className="h-6 w-auto shrink-0" />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[15px] font-bold text-white">{t('chatWs.banner.title')}</p>
        <p className="truncate text-[11px] text-sky-200/90">{t('chatWs.banner.sub')}</p>
      </div>
      <span className="flex shrink-0 items-center gap-1 rounded-full border border-white/20 px-2 py-0.5 text-[10px] text-slate-200">
        {t('chatWs.banner.ad')} <Info size={10} aria-hidden="true" />
      </span>
      <a href={url} target="_blank" rel="sponsored noopener noreferrer" className="flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#f59e0b] to-[#fbbf24] px-4 py-2 text-[13px] font-bold text-[#1c1203] transition-[filter] hover:brightness-110">
        {t('chatWs.banner.cta')} <ArrowRight size={14} aria-hidden="true" />
      </a>
    </div>
  )
}
