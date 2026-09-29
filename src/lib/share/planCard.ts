// The PLAN share image — sample #7 ("TAPPY PLAN", plan-share.png): navy ground, the plan's own hero
// photo (or none), the eyebrow + title + real counts, a numbered day timeline, the overview box,
// the blue→violet CTA pill carrying the plan link, and "Được tạo bởi TappyAI".
//
// 1080 px wide; the height follows the plan (bounded: at most PLAN_CARD_DAYS days and
// PLAN_CARD_STOPS stops per day are drawn, the rest is counted).
//
// 🚨 THE IMAGE RULE (same as /plan/<id>): a photo appears ONLY when the stop carries a canonical
// place photo (`isPlanPhotoUrl`, enforced by the snapshot). No photo → no image frame, no stock art.

import type { PlanShareSnapshot } from '@/lib/plans/share/planShare'
import { brochureOf } from '@/lib/plans/share/planShare'
import { fill, type PlanBrochureStrings } from '@/lib/i18n/planBrochure'
import { CARD_FONT, DARK, TAPPY_MARK, cardImageSrc, loadCardImage, roundedRect, wrapLines, drawCover, drawPin, isCanvasTainted, canvasToPng } from './cardStyle'

export const PLAN_CARD_DAYS = 3
export const PLAN_CARD_STOPS = 4

const W = 1080
const P = 60
const HERO_H = 640
const STOP_H = 128
const DAY_HEAD = 96

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Height of the card for a snapshot — pure, so the layout is testable without a canvas. */
export function planCardHeight(s: PlanShareSnapshot): number {
  const days = s.days.slice(0, PLAN_CARD_DAYS)
  const body = days.reduce((h, d) => h + DAY_HEAD + Math.min(d.items.length, PLAN_CARD_STOPS) * STOP_H + (d.items.length > PLAN_CARD_STOPS ? 44 : 0) + 24, 0)
  const moreDays = s.days.length > PLAN_CARD_DAYS ? 50 : 0
  const overview = 60 + 3 * 64 + 40
  return 120 + HERO_H + 60 + 70 + body + moreDays + 30 + overview + 40 + 100 + 60 + 110
}

export async function renderPlanCard(s: PlanShareSnapshot, url: string, str: PlanBrochureStrings): Promise<Blob | null> {
  if (typeof document === 'undefined') return null
  const { hero, dayCount, stopCount } = brochureOf(s)
  const H = planCardHeight(s)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, DARK.groundDeep)
  g.addColorStop(0.4, DARK.ground)
  g.addColorStop(1, '#14133A')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // ── Top bar: the shipped lockup ("Tappy" white, "AI" blue) ──
  const mark = await loadCardImage(TAPPY_MARK, 3000)
  if (mark) {
    ctx.save(); ctx.beginPath(); ctx.arc(P + 30, 60, 30, 0, Math.PI * 2); ctx.clip()
    ctx.drawImage(mark, P, 30, 60, 60); ctx.restore()
  }
  ctx.textBaseline = 'middle'
  ctx.font = `800 40px ${CARD_FONT}`
  ctx.fillStyle = DARK.text
  ctx.fillText('Tappy', P + 76, 62)
  ctx.fillStyle = '#3391FF'
  ctx.fillText('AI', P + 76 + ctx.measureText('Tappy').width, 62)

  // ── Hero ──
  const heroTop = 120
  const heroImg = hero ? await loadCardImage(cardImageSrc(hero), 5000) : null
  if (heroImg) {
    drawCover(ctx, heroImg, 0, heroTop, W, HERO_H, 0)
    const shade = ctx.createLinearGradient(0, heroTop, 0, heroTop + HERO_H)
    shade.addColorStop(0, 'rgba(7,10,18,0.10)')
    shade.addColorStop(1, 'rgba(7,10,18,0.90)')
    ctx.fillStyle = shade
    ctx.fillRect(0, heroTop, W, HERO_H)
  } else {
    const hg = ctx.createLinearGradient(0, heroTop, W, heroTop + HERO_H)
    hg.addColorStop(0, 'rgba(59,130,246,0.22)')
    hg.addColorStop(1, 'rgba(139,92,246,0.22)')
    ctx.fillStyle = hg
    ctx.fillRect(0, heroTop, W, HERO_H)
  }
  ctx.textBaseline = 'alphabetic'
  let y = heroTop + HERO_H - 60
  // bottom-up: summary, meta, title, eyebrow
  const summary = s.summary ? wrapLinesFont(ctx, s.summary, `400 28px ${CARD_FONT}`, W - P * 2, 2) : []
  const meta = [fill(str.days, dayCount), fill(str.stops, stopCount), s.people ? fill(str.people, s.people) : null].filter(Boolean).join('   ·   ')
  ctx.font = `800 76px ${CARD_FONT}`
  const title = wrapLines(ctx, s.title, W - P * 2, 2)
  const blockH = 34 + 20 + title.length * 86 + 20 + 40 + (summary.length ? 20 + summary.length * 38 : 0)
  y = heroTop + HERO_H - 56 - blockH
  ctx.fillStyle = DARK.eyebrow
  ctx.font = `700 28px ${CARD_FONT}`
  ctx.fillText(spaced(str.eyebrow.toUpperCase()), P, y + 30)
  y += 34 + 20
  ctx.fillStyle = DARK.text
  ctx.font = `800 76px ${CARD_FONT}`
  for (const l of title) { y += 80; ctx.fillText(l, P, y, W - P * 2) }
  y += 26
  ctx.fillStyle = DARK.text
  ctx.font = `600 30px ${CARD_FONT}`
  y += 34
  ctx.fillText(meta, P, y, W - P * 2)
  if (summary.length) {
    y += 20
    ctx.fillStyle = DARK.muted
    ctx.font = `400 28px ${CARD_FONT}`
    for (const l of summary) { y += 38; ctx.fillText(l, P, y, W - P * 2) }
  }

  // ── Itinerary ──
  y = heroTop + HERO_H + 60
  ctx.fillStyle = DARK.text
  ctx.font = `800 48px ${CARD_FONT}`
  ctx.fillText(str.itinerary, P, y + 40)
  y += 70
  const days = s.days.slice(0, PLAN_CARD_DAYS)
  const photos = await Promise.all(days.map(d => Promise.all(d.items.slice(0, PLAN_CARD_STOPS).map(it => (it.photo_url ? loadCardImage(cardImageSrc(it.photo_url, 384), 4000) : Promise.resolve(null))))))
  days.forEach((d, di) => {
    // Day badge (gradient circle "01") + label
    const cx = P + 36
    const cy = y + 44
    const bg = ctx.createLinearGradient(cx - 36, cy - 36, cx + 36, cy + 36)
    bg.addColorStop(0, DARK.accentFrom)
    bg.addColorStop(1, DARK.accentTo)
    ctx.fillStyle = bg
    ctx.beginPath(); ctx.arc(cx, cy, 36, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `800 30px ${CARD_FONT}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(pad2(di + 1), cx, cy + 1)
    ctx.textAlign = 'left'
    ctx.fillStyle = DARK.eyebrow
    ctx.font = `700 34px ${CARD_FONT}`
    ctx.fillText(wrapLines(ctx, d.label, W - P * 2 - 100, 1)[0] ?? '', P + 96, cy)
    ctx.textBaseline = 'alphabetic'
    const items = d.items.slice(0, PLAN_CARD_STOPS)
    const lineTop = y + DAY_HEAD
    // timeline
    if (items.length) {
      ctx.strokeStyle = 'rgba(59,130,246,0.6)'
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(cx, lineTop - 8); ctx.lineTo(cx, lineTop + items.length * STOP_H - 30); ctx.stroke()
    }
    items.forEach((it, ii) => {
      const top = lineTop + ii * STOP_H
      ctx.fillStyle = DARK.accentFrom
      ctx.beginPath(); ctx.arc(cx, top + 16, 8, 0, Math.PI * 2); ctx.fill()
      let tx = P + 96
      if (it.time) {
        ctx.fillStyle = DARK.text
        ctx.font = `700 28px ${CARD_FONT}`
        ctx.fillText(it.time, tx, top + 28, 110)
      }
      tx += 120
      const img = photos[di][ii]
      if (img) { drawCover(ctx, img, tx, top, 150, 100, 16); tx += 170 }
      const tw = W - P - tx
      ctx.fillStyle = DARK.text
      ctx.font = `700 30px ${CARD_FONT}`
      ctx.fillText(wrapLines(ctx, it.name, tw, 1)[0] ?? '', tx, top + 28, tw)
      let ly = top + 28
      if (it.description) {
        ly += 36
        ctx.fillStyle = DARK.muted
        ctx.font = `400 23px ${CARD_FONT}`
        ctx.fillText(wrapLines(ctx, it.description, tw, 1)[0] ?? '', tx, ly, tw)
      }
      if (it.address) {
        ly += 34
        drawPin(ctx, tx, ly - 20, 22, DARK.pin)
        ctx.fillStyle = DARK.faint
        ctx.font = `400 22px ${CARD_FONT}`
        ctx.fillText(wrapLines(ctx, it.address, tw - 30, 1)[0] ?? '', tx + 30, ly, tw - 30)
      }
    })
    y = lineTop + items.length * STOP_H
    if (d.items.length > PLAN_CARD_STOPS) {
      ctx.fillStyle = DARK.faint
      ctx.font = `500 24px ${CARD_FONT}`
      ctx.fillText(`+${fill(str.stops, d.items.length - PLAN_CARD_STOPS)}`, P + 96, y + 10)
      y += 44
    }
    y += 24
  })
  if (s.days.length > PLAN_CARD_DAYS) {
    ctx.fillStyle = DARK.eyebrow
    ctx.font = `600 26px ${CARD_FONT}`
    ctx.fillText(`+${fill(str.days, s.days.length - PLAN_CARD_DAYS)}`, P, y + 20)
    y += 50
  }

  // ── Overview box ──
  y += 30
  // Only real fields: the counts, the party size and the budget when the plan has them.
  const rows: [string, string][] = [[str.durationLabel, `${fill(str.days, dayCount)} · ${fill(str.stops, stopCount)}`]]
  if (s.people) rows.push([str.partyLabel, fill(str.people, s.people)])
  if (s.budget_total) rows.push([str.budget, s.budget_total])
  const boxH = 60 + 3 * 64 + 40
  ctx.fillStyle = DARK.panel
  roundedRect(ctx, P, y, W - P * 2, boxH, 28)
  ctx.fill()
  ctx.strokeStyle = DARK.panelBorder
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = DARK.text
  ctx.font = `800 34px ${CARD_FONT}`
  ctx.fillText(str.overview, P + 36, y + 56)
  rows.slice(0, 3).forEach(([k, v], i) => {
    const ry = y + 60 + 40 + i * 64
    ctx.fillStyle = DARK.muted
    ctx.font = `500 26px ${CARD_FONT}`
    ctx.fillText(k, P + 36, ry + 24, 420)
    ctx.fillStyle = DARK.text
    ctx.font = `700 26px ${CARD_FONT}`
    ctx.fillText(v, P + 480, ry + 24, W - P * 2 - 520)
  })
  y += boxH + 40

  // ── CTA pill + link ──
  const cg = ctx.createLinearGradient(P, 0, W - P, 0)
  cg.addColorStop(0, DARK.accentFrom)
  cg.addColorStop(1, DARK.accentTo)
  ctx.fillStyle = cg
  roundedRect(ctx, P + 40, y, W - P * 2 - 80, 100, 50)
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `800 32px ${CARD_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${str.cta.toUpperCase()}  →`, W / 2, y + 51, W - P * 2 - 140)
  y += 100 + 44
  ctx.fillStyle = DARK.eyebrow
  ctx.font = `600 26px ${CARD_FONT}`
  ctx.fillText(url.replace(/^https?:\/\//, ''), W / 2, y, W - P * 2)
  y += 56
  ctx.fillStyle = DARK.text
  ctx.font = `500 26px ${CARD_FONT}`
  ctx.fillText(`${str.madeBy} TappyAI`, W / 2, y)
  ctx.fillStyle = DARK.faint
  ctx.font = `400 22px ${CARD_FONT}`
  ctx.fillText(str.madeByLine, W / 2, y + 36)
  ctx.textAlign = 'left'

  if (isCanvasTainted(ctx)) return null
  return canvasToPng(canvas)
}

function wrapLinesFont(ctx: CanvasRenderingContext2D, text: string, font: string, w: number, n: number): string[] {
  ctx.font = font
  return wrapLines(ctx, text, w, n)
}

/** "TAPPY PLAN" is letter-spaced in the design; canvas has no letter-spacing everywhere, so thin spaces. */
function spaced(s: string): string {
  return s.split('').join(' ')
}
