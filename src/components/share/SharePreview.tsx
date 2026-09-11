'use client'

import { useState } from 'react'
import { Star, MapPin, ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import type { ShareArtifact } from '@/lib/share/shareArtifact'
import { BRAND } from '@/lib/share/openGraph'

// ── WHAT THE RECIPIENT WILL SEE, SHOWN BEFORE IT IS SENT ─────────────────────
//
// The preview is rendered FROM THE ARTIFACT, never from the card the user is
// looking at. That is the guarantee: if a field is not in `SharedPlace`, it is
// not on this preview, and it is not in the message. What you see is what leaves.
//
// Branding is the official mark (`/logo.svg`) plus `BRAND.name` — no new
// wordmark, no mascot pose picked here (art is the owner's domain).

const PREVIEW_PLACES = 3

export default function SharePreview({ artifact }: { artifact: ShareArtifact }) {
  const { t } = useTranslation()
  const [showAll, setShowAll] = useState(false)
  const shown = artifact.places.slice(0, PREVIEW_PLACES)
  const more = artifact.places.length - shown.length

  return (
    <div
      data-testid="share-preview"
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: 'var(--v3-border, #e5e7eb)', background: 'var(--v3-panel-elevated, #f9fafb)' }}
    >
      {/* Identity strip */}
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--v3-border, #e5e7eb)' }}>
        {/* Plain <img>: a local SVG needs no next/image pipeline. */}
        <img src="/logo.svg" alt="" aria-hidden="true" width={22} height={22} className="rounded-md" />
        <span className="text-sm font-semibold" style={{ color: 'var(--v3-fg, #111827)' }}>{BRAND.name}</span>
        <span className="text-xs" style={{ color: 'var(--v3-fg-muted, #6b7280)' }}>· {t('share.previewFrom')}</span>
      </div>

      <div className="px-3 py-2.5 space-y-2">
        <p className="text-sm font-medium leading-snug" style={{ color: 'var(--v3-fg, #111827)' }}>{artifact.subject}</p>

        {artifact.kind === 'places' && shown.length > 0 && (
          <ul className="space-y-1.5">
            {shown.map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex gap-2 text-xs" data-testid="share-preview-place">
                {p.image ? (
                  <img src={p.image} alt="" aria-hidden="true" width={36} height={36} className="h-9 w-9 flex-shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="h-9 w-9 flex-shrink-0 rounded-lg" style={{ background: 'var(--v3-border, #e5e7eb)' }} aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="font-medium truncate" style={{ color: 'var(--v3-fg, #111827)' }}>{i + 1}. {p.name}</p>
                  <p className="flex flex-wrap items-center gap-x-2" style={{ color: 'var(--v3-fg-muted, #6b7280)' }}>
                    {typeof p.rating === 'number' && (
                      <span className="inline-flex items-center gap-0.5 tabular-nums">
                        <Star size={10} className="text-amber-400" aria-hidden="true" />{p.rating}
                        {typeof p.ratingCount === 'number' && <span>({p.ratingCount})</span>}
                      </span>
                    )}
                    {p.category && <span>{p.category}</span>}
                  </p>
                  {p.address && (
                    <p className="flex items-start gap-1 truncate" style={{ color: 'var(--v3-fg-muted, #6b7280)' }}>
                      <MapPin size={10} className="mt-0.5 flex-shrink-0" aria-hidden="true" /><span className="truncate">{p.address}</span>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {more > 0 && (
          <p className="text-xs" style={{ color: 'var(--v3-fg-muted, #6b7280)' }}>{t('share.morePlaces', { n: String(more) })}</p>
        )}

        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium"
          style={{ color: 'var(--v3-accent, #2563eb)' }}
          aria-expanded={showAll}
        >
          {showAll ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {t('share.previewHint')}
        </button>
        {showAll && (
          <pre
            data-testid="share-preview-text"
            className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg p-2 text-[11px] leading-snug"
            style={{ background: 'var(--v3-panel, #fff)', color: 'var(--v3-fg, #111827)', border: '1px solid var(--v3-border, #e5e7eb)' }}
          >
            {artifact.text}
          </pre>
        )}
      </div>
    </div>
  )
}
