// The REVIEW, Explore CLIP and SUGGESTION share cards — sample #1's light style (cardStyle.ts), at
// 1080×1920 (9:16, TikTok photo mode). Each card: the lockup at the top, the content on a white
// rounded panel, a scannable code of the shared link with the website pill, and the blue slogan
// banner with the hoodie otter at the foot.
//
// 🚨 WHAT A CARD MAY SHOW. Only fields the share already carries: a post's own public fields
// (place, rating, caption, author, first photo / clip thumbnail) and a suggestion's whitelisted
// `SharedPlace` fields (never distance — see shareArtifact.ts). Nothing is invented: a missing field
// is simply not drawn (no placeholder rating, no stock photo).
//
// Null on any failure (no canvas, tainted canvas, no PNG) — the caller falls back to text.

import { encodeQR } from '@/lib/qr/qrcode'
import type { SharedPlace } from './shareArtifact'
import { isShareOnlyPlaceName, reviewShareTitle } from './reviewShareTitle'
import {
  CARD_FONT, LIGHT, SIZE, QR_CARD_MASCOT, TAPPY_MARK, cardImageSrc, loadCardImage, roundedRect, wrapLines, drawCover,
  paintLightGround, drawLightLockup, drawQrBlock, drawBanner, drawWebsitePill, drawStar, drawPin, isCanvasTainted, canvasToPng,
} from './cardStyle'

/** The public fields of an Explore post that its card may show. */
export interface SharePostCard {
  kind: 'review' | 'clip'
  title: string
  /** A real venue (never the composer's "Chia sẻ" sentinel). */
  placeName?: string
  address?: string
  /** 1–5, reviews with a real place only. */
  rating?: number
  excerpt?: string
  author?: string
  /** First photo (review) or the clip's thumbnail. */
  image?: string
}

export const POST_EXCERPT_MAX = 220

/** Build a post's card data from the feed/detail review row — the ONE mapping web uses (Android mirrors it). */
export function postCardOf(review: {
  place_name?: string | null
  place_address?: string | null
  rating?: number | null
  body?: string | null
  photos?: string[] | null
  thumbnail?: string | null
  content_type?: string | null
  profiles?: { full_name?: string | null } | null
}): SharePostCard {
  const kind: SharePostCard['kind'] = review.content_type === 'video' ? 'clip' : 'review'
  const realPlace = !isShareOnlyPlaceName(review.place_name)
  const body = (review.body ?? '').replace(/\s+/g, ' ').trim()
  const excerpt = body.length > POST_EXCERPT_MAX ? `${body.slice(0, POST_EXCERPT_MAX - 1).trimEnd()}…` : body
  const firstPhoto = (review.photos ?? []).find(p => typeof p === 'string' && /^https:\/\//i.test(p))
  const thumb = review.thumbnail && /^https:\/\//i.test(review.thumbnail) ? review.thumbnail : undefined
  const rating = typeof review.rating === 'number' && review.rating >= 1 && review.rating <= 5 ? Math.round(review.rating) : undefined
  const card: SharePostCard = { kind, title: reviewShareTitle(review) }
  if (realPlace) card.placeName = review.place_name!.trim()
  if (realPlace && review.place_address?.trim()) card.address = review.place_address.trim()
  if (kind === 'review' && realPlace && rating) card.rating = rating
  // The title already IS the caption when there is no place: do not print it twice.
  if (excerpt && (realPlace || excerpt !== card.title)) card.excerpt = excerpt
  const author = review.profiles?.full_name?.trim()
  if (author) card.author = author
  const image = kind === 'clip' ? (thumb ?? firstPhoto) : (firstPhoto ?? thumb)
  if (image) card.image = image
  return card
}

/** The words on a light content card (already localised by the caller). */
export interface ContentCardCopy {
  tagline?: string
  /** The badge over the media: "Review" / "Clip" / "Tappy gợi ý". */
  badge: string
  /** Beside the code: "Quét mã để xem trên TappyAI". */
  scanTitle: string
  slogan?: string
  sloganSub?: string
  website: string
  /** "Đăng bởi {name}" — `{name}` is replaced. */
  byline?: string
  /** "+{n} địa điểm khác" — `{n}` is replaced. */
  morePlaces?: string
}

const W = SIZE.width
const H = SIZE.height
const P = SIZE.pad
/** Vertical plan (px). Kept together so every content card is the same frame. */
export const CONTENT_FRAME = {
  lockupTop: 56,
  panelTop: 330,
  panelBottom: 1330,
  qrRowTop: 1360,
  qrRowH: 260,
  bannerTop: 1690,
} as const

function newCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  return ctx ? { canvas, ctx } : null
}

/** The shared frame: ground, lockup, empty content panel, code row, banner. */
async function paintFrame(ctx: CanvasRenderingContext2D, url: string, copy: ContentCardCopy) {
  paintLightGround(ctx, W, H)
  const [mark, mascot] = await Promise.all([loadCardImage(TAPPY_MARK, 3000), loadCardImage(QR_CARD_MASCOT, 3000)])
  drawLightLockup(ctx, mark, W, CONTENT_FRAME.lockupTop, copy.tagline)

  // Content panel
  ctx.save()
  ctx.shadowColor = 'rgba(30,107,255,0.10)'
  ctx.shadowBlur = 30
  ctx.shadowOffsetY = 8
  ctx.fillStyle = LIGHT.panel
  roundedRect(ctx, P, CONTENT_FRAME.panelTop, W - P * 2, CONTENT_FRAME.panelBottom - CONTENT_FRAME.panelTop, SIZE.panelRadius)
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = LIGHT.panelBorder
  ctx.lineWidth = 2
  roundedRect(ctx, P, CONTENT_FRAME.panelTop, W - P * 2, CONTENT_FRAME.panelBottom - CONTENT_FRAME.panelTop, SIZE.panelRadius)
  ctx.stroke()

  // Code row: the code of the SHARED LINK, the scan line, the website pill.
  const rowTop = CONTENT_FRAME.qrRowTop
  ctx.fillStyle = LIGHT.panel
  roundedRect(ctx, P, rowTop, W - P * 2, CONTENT_FRAME.qrRowH, 32)
  ctx.fill()
  ctx.strokeStyle = LIGHT.panelBorder
  ctx.stroke()
  const qrSide = 212
  // The code sits on the RIGHT: the otter of the banner below stands on the left (sample #1).
  drawQrBlock(ctx, encodeQR(url), W - P - 28 - qrSide, rowTop + (CONTENT_FRAME.qrRowH - qrSide) / 2, qrSide)
  const colX = P + 40
  const colW = W - P - 28 - qrSide - 44 - colX
  ctx.textBaseline = 'middle'
  ctx.fillStyle = LIGHT.ink
  ctx.font = `800 32px ${CARD_FONT}`
  const scan = wrapLines(ctx, copy.scanTitle, colW, 2)
  scan.forEach((l, i) => ctx.fillText(l, colX, rowTop + 58 + i * 42, colW))
  drawWebsitePill(ctx, colX + colW / 2, rowTop + 58 + scan.length * 42 + 24, copy.website, colW)

  if (copy.slogan?.trim()) drawBanner(ctx, mascot, P, CONTENT_FRAME.bannerTop, W - P * 2, copy.slogan.trim(), copy.sloganSub)
}

function badge(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, glyph: 'star' | 'play' | 'spark') {
  ctx.font = `800 26px ${CARD_FONT}`
  const tw = ctx.measureText(label.toUpperCase()).width
  const w = tw + 84
  const h = 52
  ctx.fillStyle = 'rgba(255,255,255,0.94)'
  roundedRect(ctx, x, y, w, h, h / 2)
  ctx.fill()
  ctx.strokeStyle = LIGHT.pillBorder
  ctx.lineWidth = 2
  ctx.stroke()
  const gx = x + 32
  const gy = y + h / 2
  if (glyph === 'star') drawStar(ctx, gx, gy, 14, LIGHT.star)
  else if (glyph === 'play') {
    ctx.fillStyle = LIGHT.blue
    ctx.beginPath(); ctx.moveTo(gx - 8, gy - 12); ctx.lineTo(gx + 12, gy); ctx.lineTo(gx - 8, gy + 12); ctx.closePath(); ctx.fill()
  } else drawStar(ctx, gx, gy, 14, LIGHT.blue)
  ctx.fillStyle = LIGHT.blue
  ctx.textBaseline = 'middle'
  ctx.fillText(label.toUpperCase(), x + 56, gy)
}

/** A sky block standing in for an absent photo — no art, no borrowed image: the quote mark only. */
function quoteBlock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h)
  g.addColorStop(0, '#DCEBFF')
  g.addColorStop(1, LIGHT.sky)
  ctx.fillStyle = g
  roundedRect(ctx, x, y, w, h, SIZE.photoRadius)
  ctx.fill()
  ctx.fillStyle = 'rgba(30,107,255,0.25)'
  ctx.font = `800 220px Georgia, ${CARD_FONT}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText('“', x + w / 2, y + h / 2 + 50)
  ctx.textAlign = 'left'
}

/** Title, stars, place, excerpt, byline — below the media, inside the panel. */
function postText(ctx: CanvasRenderingContext2D, card: SharePostCard, copy: ContentCardCopy, top: number) {
  const x = P + 34
  const w = W - P * 2 - 68
  const bottom = CONTENT_FRAME.panelBottom - 30
  const bylineY = bottom - 16
  let y = top
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = LIGHT.ink
  ctx.font = `800 46px ${CARD_FONT}`
  for (const l of wrapLines(ctx, card.title, w, 2)) { y += 54; ctx.fillText(l, x, y, w) }

  if (card.rating) {
    y += 20
    for (let i = 0; i < 5; i++) drawStar(ctx, x + 20 + i * 46, y + 18, 19, i < card.rating ? LIGHT.star : LIGHT.starOff)
    ctx.fillStyle = LIGHT.muted
    ctx.font = `700 28px ${CARD_FONT}`
    ctx.textBaseline = 'middle'
    ctx.fillText(`${card.rating}/5`, x + 5 * 46 + 12, y + 19)
    ctx.textBaseline = 'alphabetic'
    y += 40
  }
  const placeLine = card.address ? card.address : (card.placeName && card.placeName !== card.title ? card.placeName : '')
  if (placeLine) {
    y += 16
    drawPin(ctx, x, y, 28, LIGHT.blue)
    ctx.fillStyle = LIGHT.muted
    ctx.font = `500 26px ${CARD_FONT}`
    ctx.fillText(wrapLines(ctx, placeLine, w - 40, 1)[0] ?? '', x + 40, y + 24, w - 40)
    y += 30
  }
  if (card.excerpt) {
    ctx.fillStyle = LIGHT.body
    ctx.font = `500 29px ${CARD_FONT}`
    const room = Math.floor((bylineY - 30 - (y + 20)) / 42)
    const lines = wrapLines(ctx, `“${card.excerpt}”`, w, Math.max(0, Math.min(5, room)))
    y += 12
    for (const l of lines) { y += 42; ctx.fillText(l, x, y, w) }
  }
  if (card.author && copy.byline) {
    ctx.fillStyle = LIGHT.muted
    ctx.font = `600 25px ${CARD_FONT}`
    ctx.textBaseline = 'middle'
    const initial = card.author.trim().charAt(0).toUpperCase()
    ctx.fillStyle = LIGHT.sky
    ctx.beginPath(); ctx.arc(x + 20, bylineY, 20, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = LIGHT.blue
    ctx.font = `800 22px ${CARD_FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(initial, x + 20, bylineY + 1)
    ctx.textAlign = 'left'
    ctx.fillStyle = LIGHT.muted
    ctx.font = `600 25px ${CARD_FONT}`
    ctx.fillText(copy.byline.replace('{name}', card.author), x + 52, bylineY, w - 52)
  }
}

/** A REVIEW or Explore CLIP card. */
export async function renderPostCard(card: SharePostCard, url: string, copy: ContentCardCopy): Promise<Blob | null> {
  const c = newCanvas()
  if (!c) return null
  const { canvas, ctx } = c
  await paintFrame(ctx, url, copy)
  const mx = P + 30
  const my = CONTENT_FRAME.panelTop + 30
  const mw = W - P * 2 - 60
  const mh = card.kind === 'clip' ? 560 : 480
  const img = await loadCardImage(cardImageSrc(card.image))
  if (img) drawCover(ctx, img, mx, my, mw, mh, SIZE.photoRadius)
  else if (card.kind === 'clip') {
    const g = ctx.createLinearGradient(mx, my, mx + mw, my + mh)
    g.addColorStop(0, LIGHT.bannerFrom)
    g.addColorStop(1, LIGHT.bannerTo)
    ctx.fillStyle = g
    roundedRect(ctx, mx, my, mw, mh, SIZE.photoRadius)
    ctx.fill()
  } else quoteBlock(ctx, mx, my, mw, mh)
  if (card.kind === 'clip') {
    // The play button: this card stands for a video.
    const cx = mx + mw / 2
    const cy = my + mh / 2
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.beginPath(); ctx.arc(cx, cy, 66, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = LIGHT.blue
    ctx.beginPath(); ctx.moveTo(cx - 20, cy - 32); ctx.lineTo(cx + 34, cy); ctx.lineTo(cx - 20, cy + 32); ctx.closePath(); ctx.fill()
  }
  badge(ctx, mx + 20, my + 20, copy.badge, card.kind === 'clip' ? 'play' : 'star')
  postText(ctx, card, copy, my + mh + 6)
  if (isCanvasTainted(ctx)) return null
  return canvasToPng(canvas)
}

function metaOf(p: SharedPlace): string {
  const bits: string[] = []
  if (p.category) bits.push(p.category)
  if (p.priceRangeText) bits.push(p.priceRangeText)
  return bits.join('  ·  ')
}

// Owner verdict 29/09 (suggestion card): "lấy tấm 1 và 2, không lấy tấm 3" — the card shows the first TWO places; the rest
// are counted in the "+N" line.
export const SUGGESTION_MAX_ROWS = 2

/** The SUGGESTION card: the recommendation's places, as the chat card showed them. */
export async function renderSuggestionCard(subject: string, places: SharedPlace[], url: string, copy: ContentCardCopy): Promise<Blob | null> {
  const c = newCanvas()
  if (!c) return null
  const { canvas, ctx } = c
  await paintFrame(ctx, url, copy)
  const x = P + 34
  const w = W - P * 2 - 68
  let y = CONTENT_FRAME.panelTop + 34
  badge(ctx, x, y, copy.badge, 'spark')
  y += 52
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = LIGHT.ink
  ctx.font = `800 42px ${CARD_FONT}`
  for (const l of wrapLines(ctx, subject, w, 2)) { y += 54; ctx.fillText(l, x, y, w) }
  y += 30

  const shown = places.slice(0, SUGGESTION_MAX_ROWS)
  const photos = await Promise.all(shown.map(p => loadCardImage(cardImageSrc(p.image, 384), 4000)))
  const rowH = 176
  const thumb = 144
  shown.forEach((p, i) => {
    const top = y + i * rowH
    const img = photos[i]
    if (img) drawCover(ctx, img, x, top, thumb, thumb, 24)
    else {
      ctx.fillStyle = LIGHT.sky
      roundedRect(ctx, x, top, thumb, thumb, 24)
      ctx.fill()
      ctx.fillStyle = LIGHT.blue
      ctx.font = `800 56px ${CARD_FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1), x + thumb / 2, top + thumb / 2)
      ctx.textAlign = 'left'
    }
    const tx = x + thumb + 26
    const tw = w - thumb - 26
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = LIGHT.ink
    ctx.font = `800 32px ${CARD_FONT}`
    ctx.fillText(wrapLines(ctx, `${i + 1}. ${p.name}`, tw, 1)[0] ?? '', tx, top + 38, tw)
    let ly = top + 80
    let mx = tx
    if (typeof p.rating === 'number') {
      drawStar(ctx, mx + 13, ly - 9, 14, LIGHT.star)
      ctx.fillStyle = LIGHT.ink
      ctx.font = `700 25px ${CARD_FONT}`
      const r = `${p.rating}${typeof p.ratingCount === 'number' ? ` (${p.ratingCount})` : ''}`
      ctx.fillText(r, mx + 32, ly)
      mx += 32 + ctx.measureText(r).width + 18
    }
    const meta = metaOf(p)
    if (meta) {
      ctx.fillStyle = LIGHT.muted
      ctx.font = `500 25px ${CARD_FONT}`
      ctx.fillText(wrapLines(ctx, meta, tx + tw - mx, 1)[0] ?? '', mx, ly, tx + tw - mx)
    }
    if (p.address) {
      ly += 40
      drawPin(ctx, tx, ly - 22, 24, LIGHT.blue)
      ctx.fillStyle = LIGHT.muted
      ctx.font = `500 23px ${CARD_FONT}`
      ctx.fillText(wrapLines(ctx, p.address, tw - 34, 1)[0] ?? '', tx + 34, ly, tw - 34)
    }
    if (i < shown.length - 1) {
      ctx.strokeStyle = LIGHT.panelBorder
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(x, top + rowH - 16); ctx.lineTo(x + w, top + rowH - 16); ctx.stroke()
    }
  })
  const more = places.length - shown.length
  if (more > 0 && copy.morePlaces) {
    ctx.fillStyle = LIGHT.blue
    ctx.font = `700 26px ${CARD_FONT}`
    ctx.fillText(copy.morePlaces.replace('{n}', String(more)), x, CONTENT_FRAME.panelBottom - 40)
  }
  if (isCanvasTainted(ctx)) return null
  return canvasToPng(canvas)
}
