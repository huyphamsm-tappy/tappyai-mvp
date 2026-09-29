// ONE STYLE for every TappyAI share image (owner picks, 29/09 — docs/design/share-layouts/README.md).
//
//  - LIGHT cards (profile QR, review, Explore clip, suggestion) follow sample #1 (profile-qr.png):
//    white → sky ground, the round otter mark over the "Tappy"+"AI" wordmark at the top, content on a
//    white rounded panel, a scannable code in blue corner brackets, the blue slogan banner with the
//    hoodie otter, and the website pill (tappyai.com) at the foot.
//  - The PLAN card follows sample #7 (plan-share.png): navy ground, "TAPPY PLAN" eyebrow, a numbered
//    day timeline, the overview box and the blue→violet CTA pill.
//
// Every colour, radius and size a card uses is a token here, so no card can drift into its own
// palette. The canvas helpers are shared for the same reason. Pure canvas, no dependency.

export const CARD_FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'

/** Light cards — sample #1. */
export const LIGHT = {
  ink: '#0B1B3F',
  body: '#33415C',
  muted: '#4F5B76',
  blue: '#1E6BFF',
  /** "AI" in the wordmark — the shipped brand blue (TAPPY_WORDMARK_BLUE). */
  brandBlue: '#3391FF',
  sky: '#EAF3FF',
  groundTop: '#FFFFFF',
  groundMid: '#F2F7FF',
  panel: '#FFFFFF',
  panelBorder: '#D8E4FA',
  pillBorder: '#B9D2FB',
  bannerFrom: '#1453D9',
  bannerTo: '#2F8CFF',
  bannerSub: '#E3EEFF',
  star: '#FFB020',
  starOff: '#D5DEEE',
  heart: '#F0457A',
} as const

/** The plan card — sample #7. */
export const DARK = {
  ground: '#0B1220',
  groundDeep: '#070A12',
  panel: '#111A2E',
  panelBorder: 'rgba(255,255,255,0.08)',
  text: '#F4F6FB',
  muted: 'rgba(244,246,251,0.70)',
  faint: 'rgba(244,246,251,0.50)',
  eyebrow: '#8FB8FF',
  accentFrom: '#3B82F6',
  accentTo: '#8B5CF6',
  pin: '#A78BFA',
} as const

/** Sizes at the rendered scale (px). Content cards are 1080×1920 (9:16 — TikTok photo mode). */
export const SIZE = {
  width: 1080,
  height: 1920,
  pad: 60,
  panelRadius: 40,
  photoRadius: 28,
  pillRadius: 40,
  markSize: 116,
  wordmarkPx: 54,
  taglinePx: 26,
  qrBlock: 220,
  bracket: 40,
  bracketStroke: 7,
  bannerH: 170,
  mascotH: 300,
} as const

export const QR_CARD_MASCOT = '/branding/otter-mascot.png'
export const TAPPY_MARK = '/branding/otter-logo.png'

/**
 * Hosts the Next image optimiser may fetch (next.config `images.remotePatterns`). A photo from one
 * of them is drawn through `/_next/image` — SAME ORIGIN, so it can never taint the canvas (a
 * cross-origin photo without CORS headers would make `toBlob` throw and lose the whole card).
 */
const OPTIMISER_HOSTS = [/(^|\.)lh3\.googleusercontent\.com$/, /\.supabase\.co$/, /\.public\.blob\.vercel-storage\.com$/, /^storage\.googleapis\.com$/, /\.zadn\.vn$/]

export function cardImageSrc(url: string | null | undefined, width = 1080): string | null {
  if (!url) return null
  if (url.startsWith('/') && !url.startsWith('//')) return url
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (u.protocol !== 'https:') return null
  if (OPTIMISER_HOSTS.some(re => re.test(u.hostname))) return `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=80`
  return url
}

export function loadCardImage(src: string | null, timeoutMs = 5000): Promise<HTMLImageElement | null> {
  if (!src || typeof window === 'undefined') return Promise.resolve(null)
  return new Promise(resolve => {
    const img = new window.Image()
    let done = false
    const finish = (v: HTMLImageElement | null) => { if (!done) { done = true; resolve(v) } }
    const timer = setTimeout(() => finish(null), timeoutMs)
    if (!src.startsWith('/')) img.crossOrigin = 'anonymous'
    img.onload = () => { clearTimeout(timer); finish(img) }
    img.onerror = () => { clearTimeout(timer); finish(null) }
    img.src = src
  })
}

export function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/** Greedy word wrap; the last kept line gets an ellipsis when text was cut. */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines: string[] = []
  let cur = ''
  let i = 0
  for (; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i]
    if (ctx.measureText(next).width <= maxWidth) { cur = next; continue }
    if (cur) lines.push(cur)
    cur = words[i]
    if (lines.length === maxLines) break
  }
  if (lines.length < maxLines && cur) { lines.push(cur); cur = '' }
  const cut = i < words.length || cur !== ''
  if (cut && lines.length) {
    let last = lines[lines.length - 1]
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1)
    lines[lines.length - 1] = `${last.trimEnd()}…`
  }
  // A single word wider than the line is clipped by the width argument of fillText.
  return lines
}

/** Cover-fit an image into a rounded box. */
export function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, r: number) {
  ctx.save()
  roundedRect(ctx, x, y, w, h, r)
  ctx.clip()
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  const s = Math.max(w / iw, h / ih)
  ctx.drawImage(img, x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s)
  ctx.restore()
}

/** The light ground: white → sky, opaque edge to edge (a transparent PNG on a dark chat is unreadable). */
export function paintLightGround(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, LIGHT.groundTop)
  g.addColorStop(0.55, LIGHT.groundMid)
  g.addColorStop(1, LIGHT.sky)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

/** The lockup: round otter mark over the wordmark ("Tappy" ink, "AI" brand blue), centred. Returns the bottom y. */
export function drawLightLockup(ctx: CanvasRenderingContext2D, mark: HTMLImageElement | null, width: number, top: number, tagline?: string): number {
  const m = SIZE.markSize
  const markX = Math.round((width - m) / 2)
  if (mark) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(markX + m / 2, top + m / 2, m / 2, 0, Math.PI * 2)
    ctx.clip()
    const s = Math.min(mark.naturalWidth, mark.naturalHeight)
    ctx.drawImage(mark, (mark.naturalWidth - s) / 2, (mark.naturalHeight - s) / 2, s, s, markX, top, m, m)
    ctx.restore()
  }
  ctx.textBaseline = 'middle'
  ctx.font = `800 ${SIZE.wordmarkPx}px ${CARD_FONT}`
  const tw = ctx.measureText('Tappy').width
  const aw = ctx.measureText('AI').width
  const wordY = top + m + 10 + SIZE.wordmarkPx / 2
  const x = Math.round((width - tw - aw) / 2)
  ctx.textAlign = 'left'
  ctx.fillStyle = LIGHT.ink
  ctx.fillText('Tappy', x, wordY)
  ctx.fillStyle = LIGHT.brandBlue
  ctx.fillText('AI', x + tw, wordY)
  let bottom = top + m + 10 + SIZE.wordmarkPx
  if (tagline?.trim()) {
    ctx.textAlign = 'center'
    ctx.fillStyle = LIGHT.muted
    ctx.font = `500 ${SIZE.taglinePx}px ${CARD_FONT}`
    ctx.fillText(tagline.trim(), width / 2, bottom + 14 + SIZE.taglinePx / 2, width - SIZE.pad * 2)
    bottom += 14 + SIZE.taglinePx
  }
  ctx.textAlign = 'left'
  return bottom
}

/** A scannable code: white square, `quiet` empty modules each side, blue brackets OUTSIDE the quiet zone. */
export function drawQrBlock(ctx: CanvasRenderingContext2D, matrix: number[][], x: number, y: number, side: number, quiet = 4) {
  const n = matrix.length
  const modulePx = Math.max(1, Math.floor(side / (n + quiet * 2)))
  const real = modulePx * (n + quiet * 2)
  const ox = x + Math.floor((side - real) / 2)
  const oy = y + Math.floor((side - real) / 2)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(x, y, side, side)
  ctx.fillStyle = '#000000'
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (matrix[r][c]) ctx.fillRect(ox + (c + quiet) * modulePx, oy + (r + quiet) * modulePx, modulePx, modulePx)
  const g = 12
  const b = SIZE.bracket
  const [x0, y0, x1, y1] = [x - g, y - g, x + side + g, y + side + g]
  ctx.save()
  ctx.strokeStyle = LIGHT.blue
  ctx.lineWidth = SIZE.bracketStroke
  ctx.lineCap = 'round'
  for (const [cx, cy, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(cx, cy + dy * b); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * b, cy); ctx.stroke()
  }
  ctx.restore()
}

/** The blue slogan band with the hoodie otter standing over its left end. */
export function drawBanner(ctx: CanvasRenderingContext2D, mascot: HTMLImageElement | null, x: number, y: number, w: number, slogan: string, sub?: string) {
  const h = SIZE.bannerH
  const band = ctx.createLinearGradient(x, 0, x + w, 0)
  band.addColorStop(0, LIGHT.bannerFrom)
  band.addColorStop(1, LIGHT.bannerTo)
  ctx.fillStyle = band
  roundedRect(ctx, x, y, w, h, SIZE.panelRadius)
  ctx.fill()
  const textX = x + w * 0.63
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `italic 800 40px ${CARD_FONT}`
  ctx.fillText(slogan, textX, y + h * (sub ? 0.38 : 0.5), w * 0.6)
  if (sub?.trim()) {
    ctx.font = `500 24px ${CARD_FONT}`
    ctx.fillStyle = LIGHT.bannerSub
    ctx.fillText(sub.trim(), textX, y + h * 0.7, w * 0.6)
  }
  if (mascot) {
    const mh = SIZE.mascotH
    const mw = Math.round(mh * mascot.naturalWidth / mascot.naturalHeight)
    ctx.drawImage(mascot, x + 20, y + h - mh + 6, mw, mh)
  }
  ctx.textAlign = 'left'
}

/** The website pill (globe · host · arrow), centred on `cx`. */
export function drawWebsitePill(ctx: CanvasRenderingContext2D, cx: number, y: number, website: string, maxW: number) {
  ctx.font = `700 32px ${CARD_FONT}`
  const tw = ctx.measureText(website).width
  const w = Math.min(maxW, tw + 170)
  const h = 76
  const x = Math.round(cx - w / 2)
  ctx.fillStyle = LIGHT.sky
  roundedRect(ctx, x, y, w, h, h / 2)
  ctx.fill()
  ctx.strokeStyle = LIGHT.pillBorder
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.save()
  ctx.strokeStyle = LIGHT.blue
  ctx.lineWidth = 3.5
  const gx = x + 44
  const gy = y + h / 2
  ctx.beginPath(); ctx.arc(gx, gy, 16, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.ellipse(gx, gy, 6.5, 16, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(gx - 16, gy); ctx.lineTo(gx + 16, gy); ctx.stroke()
  const ax = x + w - 44
  ctx.beginPath(); ctx.moveTo(ax - 15, gy); ctx.lineTo(ax + 11, gy); ctx.moveTo(ax + 1, gy - 10); ctx.lineTo(ax + 12, gy); ctx.lineTo(ax + 1, gy + 10); ctx.stroke()
  ctx.restore()
  ctx.fillStyle = LIGHT.blue
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 32px ${CARD_FONT}`
  ctx.fillText(website, cx, gy, w - 170)
  ctx.textAlign = 'left'
}

/** A five-point star centred at (cx, cy). */
export function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const px = cx + rad * Math.cos(a)
    const py = cy + rad * Math.sin(a)
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
}

/** A map pin glyph at (x, y) in an `s` box. */
export function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.save()
  ctx.fillStyle = color
  const cx = x + s / 2
  ctx.beginPath()
  ctx.arc(cx, y + s * 0.38, s * 0.32, Math.PI, 0)
  ctx.quadraticCurveTo(x + s * 0.82, y + s * 0.62, cx, y + s)
  ctx.quadraticCurveTo(x + s * 0.18, y + s * 0.62, x + s * 0.18, y + s * 0.38)
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath(); ctx.arc(cx, y + s * 0.38, s * 0.12, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

/** `getImageData` throws on a tainted canvas — the only reliable probe. */
export function isCanvasTainted(ctx: CanvasRenderingContext2D): boolean {
  try { ctx.getImageData(0, 0, 1, 1); return false } catch { return true }
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise(resolve => {
    try { canvas.toBlob(b => resolve(b), 'image/png') } catch { resolve(null) }
  })
}
