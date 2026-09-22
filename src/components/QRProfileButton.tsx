'use client'

import { useEffect, useState } from 'react'
import { QrCode, X, Share2 } from 'lucide-react'
import { encodeQR, qrToSvg } from '@/lib/qr/qrcode'
import ShareMenu from '@/components/share/ShareMenu'
import { absoluteUrl } from '@/lib/share/openGraph'

// QR Profile (MFS 4.7): lets a person share their identity in the physical world.
// Zero-dependency — the QR is generated + rendered as inline SVG entirely on-device.
//
// Sharing goes through the TappyAI share menu (Phase 7, item 8) — the direct
// `navigator.share` call was the raw OS dialog (Nearby Sharing / Teams / Outlook on
// Windows, no Zalo or Facebook). The link the sheet carries is the CANONICAL public
// profile URL, the only host `isShareableUrl` admits; the QR on screen still encodes
// this origin's URL, which is what a camera pointed at this screen resolves.
export default function QRProfileButton({ userId, name }: { userId: string; name?: string | null }) {
  const [open, setOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [svg, setSvg] = useState<string>('')
  const [failed, setFailed] = useState(false)
  const shareUrl = absoluteUrl(`/users/${userId}`)

  // Build the QR only when opened (needs the real origin, available client-side).
  useEffect(() => {
    if (!open) return
    try {
      const origin = window.location.origin
      const link = `${origin}/users/${userId}`
      setSvg(qrToSvg(encodeQR(link), { size: 232, margin: 2 }))
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [open, userId])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Mã QR trang cá nhân của tôi"
        className="flex-shrink-0 p-2 rounded-xl text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 dark:hover:text-primary-400 transition-colors"
      >
        <QrCode size={20} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mã QR trang cá nhân"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-xs card p-6 text-center bg-white dark:bg-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Đóng"
              className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X size={18} />
            </button>

            <h3 className="font-bold text-gray-900 dark:text-white text-base mb-1 pr-6 truncate">{name || 'Trang cá nhân của tôi'}</h3>
            <p className="text-xs text-content-secondary mb-4">Quét mã để xem trang cá nhân</p>

            {failed ? (
              <p className="py-10 text-sm text-red-500">Không tạo được mã QR. Thử lại sau nhé.</p>
            ) : (
              // White frame so it scans in dark mode too
              <div
                className="mx-auto w-fit rounded-2xl bg-white p-3 ring-1 ring-gray-200"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            )}

            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-interactive hover:bg-interactive-hover text-white text-sm font-semibold transition-colors"
            >
              <Share2 size={16} /> Chia sẻ liên kết
            </button>
          </div>
        </div>
      )}

      <ShareMenu
        url={shareUrl}
        title={name ? `${name} · TappyAI` : 'TappyAI'}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </>
  )
}
