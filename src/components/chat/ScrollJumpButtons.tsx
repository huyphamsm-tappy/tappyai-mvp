'use client'
// Owner 02/11: a long chat got around only by the mouse wheel or the scroll bar. Two round buttons over the conversation's pane - to the
// top, to the end - shown only when they lead somewhere (jumpButtons); when the reader has scrolled up while Tappy is still answering, the
// end button carries the typing dots, so the answer being written below is not missed.
import { useEffect, useState, type RefObject } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { jumpButtons } from './useStickToBottom'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function ScrollJumpButtons({ scrollRef, answering, onTop, onEnd }: { scrollRef: RefObject<HTMLElement | null>; answering: boolean; onTop: () => void; onEnd: () => void }) {
  const { t } = useTranslation()
  const [state, setState] = useState({ top: false, end: false, answering: false })
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setState(prev => {
      const next = jumpButtons(el, answering)
      return prev.top === next.top && prev.end === next.end && prev.answering === next.answering ? prev : next
    })
    update()
    el.addEventListener('scroll', update, { passive: true })
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update)
      ro.observe(el)
      if (el.firstElementChild) ro.observe(el.firstElementChild)
    }
    return () => { el.removeEventListener('scroll', update); ro?.disconnect() }
  }, [scrollRef, answering])

  if (!state.top && !state.end) return null
  const round = 'pointer-events-auto flex items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white/95 text-gray-700 shadow-md backdrop-blur hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-200 dark:hover:bg-gray-800'
  return (
    <div data-print-hide className="pointer-events-none absolute bottom-3 right-4 z-20 flex flex-col items-end gap-2" data-testid="scroll-jump">
      {state.top && (
        <button type="button" onClick={onTop} aria-label={t('chat.scrollTop')} title={t('chat.scrollTop')} className={`${round} h-9 w-9`}>
          <ArrowUp size={16} aria-hidden="true" />
        </button>
      )}
      {state.end && (
        <button type="button" onClick={onEnd} aria-label={state.answering ? t('chat.stillAnswering') : t('chat.scrollEnd')} title={t('chat.scrollEnd')}
          className={`${round} ${state.answering ? 'h-9 px-3 text-xs font-medium' : 'h-9 w-9'}`} data-testid="scroll-jump-end">
          {state.answering && (
            <span className="flex items-center gap-1" aria-hidden="true">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary-500 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary-500 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary-500" />
            </span>
          )}
          {state.answering && <span>{t('chat.stillAnswering')}</span>}
          <ArrowDown size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
