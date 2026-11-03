'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { currentDestination } from '@/lib/auth/returnTo'
import { CommentDrawer, ShareModal, type Review } from './feedShared'
import LikeListSheet from './LikeListSheet'
import { ClipStage, useClipActions, type Me } from './clipStage'

// ── The clip viewer of the WHOLE app, desktop/tablet edition (B3, 2026-10-02) ────────────────
//
// Every place that opens a clip (profile grids, Saved, search, comments, share links, notifications,
// messages — they all end in `ClipViewer`, see ProfileTab.tsx) shows the Khám phá stage: the card
// strip with side cards, progress line, "Hỏi Tappy về video này", Post CTA and thumbnails. This is
// the SAME `ClipStage` Explore renders, fed with the clips of the opener instead of the feed.
// Phones keep the full-screen vertical pager (`Post`), which already IS Khám phá's phone feed.
//
// It owns only its list copy and its index. No history entry, no storage: close = `onClose`.

export const DESKTOP_VIEWER_QUERY = '(min-width: 768px)'

/** A row the stage can show: a playable clip, or a post with a picture (drawn as a poster, like the side cards). */
export const isStageClip = (r: Review) =>
  (r.content_type === 'video' && !!r.media_url) || (r.photos ?? []).filter(Boolean).length > 0 || !!r.thumbnail

/** true on tablets/desktops, false on phones, null before the first client read (SSR-safe). */
export function useIsDesktopViewer(): boolean | null {
  const [v, setV] = useState<boolean | null>(null)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') { setV(false); return }
    const mq = window.matchMedia(DESKTOP_VIEWER_QUERY)
    const apply = () => setV(mq.matches)
    apply()
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
    return undefined
  }, [])
  return v
}

export default function SharedClipViewer({
  posts, startIndex, me, onClose, onDelete,
}: {
  posts: Review[]
  startIndex: number
  me: string | null
  onClose: () => void
  onDelete?: (id: string) => void
}) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<Review[]>(posts)
  const [active, setActive] = useState(startIndex)
  const [commentOf, setCommentOf] = useState<Review | null>(null)
  const [shareOf, setShareOf] = useState<Review | null>(null)
  const [likesOf, setLikesOf] = useState<string | null>(null)

  // The avatar of the viewer is not needed here; the stage only needs the id (Follow / own-post menu).
  const meObj: Me = useMemo(() => (me ? { id: me, avatarUrl: null } : null), [me])

  const { toggle, follow, remove } = useClipActions(setRows, setActive, meObj, currentDestination)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // A sheet on top closes first.
      if (commentOf || shareOf || likesOf) { setCommentOf(null); setShareOf(null); setLikesOf(null); return }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, commentOf, shareOf, likesOf])

  // BUG 11: an open comment sheet follows the active clip (no stale comments from the previous one).
  const activeRowId = rows[active]?.id ?? null
  useEffect(() => {
    if (!activeRowId) return
    setCommentOf(cur => (cur && cur.id !== activeRowId ? rows.find(r => r.id === activeRowId) ?? null : cur))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRowId])

  const del = useCallback((id: string) => { remove(id); onDelete?.(id) }, [remove, onDelete])

  // A viewer with nothing left to show (the only clip was deleted) goes back where it came from.
  useEffect(() => { if (rows.length === 0) onClose() }, [rows.length, onClose])

  // Portalled to <body>: mounted inside a page that has its own shell (a public profile), a fixed
  // overlay would be clipped to that shell's main column; the viewer is always the whole window.
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => { setHost(document.body) }, [])
  if (!host) return null

  return createPortal(
    <div className="z-[70] v3-theme dark v3-xp" style={{ position: 'fixed', inset: 0 }} data-shared-clip-viewer role="dialog" aria-modal="true">
      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.back')}
        data-clip-viewer-close
        className="absolute left-4 top-4 z-[60] flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-transform active:scale-90"
      >
        <ChevronLeft size={24} aria-hidden="true" />
      </button>
      <ClipStage
        rows={rows}
        active={active}
        setActive={setActive}
        me={meObj}
        onLike={r => void toggle(r, 'like')}
        onSave={r => void toggle(r, 'save')}
        onFollow={r => void follow(r)}
        onRemoved={del}
        onComment={setCommentOf}
        onShare={setShareOf}
        surface="clip_viewer"
        stageHeight="100dvh"
      />
      {commentOf && (
        <CommentDrawer
          key={commentOf.id}
          review={commentOf}
          onNavigate={dir => setActive(a => Math.min(Math.max(0, rows.length - 1), Math.max(0, a + dir)))}
          me={me}
          onClose={() => setCommentOf(null)}
          onAdded={(id, count) => setRows(p => p.map(r => (r.id === id ? { ...r, comment_count: count } : r)))}
        />
      )}
      {shareOf && <ShareModal review={shareOf} onClose={() => setShareOf(null)} />}
      {likesOf && <LikeListSheet reviewId={likesOf} onClose={() => setLikesOf(null)} />}
    </div>,
    host,
  )
}
