'use client'

import Link from 'next/link'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function SuperTuxView() {
  const { t } = useTranslation()

  return (
    <div className="h-screen h-dvh bg-black flex flex-col overflow-hidden">
      {/* Minimal header — no external resources (COEP-safe) */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <Link
          href="/game"
          className="flex items-center gap-1 text-blue-400 text-sm font-medium"
        >
          <ChevronLeft size={18} />
          {t('game.backToGames')}
        </Link>

        <div className="text-center">
          <h1 className="text-white font-bold text-sm leading-tight">🐧 SuperTux</h1>
          <p className="text-gray-500 text-xs leading-tight">{t('game.openSourceGpl')}</p>
        </div>

        <a
          href="https://supertux.org"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-0.5 text-gray-500 text-xs hover:text-gray-300 transition-colors"
        >
          supertux.org
          <ExternalLink size={10} className="ml-0.5" />
        </a>
      </div>

      {/* SuperTux WebAssembly build — served from /public/games/supertux/supertux2.html
          Requires COOP: same-origin + COEP: require-corp on static files (set in middleware.ts)
          and COEP: credentialless on this parent page (also set in middleware.ts). */}
      {/* iframe points to the route handler at /games/supertux which serves supertux2.html
          with COOP+COEP headers (static files in /public can't get these headers directly).
          Relative URLs in supertux2.html resolve to /games/supertux/supertux2.* in public/. */}
      <iframe
        src="/games/supertux"
        className="flex-1 w-full border-0 bg-black"
        title={t('game.supertuxIframeTitle')}
        allow="fullscreen"
      />
    </div>
  )
}
