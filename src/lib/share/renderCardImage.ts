import type { ShareArtifact, SharedPlace } from './shareArtifact'
import { BRAND } from './openGraph'

// ── THE BRANDED CARD IMAGE, DRAWN WITH CANVAS 2D AND NOTHING ELSE ────────────
//
// 🔑 NO DEPENDENCY. The audit found no image library on the web client and the
// approval asked for native capability first. Canvas 2D can draw text, rules,
// rounded panels and images — everything a brochure needs — so the card is
// PAINTED from the artifact rather than captured from the DOM. That also means
// it renders identically regardless of theme, viewport or which component is
// on screen, and it can never capture something that is not in `SharedPlace`.
//
// 🚨 NEVER A PREREQUISITE. Every failure path returns null and the caller
// falls back to the text artifact. A missing font, a blocked image, a browser
// without `canvas.toBlob` — none of them may make Share fail.
//
// 🚨 CORS, MEASURED NOT ASSUMED. Card thumbnails come from
// `lh3.googleusercontent.com` (Serper /maps) and Serper Images hosts. Drawing a
// cross-origin image without CORS approval TAINTS the canvas and `toBlob` then
// throws — which would lose the whole image for one photo. So photos are loaded
// with `crossOrigin='anonymous'` and a strict per-image timeout; a photo that
// does not arrive with CORS headers is simply not drawn, and the card still
// renders with everything else. `isTainted` below is the belt to that brace:
// if anything did taint the canvas, we return null rather than throw.

const W = 1080
const PAD = 56
const MAX_PLACES = 5
const PHOTO = 120
const PHOTO_TIMEOUT_MS = 1500

const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'

function loadImage(src: string, timeoutMs: number): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    let done = false
    const finish = (v: HTMLImageElement | null) => { if (!done) { done = true; resolve(v) } }
    const timer = setTimeout(() => finish(null), timeoutMs)
    img.crossOrigin = 'anonymous'
    img.onload = () => { clearTimeout(timer); finish(img) }
    img.onerror = () => { clearTimeout(timer); finish(null) }
    img.src = src
  })
}

/** Wrap text to a width, greedy on words. Returns at most `maxLines`, ellipsising the last. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (ctx.measureText(next).width <= maxWidth) { cur = next; continue }
    if (cur) lines.push(cur)
    cur = w
    if (lines.length === maxLines) break
  }
  if (lines.length < maxLines && cur) lines.push(cur)
  if (lines.length > maxLines) lines.length = maxLines
  if (words.join(' ') !== lines.join(' ') && lines.length === maxLines) {
    let last = lines[maxLines - 1]
    while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1)
    lines[maxLines - 1] = last + '…'
  }
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** `getImageData` throws on a tainted canvas; that is the only reliable probe. */
function isTainted(ctx: CanvasRenderingContext2D): boolean {
  try { ctx.getImageData(0, 0, 1, 1); return false } catch { return true }
}

function metaLine(p: SharedPlace): string {
  const bits: string[] = []
  if (typeof p.rating === 'number') bits.push(`★ ${p.rating}${typeof p.ratingCount === 'number' ? ` (${p.ratingCount})` : ''}`)
  if (p.category) bits.push(p.category)
  if (p.priceRangeText) bits.push(p.priceRangeText)
  return bits.join('  ·  ')
}

/**
 * Paint the artifact to a PNG. Returns null on any failure or in any
 * environment without a 2D canvas (SSR, tests without a DOM).
 */
export async function renderArtifactImage(a: ShareArtifact): Promise<Blob | null> {
  if (typeof document === 'undefined') return null
  const places = a.kind === 'places' ? a.places.slice(0, MAX_PLACES) : []
  const rowH = 150
  const headerH = 200
  const footerH = 90
  const bodyH = a.kind === 'places'
    ? places.length * rowH + (a.places.length > places.length ? 44 : 0)
    : 0
  const H = headerH + Math.max(bodyH, 120) + footerH

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Background + card panel
  ctx.fillStyle = '#0B1220'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#111A2E'
  roundRect(ctx, PAD / 2, PAD / 2, W - PAD, H - PAD, 28)
  ctx.fill()

  // Identity strip — the official mark and the brand name. Nothing invented.
  const logo = await loadImage('/logo.svg', 800)
  let x = PAD
  if (logo) {
    ctx.save(); roundRect(ctx, x, PAD, 56, 56, 14); ctx.clip()
    ctx.drawImage(logo, x, PAD, 56, 56); ctx.restore()
    x += 72
  }
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `700 34px ${FONT}`
  ctx.textBaseline = 'middle'
  ctx.fillText(BRAND.name, x, PAD + 28)

  ctx.fillStyle = '#93C5FD'
  ctx.font = `600 30px ${FONT}`
  ctx.textBaseline = 'alphabetic'
  const subjLines = wrap(ctx, a.subject, W - PAD * 2, 2)
  subjLines.forEach((l, i) => ctx.fillText(l, PAD, PAD + 110 + i * 38))

  let y = headerH
  if (a.kind === 'places') {
    // Photos load in parallel, each on its own clock; a slow or CORS-blocked one
    // costs only its own slot.
    const photos = await Promise.all(places.map(p => (p.image ? loadImage(p.image, PHOTO_TIMEOUT_MS) : Promise.resolve(null))))
    places.forEach((p, i) => {
      const top = y + i * rowH
      ctx.fillStyle = 'rgba(255,255,255,0.04)'
      roundRect(ctx, PAD, top, W - PAD * 2, rowH - 16, 18); ctx.fill()

      let tx = PAD + 20
      const img = photos[i]
      if (img) {
        ctx.save(); roundRect(ctx, tx, top + 14, PHOTO, PHOTO - 12, 14); ctx.clip()
        // cover-fit
        const s = Math.max(PHOTO / img.width, (PHOTO - 12) / img.height)
        ctx.drawImage(img, tx + (PHOTO - img.width * s) / 2, top + 14 + ((PHOTO - 12) - img.height * s) / 2, img.width * s, img.height * s)
        ctx.restore()
        tx += PHOTO + 20
      }
      const textW = W - tx - PAD - 16
      ctx.fillStyle = '#FFFFFF'
      ctx.font = `700 28px ${FONT}`
      ctx.fillText(wrap(ctx, `${i + 1}. ${p.name}`, textW, 1)[0] ?? '', tx, top + 46)
      ctx.fillStyle = '#FBBF24'
      ctx.font = `600 22px ${FONT}`
      const meta = metaLine(p)
      if (meta) ctx.fillText(wrap(ctx, meta, textW, 1)[0] ?? '', tx, top + 80)
      ctx.fillStyle = '#CBD5E1'
      ctx.font = `400 21px ${FONT}`
      const sub = [p.address, p.openingHours ? `🕐 ${p.openingHours}` : '', p.phone ? `☎ ${p.phone}` : ''].filter(Boolean).join('  ·  ')
      if (sub) ctx.fillText(wrap(ctx, sub, textW, 1)[0] ?? '', tx, top + 112)
    })
    if (a.places.length > places.length) {
      ctx.fillStyle = '#94A3B8'
      ctx.font = `400 22px ${FONT}`
      ctx.fillText(`+${a.places.length - places.length}`, PAD + 20, y + places.length * rowH + 24)
    }
  } else {
    ctx.fillStyle = '#CBD5E1'
    ctx.font = `400 24px ${FONT}`
    const lines = a.text.split('\n').slice(1, 8)
    lines.forEach((l, i) => ctx.fillText(wrap(ctx, l, W - PAD * 2, 1)[0] ?? '', PAD, y + 20 + i * 34))
  }

  // Footer — the brand url, so a screenshot of the screenshot still says where it came from.
  ctx.fillStyle = '#64748B'
  ctx.font = `500 22px ${FONT}`
  ctx.fillText(`${BRAND.name} · ${a.url.replace(/^https?:\/\//, '')}`, PAD, H - PAD - 4)

  if (isTainted(ctx)) return null
  return new Promise(resolve => {
    try { canvas.toBlob(b => resolve(b), 'image/png') } catch { resolve(null) }
  })
}
