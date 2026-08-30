'use client'

import { AlertTriangle, ExternalLink } from 'lucide-react'
import { useControllerOrigin } from './originGate'
import { useTranslation } from '@/lib/i18n/useTranslation'

/**
 * Told once, at the top of the Controller, when this browser is not on the
 * canonical origin.
 *
 * ONE banner, not one per form. Twenty guarded surfaces sharing a single cause
 * should state that cause once; repeating it beside every disabled control is
 * how a legible explanation turns into noise people learn to scroll past.
 *
 * 🚨 It is a message, not a boundary. `isSameOrigin(req)` refuses the request
 * whether or not this renders.
 *
 * It stays silent until the browser origin has actually been observed — see
 * `showUnavailableNotice` — so it can never flash on the canonical origin
 * during the first paint.
 */
export function OriginNotice() {
  const { showUnavailableNotice, canonicalOrigin } = useControllerOrigin()
  const { t } = useTranslation()

  if (!showUnavailableNotice) return null

  return (
    <div
      role="status"
      data-testid="controller-origin-notice"
      className="flex items-start gap-3 border-b border-border bg-muted px-6 py-3"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
      <div className="min-w-0 text-sm">
        <p className="font-medium text-foreground">{t('admin.origin.notice.title')}</p>
        <p className="mt-0.5 text-muted-foreground">{t('admin.origin.notice.body')}</p>
        {/* Only offered when there is somewhere real to send them. A CTA built
            from a missing or malformed configuration would be a broken link. */}
        {canonicalOrigin ? (
          <a
            href={canonicalOrigin}
            className="mt-1.5 inline-flex items-center gap-1.5 font-medium text-foreground underline underline-offset-2"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {t('admin.origin.notice.cta')}
          </a>
        ) : null}
      </div>
    </div>
  )
}
