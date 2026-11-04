'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { savePhotoCopy, loadPhotoCopy } from '@/lib/messaging/photoCache'
import type { ChatMessageMedia } from '@/lib/messaging/types'

/**
 * The picture of one message. While the server still has it: the SHORT-LIVED signed link (https only), and this browser keeps its own copy the first time it is shown. After the
 * retention period (media.expired) or when no link could be made: this browser's copy if it has one, otherwise "expired" / "unavailable". Never a broken image.
 * The picture opens in a new tab without handing over the opener (only the server link; a local copy has nothing to open).
 */
export function MessagePhoto({ messageId, media, hasText }: { messageId: string; media: ChatMessageMedia; hasText: boolean }) {
  const { t } = useTranslation()
  const link = media.url && /^https:\/\//i.test(media.url) ? media.url : null
  const [copyUrl, setCopyUrl] = useState<string | null>(null)

  useEffect(() => {
    if (link) { void savePhotoCopy(messageId, link); return }
    let alive = true
    let made: string | null = null
    void loadPhotoCopy(messageId).then(u => {
      if (!alive) { if (u) URL.revokeObjectURL(u); return }
      made = u
      setCopyUrl(u)
    })
    return () => { alive = false; if (made) URL.revokeObjectURL(made) }
  }, [messageId, link])

  const src = link ?? copyUrl
  const gap = hasText ? 'mb-1.5' : ''
  if (!src) {
    return <div data-testid="message-photo-missing" className={`text-[12.5px] italic ${gap}`}>{t(media.expired ? 'v3.msg.photoExpired' : 'v3.msg.photoUnavailable')}</div>
  }
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- a signed storage link or a local object URL, not a build-time asset
    <img
      src={src}
      alt={t('v3.msg.photoAlt')}
      loading="lazy"
      {...(media.width && media.height ? { width: media.width, height: media.height } : {})}
      className="h-auto max-h-80 w-full max-w-[320px] rounded-xl object-cover"
    />
  )
  return (
    <div data-testid="message-photo" className={gap}>
      {link ? <a href={link} target="_blank" rel="noopener noreferrer">{img}</a> : img}
    </div>
  )
}
