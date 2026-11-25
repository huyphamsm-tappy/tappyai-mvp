'use client'
// RFC-001 section 6.2 (AC-RESP-01 / AC-RESP-02), behind NEXT_PUBLIC_RESPONSE_PRESENTATION: what the person was in the middle of in a conversation comes back when they return to it - the
// scroll position of the reading area and the half-typed message. Kept per conversation in the tab's session storage (never sent anywhere, gone with the tab).
// A reader who was at the END of the conversation is not restored: the chat opens at its end as it always did. Storage that is blocked or full is simply not used.
import { useEffect, useRef, type RefObject } from 'react'

export interface ReadingState { top: number; atEnd: boolean; draft: string }

export const readingKey = (conversationId: string): string => `tappy_reading:${conversationId}`

/** The stored state, or null when it is missing or not what we wrote. Pure. */
export function parseReading(raw: string | null | undefined): ReadingState | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<ReadingState>
    if (!v || typeof v !== 'object') return null
    const top = typeof v.top === 'number' && Number.isFinite(v.top) && v.top >= 0 ? v.top : 0
    return { top, atEnd: typeof v.atEnd === 'boolean' ? v.atEnd : true, draft: typeof v.draft === 'string' ? v.draft.slice(0, 8000) : '' }
  } catch { return null }
}

function read(id: string): ReadingState | null {
  try { return parseReading(window.sessionStorage.getItem(readingKey(id))) } catch { return null }
}
function write(id: string, s: ReadingState) {
  try {
    if (!s.draft && s.atEnd) window.sessionStorage.removeItem(readingKey(id))
    else window.sessionStorage.setItem(readingKey(id), JSON.stringify(s))
  } catch { /* blocked or full: the position is just not remembered */ }
}

const NEAR_END_PX = 64
const RESTORE_WINDOW_MS = 2500

export function useReadingState(o: {
  enabled: boolean
  conversationId: string | undefined
  scrollRef: RefObject<HTMLElement>
  contentRef: RefObject<HTMLElement>
  pinned: { current: boolean }
  input: string
  setInput: (v: string) => void
}) {
  const { enabled, conversationId, scrollRef, contentRef, pinned } = o
  const latest = useRef<ReadingState>({ top: 0, atEnd: true, draft: '' })
  latest.current.draft = o.input
  const setInputRef = useRef(o.setInput)
  setInputRef.current = o.setInput
  const inputRef = useRef(o.input)
  inputRef.current = o.input

  useEffect(() => {
    if (!enabled || !conversationId || typeof window === 'undefined') return
    const box = scrollRef.current
    const saved = read(conversationId)
    latest.current = { top: saved?.top ?? 0, atEnd: saved?.atEnd ?? true, draft: saved?.draft ?? '' }
    // the half-typed message of this conversation, unless something was already typed here
    if (saved?.draft && !inputRef.current) setInputRef.current(saved.draft)

    let timer: ReturnType<typeof setTimeout> | null = null
    let userMoved = false
    const persist = () => { write(conversationId, { ...latest.current, draft: inputRef.current }) }
    const onScroll = () => {
      if (!box) return
      latest.current.top = box.scrollTop
      latest.current.atEnd = box.scrollHeight - box.scrollTop - box.clientHeight <= NEAR_END_PX
      if (timer) clearTimeout(timer)
      timer = setTimeout(persist, 200)
    }
    const gesture = () => { userMoved = true }
    const events: Array<keyof HTMLElementEventMap> = ['wheel', 'touchstart', 'pointerdown', 'keydown']
    box?.addEventListener('scroll', onScroll, { passive: true })
    for (const e of events) box?.addEventListener(e, gesture, { passive: true })

    // restore: the content settles over a moment (pictures, cards), so the position is applied again as it grows, until the reader moves or the window ends
    let ro: ResizeObserver | null = null
    let stop: ReturnType<typeof setTimeout> | null = null
    if (box && saved && !saved.atEnd && saved.top > 0) {
      const apply = () => { if (!userMoved) { pinned.current = false; box.scrollTop = saved.top } }
      apply()
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(apply)
      if (typeof ResizeObserver !== 'undefined' && contentRef.current) {
        ro = new ResizeObserver(apply)
        ro.observe(contentRef.current)
      }
      stop = setTimeout(() => { ro?.disconnect(); ro = null }, RESTORE_WINDOW_MS)
    }
    return () => {
      if (timer) clearTimeout(timer)
      if (stop) clearTimeout(stop)
      ro?.disconnect()
      box?.removeEventListener('scroll', onScroll)
      for (const e of events) box?.removeEventListener(e, gesture)
      persist()
    }
  }, [enabled, conversationId, scrollRef, contentRef, pinned])

  // the draft is saved as it is typed, not only when the conversation is left
  useEffect(() => {
    if (!enabled || !conversationId || typeof window === 'undefined') return
    const t = setTimeout(() => write(conversationId, { ...latest.current, draft: o.input }), 300)
    return () => clearTimeout(t)
  }, [enabled, conversationId, o.input])
}
