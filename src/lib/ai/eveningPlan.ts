// ── THE EVENING PLAN IS BUILT BY CODE, ON A FIXED FRAME (owner, UAT 2026-09-28) ───────────────
//
// "tối nay có chỗ nào đi chơi ở sài gòn ko" produced a children's park, one stop, or no plan at all
// across runs: the MODEL chose the searches ("địa điểm vui chơi giải trí") and wrote the plan. Stacked
// exclusion filters were patching symptoms. The frame is now fixed and deterministic:
//
//   dinner (18:30) → going out at night (20:00) → a drink (21:30)
//
//   · each stage runs ONE search whose words this code writes — never the model;
//   · each stage takes the best row that is OPEN at that stage's time (today's hours from the maps
//     provider; unknown hours are accepted after the known-open ones) and was not used by an earlier
//     stage; rows come back ranked around the user (GPS bias / the stated area);
//   · the [TAPPY_PLAN] block is written here; the model only writes the short introduction, and any
//     plan block it writes anyway is replaced by this one (`fixedPlanStream`).
//
// Used only for an evening plan that names no activity of its own ("tối nay đi đâu chơi"); a plan
// that names its activities ("ăn lẩu rồi xem phim") keeps the model-planned path.

import { isOpenNow } from '@/lib/ai/tools/serperPlaces'
import { buildActions, type ActionSource } from '@/lib/recommendation/actions'
import { normalizeVN } from '@/lib/ai/intent'

export type EveningStageKey = 'dinner' | 'night' | 'drinks'

export interface EveningStage {
  key: EveningStageKey
  time: string
  minutes: number
  category: 'food' | 'entertainment' | 'drinks'
  emoji: string
  /** Searches tried in order until one yields an open row. Code-written, never the model's. */
  searches: Array<{ query: string; type: 'restaurant' | 'attraction' | 'bar' | 'cafe' }>
  actionDomain: string
}

export const EVENING_STAGES: readonly EveningStage[] = [
  { key: 'dinner', time: '18:30', minutes: 18 * 60 + 30, category: 'food', emoji: '🍽️', actionDomain: 'food',
    searches: [{ query: 'nhà hàng ăn tối ngon', type: 'restaurant' }] },
  { key: 'night', time: '20:00', minutes: 20 * 60, category: 'entertainment', emoji: '🎶', actionDomain: 'entertainment',
    searches: [{ query: 'phố đi bộ chợ đêm', type: 'attraction' }, { query: 'live music phòng trà', type: 'bar' }, { query: 'karaoke bowling', type: 'attraction' }] },
  { key: 'drinks', time: '21:30', minutes: 21 * 60 + 30, category: 'drinks', emoji: '🍹', actionDomain: 'entertainment',
    searches: [{ query: 'rooftop bar view đẹp', type: 'bar' }, { query: 'quán cà phê mở khuya', type: 'cafe' }] },
]

/** Is this evening plan one the fixed frame builds? (An evening plan that names no activity of its own.) */
export function usesEveningFrame(planningIntent: string | null, planning: { activities?: readonly string[]; inherited?: boolean } | undefined): boolean {
  // "ăn chơi tối nay" names dinner / a drink — the frame's own stages; "lẩu rồi xem phim" names its own.
  return planningIntent === 'evening' && !planning?.inherited && (planning?.activities ?? []).every(a => a === 'restaurant' || a === 'bar' || a === 'cafe')
}

/** The search area: the district the user named, else a city named in the text, else none (GPS bias). */
export function eveningLocation(statedArea: string | null | undefined, text: string): string | undefined {
  if (statedArea) return statedArea
  const t = normalizeVN(String(text ?? '').toLowerCase())
  if (/\b(sai gon|saigon|hcm|ho chi minh|tphcm|tp hcm)\b/.test(t)) return 'TP. Hồ Chí Minh'
  if (/\bha noi\b|\bhanoi\b/.test(t)) return 'Hà Nội'
  if (/\bda nang\b/.test(t)) return 'Đà Nẵng'
  return undefined
}

export interface EveningRow extends ActionSource {
  name?: string
  address?: string
  place_id?: string
  maps_link?: string
  opening_hours?: string
  rating_value?: number
  rating_count?: number
  rating?: number
  user_ratings_total?: number
  photo_url?: string
  photo_urls?: string[]
}

const rowsOf = (result: unknown): EveningRow[] => {
  const r = result as { results?: unknown } | null
  return Array.isArray(r?.results) ? (r!.results as EveningRow[]).filter(x => x && typeof x.name === 'string' && x.name.trim()) : []
}
const keyOf = (p: EveningRow) => (p.place_id || normalizeVN((p.name ?? '').toLowerCase())).trim()

/** The stage's stop: the first row open at the stage's time (known-open before unknown hours), not used earlier. */
export function pickStageStop(result: unknown, stage: EveningStage, used: Set<string>): EveningRow | null {
  const rows = rowsOf(result).filter(p => !used.has(keyOf(p)))
  const openState = (p: EveningRow) => (typeof p.opening_hours === 'string' ? isOpenNow(p.opening_hours, { minutes: stage.minutes }) : null)
  return rows.find(p => openState(p) === true) ?? rows.find(p => openState(p) === null) ?? null
}

function ratingLine(p: EveningRow, lang: string): string {
  const rating = p.rating_value ?? p.rating
  const count = p.rating_count ?? p.user_ratings_total
  const parts: string[] = []
  if (typeof rating === 'number') parts.push(`${rating}⭐${typeof count === 'number' ? ` (${count.toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN')} ${lang === 'en' ? 'Google Maps reviews' : 'đánh giá Google Maps'})` : ''}`)
  if (typeof p.opening_hours === 'string' && p.opening_hours.trim()) parts.push(lang === 'en' ? `hours today ${p.opening_hours}` : `giờ mở cửa hôm nay ${p.opening_hours}`)
  return parts.join(', ')
}

const BOOK_KINDS = new Set(['booking', 'reservation', 'order', 'delivery', 'ticket'])
function bookingUrl(p: EveningRow, domain: string): string | null {
  const a = buildActions(p, domain).find(x => BOOK_KINDS.has(x.kind) && x.urlKind !== 'search' && (x.urlKind === 'direct' || !!x.commerce))
  return a?.url ?? null
}

export interface EveningStop { stage: EveningStage; place: EveningRow }

/** The [TAPPY_PLAN] block for the chosen stops, in stage order. Every value comes from the rows. */
export function buildEveningPlanBlock(stops: readonly EveningStop[], opts: { lang: string; area?: string; people?: number | null; budgetTotal?: number | null }): string {
  const en = opts.lang === 'en'
  const items = stops.map(({ stage, place }) => {
    const item: Record<string, unknown> = {
      time: stage.time, emoji: stage.emoji, category: stage.category, name: place.name,
      description: ratingLine(place, opts.lang), price: en ? 'price not available' : 'chưa có giá',
    }
    if (place.address) item.address = place.address
    if (place.maps_link) item.maps_link = place.maps_link
    if (place.place_id) item.place_id = place.place_id
    const photo = place.photo_urls?.[0] ?? place.photo_url
    if (photo) item.photo_url = photo
    const book = bookingUrl(place, stage.actionDomain)
    if (book) item.booking_link = book
    return item
  })
  const where = opts.area ? (en ? ` in ${opts.area}` : ` ở ${opts.area}`) : ''
  const plan = {
    type: 'evening',
    title: en ? `Tonight${where}: dinner → night out → drinks` : `Tối nay${where}: ăn tối → dạo chơi → cà phê/bar`,
    people: opts.people && opts.people > 0 ? opts.people : 2,
    budget_total: opts.budgetTotal ? `${opts.budgetTotal.toLocaleString('vi-VN')} VND` : (en ? 'price not available' : 'chưa có giá'),
    days: [{ label: en ? 'Tonight' : 'Tối nay', items }],
    share_text: en ? `Tonight's plan${where} by TappyAI ✨ #TappyAI` : `Kế hoạch tối nay${where} cùng TappyAI ✨ #TappyAI`,
  }
  return `[TAPPY_PLAN]\n${JSON.stringify(plan)}\n[/TAPPY_PLAN]`
}

/** What the model is told: the stops are chosen; it introduces them, in order, and writes no plan block. */
export function eveningIntroInstruction(stops: readonly EveningStop[], lang: string): string {
  const list = stops.map(s => `${s.stage.time} ${s.place.name}`).join(' → ')
  return lang === 'en'
    ? `\n\n===== TONIGHT'S PLAN IS ALREADY BUILT =====\nThe system searched and chose tonight's stops: ${list}. Write 2–4 short sentences introducing THESE stops in THIS order (why each fits the evening, using only facts from the tool results). Do NOT call any tool. Do NOT write a [TAPPY_PLAN] block — the system appends it. Do not ask where the user starts from or how they travel.`
    : `\n\n===== KẾ HOẠCH TỐI NAY ĐÃ ĐƯỢC HỆ THỐNG DỰNG =====\nHệ thống đã tìm và chọn các điểm tối nay: ${list}. Viết 2–4 câu ngắn giới thiệu ĐÚNG các điểm này theo ĐÚNG thứ tự (vì sao hợp buổi tối, chỉ dùng thông tin trong kết quả công cụ). KHÔNG gọi thêm tool. KHÔNG viết khối [TAPPY_PLAN] — hệ thống tự thêm. KHÔNG hỏi điểm xuất phát hay phương tiện.`
}

/**
 * The introduction, written by code from the SAME stops the plan carries. Measured on uat @ f6c7faf:
 * the model, told the stops, still introduced a different restaurant than the plan's — so the words
 * above the plan come from the plan, never from the model.
 */
export function eveningIntro(stops: readonly EveningStop[], opts: { lang: string; area?: string }): string {
  const en = opts.lang === 'en'
  const verb: Record<EveningStageKey, string> = en
    ? { dinner: 'dinner at', night: 'then', drinks: 'and a drink at' }
    : { dinner: 'ăn tối ở', night: 'sau đó ghé', drinks: 'cuối cùng uống nước ở' }
  const lines = stops.map(({ stage, place }) => {
    const r = ratingLine(place, opts.lang)
    return `${stage.time} — ${verb[stage.key]} **${place.name}**${r ? ` (${r})` : ''}`
  })
  const head = en
    ? `Here is tonight${opts.area ? ` in ${opts.area}` : ''}, every stop open at its time:`
    : `Tối nay${opts.area ? ` ở ${opts.area}` : ''} mình lên lịch như sau, điểm nào cũng còn mở vào giờ đó:`
  const tail = en ? 'Tap a stop for the map or to book; tell me if you want to swap one.' : 'Bấm từng điểm để xem bản đồ hoặc đặt chỗ; muốn đổi điểm nào cứ nói mình nhé.'
  return `${head}\n\n${lines.map(l => `- ${l}`).join('\n')}\n\n${tail}`
}

const MODEL_PLAN_RE = /\[TAPPY_PLAN\][\s\S]*?(?:\[\/TAPPY_PLAN\]|$)/g

/**
 * Pass the model's data stream through; its text is held, any plan block it wrote is removed, and
 * the system's block follows the introduction — all before the finish frame, so every downstream
 * guard (prices, items, photos) treats it like any plan.
 */
export function fixedPlanStream(body: ReadableStream<Uint8Array>, block: string, intro?: string): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let remainder = ''
  let text = ''
  const held: string[] = []
  const pass = (line: string, controller: TransformStreamDefaultController<Uint8Array>) => {
    if (line.startsWith('d:')) { held.push(line); return }
    if (line.startsWith('0:')) { try { text += JSON.parse(line.slice(2)) } catch { /* not text */ } return }
    controller.enqueue(encoder.encode(line + '\n'))
  }
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      remainder += decoder.decode(chunk, { stream: true })
      const lines = remainder.split('\n')
      remainder = lines.pop() ?? ''
      for (const line of lines) pass(line, controller)
    },
    flush(controller) {
      if (remainder) pass(remainder, controller)
      const lead = intro ?? text.replace(MODEL_PLAN_RE, '').replace(/\n{3,}/g, '\n\n').trim()
      controller.enqueue(encoder.encode(`0:${JSON.stringify(`${lead}\n\n${block}\n`)}\n`))
      for (const line of held) controller.enqueue(encoder.encode(line + '\n'))
    },
  }))
}
