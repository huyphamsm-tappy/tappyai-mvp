'use client'

// The TappyAI share menu.
//
// Replaces per-component `navigator.share()` calls. On Windows desktop those
// opened the OS Share Sheet, which lists only registered Windows Share Targets
// — Nearby Sharing, Teams, Outlook — so Facebook, TikTok and Zalo never
// appeared. TappyAI now presents its own targets first, and the system sheet
// becomes one option ("More apps") rather than the whole experience.
//
// 🔑 ONE ARTIFACT IN, EIGHT DELIVERIES OUT. Every button below receives the
// same `ShareArtifact` (see lib/share/shareArtifact.ts). The preview at the top
// is rendered from that artifact, so the user is shown exactly what will leave.
//
// Honesty rules baked in — each button's label and its result say what actually
// happened, and nothing more:
//  - a URL handoff (Facebook, Zalo) cannot carry the recommendation, because a
//    recommendation has no public page (Places data is live-only). The brochure
//    is COPIED first, the platform's dialog opens with the brand url, and the
//    result says "copied — opened X, paste to send". Never "sent".
//  - a text handoff (Email, Viber, LINE) carries the brochure in the URI. Viber
//    is a custom scheme that fails silently when the app is absent, so the text
//    is copied first as insurance and the result says so.
//  - TikTok publishes no web handoff at all; its action copies and says so.
//  - Tappy Inbox is the ONE target that can report delivery, because the
//    existing messaging endpoint returns 2xx. It reuses NewMessageSheet and
//    POST /api/messaging/threads/{id}/messages — nothing new.
//  - "More apps" only renders when navigator.share exists.
//  - image rendering is never a prerequisite: Save falls back to a text file.

import { useEffect, useState } from 'react'
import { Copy, Check, Share2, X, Mail, Inbox, Download } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import {
  SHARE_TARGETS, buildShareUrl, buildTextShareUrl, isShareableUrl, type ShareTargetId,
} from '@/lib/share/shareTargets'
import { inboxBody, type ShareArtifact } from '@/lib/share/shareArtifact'
import { renderArtifactImage } from '@/lib/share/renderCardImage'
import NewMessageSheet from '@/components/messaging/NewMessageSheet'
import SharePreview from './SharePreview'

type Feedback = { kind: 'ok' | 'error'; text: string } | null

/** A url-only call (Reviews) becomes the smallest honest artifact: the link is the content. */
function urlArtifact(url: string, title?: string): ShareArtifact {
  return { kind: 'places', title: title ?? url, subject: title ?? url, text: url, url, places: [] }
}

export default function ShareMenu({
  artifact,
  url,
  title,
  open,
  onClose,
}: {
  /** The canonical artifact. When absent, `url` + `title` are shared as a link (Reviews). */
  artifact?: ShareArtifact
  /** Canonical public URL. Anything else is refused by isShareableUrl. */
  url?: string
  title?: string
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [canNativeShare, setCanNativeShare] = useState(false)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [busy, setBusy] = useState<ShareTargetId | null>(null)

  const a: ShareArtifact = artifact ?? urlArtifact(url ?? '', title)
  // A recommendation shares the BRAND url; a review shares its own page. Only
  // the former needs the brochure copied alongside a url handoff.
  const textIsMoreThanUrl = a.text.trim() !== a.url.trim()

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  useEffect(() => {
    if (!open) { setFeedback(null); setInboxOpen(false); setBusy(null) }
  }, [open])

  if (!open) return null

  const shareable = isShareableUrl(a.url)
  const hasContent = a.text.trim().length > 0

  async function copyText(text: string): Promise<boolean> {
    try { await navigator.clipboard.writeText(text); return true } catch { return false }
  }

  function download(blob: Blob, filename: string) {
    const href = URL.createObjectURL(blob)
    const el = document.createElement('a')
    el.href = href; el.download = filename; el.rel = 'noopener'
    document.body.appendChild(el); el.click(); el.remove()
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  }

  const appName = (id: ShareTargetId) => t(`share.${id}`)

  async function handle(id: ShareTargetId) {
    if (busy) return
    if (!hasContent) { setFeedback({ kind: 'error', text: t('share.nothingToShare') }); return }
    setBusy(id)
    try {
      switch (id) {
        case 'copy': {
          const ok = await copyText(a.text)
          setFeedback({ kind: ok ? 'ok' : 'error', text: ok ? (textIsMoreThanUrl ? t('share.copiedContent') : t('share.copied')) : t('share.copyFailed') })
          return
        }
        case 'native': {
          try {
            const data: ShareData = { title: a.subject, text: a.text }
            if (!textIsMoreThanUrl) data.url = a.url
            if (a.image && typeof navigator.canShare === 'function') {
              const file = new File([a.image], 'tappyai.png', { type: 'image/png' })
              if (navigator.canShare({ files: [file] })) data.files = [file]
            }
            await navigator.share(data)
            onClose()
          } catch {
            // A cancelled share is not an error; report only if genuinely unavailable.
            if (!canNativeShare) setFeedback({ kind: 'error', text: t('share.unavailable') })
          }
          return
        }
        case 'email':
        case 'line':
        case 'viber': {
          const handoff = buildTextShareUrl(id, a.subject, inboxBody(a))
          if (!handoff) { setFeedback({ kind: 'error', text: t('share.unavailable') }); return }
          // Viber is a custom scheme: nothing tells the page whether the app
          // exists. Copy first so the user is never left with nothing.
          const copied = id === 'viber' ? await copyText(a.text) : true
          if (id === 'email') {
            window.location.assign(handoff)
            setFeedback({ kind: 'ok', text: t('share.emailOpened') })
            return
          }
          const opened = window.open(handoff, '_blank', 'noopener,noreferrer')
          if (id === 'viber') {
            setFeedback({ kind: copied ? 'ok' : 'error', text: copied ? t('share.copiedAndOpened', { app: appName(id) }) : t('share.appNotOpened', { app: appName(id) }) })
          } else {
            setFeedback(opened
              ? { kind: 'ok', text: t('share.openedWithText', { app: appName(id) }) }
              : { kind: 'error', text: t('share.unavailable') })
          }
          return
        }
        case 'inbox': {
          setInboxOpen(true)
          return
        }
        case 'save': {
          let image = a.image ?? null
          if (!image) {
            // Best effort, never a prerequisite: any failure falls to text.
            try { image = await renderArtifactImage(a) } catch { image = null }
          }
          const stamp = new Date().toISOString().slice(0, 10)
          if (image) {
            download(image, `tappyai-${stamp}.png`)
            setFeedback({ kind: 'ok', text: t('share.savedImage') })
          } else {
            download(new Blob([a.text], { type: 'text/plain;charset=utf-8' }), `tappyai-${stamp}.txt`)
            setFeedback({ kind: 'ok', text: t('share.savedText') })
          }
          return
        }
        case 'facebook':
        case 'zalo':
        case 'tiktok': {
          if (!shareable) { setFeedback({ kind: 'error', text: t('share.unavailable') }); return }
          const handoff = buildShareUrl(id, a.url)
          if (!handoff) {
            // TikTok lands here by design — copy and tell the user what to do.
            const ok = await copyText(a.text)
            setFeedback({ kind: ok ? 'ok' : 'error', text: ok ? t('share.tiktokHint') : t('share.copyFailed') })
            return
          }
          // The dialog can only carry the brand url; the brochure travels on the clipboard.
          const copied = textIsMoreThanUrl ? await copyText(a.text) : true
          const opened = window.open(handoff, '_blank', 'noopener,noreferrer')
          if (!opened) { setFeedback({ kind: 'error', text: t('share.unavailable') }); return }
          setFeedback({
            kind: copied ? 'ok' : 'error',
            text: textIsMoreThanUrl
              ? (copied ? t('share.copiedAndOpened', { app: appName(id) }) : t('share.copyFailed'))
              : t('share.opened', { app: appName(id) }),
          })
          return
        }
      }
    } finally {
      setBusy(null)
    }
  }

  /** After NewMessageSheet made/reopened a thread, post the brochure into it. */
  async function sendToInbox(threadId: string) {
    setInboxOpen(false)
    try {
      const r = await fetch(`/api/messaging/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: inboxBody(a) }),
      })
      if (r.status === 401 || r.status === 403) { setFeedback({ kind: 'error', text: t('share.inboxSignIn') }); return }
      if (!r.ok) throw new Error(String(r.status))
      // The one target that may say "sent": the server just confirmed it.
      setFeedback({ kind: 'ok', text: t('share.inboxSent') })
    } catch {
      setFeedback({ kind: 'error', text: t('share.inboxFailed') })
    }
  }

  const apps = SHARE_TARGETS.filter(x => x.kind === 'url-handoff' || x.kind === 'text-handoff' || x.id === 'tiktok')
  const buttonLabel = (id: ShareTargetId, kind: string) =>
    kind === 'url-handoff' && textIsMoreThanUrl && id !== 'tiktok' ? t('share.copyAndOpen', { app: appName(id) }) : appName(id)

  return (
    <>
      <div
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label={t('share.previewTitle')}
        onClick={onClose}
      >
        <div
          className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-gray-900 p-5 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">{t('share.previewTitle')}</h2>
            <button onClick={onClose} aria-label={t('share.close')} className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={18} />
            </button>
          </div>

          <div className="mb-4">
            <SharePreview artifact={a} />
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            {apps.map((target) => (
              <button
                key={target.id}
                data-testid={`share-target-${target.id}`}
                onClick={() => handle(target.id)}
                disabled={!!busy}
                title={buttonLabel(target.id, target.kind)}
                className="flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-primary active:scale-95 transition disabled:opacity-60"
              >
                <span
                  className="flex items-center justify-center w-9 h-9 rounded-full text-white text-sm font-bold"
                  style={{ background: target.color ?? '#6b7280' }}
                  aria-hidden="true"
                >
                  {target.id === 'email' ? <Mail size={16} /> : appName(target.id).slice(0, 1)}
                </span>
                <span className="text-[11px] leading-tight text-center text-gray-700 dark:text-gray-200">
                  {buttonLabel(target.id, target.kind)}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <button data-testid="share-target-inbox" onClick={() => handle('inbox')} disabled={!!busy} className="flex items-center gap-3 w-full px-3 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-left">
              <Inbox size={18} className="text-orange-500" />
              <span className="text-sm text-gray-800 dark:text-gray-100">{t('share.inbox')}</span>
            </button>
            <button data-testid="share-target-save" onClick={() => handle('save')} disabled={!!busy} className="flex items-center gap-3 w-full px-3 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-left">
              <Download size={18} className="text-gray-500" />
              <span className="text-sm text-gray-800 dark:text-gray-100">{t('share.save')}</span>
            </button>
            <button data-testid="share-target-copy" onClick={() => handle('copy')} disabled={!!busy} className="flex items-center gap-3 w-full px-3 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-left">
              {feedback?.text === t('share.copiedContent') || feedback?.text === t('share.copied')
                ? <Check size={18} className="text-green-500" />
                : <Copy size={18} className="text-gray-500" />}
              <span className="text-sm text-gray-800 dark:text-gray-100">{textIsMoreThanUrl ? t('share.copyContent') : t('share.copyLink')}</span>
            </button>
            {canNativeShare && (
              <button data-testid="share-target-native" onClick={() => handle('native')} disabled={!!busy} className="flex items-center gap-3 w-full px-3 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-left">
                <Share2 size={18} className="text-gray-500" />
                <span className="text-sm text-gray-800 dark:text-gray-100">{t('share.more')}</span>
              </button>
            )}
          </div>

          {feedback && (
            <p role="status" className={`mt-3 text-xs ${feedback.kind === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {feedback.text}
            </p>
          )}
        </div>
      </div>

      {/* The existing Messenger flow, unchanged: pick a person, get a thread id. */}
      {inboxOpen && (
        // The Messenger sheet is z-50 on its own; this dialog is z-100. A stacking
        // context above the dialog puts the picker where the user can see it.
        <div className="relative z-[110]">
          <NewMessageSheet onClose={() => setInboxOpen(false)} onStarted={(threadId) => { void sendToInbox(threadId) }} />
        </div>
      )}
    </>
  )
}
