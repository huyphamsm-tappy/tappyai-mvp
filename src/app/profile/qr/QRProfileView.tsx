'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { ComponentProps } from 'react'
import type Header from '@/components/Header'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { ArrowLeft, Share2, Download, Check } from 'lucide-react'
import V3Shell from '@/components/v3/V3Shell'
import { encodeQR, qrToSvg } from '@/lib/qr/qrcode'

// ── V3 Web · QR Profile ─────────────────────────────────────────────────────
//
// 🔑 THE QR SYSTEM ALREADY EXISTED AND IS REUSED WHOLE. `lib/qr/qrcode.ts` is a
// dependency-free ISO/IEC 18004 encoder that `QRProfileButton` has shipped with
// for as long as the profile has had a share icon. This page adds a surface and
// a download; it adds no second encoder, no image service and no table.
//
// 🚨 THE QR IS DELIBERATELY PLAIN. No logo in the middle, no gradient, no
// rounded modules, no dark-mode inversion of the code itself. Every one of those
// costs error-correction budget or scanner contrast, and this code exists to be
// read by a stranger's phone camera in a café. The card around it is TappyAI;
// the code is black on white with a full quiet zone.

/** Rendered pixel size of the QR. Large enough to scan off a laptop screen. */
const QR_PX = 260
/** Modules of quiet zone. 4 is the spec's minimum for reliable scanning. */
const QR_MARGIN = 4
/** Downloaded at 3x so the PNG survives being printed or re-shared. */
const DOWNLOAD_SCALE = 3

export default function QRProfileView({
  userId, userInfo,
}: {
  userId: string
  userInfo: ComponentProps<typeof Header>['user']
}) {
  const { t } = useTranslation()
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const svgRef = useRef<HTMLDivElement>(null)

  // The origin is only knowable in the browser, and the QR must encode the URL a
  // scanner will actually resolve — not a build-time guess.
  useEffect(() => { setOrigin(window.location.origin) }, [])

  /**
   * 🚨 THE PUBLIC PROFILE URL, AND NOTHING ELSE.
   *
   * `/users/[id]` is the route this app already serves to anyone; the id is
   * already in every feed link. No email, no token, no query string — a QR code
   * is a thing people photograph and forward, so whatever it carries is public
   * the moment it is printed.
   */
  const profileUrl = origin ? `${origin}/users/${userId}` : ''

  const svg = useMemo(() => {
    if (!profileUrl) return ''
    try {
      setFailed(false)
      return qrToSvg(encodeQR(profileUrl), {
        size: QR_PX,
        margin: QR_MARGIN,
        dark: '#0B0C11',
        light: '#FFFFFF',
      })
    } catch {
      setFailed(true)
      return ''
    }
  }, [profileUrl])

  const displayName = userInfo?.full_name?.trim() || ''

  async function share() {
    if (!profileUrl) return
    try {
      if (navigator.share) {
        await navigator.share({ title: displayName || 'TappyAI', url: profileUrl })
        return
      }
    } catch {
      // Cancelled, or the sheet refused — fall through to the clipboard rather
      // than leaving the button feeling dead.
    }
    try {
      await navigator.clipboard.writeText(profileUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* nothing further to offer; the URL is on screen under the code */
    }
  }

  /**
   * Download the code the page is showing.
   *
   * 🔑 Rasterised from the SAME SVG that is rendered, so the file and the screen
   * cannot disagree — and drawn through a Blob URL rather than a data: URI so no
   * canvas taint applies. A failure leaves the page alone; the QR on screen is
   * still scannable, which is the primary path.
   */
  function download() {
    const markup = svgRef.current?.querySelector('svg')?.outerHTML
    if (!markup) return
    const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })
    const blobUrl = URL.createObjectURL(blob)
    const img = new window.Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = QR_PX * DOWNLOAD_SCALE
        canvas.height = QR_PX * DOWNLOAD_SCALE
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        // White ground first: a transparent PNG dropped onto a dark chat bubble
        // is an unscannable code.
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(png => {
          if (!png) return
          const href = URL.createObjectURL(png)
          const a = document.createElement('a')
          a.href = href
          a.download = 'tappyai-qr.png'
          a.click()
          URL.revokeObjectURL(href)
        }, 'image/png')
      } finally {
        URL.revokeObjectURL(blobUrl)
      }
    }
    img.onerror = () => URL.revokeObjectURL(blobUrl)
    img.src = blobUrl
  }

  return (
    <V3Shell
      title={t('v3.nav.qr')}
      subtitle={t('v3.qr.scanHint')}
      activeTab="/profile/qr"
      user={userInfo ? { name: userInfo.full_name, avatarUrl: userInfo.avatar_url } : null}
    >
      <div className="mx-auto w-full max-w-[440px]">
        <Link
          href="/profile"
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold"
          style={{ color: 'var(--v3-fg-muted)' }}
        >
          <ArrowLeft size={16} />
          {t('v3.qr.back')}
        </Link>

        <section className="v3-panel flex flex-col items-center p-6 text-center sm:p-7">
          <h1 className="text-[17px] font-extrabold" style={{ color: 'var(--v3-fg)' }}>
            {t('v3.qr.title')}
          </h1>

          {failed ? (
            <p role="alert" className="py-14 text-[13px]" style={{ color: 'var(--v3-rose)' }}>
              {t('v3.qr.failed')}
            </p>
          ) : (
            <div
              ref={svgRef}
              data-qr
              className="mt-5 rounded-2xl bg-white p-3"
              style={{ lineHeight: 0, boxShadow: '0 10px 30px -12px rgba(0,0,0,0.55)' }}
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}

          {/* The name as stored, and nothing beneath it: there is no username
              column on `profiles`, so there is no handle to print. */}
          {displayName && (
            <p className="mt-5 text-[16px] font-bold" style={{ color: 'var(--v3-fg)' }}>
              {displayName}
            </p>
          )}

          <p className="mt-1.5 text-[12.5px] leading-snug" style={{ color: 'var(--v3-fg-muted)' }}>
            {t('v3.qr.scanHint')}
          </p>

          <div className="mt-6 w-full space-y-2">
            <button
              type="button"
              onClick={() => void share()}
              disabled={!profileUrl}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold transition-opacity disabled:opacity-50"
              style={{ background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}
            >
              {copied ? <Check size={17} /> : <Share2 size={17} />}
              {copied ? t('v3.qr.copied') : t('v3.qr.share')}
            </button>

            <button
              type="button"
              onClick={download}
              disabled={!svg}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border text-[14px] font-semibold transition-opacity disabled:opacity-50"
              style={{ background: 'var(--v3-panel-elevated)', borderColor: 'var(--v3-border)', color: 'var(--v3-fg)' }}
            >
              <Download size={17} />
              {t('v3.qr.download')}
            </button>
          </div>

          <p className="mt-3 text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>
            {t('v3.qr.saveHint')}
          </p>
        </section>
      </div>
    </V3Shell>
  )
}
