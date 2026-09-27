// The downloadable QR card: the SAME code the page shows, on a TappyAI card.
//
// Phase 7 (item 9), redrawn to the approved reference in UAT3 (2026-09-27). A file people
// forward, print and pin up needs to say whose it is — so the card carries the shipped mark and
// wordmark, the tagline, the display name, an invitation, the hoodie otter beside the brand
// banner, the website and the feature strip — and it must still SCAN, so nothing is drawn inside
// the code: the matrix is painted module by module with its own full quiet zone, dark on white,
// exactly as on screen. Branding is around the code, never on it (the corner brackets sit OUTSIDE
// the quiet zone).
//
// Owner decisions (UAT3): no @username (the profile link is `/users/<id>`); no store badges until a
// public listing exists (the Play listing is 404 anonymously); no handwriting, skyline or paw
// prints — only the shipped otter assets.
//
// Pure canvas, no dependency, no image service. Every image is same-origin (`/branding/…`), so
// drawing it does not taint the canvas.

import { encodeQR } from './qrcode'
import { TAPPY_MARK_SRC, TAPPY_WORDMARK_BLUE } from '@/components/brand/TappyLockup'

/** The waving hoodie otter from the reference, same-origin. */
export const QR_CARD_MASCOT_SRC = '/branding/otter-mascot.png'

export interface BrandedQrOptions {
  /** The payload — the public profile URL, and nothing else. */
  text: string
  /** Shown under the code. Empty when the profile has no name. */
  displayName: string
  /** The first caption line under the name (the page's own `v3.qr.scanHint`). */
  caption: string
  /** The second caption line ("…và kết nối cùng nhau nhé!"). Omitted when empty. */
  invite?: string
  /** Rendered module size in px; 3x the on-screen 260px card by default. */
  qrPx?: number
  /** Quiet zone in modules. 4 is the spec's minimum. */
  quietModules?: number
  /** The product line under the lockup (`v3.page.subtitle`). Omitted when empty. */
  tagline?: string
  /** The banner's two lines ("Kết nối · Khám phá · Chia sẻ" + its sub-line). Banner omitted when empty. */
  slogan?: string
  sloganSub?: string
  /** The label over the website pill ("Truy cập website"). */
  websiteLabel?: string
  /** The four feature-strip labels, in order: AI agent, places, community, everyday life. */
  features?: string[]
  /**
   * The website the card points people at, shown bare ("www.tappyai.com").
   *
   * 🚨 THIS IS THE ONLY DESTINATION ON THE CARD BESIDES THE CODE. The reference also draws
   * App Store and Google Play badges; this repository holds NO public store listing for either
   * platform (the Android listing answers 404 to a signed-out visitor), and a store link composed
   * from an app id would be an invented URL on a file people print and hand out, so the badges
   * are omitted until a real listing exists. The site origin, by contrast, is configuration:
   * `NEXT_PUBLIC_SITE_URL`.
   */
  website?: string
}

/** Layout constants (px at the rendered scale). Kept together so the card reads as one design. */
const CARD = {
  width: 1200,
  pad: 60,
  markSize: 150,
  wordmarkPx: 64,
  taglinePx: 28,
  bracket: 64,
  bracketGap: 20,
  namePx: 58,
  captionPx: 29,
  bannerH: 210,
  mascotH: 360,
  panelH: 190,
  websitePx: 34,
  featurePx: 21,
  ink: '#0B1B3F',
  muted: '#4F5B76',
  blue: '#1E6BFF',
  sky: '#EAF3FF',
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

/** The four line icons of the feature strip, drawn in a `s`×`s` box at (x, y). */
function featureIcon(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, s: number) {
  ctx.save()
  ctx.strokeStyle = CARD.blue
  ctx.lineWidth = Math.max(2, s / 12)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const cx = x + s / 2
  ctx.beginPath()
  if (kind === 0) {
    // chat bubble with three dots
    roundedRect(ctx, x + s * 0.08, y + s * 0.14, s * 0.84, s * 0.62, s * 0.2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x + s * 0.3, y + s * 0.76); ctx.lineTo(x + s * 0.24, y + s * 0.94); ctx.lineTo(x + s * 0.46, y + s * 0.76)
    ctx.stroke()
    ctx.fillStyle = CARD.blue
    for (const dx of [-0.2, 0, 0.2]) { ctx.beginPath(); ctx.arc(cx + dx * s, y + s * 0.45, s * 0.05, 0, Math.PI * 2); ctx.fill() }
  } else if (kind === 1) {
    // map pin
    ctx.arc(cx, y + s * 0.4, s * 0.3, Math.PI, 0)
    ctx.quadraticCurveTo(x + s * 0.8, y + s * 0.62, cx, y + s * 0.95)
    ctx.quadraticCurveTo(x + s * 0.2, y + s * 0.62, x + s * 0.2, y + s * 0.4)
    ctx.stroke()
    ctx.beginPath(); ctx.arc(cx, y + s * 0.4, s * 0.1, 0, Math.PI * 2); ctx.stroke()
  } else if (kind === 2) {
    // two people
    ctx.arc(x + s * 0.36, y + s * 0.32, s * 0.15, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(x + s * 0.36, y + s * 0.95, s * 0.3, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke()
    ctx.beginPath(); ctx.arc(x + s * 0.7, y + s * 0.36, s * 0.12, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(x + s * 0.72, y + s * 0.95, s * 0.24, Math.PI * 1.2, Math.PI * 1.85); ctx.stroke()
  } else {
    // heart
    ctx.strokeStyle = '#F0457A'
    ctx.moveTo(cx, y + s * 0.88)
    ctx.bezierCurveTo(x - s * 0.1, y + s * 0.45, x + s * 0.22, y + s * 0.02, cx, y + s * 0.3)
    ctx.bezierCurveTo(x + s * 0.78, y + s * 0.02, x + s * 1.1, y + s * 0.45, cx, y + s * 0.88)
    ctx.stroke()
  }
  ctx.restore()
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
  const invite = opts.invite?.trim() ?? ''
  const website = opts.website?.trim() ?? ''
  const slogan = opts.slogan?.trim() ?? ''
  const features = (opts.features ?? []).map(f => f.trim()).filter(Boolean).slice(0, 4)
  const width = Math.max(CARD.width, qrSide + (CARD.pad + CARD.bracketGap) * 2)

  // ── Vertical plan (top to bottom) ──
  const top = CARD.pad
  const lockupH = CARD.markSize + 16 + CARD.wordmarkPx
  const taglineH = tagline ? 18 + CARD.taglinePx : 0
  const qrTop = top + lockupH + taglineH + 44
  const nameTop = qrTop + qrSide + 40
  const captionTop = nameTop + (hasName ? CARD.namePx + 18 : 0)
  const captionH = CARD.captionPx + (invite ? 10 + CARD.captionPx : 0)
  const bannerTop = captionTop + captionH + (slogan ? 150 : 40)
  const panelTop = bannerTop + (slogan ? CARD.bannerH + 36 : 0)
  const featuresTop = panelTop + (website ? CARD.panelH + 30 : 0)
  const height = featuresTop + (features.length ? CARD.featurePx + 36 : 0) + CARD.pad

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Ground: soft sky gradient, opaque edge to edge — a transparent PNG dropped onto a dark chat
  // bubble is an unscannable code. The code itself sits on its own white panel.
  const ground = ctx.createLinearGradient(0, 0, 0, height)
  ground.addColorStop(0, '#FFFFFF')
  ground.addColorStop(0.55, '#F2F7FF')
  ground.addColorStop(1, CARD.sky)
  ctx.fillStyle = ground
  ctx.fillRect(0, 0, width, height)

  const [mark, mascot] = await Promise.all([loadImage(TAPPY_MARK_SRC), loadImage(QR_CARD_MASCOT_SRC)])

  // ── Lockup: the round otter mark over the wordmark ("Tappy" ink, "AI" brand blue) ──
  const markX = Math.round((width - CARD.markSize) / 2)
  if (mark) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(markX + CARD.markSize / 2, top + CARD.markSize / 2, CARD.markSize / 2, 0, Math.PI * 2)
    ctx.clip()
    const s = Math.min(mark.naturalWidth, mark.naturalHeight)
    ctx.drawImage(mark, (mark.naturalWidth - s) / 2, (mark.naturalHeight - s) / 2, s, s, markX, top, CARD.markSize, CARD.markSize)
    ctx.restore()
  }
  ctx.textBaseline = 'middle'
  ctx.font = `800 ${CARD.wordmarkPx}px ${CARD.font}`
  const tappyW = ctx.measureText('Tappy').width
  const aiW = ctx.measureText('AI').width
  const wordY = top + CARD.markSize + 16 + CARD.wordmarkPx / 2
  const x = Math.round((width - tappyW - aiW) / 2)
  ctx.textAlign = 'left'
  ctx.fillStyle = CARD.ink
  ctx.fillText('Tappy', x, wordY)
  ctx.fillStyle = TAPPY_WORDMARK_BLUE
  ctx.fillText('AI', x + tappyW, wordY)
  ctx.textAlign = 'center'
  if (tagline) {
    ctx.fillStyle = CARD.muted
    ctx.font = `500 ${CARD.taglinePx}px ${CARD.font}`
    ctx.fillText(tagline, width / 2, top + lockupH + 18 + CARD.taglinePx / 2, width - CARD.pad * 2)
  }

  // ── The code: a white panel, the matrix module by module with `quiet` empty modules on every
  // side, and nothing else drawn in this rectangle. ──
  const qrX = Math.round((width - qrSide) / 2)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(qrX, qrTop, qrSide, qrSide)
  ctx.fillStyle = '#000000'
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) ctx.fillRect(qrX + (c + quiet) * modulePx, qrTop + (r + quiet) * modulePx, modulePx, modulePx)
    }
  }
  // Corner brackets, OUTSIDE the quiet zone (the reference's blue scan frame).
  const g = CARD.bracketGap
  const b = CARD.bracket
  const [bx0, by0, bx1, by1] = [qrX - g, qrTop - g, qrX + qrSide + g, qrTop + qrSide + g]
  ctx.save()
  ctx.strokeStyle = CARD.blue
  ctx.lineWidth = 9
  ctx.lineCap = 'round'
  for (const [cx, cy, dx, dy] of [[bx0, by0, 1, 1], [bx1, by0, -1, 1], [bx0, by1, 1, -1], [bx1, by1, -1, -1]]) {
    ctx.beginPath()
    ctx.moveTo(cx, cy + dy * b)
    ctx.lineTo(cx, cy)
    ctx.lineTo(cx + dx * b, cy)
    ctx.stroke()
  }
  ctx.restore()

  // ── Name + caption ──
  if (hasName) {
    ctx.fillStyle = CARD.ink
    ctx.font = `800 ${CARD.namePx}px ${CARD.font}`
    ctx.fillText(opts.displayName.trim(), width / 2, nameTop + CARD.namePx / 2, width - CARD.pad * 2)
  }
  ctx.fillStyle = CARD.muted
  ctx.font = `500 ${CARD.captionPx}px ${CARD.font}`
  ctx.fillText(opts.caption, width / 2, captionTop + CARD.captionPx / 2, width - CARD.pad * 2)
  if (invite) ctx.fillText(invite, width / 2, captionTop + CARD.captionPx + 10 + CARD.captionPx / 2, width - CARD.pad * 2)

  // ── Banner: the blue band with the slogan, the hoodie otter standing over its left end ──
  if (slogan) {
    const bx = CARD.pad
    const bw = width - CARD.pad * 2
    const band = ctx.createLinearGradient(bx, 0, bx + bw, 0)
    band.addColorStop(0, '#1453D9')
    band.addColorStop(1, '#2F8CFF')
    ctx.fillStyle = band
    roundedRect(ctx, bx, bannerTop, bw, CARD.bannerH, 40)
    ctx.fill()
    const textX = bx + bw * 0.62
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `italic 800 46px ${CARD.font}`
    ctx.fillText(slogan, textX, bannerTop + CARD.bannerH * 0.36, bw * 0.6)
    if (opts.sloganSub?.trim()) {
      ctx.font = `500 27px ${CARD.font}`
      ctx.fillStyle = '#E3EEFF'
      ctx.fillText(opts.sloganSub.trim(), textX, bannerTop + CARD.bannerH * 0.7, bw * 0.6)
    }
    if (mascot) {
      const mh = CARD.mascotH
      const mw = Math.round(mh * mascot.naturalWidth / mascot.naturalHeight)
      ctx.drawImage(mascot, bx + 24, bannerTop + CARD.bannerH - mh + 8, mw, mh)
    }
  }

  // ── Website panel (no store badges — see `website`) ──
  if (website) {
    const px = CARD.pad
    const pw = width - CARD.pad * 2
    ctx.fillStyle = '#FFFFFF'
    roundedRect(ctx, px, panelTop, pw, CARD.panelH, 32)
    ctx.fill()
    ctx.strokeStyle = '#D8E4FA'
    ctx.lineWidth = 2
    ctx.stroke()
    if (opts.websiteLabel?.trim()) {
      ctx.fillStyle = CARD.ink
      ctx.font = `600 27px ${CARD.font}`
      ctx.fillText(opts.websiteLabel.trim(), width / 2, panelTop + 46, pw)
    }
    ctx.font = `700 ${CARD.websitePx}px ${CARD.font}`
    const tw = ctx.measureText(website).width
    const pillW = Math.min(pw - 60, tw + 190)
    const pillX = Math.round((width - pillW) / 2)
    const pillY = panelTop + 82
    ctx.fillStyle = CARD.sky
    roundedRect(ctx, pillX, pillY, pillW, 78, 39)
    ctx.fill()
    ctx.strokeStyle = '#B9D2FB'
    ctx.stroke()
    // globe on the left, arrow on the right
    ctx.save()
    ctx.strokeStyle = CARD.blue
    ctx.lineWidth = 3.5
    const gx = pillX + 48
    const gy = pillY + 39
    ctx.beginPath(); ctx.arc(gx, gy, 17, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.ellipse(gx, gy, 7, 17, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(gx - 17, gy); ctx.lineTo(gx + 17, gy); ctx.stroke()
    const ax = pillX + pillW - 48
    ctx.beginPath(); ctx.moveTo(ax - 16, gy); ctx.lineTo(ax + 12, gy); ctx.moveTo(ax + 2, gy - 11); ctx.lineTo(ax + 13, gy); ctx.lineTo(ax + 2, gy + 11); ctx.stroke()
    ctx.restore()
    ctx.fillStyle = CARD.blue
    ctx.font = `700 ${CARD.websitePx}px ${CARD.font}`
    ctx.fillText(website, width / 2, pillY + 39, pillW - 190)
  }

  // ── Feature strip ──
  if (features.length) {
    // Columns sized by their labels (the last one is the longest), so no label is squeezed.
    const iconS = 30
    ctx.font = `500 ${CARD.featurePx}px ${CARD.font}`
    ctx.textAlign = 'left'
    const itemW = features.map(label => iconS + 10 + ctx.measureText(label).width)
    const avail = width - CARD.pad * 2
    const scale = Math.min(1, (avail - 24 * (features.length - 1)) / itemW.reduce((a, w) => a + w, 0))
    const gap = (avail - itemW.reduce((a, w) => a + w * scale, 0)) / Math.max(1, features.length - 1)
    let fx = CARD.pad
    features.forEach((label, i) => {
      const w = itemW[i] * scale
      featureIcon(ctx, i, fx, featuresTop + (CARD.featurePx + 36 - iconS) / 2, iconS)
      ctx.fillStyle = CARD.muted
      ctx.fillText(label, fx + iconS + 10, featuresTop + (CARD.featurePx + 36) / 2, w - iconS - 10)
      fx += w + gap
    })
    ctx.textAlign = 'center'
  }

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}
