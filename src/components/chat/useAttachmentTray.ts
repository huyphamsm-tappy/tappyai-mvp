'use client'
// The files chosen in a box that does not send them itself (the home page's box): the same rules as the chat's composer (composerAttachment.ts) - pictures shrunk first, at most 5 pictures and 3 documents,
// 3 MB in all - and a message when a file is refused. The chat's own composer keeps its own copy of this loop (ChatInterface.acceptAttachments); this hook is for the new places.
import { useCallback, useEffect, useRef, useState } from 'react'
import { attachableList, checkAddition, checkAttachment, normalizedType, shrinkImage } from '@/components/chat/composerAttachment'
import { useTranslation } from '@/lib/i18n/useTranslation'

export interface TrayItem { file: File; previewUrl: string | null }

export function useAttachmentTray() {
  const { t } = useTranslation()
  const [items, setItems] = useState<TrayItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<TrayItem[]>([])
  ref.current = items

  const add = useCallback(async (picked: ArrayLike<File> | null | undefined) => {
    let message: string | null = null
    for (const original of attachableList(picked)) {
      const first = checkAttachment(original)
      if (!first.ok) { message = t(first.error); continue }
      const type = normalizedType(original)
      const file = first.isPdf ? (original.type === type ? original : new File([original], original.name, { type })) : await shrinkImage(original)
      const room = checkAddition(ref.current.map(i => i.file), file)
      if (!room.ok) { message = t(room.error); continue }
      ref.current = [...ref.current, { file, previewUrl: first.isPdf ? null : URL.createObjectURL(file) }]
      setItems(ref.current)
    }
    setError(message)
  }, [t])

  const remove = useCallback((index: number) => {
    const gone = ref.current[index]
    if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl)
    ref.current = ref.current.filter((_, i) => i !== index)
    setItems(ref.current)
    setError(null)
  }, [])

  /** The files are handed on (the chat page makes its own previews): the previews made here are let go and the tray is empty. */
  const release = useCallback((): File[] => {
    const files = ref.current.map(i => i.file)
    ref.current.forEach(i => { if (i.previewUrl) URL.revokeObjectURL(i.previewUrl) })
    ref.current = []
    setItems([])
    setError(null)
    return files
  }, [])

  useEffect(() => () => { ref.current.forEach(i => { if (i.previewUrl) URL.revokeObjectURL(i.previewUrl) }) }, [])

  return { items, error, add, remove, release }
}
