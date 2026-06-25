'use client'

import { Share2 } from 'lucide-react'
import { useState } from 'react'

export default function ReviewShareButton({
  reviewId,
  placeName,
  body,
}: {
  reviewId: string
  placeName: string
  body: string
}) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    const url = window.location.origin + '/reviews/' + reviewId
    if (navigator.share) {
      try {
        await navigator.share({ title: placeName, text: body.slice(0, 80), url })
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={handleShare}
      className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary-500 transition-colors px-2 py-1"
    >
      <Share2 size={17} />
      {copied ? <span className="text-xs text-green-500 font-medium">Da copy!</span> : null}
    </button>
  )
}
