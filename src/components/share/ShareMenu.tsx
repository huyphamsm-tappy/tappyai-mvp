'use client'

// The TappyAI share menu.
//
// Replaces per-component `navigator.share()` calls. On Windows desktop those
// opened the OS Share Sheet, which lists only registered Windows Share Targets
// — Nearby Sharing, Teams, Outlook — so Facebook, TikTok and Zalo never
// appeared. TappyAI now presents its own targets first, and the system sheet
// becomes one option ("More apps") rather than the whole experience.
//
// Honesty rules baked in:
//  - Facebook and Zalo open a share dialog; the user posts. The toast says
//    "Opened …", never "Posted".
//  - TikTok publishes no web link-handoff endpoint, so its action copies the
//    link and says so, instead of opening a fabricated URL.
//  - "More apps" only renders when navigator.share actually exists.

import { useEffect, useState } from 'react'
import { Copy, Check, Share2, X } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { SHARE_TARGETS, buildShareUrl, isShareableUrl, type ShareTargetId } from '@/lib/share/shareTargets'

type Feedback = { kind: 'ok' | 'error'; text: string } | null

export default function ShareMenu({
  url,
  title,
  open,
  onClose,
}: {
  /** Canonical public URL. Anything else is refused by isShareableUrl. */
  url: string
  title?: string
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [canNativeShare, setCanNativeShare] = useState(false)

  // Capability detection has to happen on the client: rendering "More apps"
  // from a server guess would show an action that does nothing.
  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  useEffect(() => {
    if (!open) setFeedback(null)
  }, [open])

  if (!open) return null

  const shareable = isShareableUrl(url)

  async function copyLink(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(url)
      return true
    } catch {
      return false
    }
  }

  async function handle(id: ShareTargetId) {
    if (!shareable) {
      setFeedback({ kind: 'error', text: t('share.unavailable') })
      return
    }

    if (id === 'copy') {
      const ok = await copyLink()
      setFeedback({ kind: ok ? 'ok' : 'error', text: ok ? t('share.copied') : t('share.copyFailed') })
      return
    }

    if (id === 'native') {
      try {
        await navigator.share({ title, url })
        onClose()
      } catch {
        // A cancelled share is not an error; only report if sharing is truly
        // unavailable, and never claim it succeeded.
        if (!canNativeShare) setFeedback({ kind: 'error', text: t('share.unavailable') })
      }
      return
    }

    const handoff = buildShareUrl(id, url)
    if (!handoff) {
      // TikTok lands here by design — copy and tell the user what to do.
      const ok = await copyLink()
      setFeedback({
        kind: ok ? 'ok' : 'error',
        text: ok ? t('share.tiktokHint') : t('share.copyFailed'),
      })
      return
    }

    const opened = window.open(handoff, '_blank', 'noopener,noreferrer')
    if (!opened) {
      // Popup blocked — do not pretend the app opened.
      setFeedback({ kind: 'error', text: t('share.unavailable') })
      return
    }
    setFeedback({ kind: 'ok', text: t('share.opened').replace('{app}', t(`share.${id}`)) })
  }

  const targets = SHARE_TARGETS.filter((target) => target.id !== 'native' || canNativeShare)

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('share.title')}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-white dark:bg-gray-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">
            {t('share.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('share.close')}
            className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {targets
            .filter((target) => target.kind === 'url-handoff')
            .map((target) => (
              <button
                key={target.id}
                onClick={() => handle(target.id)}
                className="flex flex-col items-center gap-2 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-primary active:scale-95 transition"
              >
                <span
                  className="flex items-center justify-center w-10 h-10 rounded-full text-white text-sm font-bold"
                  style={{ background: target.color }}
                  aria-hidden="true"
                >
                  {t(target.labelKey).slice(0, 1)}
                </span>
                <span className="text-xs text-gray-700 dark:text-gray-200">{t(target.labelKey)}</span>
              </button>
            ))}
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => handle('copy')}
            className="flex items-center gap-3 w-full px-3 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-left"
          >
            {feedback?.text === t('share.copied') ? (
              <Check size={18} className="text-green-500" />
            ) : (
              <Copy size={18} className="text-gray-500" />
            )}
            <span className="text-sm text-gray-800 dark:text-gray-100">{t('share.copyLink')}</span>
          </button>

          {canNativeShare && (
            <button
              onClick={() => handle('native')}
              className="flex items-center gap-3 w-full px-3 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-left"
            >
              <Share2 size={18} className="text-gray-500" />
              <span className="text-sm text-gray-800 dark:text-gray-100">{t('share.more')}</span>
            </button>
          )}
        </div>

        {feedback && (
          <p
            role="status"
            className={`mt-3 text-xs ${feedback.kind === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
          >
            {feedback.text}
          </p>
        )}
      </div>
    </div>
  )
}
