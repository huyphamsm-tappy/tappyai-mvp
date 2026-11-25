'use client'
import { createPortal } from 'react-dom'
import { useTranslation } from '@/lib/i18n/useTranslation'

/**
 * The AI-consent dialog of the clip upload (owner-approved wording, see src/lib/i18n/video.ts `video.consent.body`). Shown when the server answers 403 ai_consent_required.
 * Accepting records the consent and retries the upload; declining leaves the composer without posting.
 */
export function AiConsentDialog({ onAccept, onDecline, busy, failed }: { onAccept(): void; onDecline(): void; busy?: boolean; failed?: boolean }) {
  const { t } = useTranslation()
  // Rendered into document.body: inside the new-post page it sat in a stacking context and the composer card was painted OVER it, so the
  // person could not reach "Agree" and could never post a clip (found in a real UAT run on desktop width).
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4" data-testid="ai-consent-dialog">
      <div role="dialog" aria-modal="true" aria-labelledby="video-consent-title" aria-describedby="video-consent-body"
        className="w-full max-w-md rounded-2xl p-5 shadow-xl" style={{ background: 'var(--v3-panel-elevated, #fff)', color: 'var(--v3-fg, #111)' }}>
        <h2 id="video-consent-title" className="text-[17px] font-extrabold">{t('video.consent.title')}</h2>
        <p id="video-consent-body" className="mt-3 text-[14px] leading-relaxed">{t('video.consent.body')}</p>
        {failed && <p role="alert" className="mt-3 text-[13px]" style={{ color: 'var(--v3-rose, #e11d48)' }}>{t('video.consent.saveFailed')}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onDecline} disabled={busy} className="rounded-full px-4 py-2 text-[14px] font-semibold" style={{ border: '1px solid var(--v3-border, #ccc)' }}>
            {t('video.consent.decline')}
          </button>
          <button type="button" onClick={onAccept} disabled={busy} className="rounded-full px-4 py-2 text-[14px] font-bold text-white" style={{ background: 'var(--v3-accent-fill, #2563eb)' }}>
            {busy ? t('video.consent.saving') : t('video.consent.accept')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
