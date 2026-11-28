'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bookmark, MapPin, X } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

// "Saved places" side panel of the chat workspace: the person's REAL saved places (GET /api/favorites — the same list as Profile → Saved),
// slid over the right edge of the chat. There is no dimming layer: the conversation stays bright and readable beside it.
// Posts the person saved live in Profile → Saved; the link at the bottom goes there.

interface Favorite {
  id: string
  place_id: string
  place_name: string
  place_address: string
  place_type: string
}

type State = 'loading' | 'ready' | 'error' | 'signedOut'

export default function SavedDrawer({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [state, setState] = useState<State>('loading')
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/favorites', { cache: 'no-store' })
      // 401 = no session; 403 = a visitor session (everything except the chat needs an account, owner 28/11/2026): both mean "sign in", neither is a failure to load
      if (res.status === 401 || res.status === 403) { setState('signedOut'); return }
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as { favorites?: Favorite[] }
      setFavorites(Array.isArray(body.favorites) ? body.favorites : [])
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function remove(fav: Favorite) {
    const before = favorites
    setFavorites(list => list.filter(f => f.id !== fav.id))
    try {
      const res = await fetch(`/api/favorites?placeId=${encodeURIComponent(fav.place_id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(String(res.status))
      setNotice(t('chatWs.drawer.removed', { title: fav.place_name }))
      setTimeout(() => setNotice(null), 3000)
    } catch {
      setFavorites(before)
      setNotice(t('chatWs.action.failed'))
      setTimeout(() => setNotice(null), 3000)
    }
  }

  return (
    <aside
      role="complementary"
      aria-label={t('chatWs.drawer.title')}
      className="absolute inset-y-0 right-0 z-30 flex w-[380px] max-w-full flex-col border-l border-blue-500/30 bg-[#091022] shadow-[-16px_0_40px_rgba(0,0,0,0.85)]"
    >
      <div className="flex items-center justify-between border-b border-blue-900/30 px-4 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white"><Bookmark size={16} aria-hidden className="text-sky-300" />{t('chatWs.drawer.title')}</h2>
        <button type="button" onClick={onClose} aria-label={t('chatWs.drawer.close')} title={t('chatWs.drawer.close')} className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-900/30 hover:text-white"><X size={16} aria-hidden /></button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {state === 'loading' && <p className="p-6 text-center text-xs text-slate-400">{t('chatWs.loading')}</p>}
        {state === 'signedOut' && <p className="p-6 text-center text-xs text-slate-400">{t('chatWs.drawer.signin')}</p>}
        {state === 'error' && (
          <div className="p-6 text-center text-xs text-slate-400">
            <p>{t('chatWs.drawer.error')}</p>
            <button type="button" onClick={() => { setState('loading'); void load() }} className="mt-3 rounded-xl border border-blue-500/40 bg-blue-600/20 px-3 py-1.5 font-medium text-sky-200 hover:bg-blue-600/40">{t('chatWs.error.retry')}</button>
          </div>
        )}
        {state === 'ready' && favorites.length === 0 && <p className="p-6 text-center text-xs leading-relaxed text-slate-400">{t('chatWs.drawer.empty')}</p>}
        {state === 'ready' && favorites.map(fav => (
          <div key={fav.id} className="flex items-start justify-between gap-2 rounded-xl border border-blue-900/40 bg-[#0B1328]/60 p-3">
            <div className="flex min-w-0 items-start gap-2">
              <MapPin size={15} aria-hidden className="mt-0.5 shrink-0 text-sky-300" />
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-white">{fav.place_name}</p>
                {fav.place_address && <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">{fav.place_address}</p>}
              </div>
            </div>
            <button type="button" onClick={() => void remove(fav)} className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-slate-400 hover:bg-red-600/25 hover:text-red-200">{t('chatWs.drawer.remove')}</button>
          </div>
        ))}
        {notice && <p role="status" className="rounded-xl border border-blue-500/40 bg-[#0B152C] px-3 py-2 text-xs font-medium text-white">{notice}</p>}
      </div>

      <div className="border-t border-blue-900/30 p-3 text-center">
        <Link href="/profile/favorites" className="text-xs font-medium text-sky-300 hover:text-white">{t('chatWs.drawer.all')}</Link>
      </div>
    </aside>
  )
}
