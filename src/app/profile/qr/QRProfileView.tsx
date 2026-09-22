'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ComponentProps } from 'react'
import type Header from '@/components/Header'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { ArrowLeft, Share2, Download, Loader2 } from 'lucide-react'
import V3Shell from '@/components/v3/V3Shell'
import ShareMenu from '@/components/share/ShareMenu'
import { encodeQR, qrToSvg } from '@/lib/qr/qrcode'
import { renderBrandedQrCard } from '@/lib/qr/brandedCard'
import { absoluteUrl } from '@/lib/share/openGraph'
import { goBack } from '@/lib/nav/inAppBack'

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
  const router = useRouter()
  const [origin, setOrigin] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
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

  /**
   * Share goes through the TappyAI share menu, not `navigator.share`.
   *
   * 🚨 The direct call was the raw OS dialog: on Windows that lists Nearby
   * Sharing, Teams and Outlook, and no Zalo, Facebook or WhatsApp anywhere
   * (Phase 7, item 8). `ShareMenu` is the sheet every other share in the product
   * already uses — Copy link, Zalo, Facebook, WhatsApp, Telegram, Email, the
   * Inbox, Save, and the OS sheet as ONE option only where `navigator.share`
   * exists. It never claims an app is installed: a desktop Zalo tile says
   * "copy link", Messenger is absent where its scheme cannot resolve.
   *
   * 🔑 The link it carries is the CANONICAL public profile URL
   * (`absoluteUrl('/users/<id>')`, the only host `isShareableUrl` admits) — never
   * `window.location`, which on a preview deployment or localhost would hand
   * out an address a recipient cannot open.
   */
  const shareUrl = absoluteUrl(`/users/${userId}`)

  /**
   * Download: the branded card (Phase 7, item 9).
   *
   * 🔑 The card encodes the SAME `profileUrl` the on-screen code encodes — the
   * same `encodeQR`, the same payload — with the shipped lockup, the display
   * name and the caption AROUND the code, never on it, so it still scans (see
   * `lib/qr/brandedCard.ts`). A failure leaves the page alone; the QR on screen
   * is still scannable, which is the primary path.
   */
  async function download() {
    if (!profileUrl || downloading) return
    setDownloading(true)
    try {
      const png = await renderBrandedQrCard({
        text: profileUrl,
        displayName,
        caption: t('v3.qr.scanHint'),
        qrPx: QR_PX * DOWNLOAD_SCALE,
        quietModules: QR_MARGIN,
      })
      if (!png) return
      const href = URL.createObjectURL(png)
      const a = document.createElement('a')
      a.href = href
      a.download = 'tappyai-qr.png'
      a.click()
      URL.revokeObjectURL(href)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <V3Shell
      title={t('v3.nav.qr')}
      subtitle={t('v3.qr.scanHint')}
      activeTab="/profile/qr"
      user={userInfo ? { name: userInfo.full_name, avatarUrl: userInfo.avatar_url } : null}
    >
      <div className="mx-auto w-full max-w-[440px]">
        {/* Back pops in-app history — the Profile page, the sidebar row's origin, wherever the
            person came from; a deep link falls back to /profile. It was a fixed link to /profile,
            which pushed a new entry instead of returning (Phase 7, item 7). */}
        <button
          type="button"
          onClick={() => goBack(router, '/profile')}
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold"
          style={{ color: 'var(--v3-fg-muted)' }}
          data-in-app-back="/profile"
        >
          <ArrowLeft size={16} />
          {t('v3.qr.back')}
        </button>

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
              onClick={() => setShareOpen(true)}
              disabled={!profileUrl}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold transition-opacity disabled:opacity-50"
              style={{ background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)' }}
              data-qr-share
            >
              <Share2 size={17} />
              {t('v3.qr.share')}
            </button>

            <button
              type="button"
              onClick={() => void download()}
              disabled={!svg || downloading}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border text-[14px] font-semibold transition-opacity disabled:opacity-50"
              style={{ background: 'var(--v3-panel-elevated)', borderColor: 'var(--v3-border)', color: 'var(--v3-fg)' }}
              data-qr-download
            >
              {downloading ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
              {t('v3.qr.download')}
            </button>
          </div>

          <p className="mt-3 text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }}>
            {t('v3.qr.saveHint')}
          </p>
        </section>
      </div>

      <ShareMenu
        url={shareUrl}
        title={displayName ? `${displayName} · TappyAI` : 'TappyAI'}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </V3Shell>
  )
}
