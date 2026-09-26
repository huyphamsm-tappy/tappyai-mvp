'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { Plus, MessageCircle, Loader2 } from 'lucide-react'
import { useMessages } from './MessagesProvider'
import ThreadList from './ThreadList'
import ThreadView from './ThreadView'
import NewMessageSheet from './NewMessageSheet'

/**
 * The Messages tab of the Inbox (`v3.inbox.messages`).
 *
 * RESPONSIVE SHAPE — one component, two layouts:
 *
 *   lg and up   list and thread side by side; selecting a row swaps the right
 *               pane and the list stays put.
 *   below lg    one at a time. The thread takes the whole surface and Back
 *               returns to the list, which is the only arrangement that leaves
 *               room for a conversation on a 360px screen.
 *
 * `activeId` drives both, so there is no second navigation model to keep in
 * step — the same state that highlights a row on desktop is what replaces the
 * screen on mobile.
 */
export default function MessagesTab({ signedIn }: { signedIn: boolean }) {
  const { t } = useTranslation()
  const { threads, loading, meId } = useMessages()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  const active = threads.find(thread => thread.id === activeId) ?? null

  // A thread that disappears (signed out, or removed server-side) must not leave
  // an empty detail pane pointing at nothing.
  useEffect(() => {
    if (activeId && !threads.some(thread => thread.id === activeId) && !loading) setActiveId(null)
  }, [activeId, threads, loading])

  if (!signedIn) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-muted)' }}
          aria-hidden="true"
        >
          <MessageCircle size={26} />
        </span>
        <p className="text-[14px] font-semibold" style={{ color: 'var(--v3-fg)' }}>{t('v3.msg.signIn')}</p>
      </div>
    )
  }

  return (
    <>
      <div
        className="flex overflow-hidden rounded-2xl border"
        style={{
          borderColor: 'var(--v3-border)',
          background: 'var(--v3-panel)',
          // Fills the space the page gives it without letting the inner columns
          // scroll the document — each pane owns its own overflow.
          height: 'calc(100dvh - var(--v3-header-h) - 13rem)',
          minHeight: '420px',
        }}
      >
        {/* ── Conversation list ── */}
        <div
          className={`min-w-0 flex-col border-r lg:flex lg:w-[320px] lg:flex-shrink-0 ${active ? 'hidden' : 'flex w-full'}`}
          style={{ borderColor: 'var(--v3-border)' }}
        >
          <div className="flex flex-shrink-0 items-center gap-2 px-3 pb-1 pt-3">
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold transition-opacity"
              style={{ background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}
            >
              <Plus size={16} />
              {t('v3.msg.new')}
            </button>
          </div>
          <div className="min-h-0 flex-1 px-2 pt-2">
            {loading && threads.length === 0 ? (
              <div className="flex justify-center py-10">
                <Loader2 size={22} className="animate-spin" style={{ color: 'var(--v3-accent)' }} />
              </div>
            ) : (
              <ThreadList threads={threads} activeId={activeId} meId={meId} onSelect={setActiveId} />
            )}
          </div>
        </div>

        {/* ── Thread ── */}
        <div className={`min-w-0 flex-1 flex-col ${active ? 'flex' : 'hidden lg:flex'}`}>
          {active ? (
            <ThreadView thread={active} onBack={() => setActiveId(null)} />
          ) : (
            // Desktop only: below `lg` this pane is not rendered at all, so
            // there is no empty right-hand column on a phone.
            <div className="flex flex-1 items-center justify-center px-6 text-center">
              <p className="text-[13px]" style={{ color: 'var(--v3-fg-muted)' }}>
                {t('v3.msg.pickThread')}
              </p>
            </div>
          )}
        </div>
      </div>

      {composing && (
        <NewMessageSheet
          onClose={() => setComposing(false)}
          onStarted={threadId => {
            setComposing(false)
            setActiveId(threadId)
          }}
        />
      )}
    </>
  )
}
