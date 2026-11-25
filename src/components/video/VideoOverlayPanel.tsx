'use client'
import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { OverlayEditor, useOverlayDraft, useVideoTimeMs } from './overlay'

export interface OverlaySaveHandle {
  /** Saves the draft now; true when nothing is pending or the save worked. */
  save(): Promise<boolean>
  dirty(): boolean
}

/**
 * The text-overlay editor mounted in the composer for the new-flow video: the clip itself (the local file, not the server's copy) as the preview, the saved draft
 * loaded from and saved to /api/video/uploads/{id}/overlay with the version check (a 409 offers a reload). `handleRef` lets the composer save before it posts.
 */
export function VideoOverlayPanel({ assetId, previewUrl, durationMs, handleRef, fetchImpl }: {
  assetId: string
  previewUrl: string
  durationMs: number
  handleRef?: MutableRefObject<OverlaySaveHandle | null>
  fetchImpl?: typeof fetch
}) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [aspect, setAspect] = useState(9 / 16)
  const draft = useOverlayDraft(assetId, { durationMs, fetchImpl })
  const timeMs = useVideoTimeMs(videoRef)

  const draftRef = useRef(draft)
  draftRef.current = draft
  useEffect(() => {
    if (!handleRef) return
    handleRef.current = {
      save: async () => (draftRef.current.dirty ? draftRef.current.save() : true),
      dirty: () => draftRef.current.dirty,
    }
    return () => { handleRef.current = null }
  }, [handleRef])

  const { status } = draft
  const message = status === 'saving' ? t('video.overlay.saving')
    : status === 'saved' ? t('video.overlay.saved')
    : status === 'conflict' ? t('video.overlay.conflict')
    : status === 'load_failed' ? t('video.overlay.loadFailed')
    : status === 'save_failed' ? t('video.overlay.saveFailed')
    : status === 'invalid' ? t('video.overlay.invalid')
    : null

  if (status === 'loading') return <div className="h-24" aria-busy="true" />
  const needsReload = status === 'conflict' || status === 'load_failed'
  return (
    <div className="space-y-3" data-testid="video-overlay-panel">
      <OverlayEditor
        doc={draft.doc}
        onChange={draft.setDoc}
        durationMs={durationMs}
        currentTimeMs={timeMs}
        onSeek={ms => { if (videoRef.current) videoRef.current.currentTime = ms / 1000 }}
        aspectRatio={aspect}
        disabled={status === 'load_failed' || status === 'saving'}
        media={
          <video
            ref={videoRef}
            src={previewUrl}
            controls
            muted
            playsInline
            className="h-full w-full object-contain"
            onLoadedMetadata={e => { const v = e.currentTarget; if (v.videoWidth > 0 && v.videoHeight > 0) setAspect(v.videoWidth / v.videoHeight) }}
          />
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void draft.save()} disabled={!draft.dirty || status === 'saving' || status === 'load_failed' || status === 'conflict'}
          className="rounded-full px-4 py-1.5 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: 'var(--v3-accent-fill, #2563eb)' }}>
          {t('video.overlay.save')}
        </button>
        {needsReload && (
          <button type="button" onClick={() => void draft.reload()} className="text-[13px] font-semibold hover:underline" style={{ color: 'var(--v3-accent)' }}>
            {t('video.overlay.reload')}
          </button>
        )}
        {message && <span role={status === 'saved' || status === 'saving' ? 'status' : 'alert'} className="text-[12.5px]">{message}</span>}
      </div>
      {draft.unsupportedChars.length > 0 && (
        <p role="status" className="text-[12.5px]">{t('video.overlay.warningGlyphs')} {draft.unsupportedChars.join(' ')}</p>
      )}
    </div>
  )
}
