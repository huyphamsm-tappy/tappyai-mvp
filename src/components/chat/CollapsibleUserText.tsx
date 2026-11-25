'use client'
// A long question, once sent, folds under the person's bubble (owner 20/11/2026): about six lines stay visible, a "show more" button opens it and "show less" folds it again.
// Short texts render exactly as before. The text is the same sanitised HTML the bubble always drew (`html`); `text` is only used to decide whether to fold.
import { useState } from 'react'
import { needsCollapse } from '@/lib/chat/composerSize'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function CollapsibleUserText({ html, text, onClick }: { html: string; text: string; onClick?: (e: React.MouseEvent<HTMLDivElement>) => void }) {
  const { t } = useTranslation()
  const foldable = needsCollapse(text)
  const [open, setOpen] = useState(false)
  const folded = foldable && !open
  return (
    <>
      <div
        className="message-content whitespace-pre-wrap"
        data-testid="user-msg-body"
        data-folded={folded ? 'true' : undefined}
        style={folded ? { maxHeight: '9.6em', overflow: 'hidden', WebkitMaskImage: 'linear-gradient(to bottom, #000 70%, transparent)', maskImage: 'linear-gradient(to bottom, #000 70%, transparent)' } : undefined}
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {foldable && (
        <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} data-testid="user-msg-toggle" className="mt-1 text-xs font-semibold underline underline-offset-2 opacity-90 hover:opacity-100">
          {open ? t('chatui.showLess') : t('chatui.showMore')}
        </button>
      )}
    </>
  )
}
