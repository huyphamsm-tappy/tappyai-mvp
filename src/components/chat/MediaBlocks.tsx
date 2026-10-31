'use client'
// CONSULT_V3 layouts (owner 17/10, ChatGPT-like layout): the server's [TAPPY_MEDIA] block rendered.
//   · news   — the cited articles' own pictures as a magazine grid (one large, two stacked, "+N"), each opening its article;
//   · entity — the answer's subject as a card (Wikipedia picture + summary), and a panel that slides in from the right to read more
//              without leaving the chat (opened from the card or by tapping the subject's bold name in the answer).
// Every URL is re-checked here (mediaHosts.ts: allowed image CDNs / article pages, safe https) even though the server checked it.
import { useEffect } from 'react'
import { X, ExternalLink } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { isAllowedMediaImage, isAllowedMediaPage, type MediaEntity, type MediaNewsItem, type MediaOption } from '@/lib/media/mediaHosts'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'

/**
 * CONSULT_ONE_BRAIN (owner 31/10, ChatGPT's option cards): each option of a recommendation as a bordered card — its tag, its name, the figure to
 * compare by (large) with what the figure is and its date, the highlights, what costs extra, a small caveat and the link to act on it.
 * Text only; the link is re-checked here (safe https) although the server kept only links this turn's tools returned.
 */
export function OptionCards({ title, options }: { title?: string; options: MediaOption[] }) {
  if (!options.length) return null
  return (
    <div data-media="options" className="my-3">
      {title && <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map(o => (
          <div key={o.name} className="flex flex-col rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 p-4">
            {o.badge && <span className="mb-2 self-start rounded-full bg-primary-500/10 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">{o.badge}</span>}
            <p className="text-base font-semibold text-gray-900 dark:text-gray-100">{o.name}</p>
            {o.figure && <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{o.figure}</p>}
            {o.figureNote && <p className="text-xs text-gray-500 dark:text-gray-400">{o.figureNote}</p>}
            {o.verdict && <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{o.verdict}</p>}
            {o.highlights.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
                {o.highlights.map(h => <li key={h}>{h}</li>)}
              </ul>
            )}
            {o.extras && o.extras.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-gray-600 dark:text-gray-400">
                {o.extras.map(x => <li key={x}>+ {x}</li>)}
              </ul>
            )}
            {o.caveat && <p className="mt-2 text-xs italic text-gray-500 dark:text-gray-400">{o.caveat}</p>}
            {o.href && isSafeHttpsUrl(o.href) && (
              <a href={o.href} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 self-start text-sm font-medium text-primary-600 dark:text-primary-300">
                {o.linkLabel || new URL(o.href).hostname.replace(/^www\./, '')} <ExternalLink size={13} aria-hidden="true" />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function NewsMediaGrid({ items }: { items: MediaNewsItem[] }) {
  const ok = items.filter(it => isAllowedMediaImage(it.src) && isAllowedMediaPage(it.href))
  if (!ok.length) return null
  const shown = ok.slice(0, 3)
  const more = ok.length - shown.length
  const tile = (it: MediaNewsItem, i: number, big: boolean) => (
    <a key={it.src} href={it.href} target="_blank" rel="noopener noreferrer" title={it.title}
      className={`relative block overflow-hidden bg-gray-100 dark:bg-gray-800 ${big ? 'row-span-2' : ''}`}>
      <img src={it.src} alt={it.title} loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }} className="w-full h-full object-cover" />
      <span className="absolute left-2 bottom-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">{it.label}</span>
      {more > 0 && i === shown.length - 1 && (
        <span className="absolute right-2 bottom-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">+{more}</span>
      )}
    </a>
  )
  return (
    <div data-media="news" className={`my-3 grid gap-1 overflow-hidden rounded-2xl ${shown.length === 1 ? 'grid-cols-1 h-56' : 'grid-cols-[3fr_2fr] grid-rows-2 h-64'}`}>
      {shown.map((it, i) => tile(it, i, i === 0 && shown.length > 1))}
    </div>
  )
}

export function EntityCard({ entity, onOpen }: { entity: MediaEntity; onOpen: () => void }) {
  const { t } = useTranslation()
  if (!isAllowedMediaPage(entity.href)) return null
  return (
    <div data-media="entity" className="my-3 flex gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 p-3">
      {entity.image && isAllowedMediaImage(entity.image) && (
        <button type="button" onClick={onOpen} className="flex-shrink-0" aria-label={t('placeDecision.mediaOpenPanel')}>
          <img src={entity.image} alt={entity.name} loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }} className="h-36 w-28 rounded-xl object-cover object-top" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onOpen} className="text-left text-base font-semibold text-gray-900 dark:text-gray-100 underline decoration-gray-300 dark:decoration-gray-600 underline-offset-4 hover:decoration-primary-500">
          {entity.name}
        </button>
        <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300 line-clamp-4">{entity.summary}</p>
        <a href={entity.href} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-300">
          {entity.source} <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>
    </div>
  )
}

export function EntityPanel({ entity, onClose }: { entity: MediaEntity; onClose: () => void }) {
  const { t } = useTranslation()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (!isAllowedMediaPage(entity.href)) return null
  return (
    <div className="fixed inset-0 z-50" data-media="entity-panel">
      <button type="button" aria-label={t('placeDecision.mediaClose')} onClick={onClose} className="absolute inset-0 bg-black/30" />
      <aside role="dialog" aria-label={entity.name} className="absolute right-0 top-0 h-full w-full sm:w-[400px] overflow-y-auto bg-white dark:bg-gray-900 shadow-2xl">
        <div className="relative">
          {entity.image && isAllowedMediaImage(entity.image) && (
            <img src={entity.image} alt={entity.name} className="h-72 w-full object-cover object-top" onError={e => { e.currentTarget.style.display = 'none' }} />
          )}
          <button type="button" onClick={onClose} aria-label={t('placeDecision.mediaClose')}
            className="absolute right-3 top-3 rounded-full bg-white/90 dark:bg-gray-800/90 p-1.5 text-gray-700 dark:text-gray-200 shadow">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="p-5">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{entity.name}</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-gray-700 dark:text-gray-300">{entity.summary}</p>
          <a href={entity.href} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-primary-500/40 bg-primary-500/10 px-3 py-1 text-sm font-medium text-primary-600 dark:text-primary-300">
            {t('placeDecision.mediaReadMore')} <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      </aside>
    </div>
  )
}
