'use client'

import { useEffect, useState } from 'react'
import { X, Eye, Link2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import ShareMenu from '@/components/share/ShareMenu'
import type { SharedResultPayload } from '@/lib/share/sharedResult'
import { emitResultAction, emitShareCreated } from '@/lib/analytics/g1Events'

// ─────────────────────────────────────────────────────────────────────────────
// "This is what others will see." — the explicit share step.
//
// Sharing is never implicit. This dialog fetches the SANITIZED payload from
// the server (the same code path that will publish it), shows it, lets the
// user retitle, and only on Confirm asks the server to create the public
// result. Then the canonical ShareMenu takes over with the public URL.
//
// Nothing here reads the private message: the preview is what the server
// says the public will get, not what the client thinks it will.
// ─────────────────────────────────────────────────────────────────────────────

type Stage = 'loading' | 'preview' | 'publishing' | 'published' | 'error'

export default function SharePreviewDialog({
  open, onClose, conversationId, messageIndex, resultId, domain, parentSlug,
}: {
  open: boolean
  onClose: () => void
  conversationId: string
  messageIndex: number
  /** The client-side result id the `query` event carried, so share_created links to it. */
  resultId?: string
  domain?: string
  /** The public share this answer was reached from — enables anonymous second-generation sharing. */
  parentSlug?: string
}) {
  const { t, locale } = useTranslation()
  const [stage, setStage] = useState<Stage>('loading')
  const [payload, setPayload] = useState<SharedResultPayload | null>(null)
  const [title, setTitle] = useState('')
  const [errorText, setErrorText] = useState<string | null>(null)
  const [published, setPublished] = useState<{ url: string; slug: string; id: string } | null>(null)
  const [listed, setListed] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setStage('loading'); setPayload(null); setPublished(null); setErrorText(null)
    fetch('/api/shared-results/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, messageIndex, locale, ...(parentSlug ? { parentSlug } : {}) }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (cancelled) return
        if (!res.ok || !body?.payload) {
          setErrorText(typeof body?.message === 'string' ? body.message : t('share.previewFailed'))
          setStage('error')
          return
        }
        setPayload(body.payload as SharedResultPayload)
        setTitle((body.payload as SharedResultPayload).title)
        setListed(body.listed !== false)
        setStage('preview')
      })
      .catch(() => { if (!cancelled) { setErrorText(t('share.previewFailed')); setStage('error') } })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conversationId, messageIndex])

  if (!open) return null

  async function confirm() {
    setStage('publishing')
    try {
      const res = await fetch('/api/shared-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, messageIndex, title: title.trim() || undefined, locale, ...(parentSlug ? { parentSlug } : {}) }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.url) {
        setErrorText(typeof body?.message === 'string' ? body.message : t('share.publishFailed'))
        setStage('error')
        return
      }
      setPublished({ url: body.url, slug: body.slug, id: body.id })
      emitShareCreated({ share_id: body.id, slug: body.slug, domain: body.domain ?? domain, result_id: resultId, ...(body.parent_id ? { parent_share_id: body.parent_id } : {}) })
      emitResultAction({ action_type: 'share', result_id: resultId })
      setStage('published')
      setMenuOpen(true)
    } catch {
      setErrorText(t('share.publishFailed'))
      setStage('error')
    }
  }

  const excerpt = payload ? payload.body.replace(/[#*_>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 420) : ''

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={t('share.previewTitle')} onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-gray-900 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-50"><Eye size={16} /> {t('share.previewTitle')}</h2>
          <button onClick={onClose} aria-label={t('share.close')} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{t('share.previewHint')}</p>

        {stage === 'loading' && <div className="py-8 text-center text-sm text-gray-500">{t('share.previewLoading')}</div>}

        {(stage === 'preview' || stage === 'publishing') && payload && (
          <>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300" htmlFor="share-title">{t('share.previewTitleField')}</label>
            <input
              id="share-title"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
            />
            <div className="mt-3 rounded-2xl border border-gray-100 dark:border-gray-800 p-3">
              <p className="text-xs text-gray-500">{t('share.previewQuestion')}</p>
              <p className="text-sm text-gray-800 dark:text-gray-100">“{payload.query}”</p>
              {payload.images.length > 0 && (
                <div className="mt-2 flex gap-2 overflow-x-auto">
                  {payload.images.map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={src} src={src} alt="" className="h-16 w-20 flex-shrink-0 rounded-lg object-cover" />
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-gray-500">{t('share.previewAnswer')}</p>
              <p className="text-sm text-gray-700 dark:text-gray-200">{excerpt}{payload.body.length > 420 ? '…' : ''}</p>
              <p className="mt-2 text-xs text-gray-500">
                {t('share.previewCounts').replace('{buttons}', String(payload.buttons.length)).replace('{images}', String(payload.images.length))}
              </p>
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{t('share.previewPrivacy')}</p>
            {!listed && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('share.unlistedNotice')}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm font-medium">{t('share.cancel')}</button>
              <button onClick={confirm} disabled={stage === 'publishing'} className="flex-1 rounded-xl bg-interactive px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                {stage === 'publishing' ? t('share.publishing') : t('share.confirmPublish')}
              </button>
            </div>
          </>
        )}

        {stage === 'published' && published && (
          <div className="rounded-2xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-green-700 dark:text-green-300"><Link2 size={14} /> {t('share.published')}</p>
            <p className="mt-1 break-all text-xs text-gray-700 dark:text-gray-200">{published.url}</p>
            <button onClick={() => setMenuOpen(true)} className="mt-3 w-full rounded-xl bg-interactive px-4 py-2.5 text-sm font-semibold text-white">{t('share.title')}</button>
          </div>
        )}

        {stage === 'error' && (
          <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
            {errorText}
          </div>
        )}
      </div>
      {published && <ShareMenu url={published.url} title={title} text={payload?.query} open={menuOpen} onClose={() => setMenuOpen(false)} />}
    </div>
  )
}
