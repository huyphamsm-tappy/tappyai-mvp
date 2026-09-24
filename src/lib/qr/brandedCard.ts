// The downloadable QR card: the SAME code the page shows, on a TappyAI card.
//
// Phase 7 (item 9). The download used to be the bare code. A file people forward,
// print and pin up needs to say whose it is — so the card carries the shipped
// lockup (`TappyLockup`: the otter mark + "Tappy"/"AI" wordmark), the display
// name and a caption — and it must still SCAN, so nothing is drawn inside the
// code: the matrix is painted module by module with its own full quiet zone, dark
// on white, exactly as on screen. Branding is around the code, never on it.
//
// Pure canvas, no dependency, no image service. The mark is the same-origin
// `/branding/otter-logo.png`, so drawing it does not taint the canvas.

import { encodeQR } from './qrcode'
import { TAPPY_MARK_SRC, TAPPY_WORDMARK_BLUE } from '@/components/brand/TappyLockup'

export interface BrandedQrOptions {
  /** The payload — the public profile URL, and nothing else. */
  text: string
  /** Shown under the code. Empty when the profile has no name. */
  displayName: string
  /** The one-line caption under the name (the page's own `v3.qr.scanHint`). */
  caption: string
  /** Rendered module size in px; 3x the on-screen 260px card by default. */
  qrPx?: number
  /** Quiet zone in modules. 4 is the spec's minimum. */
  quietModules?: number
  /** The product line under the lockup (`v3.page.subtitle`). Omitted when empty. */
  tagline?: string
  /**
   * The website the card points people at, shown bare ("www.tappyai.com").
   *
   * 🚨 THIS IS THE ONLY DESTINATION ON THE CARD BESIDES THE CODE. The reference also draws
   * App Store and Google Play badges; measured across `src/`, `public/` and `docs/`, this
   * repository holds NO canonical store URL for either platform (the only App Store strings are
   * third-party test fixtures and Apple's server-to-server StoreKit host), and the Android
   * `applicationId` is not a published listing. A store link composed from an app id would be an
   * invented URL on a file people print and hand out, so the badges are omitted until a real
   * listing exists. The site origin, by contrast, is configuration: `NEXT_PUBLIC_SITE_URL`.
   */
  website?: string
}

/** Layout constants (px at the rendered scale). Kept together so the card reads as one design. */
const CARD = {
  pad: 72,
  markSize: 84,
  wordmarkPx: 52,
  taglinePx: 26,
  gapLockupToTagline: 18,
  gapLockupToQr: 48,
  websitePx: 26,
  gapCaptionToWebsite: 26,
  gapQrToName: 44,
  namePx: 46,
  captionPx: 27,
  gapNameToCaption: 14,
  radius: 56,
  ink: '#0B0C11',
  muted: '#5B6270',
  font: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Rounded-rect path helper (canvas `roundRect` is not everywhere yet). */
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * Paints the branded card and resolves to a PNG blob. Null when the browser
 * cannot give us a 2D context or a PNG (the on-screen code is still there).
 */
export async function renderBrandedQrCard(opts: BrandedQrOptions): Promise<Blob | null> {
  const qrPx = opts.qrPx ?? 780
  const quiet = opts.quietModules ?? 4
  const matrix = encodeQR(opts.text)
  const n = matrix.length
  const modulePx = Math.floor(qrPx / (n + quiet * 2))
  const qrSide = modulePx * (n + quiet * 2)

  const hasName = opts.displayName.trim().length > 0
  const tagline = opts.tagline?.trim() ?? ''
  const website = opts.website?.trim() ?? ''
  const width = qrSide + CARD.pad * 2
  const height =
    CARD.pad + CARD.markSize +
    (tagline ? CARD.gapLockupToTagline + CARD.taglinePx : 0) +
    CARD.gapLockupToQr + qrSide +
    (hasName ? CARD.gapQrToName + CARD.namePx : CARD.gapQrToName) +
    CARD.gapNameToCaption + CARD.captionPx +
    (website ? CARD.gapCaptionToWebsite + CARD.websitePx : 0) + CARD.pad

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Card: white, rounded. A transparent PNG dropped onto a dark chat bubble is an
  // unscannable code, so the ground is opaque white edge to edge.
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)

  // Lockup: the shipped mark (rounded 22%, object-cover of a square source) + the
  // wordmark split the sidebar renders — "Tappy" in ink, "AI" in brand blue.
  let y = CARD.pad
  const mark = await loadImage(TAPPY_MARK_SRC)
  ctx.textBaseline = 'middle'
  ctx.font = `800 ${CARD.wordmarkPx}px ${CARD.font}`
  const tappyW = ctx.measureText('Tappy').width
  const aiW = ctx.measureText('AI').width
  const lockupGap = Math.round(CARD.markSize * 0.32)
  const lockupW = CARD.markSize + lockupGap + tappyW + aiW
  let x = Math.round((width - lockupW) / 2)
  if (mark) {
    ctx.save()
    roundedRect(ctx, x, y, CARD.markSize, CARD.markSize, Math.round(CARD.markSize * 0.22))
    ctx.clip()
    const s = Math.min(mark.naturalWidth, mark.naturalHeight)
    ctx.drawImage(mark, (mark.naturalWidth - s) / 2, (mark.naturalHeight - s) / 2, s, s, x, y, CARD.markSize, CARD.markSize)
    ctx.restore()
  }
  x += CARD.markSize + lockupGap
  ctx.fillStyle = CARD.ink
  ctx.textAlign = 'left'
  ctx.fillText('Tappy', x, y + CARD.markSize / 2)
  ctx.fillStyle = TAPPY_WORDMARK_BLUE
  ctx.fillText('AI', x + tappyW, y + CARD.markSize / 2)
  y += CARD.markSize
  if (tagline) {
    y += CARD.gapLockupToTagline
    ctx.textAlign = 'center'
    ctx.fillStyle = CARD.muted
    ctx.font = `500 ${CARD.taglinePx}px ${CARD.font}`
    ctx.fillText(tagline, width / 2, y + CARD.taglinePx / 2, width - CARD.pad * 2)
    y += CARD.taglinePx
    ctx.textAlign = 'left'
  }
  y += CARD.gapLockupToQr

  // The code. Module by module, dark on the white ground, with `quiet` empty
  // modules on every side. Nothing else is drawn in this rectangle.
  const qrX = CARD.pad
  ctx.fillStyle = CARD.ink
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) ctx.fillRect(qrX + (c + quiet) * modulePx, y + (r + quiet) * modulePx, modulePx, modulePx)
    }
  }
  y += qrSide + CARD.gapQrToName

  ctx.textAlign = 'center'
  if (hasName) {
    ctx.fillStyle = CARD.ink
    ctx.font = `700 ${CARD.namePx}px ${CARD.font}`
    ctx.fillText(opts.displayName.trim(), width / 2, y + CARD.namePx / 2, width - CARD.pad * 2)
    y += CARD.namePx
  }
  y += CARD.gapNameToCaption
  ctx.fillStyle = CARD.muted
  ctx.font = `400 ${CARD.captionPx}px ${CARD.font}`
  ctx.fillText(opts.caption, width / 2, y + CARD.captionPx / 2, width - CARD.pad * 2)

  if (website) {
    y += CARD.captionPx + CARD.gapCaptionToWebsite
    ctx.fillStyle = TAPPY_WORDMARK_BLUE
    ctx.font = `600 ${CARD.websitePx}px ${CARD.font}`
    ctx.fillText(website, width / 2, y + CARD.websitePx / 2, width - CARD.pad * 2)
  }

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}
