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
//  - WhatsApp and Telegram carry the text through their documented web
//    endpoints (wa.me, t.me/share). Messenger has only an app deep link, so
//    its tile exists only where the app can — never a dead tile on a desktop.
//  - "Other apps" (the system sheet) only renders when navigator.share exists.
//  - image rendering is never a prerequisite: Save falls back to a text file.
//
// 🔑 EVERY PLATFORM TILE SHOWS THE PLATFORM'S OWN MARK (lib/share/shareBrands.ts)
// — never a coloured initial, never a generic glyph standing in for a brand.
// The neutral glyphs are reserved for the ACTIONS (Email, Inbox, Save, Copy,
// Other apps), so a real mark can never be mistaken for a generic one.

import { useEffect, useState } from 'react'
import { Copy, Check, Share2, X, Mail, Inbox, Download } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import {
  WEB_SHARE_TARGETS, buildShareUrl, buildTextShareUrl, canOpenMessenger, isShareableUrl, type ShareTargetId,
} from '@/lib/share/shareTargets'
import { shareBrandMark } from '@/lib/share/shareBrands'
import { inboxBody, withPlanShareUrl, type ShareArtifact } from '@/lib/share/shareArtifact'
import { renderArtifactImage } from '@/lib/share/renderCardImage'
import { planBrochureStrings } from '@/lib/i18n/planBrochure'
import { PLAN_SHARE_ID_RE, planShareUrl } from '@/lib/plans/share/planShare'
import NewMessageSheet from '@/components/messaging/NewMessageSheet'
import SharePreview from './SharePreview'

type Feedback = { kind: 'ok' | 'error'; text: string } | null

/**
 * A plan's link, minted when the menu opens on a plan artifact.
 *
 *  - `pending`  the request is in flight; handoffs wait for it so nothing
 *               leaves with the brand url that could have carried the plan's own.
 *  - `url`      published: every target now carries `/plan/<shareId>`.
 *  - `signIn`   the sender is signed out or a guest (401/403): the text
 *               brochure still shares, and the menu says why there is no link.
 *  - `failed`   anything else: same fallback, no message beyond the brochure.
 */
type PlanLink = { state: 'idle' | 'pending' | 'failed' } | { state: 'url'; url: string } | { state: 'signIn' }

async function publishPlan(plan: unknown): Promise<PlanLink> {
  try {
    const r = await fetch('/api/plans/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    })
    if (r.status === 401 || r.status === 403) return { state: 'signIn' }
    // 🚨 fetch resolves on 4xx/5xx: the body must look right, not just arrive.
    if (!r.ok) return { state: 'failed' }
    const body = (await r.json()) as { id?: unknown }
    // The id is the contract; the url is built here from the same canonical
    // origin every other share link uses, so it can never disagree with them.
    return typeof body.id === 'string' && PLAN_SHARE_ID_RE.test(body.id) ? { state: 'url', url: planShareUrl(body.id) } : { state: 'failed' }
  } catch {
    return { state: 'failed' }
  }
}

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
  onShared,
}: {
  /** The canonical artifact. When absent, `url` + `title` are shared as a link (Reviews). */
  artifact?: ShareArtifact
  /** Canonical public URL. Anything else is refused by isShareableUrl. */
  url?: string
  title?: string
  open: boolean
  onClose: () => void
  /**
   * A share COMPLETED through this channel (copy landed, native sheet resolved, an app or a
   * mail client was handed the content, a file was saved, the inbox send succeeded). Cancelled
   * or failed attempts never report. Reviews record it as their "Đã share" history.
   */
  onShared?: (channel: ShareTargetId | 'inbox' | 'download') => void
}) {
  const { t, locale } = useTranslation()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [canNativeShare, setCanNativeShare] = useState(false)
  const [messengerApp, setMessengerApp] = useState(false)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [busy, setBusy] = useState<ShareTargetId | null>(null)

  const [planLink, setPlanLink] = useState<PlanLink>({ state: 'idle' })

  const base: ShareArtifact = artifact ?? urlArtifact(url ?? '', title)
  // A plan whose link has been minted shares ITS OWN page; until then, and for
  // everything else, the artifact is used as built.
  const a: ShareArtifact = planLink.state === 'url' ? withPlanShareUrl(base, planLink.url) : base
  // A recommendation shares the BRAND url; a review shares its own page. Only
  // the former needs the brochure copied alongside a url handoff.
  const textIsMoreThanUrl = a.text.trim() !== a.url.trim()
  const planSnapshot = base.kind === 'plan' ? base.plan : undefined

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
    setMessengerApp(typeof navigator !== 'undefined' && canOpenMessenger(navigator.userAgent))
  }, [])

  useEffect(() => {
    if (!open) { setFeedback(null); setInboxOpen(false); setBusy(null); setPlanLink({ state: 'idle' }) }
  }, [open])

  // Publish the plan the moment the menu opens on one. The snapshot goes up in
  // the plan's own field names; the server whitelists it again and answers with
  // the stable link for exactly this plan.
  //
  // 🚨 Keyed on the snapshot's CONTENT, not its identity: callers build the
  // artifact during render, so the object is new every time and an identity
  // dependency would publish on every render.
  const planKey = planSnapshot ? JSON.stringify(planSnapshot) : ''
  useEffect(() => {
    if (!open || !planKey) return
    let cancelled = false
    setPlanLink({ state: 'pending' })
    const snapshot = JSON.parse(planKey) as { summary?: string }
    void publishPlan({ ...snapshot, share_text: snapshot.summary }).then(link => { if (!cancelled) setPlanLink(link) })
    return () => { cancelled = true }
  }, [open, planKey])

  if (!open) return null

  const planStrings = planBrochureStrings(locale === 'en' ? 'en' : 'vi')
  const linkPending = planLink.state === 'pending'

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
    if (busy || linkPending) return
    if (!hasContent) { setFeedback({ kind: 'error', text: t('share.nothingToShare') }); return }
    setBusy(id)
    try {
      switch (id) {
        case 'copy': {
          const ok = await copyText(a.text)
          setFeedback({ kind: ok ? 'ok' : 'error', text: ok ? (textIsMoreThanUrl ? t('share.copiedContent') : t('share.copied')) : t('share.copyFailed') })
          if (ok) onShared?.('copy')
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
            onShared?.('native')
            onClose()
          } catch {
            // A cancelled share is not an error; report only if genuinely unavailable.
            if (!canNativeShare) setFeedback({ kind: 'error', text: t('share.unavailable') })
          }
          return
        }
        case 'email':
        case 'line':
        case 'whatsapp':
        case 'telegram':
        case 'viber': {
          const handoff = buildTextShareUrl(id, a.subject, inboxBody(a), a.url)
          if (!handoff) { setFeedback({ kind: 'error', text: t('share.unavailable') }); return }
          // Viber is a custom scheme: nothing tells the page whether the app
          // exists. Copy first so the user is never left with nothing.
          const copied = id === 'viber' ? await copyText(a.text) : true
          if (id === 'email') {
            window.location.assign(handoff)
            setFeedback({ kind: 'ok', text: t('share.emailOpened') })
            onShared?.(id)
            return
          }
          const opened = window.open(handoff, '_blank', 'noopener,noreferrer')
          if (id === 'viber') {
            setFeedback({ kind: copied ? 'ok' : 'error', text: copied ? t('share.copiedAndOpened', { app: appName(id) }) : t('share.appNotOpened', { app: appName(id) }) })
            if (copied) onShared?.(id)
          } else {
            setFeedback(opened
              ? { kind: 'ok', text: t('share.openedWithText', { app: appName(id) }) }
              : { kind: 'error', text: t('share.unavailable') })
            if (opened) onShared?.(id)
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
            onShared?.('download')
          } else {
            download(new Blob([a.text], { type: 'text/plain;charset=utf-8' }), `tappyai-${stamp}.txt`)
            setFeedback({ kind: 'ok', text: t('share.savedText') })
            onShared?.('download')
          }
          return
        }
        case 'facebook':
        case 'zalo':
        case 'messenger':
        case 'tiktok': {
          if (!shareable) { setFeedback({ kind: 'error', text: t('share.unavailable') }); return }
          const handoff = buildShareUrl(id, a.url)
          if (!handoff) {
            // TikTok lands here by design — copy and tell the user what to do.
            const ok = await copyText(a.text)
            setFeedback({ kind: ok ? 'ok' : 'error', text: ok ? t('share.tiktokHint') : t('share.copyFailed') })
            return
          }
          if (id === 'messenger') {
            // A custom scheme, like Viber: the page never learns whether the app
            // opened, so the content is copied first and the result says so.
            const copied = await copyText(a.text)
            window.open(handoff, '_blank', 'noopener,noreferrer')
            setFeedback({ kind: copied ? 'ok' : 'error', text: copied ? t('share.copiedAndOpened', { app: appName(id) }) : t('share.appNotOpened', { app: appName(id) }) })
            if (copied) onShared?.(id)
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
          onShared?.(id)
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
      onShared?.('inbox')
    } catch {
      setFeedback({ kind: 'error', text: t('share.inboxFailed') })
    }
  }

  // The messaging apps, each behind its own real mark. Messenger only where its
  // scheme can resolve — see canOpenMessenger.
  const apps = WEB_SHARE_TARGETS.filter(x =>
    (x.kind === 'url-handoff' || x.kind === 'text-handoff' || x.id === 'tiktok') && (x.id !== 'messenger' || messengerApp))
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
            {/* The plan link's state, said plainly: minting, or why there is none. A
                published link is visible in the preview and needs no line of its own. */}
            {planSnapshot && linkPending && (
              <p role="status" className="mt-2 text-xs text-gray-500 dark:text-gray-400" data-plan-link="pending">{planStrings.linkPending}</p>
            )}
            {planSnapshot && planLink.state === 'signIn' && (
              <p role="status" className="mt-2 text-xs text-amber-600 dark:text-amber-400" data-plan-link="sign-in">{planStrings.linkSignIn}</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            {apps.map((target) => (
              <button
                key={target.id}
                data-testid={`share-target-${target.id}`}
                onClick={() => handle(target.id)}
                disabled={!!busy || linkPending}
                title={buttonLabel(target.id, target.kind)}
                className="flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-primary active:scale-95 transition disabled:opacity-60"
              >
                {(() => {
                  const mark = shareBrandMark(target.id)
                  return mark
                    // The platform's own mark, as published: fixed square box, aspect
                    // ratio preserved, never recolored, no container that would make
                    // every platform look alike. Decorative — the label names it.
                    // eslint-disable-next-line @next/next/no-img-element -- local SVG, fixed box, no pipeline needed
                    ? <img src={mark.logo} alt="" width={40} height={40} draggable={false} decoding="async" className="h-10 w-10 select-none object-contain" data-share-brand={mark.id} />
                    // An ACTION, not a brand: a neutral glyph in a neutral chip.
                    : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-200" aria-hidden="true" data-share-glyph={target.id}>
                        <Mail size={18} />
                      </span>
                })()}
                <span className="text-[11px] leading-tight text-center text-gray-700 dark:text-gray-200">
                  {buttonLabel(target.id, target.kind)}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <button data-testid="share-target-inbox" onClick={() => handle('inbox')} disabled={!!busy || linkPending} className="flex items-center gap-3 w-full px-3 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-left">
              <Inbox size={18} className="text-orange-500" />
              <span className="text-sm text-gray-800 dark:text-gray-100">{t('share.inbox')}</span>
            </button>
            <button data-testid="share-target-save" onClick={() => handle('save')} disabled={!!busy || linkPending} className="flex items-center gap-3 w-full px-3 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-left">
              <Download size={18} className="text-gray-500" />
              <span className="text-sm text-gray-800 dark:text-gray-100">{t('share.save')}</span>
            </button>
            <button data-testid="share-target-copy" onClick={() => handle('copy')} disabled={!!busy || linkPending} className="flex items-center gap-3 w-full px-3 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-left">
              {feedback?.text === t('share.copiedContent') || feedback?.text === t('share.copied')
                ? <Check size={18} className="text-green-500" />
                : <Copy size={18} className="text-gray-500" />}
              <span className="text-sm text-gray-800 dark:text-gray-100">{textIsMoreThanUrl ? t('share.copyContent') : t('share.copyLink')}</span>
            </button>
            {canNativeShare && (
              <button data-testid="share-target-native" onClick={() => handle('native')} disabled={!!busy || linkPending} className="flex items-center gap-3 w-full px-3 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-left">
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
