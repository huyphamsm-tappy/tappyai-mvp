'use client'
import { Download, Loader2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { useVideoDownload, type UseVideoDownloadDeps } from './useVideoDownload'

/** "Tải về" for the owner's ready / published clip: renders the MP4 with the text and the watermark on the server, then downloads it. Localized progress and failure. */
export function VideoDownloadButton({ assetId, deps }: { assetId: string; deps?: UseVideoDownloadDeps }) {
  const { t } = useTranslation()
  const { status, error, start } = useVideoDownload(assetId, deps)
  const busy = status === 'rendering'
  const errorKey = error === 'notReady' ? 'video.download.notReady' : error === 'overlayInvalid' ? 'video.download.overlayInvalid' : error === 'unavailable' ? 'video.download.unavailable' : 'video.download.failed'
  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" onClick={() => void start()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold" style={{ border: '1px solid var(--v3-border, #ccc)' }}>
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Download size={14} aria-hidden />}
        {t('video.download.button')}
      </button>
      {busy && <p role="status" className="text-[12px]" style={{ color: 'var(--v3-fg-secondary)' }}>{t('video.download.rendering')}</p>}
      {status === 'ready' && <p role="status" className="text-[12px]" style={{ color: 'var(--v3-fg-secondary)' }}>{t('video.download.ready')}</p>}
      {status === 'failed' && <p role="alert" className="text-[12px]" style={{ color: 'var(--v3-rose, #e11d48)' }}>{t(errorKey)}</p>}
    </div>
  )
}
