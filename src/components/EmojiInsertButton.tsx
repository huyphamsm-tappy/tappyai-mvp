'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { Smile } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

// A small built-in emoji grid for text boxes (owner, 27/11/2026: the comment box had none). No dependency: the list is plain
// code points, one decision in one place. Inserts at the caret and never past the box's maxLength.

/** Faces, hands, symbols and a few food/travel marks people actually use in Vietnam. Single code points only, so nothing invisible rides along. */
export const EMOJI_CODEPOINTS: readonly number[] = [
  0x1f600, 0x1f603, 0x1f604, 0x1f601, 0x1f606, 0x1f605, 0x1f602, 0x1f923, 0x1f60a, 0x1f607, 0x1f642, 0x1f609, 0x1f60d,
  0x1f970, 0x1f618, 0x1f60b, 0x1f60e, 0x1f929, 0x1f973, 0x1f914, 0x1f62e, 0x1f631, 0x1f622, 0x1f62d, 0x1f621, 0x1f634,
  0x1f44d, 0x1f44f, 0x1f64f, 0x1f4aa, 0x1f44c, 0x1f64c, 0x1f91d,
  0x1f525, 0x2728, 0x1f389, 0x1f4af, 0x1f496, 0x1f9e1, 0x1f49b, 0x1f49a, 0x1f499,
  0x1f35c, 0x1f37b, 0x2615, 0x1f334,
]

/** The text with `insert` placed over the selection (or at the end when the caret is unknown), and where the caret goes; null when it would pass `maxLength`. Pure. */
export function insertAtSelection(value: string, start: number | null, end: number | null, insert: string, maxLength: number): { value: string; caret: number } | null {
  const s = start ?? value.length
  const e = end ?? s
  const next = value.slice(0, s) + insert + value.slice(e)
  if (next.length > maxLength) return null
  return { value: next, caret: s + insert.length }
}

export default function EmojiInsertButton({ inputRef, value, onChange, maxLength }: {
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement>
  value: string
  onChange: (next: string) => void
  maxLength: number
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [open])

  const pick = (cp: number) => {
    const el = inputRef.current
    const res = insertAtSelection(value, el?.selectionStart ?? null, el?.selectionEnd ?? null, String.fromCodePoint(cp), maxLength)
    setOpen(false)
    if (!res) return
    onChange(res.value)
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(res.caret, res.caret) })
  }

  return (
    <div ref={wrap} className="relative flex-shrink-0 self-center">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={t('reviews.commentEmoji')}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:text-white"
      >
        <Smile size={20} aria-hidden="true" />
      </button>
      {open && (
        <div role="group" aria-label={t('reviews.commentEmoji')} className="absolute bottom-full left-0 z-10 mb-2 grid w-[264px] grid-cols-8 gap-0.5 rounded-2xl bg-[#262626] p-2 shadow-lg">
          {EMOJI_CODEPOINTS.map(cp => {
            const ch = String.fromCodePoint(cp)
            return (
              <button key={cp} type="button" aria-label={ch} onClick={() => pick(cp)} className="flex h-8 w-8 items-center justify-center rounded-lg text-xl hover:bg-white/10">
                {ch}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
