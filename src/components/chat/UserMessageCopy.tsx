'use client'

// 01/11: a copy button under the question the person sent (the answers already have theirs in MessageActionBar). It copies the text exactly
// as typed - an answer is copied as plain text, a question is never edited.
import { useState, useRef, useEffect } from 'react'
import { Copy, Check } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function UserMessageCopy({ text }: { text: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  if (!text.trim()) return null
  const label = copied ? t('chat.messageCopied') : t('chat.messageCopy')
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-print-hide
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => setCopied(false), 2000)
        } catch { /* a blocked clipboard leaves the chat as it was */ }
      }}
      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 opacity-70 transition hover:bg-gray-100 hover:text-gray-600 hover:opacity-100 focus-visible:opacity-100 dark:hover:bg-gray-800 dark:hover:text-gray-200"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}
