// ── CONSULTATIVE V1 — the situation frame ───────────────────────────────────
//
// WHO is going, for WHAT occasion, WHEN, in what MOOD, with which HARD
// constraints — decided deterministically from the user's own words before the
// model runs, so the reply can consult for THIS situation instead of listing
// venues. `needProfile` already folds budget / location / domain; this frame
// reads the social side the profile has no slot for, and says out loud what it
// had to ASSUME because nothing was said (the assumptions are what the reply
// turns into "mình giả sử…" rather than a reflex question).
//
// Everything is diacritic-folded (`normalizeVN`) so "2 nguoi di date toi nay"
// typed on a phone reads exactly like "2 người đi date tối nay". Slang is in the
// lexicon on purpose — it is how the measured queries are written.
//
// Flag-gated at the call site (`consultativeV1Enabled`); the module itself is
// pure and free of side effects. See docs/audit/consultative-v1-design.md §1.

import { normalizeVN } from '../intent'
import type { NeedProfile } from './needProfile'

export type Who = 'solo' | 'couple' | 'friends' | 'family' | 'group' | 'colleagues'
export type Occasion = 'date' | 'birthday' | 'business' | 'family_meal' | 'hangout' | 'quick_bite' | 'celebration'
export type TimeSlot = 'now' | 'tonight' | 'lunch' | 'breakfast' | 'late_night' | 'weekend' | 'tomorrow'
export type Hard =
  | 'quiet' | 'parking' | 'kids' | 'vegetarian' | 'outdoor' | 'private_room' | 'late_open'
  | 'delivery' | 'air_con' | 'view' | 'live_music' | 'wheelchair'
export type Mood = 'chill' | 'lively' | 'romantic' | 'fancy' | 'cheap_good'

export interface SituationFrame {
  who: Who | null
  partySize: number | null
  occasion: Occasion | null
  time: TimeSlot | null
  /** The need profile's location, unchanged, plus whether "near me" was asked or GPS is present. */
  place: { text: string | null; nearMe: boolean }
  /** The need profile's budget, unchanged. */
  budget: NeedProfile['budget']
  hard: Hard[]
  mood: Mood | null
  /** What V1 assumed because nothing was said — rendered to the user, never hidden. */
  assumptions: string[]
  /** 0..1 — the share of the frame that was STATED rather than assumed. */
  confidence: number
}

const fold = (s: string) => ' ' + normalizeVN(s.toLowerCase()).replace(/\s+/g, ' ').trim() + ' '

// Ordered: the first pattern that matches wins within a field, so the more
// specific phrasing ("gia dinh co con nit") sits above the generic one.
const WHO: Array<[Who, RegExp]> = [
  // Explicit "alone" first: "ăn trưa gần công ty 1 mình" is solo, not colleagues.
  ['solo', /\b(mot minh|1 minh|di minh|solo|alone|by myself|1 nguoi|1 ng)\b/],
  ['family', /\b(gia dinh|ba me|bo me|ca nha|family|con nit|tre em|kids?|children|voi con|ong ba)\b/],
  ['colleagues', /\b(dong nghiep|sep|cong ty|team|coworkers?|colleagues?|khach hang|doi tac|tiep khach)\b/],
  ['couple', /\b(nguoi yeu|gau|crush|ban gai|ban trai|bx|ox|chong|2 dua|hai dua|couple|girlfriend|boyfriend|partner|wife|husband|hen ho|date)\b/],
  ['friends', /\b(ban be|hoi ban|dam ban|nhom ban|tui ban|friends?|nhau|bros?)\b/],
  ['group', /\b(nhom|group|dong nguoi|team building|(?:[5-9]|[1-9]\d) (?:nguoi|ng|people|pax))\b/],
]

const OCCASION: Array<[Occasion, RegExp]> = [
  ['birthday', /\b(sinh nhat|birthday|bday|thoi noi|day thang)\b/],
  ['celebration', /\b(ky niem|anniversary|an mung|celebrat|tot nghiep|graduation|thang chuc|promotion)\b/],
  ['business', /\b(tiep khach|hop mat|di hop|buoi hop|meeting|business|cong viec|ban viec|khach hang|doi tac)\b/],
  ['date', /\b(hen ho|date|lang man|romantic|nguoi yeu|gau|crush|ban gai|ban trai)\b/],
  ['family_meal', /\b(gia dinh|ba me|bo me|ca nha|family|ong ba|con nit|tre em)\b/],
  ['quick_bite', /\b(an nhanh|an (?:trua|sang|toi|gi do) nhanh|an vat|an le|nhanh gon|quick bite|quick|grab something|an tam|lot da)\b/],
  ['hangout', /\b(nhau|di choi|hang ?out|tu tap|tam su|chill|cafe|ca phe|coffee)\b/],
]

const TIME: Array<[TimeSlot, RegExp]> = [
  ['now', /\b(bay gio|ngay bay gio|hien tai|right now|\bnow\b|dang doi|dang o|luc nay)\b/],
  ['late_night', /\b(khuya|dem khuya|late night|late-night|sau 11h|sau 23h|qua dem|overnight|dem nay)\b/],
  // "trưa mai / tối mai" is tomorrow, so the day wins over the slot.
  ['tomorrow', /\b(ngay mai|mai|tomorrow|toi mai|trua mai|sang mai)\b/],
  ['tonight', /\b(toi nay|tonight|this evening|buoi toi|chieu toi|an toi|dinner)\b/],
  ['lunch', /\b(trua nay|buoi trua|trua|an trua|lunch|noon)\b/],
  ['breakfast', /\b(sang nay|buoi sang|an sang|breakfast|brunch)\b/],
  ['weekend', /\b(cuoi tuan|weekend|thu 7|thu bay|chu nhat|saturday|sunday|t7|cn)\b/],
]

const HARD: Array<[Hard, RegExp]> = [
  ['quiet', /\b(yen tinh|im lang|quiet|khong on|it on|nhe nhang|tinh lang)\b/],
  ['parking', /\b(dau xe|do xe|giu xe|bai xe|parking|o to|xe hoi|xe oto)\b/],
  ['kids', /\b(con nit|tre em|kids?|children|khu vui choi|tre nho|em be|baby)\b/],
  ['vegetarian', /\b(chay|vegetarian|vegan|thuan chay|an chay)\b/],
  ['outdoor', /\b(ngoai troi|san vuon|outdoor|rooftop|san thuong|khong gian mo|open air)\b/],
  ['private_room', /\b(phong rieng|phong vip|private room|private)\b/],
  ['late_open', /\b(mo khuya|mo muon|mo 24|24h|24\/7|late open|open late|con mo|mo toi khuya)\b/],
  ['delivery', /\b(giao hang|ship|delivery|giao tan noi|dat ve|mang ve|takeaway|take away)\b/],
  ['air_con', /\b(may lanh|dieu hoa|air ?con|aircon|a\/c)\b/],
  ['view', /\b(view|ngam canh|nhin ra|huong bien|huong song|tam nhin|cao tang)\b/],
  ['live_music', /\b(nhac song|live music|acoustic|ban nhac|live band)\b/],
  ['wheelchair', /\b(xe lan|wheelchair|khuyet tat|accessible)\b/],
]

const MOOD: Array<[Mood, RegExp]> = [
  ['romantic', /\b(lang man|romantic|hen ho|date|candle)\b/],
  ['fancy', /\b(sang trong|sang chanh|fancy|cao cap|fine dining|xin xo|dang cap|luxury|upscale|5 sao)\b/],
  ['cheap_good', /\b(re|binh dan|gia re|ngon re|ngon bo re|re ma ngon|via he|le duong|cheap|budget|affordable|hop tui tien|sinh vien)\b/],
  ['lively', /\b(soi dong|nhon nhip|vui|nao nhiet|lively|dong vui|party|dj|bar|pub|club)\b/],
  ['chill', /\b(chill|thu gian|nhe nhang|relax|thanh tinh|yen tinh|tinh lang|cozy|am cung)\b/],
]

/** "2 người / 2 ng / 4 đứa / 6 people / cho 3" → the party size the user stated. */
function partySizeIn(f: string): number | null {
  const m = f.match(/\b(\d{1,2})\s*(?:nguoi|ng|dua|people|pax|persons?|ban|manh)\b/)
    ?? f.match(/\b(?:cho|for|nhom|group of|ban)\s+(\d{1,2})\b(?!\s*(?:h|gio|k|tr|trieu|m|ngay|dem|sao|star|\d))/)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= 60 ? n : null
}

function first<T extends string>(table: Array<[T, RegExp]>, f: string): T | null {
  for (const [value, re] of table) if (re.test(f)) return value
  return null
}

/**
 * Derive the frame over the last user turns — newest first, so the most recent
 * statement of a field wins, and an earlier "cho 2 người" still holds later.
 */
export function deriveSituation(
  userTexts: readonly string[],
  need: Pick<NeedProfile, 'budget' | 'location'>,
  opts: { window?: number; hasGps?: boolean } = {},
): SituationFrame {
  const window = opts.window ?? 3
  const recent = userTexts.filter(t => typeof t === 'string' && t.trim()).slice(-window).reverse()
  const folded = recent.map(fold)
  const all = folded.join(' ')

  const pick = <T extends string>(table: Array<[T, RegExp]>): T | null => {
    for (const f of folded) { const v = first(table, f); if (v) return v }
    return null
  }
  const partySize = (() => { for (const f of folded) { const n = partySizeIn(f); if (n) return n } return null })()

  let who = pick(WHO)
  if (!who && partySize !== null) {
    who = partySize === 1 ? 'solo' : partySize === 2 ? 'couple' : partySize <= 4 ? 'friends' : 'group'
  }
  const occasion = pick(OCCASION)
  const time = pick(TIME)
  const mood = pick(MOOD)
  const hard: Hard[] = []
  for (const [h, re] of HARD) if (re.test(all) && !hard.includes(h)) hard.push(h)
  const nearMe = /\b(gan day|gan toi|gan minh|quanh day|near me|nearby|around here|gan cho|xung quanh)\b/.test(all) || !!opts.hasGps

  const assumptions: string[] = []
  if (!who && partySize === null) assumptions.push('1-2 người')
  if (!time) assumptions.push('đi trong hôm nay')
  if (!need.budget) assumptions.push('tầm giá phổ thông')
  if (!need.location.text && !nearMe) assumptions.push('khu vực gần bạn')

  // Four fields carry the frame: who, time, budget, place. Occasion / mood / hard
  // are extras — stated or not, they never lower the confidence.
  const stated = [who !== null || partySize !== null, time !== null, need.budget !== null, need.location.text !== null || nearMe]
  const confidence = stated.filter(Boolean).length / stated.length

  return {
    who, partySize, occasion, time,
    place: { text: need.location.text, nearMe },
    budget: need.budget,
    hard, mood, assumptions, confidence,
  }
}

const WHO_VI: Record<Who, string> = {
  solo: 'đi một mình', couple: 'đi 2 người / cặp đôi', friends: 'đi cùng bạn bè', family: 'đi cùng gia đình',
  group: 'đi nhóm đông', colleagues: 'đi cùng đồng nghiệp / khách',
}
const OCCASION_VI: Record<Occasion, string> = {
  date: 'hẹn hò', birthday: 'sinh nhật', business: 'tiếp khách / công việc', family_meal: 'bữa cơm gia đình',
  hangout: 'tụ tập / đi chơi', quick_bite: 'ăn nhanh / ăn vặt', celebration: 'kỷ niệm / ăn mừng',
}
const TIME_VI: Record<TimeSlot, string> = {
  now: 'ngay bây giờ', tonight: 'tối nay', lunch: 'buổi trưa', breakfast: 'buổi sáng', late_night: 'khuya',
  weekend: 'cuối tuần', tomorrow: 'ngày mai',
}
const MOOD_VI: Record<Mood, string> = {
  chill: 'chill / thư giãn', lively: 'sôi động', romantic: 'lãng mạn', fancy: 'sang trọng', cheap_good: 'rẻ mà ngon',
}
const HARD_VI: Record<Hard, string> = {
  quiet: 'yên tĩnh', parking: 'có chỗ đậu xe', kids: 'phù hợp trẻ em', vegetarian: 'có món chay', outdoor: 'ngoài trời',
  private_room: 'phòng riêng', late_open: 'mở khuya', delivery: 'giao hàng / mang về', air_con: 'máy lạnh', view: 'có view',
  live_music: 'nhạc sống', wheelchair: 'tiếp cận xe lăn',
}

/**
 * The prompt block: each stated field marked `(user nói)`, each assumption
 * `(giả sử)`. Unaccented section header like every other block in the prompt.
 */
export function buildSituationBlock(frame: SituationFrame): string {
  const lines: string[] = []
  if (frame.who) lines.push(`- Ai đi: ${WHO_VI[frame.who]}${frame.partySize ? ` (${frame.partySize} người)` : ''} (user nói)`)
  if (frame.occasion) lines.push(`- Dịp: ${OCCASION_VI[frame.occasion]} (user nói)`)
  if (frame.time) lines.push(`- Khi nào: ${TIME_VI[frame.time]} (user nói)`)
  if (frame.place.text) lines.push(`- Ở đâu: ${frame.place.text} (user nói)`)
  else if (frame.place.nearMe) lines.push('- Ở đâu: gần vị trí hiện tại (user nói / GPS)')
  if (frame.budget) lines.push('- Ngân sách: như user nói (xem khối nhu cầu)')
  if (frame.mood) lines.push(`- Không khí muốn: ${MOOD_VI[frame.mood]} (user nói)`)
  if (frame.hard.length > 0) lines.push(`- Điều kiện cứng: ${frame.hard.map(h => HARD_VI[h]).join(', ')} (user nói)`)
  for (const a of frame.assumptions) lines.push(`- ${a} (giả sử — nêu ngắn "mình giả sử …" rồi TÌM NGAY; KHÔNG hỏi xác nhận, KHÔNG "phải không?")`)
  // Measured 2026-09-18 (F7 "ăn gì ngon giờ", T5 "đi chơi ở đâu"): "nói rõ là giả sử, không hỏi lại" was
  // read as "state the assumption, then ask whether it is right" — one line ending in "phải không?"
  // and no tool ran. Low confidence is not a reason to ask: a wrong assumption costs the user one
  // correction; a question costs the whole turn.
  const lowConfidence = frame.assumptions.length > 0 && frame.confidence < 0.5
    ? '\nĐộ chắc thấp KHÔNG phải lý do để hỏi: GỌI tool tìm ngay trong lượt này với các giả sử trên, rồi chọn; user sửa sau nếu sai.'
    : ''
  return `\n\n===== TINH HUONG (V1) =====
${lines.join('\n')}
Độ chắc: ${Math.round(frame.confidence * 100)}%. Chọn cho ĐÚNG tình huống này; các quán khác chỉ nhắc khi có lý do gắn với tình huống.${lowConfidence}
=====================================`
}
