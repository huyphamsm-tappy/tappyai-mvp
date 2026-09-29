'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import ShareMenu from '@/components/share/ShareMenu'
import type { ShareArtifact } from '@/lib/share/shareArtifact'
import type { PlanShareSnapshot } from '@/lib/plans/share/planShare'

/**
 * The brochure bar's Share button — the approved share sheet (owner pick #6) with this page's own
 * canonical URL. A recipient who forwards a plan forwards the same link the sender made, through
 * the same targets; nothing is re-published (the artifact arrives already linked, so the menu
 * never mints). With the snapshot, the sheet also offers the plan IMAGE (owner pick #7) — the same
 * file for "Lưu về máy" and TikTok.
 */
export default function PlanBrochureShare({ url, title, label, snapshot }: { url: string; title: string; label: string; snapshot?: PlanShareSnapshot }) {
  const [open, setOpen] = useState(false)
  const artifact: ShareArtifact | undefined = snapshot
    ? { kind: 'plan', title, subject: title, text: `${title}\n${url}`, url, places: [], plan: snapshot, planLink: true }
    : undefined
  return (
    <>
      <button type="button" className="v3-pb-share" onClick={() => setOpen(true)} data-pb-share>
        <span>{label}</span><Share2 size={15} aria-hidden="true" />
      </button>
      {artifact
        ? <ShareMenu artifact={artifact} variant="plan" profileName={title} open={open} onClose={() => setOpen(false)} />
        : <ShareMenu url={url} title={title} open={open} onClose={() => setOpen(false)} />}
    </>
  )
}
