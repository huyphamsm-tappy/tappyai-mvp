'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useChat } from 'ai/react'
import { Share2, Send } from 'lucide-react'
import ShareMenu from '@/components/share/ShareMenu'
import { absoluteUrl } from '@/lib/share/openGraph'
import { ensureAnonymousSession } from '@/lib/auth/ensureAnonymousSession'
import { loginPathFor } from '@/lib/auth/returnTo'
import { ANON_SOFT_SIGNUP_GATE_AFTER } from '@/lib/config/product'
import { setShareAttribution } from '@/lib/analytics/attribution'
import { classifyOutboundAction, detectShareChannel, emitQuery, emitResultAction, emitShareViewed, hostOf } from '@/lib/analytics/g1Events'
import { parsePlan } from '@/lib/structuredContent/parsePlan'
import { parseCTA } from '@/lib/structuredContent/parseCta'
import { parseFollowups } from '@/lib/structuredContent/parseFollowups'
import { parseShoppingMarker } from '@/lib/ai/consultative/synthesisView'
import { parsePlacesMarker } from '@/lib/recommendation/marker'
import { renderPublicMarkdown } from '@/lib/share/renderPublicMarkdown'
import { publicResultText } from '@/lib/i18n/share'

// ─────────────────────────────────────────────────────────────────────────────
// The interactive layer of /r/<slug>:
//
//   · attribution + `share_viewed` (once per share per session)
//   · `result_action` for every outbound click on the page (delegated)
//   · "Hỏi Tappy câu khác…" — the anonymous follow-up, through the EXISTING
//     /api/chat pipeline with `shareSlug` so the server applies the per-share
//     cap and gives the model the public context line. No second AI backend.
//   · share-out of this same result (ShareMenu, the canonical share layer)
//
// Gates are SOFT first (a dismissable nudge after ANON_SOFT_SIGNUP_GATE_AFTER
// questions) and HARD only when the server says so (429/401 from the quota
// the whole product already enforces). The page itself never blocks reading.
// ─────────────────────────────────────────────────────────────────────────────

const ASK_COUNT_KEY = 'tappy_g1_public_asks'

function stripMarkers(content: string): { text: string; buttons: { label: string; url: string }[] } {
  const { text: afterPlan } = parsePlan(content)
  const { text: afterCta, buttons } = parseCTA(afterPlan)
  const { text: afterFollowups } = parseFollowups(afterCta)
  const { text: afterShopping } = parseShoppingMarker(afterFollowups)
  const { text } = parsePlacesMarker(afterShopping)
  return {
    text: text.replace(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g, ''),
    buttons: buttons.filter(b => typeof b.url === 'string' && /^https:\/\//.test(b.url)).map(b => ({ label: b.label, url: b.url })),
  }
}

function serverErrorCode(raw: string | undefined): string | null {
  if (!raw) return null
  try { return String(JSON.parse(raw)?.error ?? '') || null } catch { return null }
}

export default function PublicResultClient({
  shareId, slug, locale, title, suggestedQuestions,
}: {
  shareId: string
  slug: string
  locale: 'vi' | 'en'
  title: string
  suggestedQuestions: string[]
}) {
  const t = (key: Parameters<typeof publicResultText>[1]) => publicResultText(locale, key)
  const [shareOpen, setShareOpen] = useState(false)
  const [softGate, setSoftGate] = useState(false)
  const [hardGate, setHardGate] = useState<string | null>(null)
  const askCountRef = useRef(0)
  const publicUrl = absoluteUrl(`/r/${slug}`)

  // Attribution first, then the view — so the view already carries the share.
  useEffect(() => {
    setShareAttribution(shareId)
    emitShareViewed({ share_id: shareId, slug, channel: detectShareChannel(document.referrer, navigator.userAgent) })
    try { askCountRef.current = Number(sessionStorage.getItem(ASK_COUNT_KEY) ?? 0) || 0 } catch { /* ignore */ }
  }, [shareId, slug])

  // Every outbound click on the page is a result_action. Delegated so the
  // server-rendered buttons, the cards and the follow-up replies all count.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      const href = a.getAttribute('href') ?? ''
      if (!/^https?:\/\//i.test(href)) return
      const action = classifyOutboundAction(a.dataset.ctaType, href)
      if (!action) return
      emitResultAction({ action_type: action, result_id: shareId, share_id: shareId, target_host: hostOf(href), surface: 'public_result' })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [shareId])

  const { messages, input, setInput, handleInputChange, handleSubmit, isLoading, error, append } = useChat({
    api: '/api/chat',
    headers: { 'x-tappy-surface': 'web' },
    body: { shareSlug: slug },
  })

  useEffect(() => {
    const code = serverErrorCode(error?.message)
    if (code === 'anon_limit_reached' || code === 'share_follow_up_limit' || code === 'free_limit_reached') setHardGate(t('publicResult.hardGate'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])

  const countAsk = useCallback(() => {
    askCountRef.current += 1
    try { sessionStorage.setItem(ASK_COUNT_KEY, String(askCountRef.current)) } catch { /* ignore */ }
    emitQuery({ is_follow_up: true, surface: 'public_result' })
    emitResultAction({ action_type: 'follow_up_query', result_id: shareId, share_id: shareId, surface: 'public_result' })
    if (askCountRef.current >= ANON_SOFT_SIGNUP_GATE_AFTER) setSoftGate(true)
  }, [shareId])

  const ask = useCallback(async (question: string) => {
    if (!question.trim() || isLoading || hardGate) return
    // A real (anonymous) identity so the server's quota keys on it — same call the chat makes.
    await ensureAnonymousSession()
    countAsk()
    await append({ role: 'user', content: question.trim() })
    setInput('')
  }, [append, countAsk, hardGate, isLoading, setInput])

  const onSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim() || isLoading || hardGate) return
    await ensureAnonymousSession()
    countAsk()
    handleSubmit(e)
  }, [countAsk, handleSubmit, hardGate, input, isLoading])

  const loginHref = loginPathFor(`/r/${slug}`)

  return (
    <section className="mt-8">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { setShareOpen(true); emitResultAction({ action_type: 'share', result_id: shareId, share_id: shareId, surface: 'public_result' }) }}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-medium"
        >
          <Share2 size={16} /> {t('publicResult.share')}
        </button>
      </div>
      <ShareMenu url={publicUrl} title={title} open={shareOpen} onClose={() => setShareOpen(false)} />

      {/* Follow-up thread */}
      {messages.length > 0 && (
        <div className="mt-6 space-y-4">
          {messages.map((m) => {
            if (m.role === 'user') {
              return <p key={m.id} className="ml-auto max-w-[85%] rounded-2xl bg-interactive px-4 py-2 text-sm text-white">{m.content}</p>
            }
            const { text, buttons } = stripMarkers(m.content)
            return (
              <div key={m.id} className="rounded-2xl bg-gray-50 dark:bg-gray-900 px-4 py-3 text-sm leading-relaxed">
                <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: renderPublicMarkdown(text) }} />
                {buttons.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {buttons.map((b) => (
                      <a key={b.url} href={b.url} target="_blank" rel="noopener noreferrer nofollow" className="rounded-lg border border-primary-300 px-3 py-1 text-xs font-medium text-primary-600">{b.label}</a>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {isLoading && <p className="text-xs text-gray-500">{t('publicResult.thinking')}</p>}
        </div>
      )}

      {hardGate ? (
        <div className="mt-6 rounded-2xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 p-4 text-sm">
          <p>{hardGate}</p>
          <a href={loginHref} className="mt-3 inline-block rounded-xl bg-interactive px-4 py-2 font-semibold text-white">{t('publicResult.signIn')}</a>
        </div>
      ) : (
        <>
          {softGate && (
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-primary-50 dark:bg-primary-900/20 p-4 text-sm">
              <p className="flex-1">{t('publicResult.softGate')}</p>
              <a href={loginHref} className="rounded-xl bg-interactive px-3 py-1.5 font-semibold text-white">{t('publicResult.signIn')}</a>
              <button type="button" onClick={() => setSoftGate(false)} className="text-gray-500 underline">{t('publicResult.notNow')}</button>
            </div>
          )}
          {suggestedQuestions.length > 0 && messages.length === 0 && (
            <div className="mt-6">
              <p className="mb-2 text-xs font-medium text-gray-500">{t('publicResult.suggested')}</p>
              <div className="flex flex-wrap gap-2">
                {suggestedQuestions.map((q) => (
                  <button key={q} type="button" onClick={() => ask(q)} className="rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          <form onSubmit={onSubmit} className="mt-4">
            <label htmlFor="public-ask" className="block text-sm font-semibold">{t('publicResult.askAnother')}</label>
            <div className="mt-2 flex gap-2">
              <input
                id="public-ask"
                value={input}
                onChange={handleInputChange}
                placeholder={t('publicResult.askPlaceholder')}
                maxLength={1000}
                className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm outline-none focus:border-primary-400"
              />
              <button type="submit" disabled={isLoading || !input.trim()} aria-label={t('publicResult.send')} className="inline-flex items-center justify-center rounded-xl bg-interactive px-4 text-white disabled:opacity-50">
                <Send size={16} />
              </button>
            </div>
          </form>
          {error && !hardGate && <p className="mt-2 text-xs text-red-600">{t('publicResult.retry')}</p>}
        </>
      )}
    </section>
  )
}
