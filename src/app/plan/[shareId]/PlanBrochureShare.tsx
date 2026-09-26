'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import ShareMenu from '@/components/share/ShareMenu'

/**
 * The brochure bar's Share button — the existing ShareMenu with this page's
 * own canonical URL. A recipient who forwards a plan forwards the same link
 * the sender made, through the same targets; nothing is re-published.
 */
export default function PlanBrochureShare({ url, title, label }: { url: string; title: string; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="v3-pb-share" onClick={() => setOpen(true)} data-pb-share>
        <span>{label}</span><Share2 size={15} aria-hidden="true" />
      </button>
      <ShareMenu url={url} title={title} open={open} onClose={() => setOpen(false)} />
    </>
  )
}
