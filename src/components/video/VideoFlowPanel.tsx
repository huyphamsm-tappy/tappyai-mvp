'use client'
import { Loader2, XCircle, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { isRetryable, type FlowState } from '@/lib/media/video/composerState'
import { AiConsentDialog } from './AiConsentDialog'

export interface VideoFlowPanelProps {
  state: FlowState
  onCancel(): void
  onRetry(): void
  onRemove(): void
  consentBusy?: boolean
  consentError?: boolean
  onAcceptConsent(): void
  onDeclineConsent(): void
}

/**
 * What the person sees of the new upload flow: progress while uploading, "Đang xử lý" / "Đang chờ duyệt" / "Sẵn sàng đăng" while the server works, and a neutral
 * message when the clip is rejected or fails (they can choose another clip). Errors are the localized message of the documented code. The editor and the Post button
 * are the composer's own; this panel only reports state.
 */
export function VideoFlowPanel({ state, onCancel, onRetry, onRemove, consentBusy, consentError, onAcceptConsent, onDeclineConsent }: VideoFlowPanelProps) {
  const { t } = useTranslation()
  const { phase } = state
  const box = 'rounded-2xl border p-4'
  const boxStyle = { borderColor: 'var(--v3-border)', background: 'var(--v3-panel-elevated)' } as const

  if (phase === 'idle') {
    return state.consentDeclined ? <p role="status" className="text-[13px]" style={{ color: 'var(--v3-fg-secondary)' }}>{t('video.consent.declined')}</p> : null
  }
  if (phase === 'consent') {
    return <AiConsentDialog onAccept={onAcceptConsent} onDecline={onDeclineConsent} busy={consentBusy} failed={consentError} />
  }
  if (phase === 'preparing' || phase === 'uploading' || phase === 'finishing') {
    return (
      <div className={`${box} space-y-3`} style={boxStyle} data-testid="video-flow-upload">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold" style={{ color: 'var(--v3-fg-secondary)' }}>
            {phase === 'preparing' ? t('video.flow.preparing') : phase === 'uploading' ? t('video.flow.uploading') : t('video.flow.finishing')}
          </span>
          {phase === 'uploading' && <span className="text-[13px] font-bold" style={{ color: 'var(--v3-accent)' }}>{state.progress}%</span>}
        </div>
        {phase === 'uploading' && (
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--v3-border)' }}>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.progress} className="h-full rounded-full transition-all duration-200" style={{ width: `${state.progress}%`, background: 'var(--v3-accent-fill)' }} />
          </div>
        )}
        <button type="button" onClick={onCancel} className="flex items-center gap-1.5 text-[13px] hover:underline" style={{ color: 'var(--v3-fg-muted)' }}>
          <XCircle size={16} aria-hidden /> {t('video.flow.cancel')}
        </button>
      </div>
    )
  }
  if (phase === 'processing' || phase === 'review') {
    return (
      <div className={`${box} flex items-start gap-3`} style={boxStyle} role="status" data-testid="video-flow-processing">
        <Loader2 size={20} className="mt-0.5 animate-spin" aria-hidden />
        <div>
          <p className="text-[14px] font-semibold">{phase === 'review' ? t('video.flow.review') : t('video.flow.processing')}</p>
          <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--v3-fg-secondary)' }}>{phase === 'review' ? t('video.flow.reviewHint') : t('video.flow.processingHint')}</p>
        </div>
        <button type="button" onClick={onRemove} className="ml-auto text-[12px] font-semibold hover:underline" style={{ color: 'var(--v3-rose)' }}>{t('video.flow.remove')}</button>
      </div>
    )
  }
  if (phase === 'ready' || phase === 'published') {
    return (
      <div className={`${box} flex items-center gap-3`} style={boxStyle} role="status" data-testid="video-flow-ready">
        <CheckCircle2 size={20} aria-hidden style={{ color: 'var(--v3-accent)' }} />
        <p className="text-[14px] font-semibold">{phase === 'published' ? t('video.flow.published') : t('video.flow.ready')}</p>
        {phase === 'ready' && <button type="button" onClick={onRemove} className="ml-auto text-[12px] font-semibold hover:underline" style={{ color: 'var(--v3-rose)' }}>{t('video.flow.remove')}</button>}
      </div>
    )
  }
  // rejected / failed / error
  const message = phase === 'rejected' ? t('video.flow.rejected')
    : phase === 'failed' ? t('video.flow.failed')
    : t(`video.err.${state.error ?? 'generic'}`)
  const hint = phase === 'rejected' ? t('video.flow.rejectedHint') : null
  return (
    <div className={`${box} flex items-start gap-3`} style={boxStyle} role="alert" data-testid="video-flow-error">
      <AlertTriangle size={20} className="mt-0.5 flex-shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="text-[14px] font-semibold">{message}</p>
        {hint && <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--v3-fg-secondary)' }}>{hint}</p>}
        <div className="mt-2 flex gap-4">
          {phase === 'error' && isRetryable(state.error) && (
            <button type="button" onClick={onRetry} className="text-[13px] font-semibold hover:underline" style={{ color: 'var(--v3-accent)' }}>{t('video.flow.retry')}</button>
          )}
          <button type="button" onClick={onRemove} className="text-[13px] font-semibold hover:underline" style={{ color: 'var(--v3-fg-muted)' }}>{t('video.flow.chooseAnother')}</button>
        </div>
      </div>
    </div>
  )
}
