'use client'

// Opens the unified TappyAI share menu.
//
// This used to call navigator.share() directly, falling back to the clipboard.
// On Windows desktop that meant the OS Share Sheet — Nearby Sharing, Teams,
// Outlook — with no Facebook, TikTok or Zalo anywhere. The labels were also
// hardcoded Vietnamese, so English users saw "Chia sẻ".

import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { absoluteUrl } from '@/lib/share/openGraph'
import { reviewShareTitle } from '@/lib/share/reviewShareTitle'
import ShareMenu from '@/components/share/ShareMenu'
import { recordReviewShare } from '@/lib/share/recordReviewShare'

export default function ReviewShareButton({
  reviewId,
  placeName,
  body,
  variant,
  className,
  style,
}: {
  reviewId: string
  placeName: string
  /** The caption — the share title when the review has no real place (the menu still shares the URL, not this text). */
  body?: string | null
  /** 'bar' renders the RAction-style vertical button used in the action bar */
  variant?: 'bar'
  className?: string
  style?: React.CSSProperties
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  // The canonical public URL — never window.location, which on a preview
  // deployment would hand out a non-canonical host.
  const url = absoluteUrl(`/reviews/${reviewId}`)

  // `placeName` may be the composer's share-only sentinel ("Chia sẻ"); the title
  // helper never lets that reach the preview or the outgoing message.
  const menu = (
    <ShareMenu
      url={url}
      title={reviewShareTitle({ place_name: placeName, body })}
      open={open}
      onClose={() => setOpen(false)}
      // A completed share becomes a row of the self profile's "Đã share" history.
      onShared={(channel) => { void recordReviewShare(reviewId, channel) }}
    />
  )

  if (variant === 'bar') {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
          aria-label={t('share.title')}
        >
          <Share2 size={24} className="text-white" />
          <span className="text-white text-xs font-semibold drop-shadow-md">{t('share.title')}</span>
        </button>
        {menu}
      </>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className || 'flex items-center gap-1.5 text-sm text-gray-500 hover:text-link transition-colors px-2 py-1'}
        style={style}
        aria-label={t('share.title')}
      >
        <Share2 size={17} />
      </button>
      {menu}
    </>
  )
}
