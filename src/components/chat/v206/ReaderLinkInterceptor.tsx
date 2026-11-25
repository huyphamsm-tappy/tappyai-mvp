'use client'
// 15/11 (owner): mounted ONCE by the chat. A plain click on an ordinary https link inside an answer (readerLinks.ts says which) opens the reader beside the chat instead of a new tab, for EVERY answer and
// every part of it, with no per-answer wiring. One listener on the document, in the capture phase, only for anchors inside READER_SCOPE; everything else (a map, a partner link, a modifier click) is untouched.
import { useEffect } from 'react'
import { isPlainClick, readerLinkTarget, READER_SCOPE } from '@/lib/chat/readerLinks'
import { v206Store } from '@/lib/chat/v206Store'

export default function ReaderLinkInterceptor() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!isPlainClick(e)) return
      const a = (e.target as HTMLElement | null)?.closest?.('a')
      if (!(a instanceof HTMLAnchorElement) || !a.closest(READER_SCOPE)) return
      const target = readerLinkTarget(a, window.location.origin)
      if (!target) return
      e.preventDefault()
      v206Store.openLink(target.url, target.title)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
  return null
}
