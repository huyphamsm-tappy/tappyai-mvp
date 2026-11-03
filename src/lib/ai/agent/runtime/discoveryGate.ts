// ── CONSULTATIVE_IN_AGENT — "understand the need first, then search" for a vague discovery question ───────────────────────────────────
//
// UAT 2026-10-12 ("nay có gì dzui ko pa", 3018, flag on): the model ran get_news, get_weather and a Serper Maps search before it knew what the user wanted; when it
// did ask, it asked only WHERE and then, on "TP.HCM", searched at once and wrote "hợp đi chơi nhẹ mà vẫn có cái để quậy" — a preference nobody had stated. The prompt that allows the
// early search is the base rule "Câu mở như 'tối nay làm gì cho vui': tìm vài lựa chọn … rồi mới hỏi" (agent/prompt.ts:34), kept by the V2 rewrite, and the context line "có GPS …
// không hỏi 'ở đâu'" (agent/prompt.ts:190). A prompt alone was ignored before (Round 25), so this is a deterministic backstop in the same family as plannerGate.ts / askGate.ts:
// on a vague opener the turn gets NO retrieval tool (route.ts → noRetrieval) and any tool the model proposes anyway is blocked (loop.ts `blockRetrieval`).
//
// The user's own words decide, conservatively:
//   · VAGUE: a short opener ("có gì dzui/vui/chơi", "đi đâu chơi", "chơi gì", "làm gì cho vui") with NO activity noun, budget or stated criterion, and not a trip request;
//   · it is answered by ONE short question: where + what (no trusted location), or only what (a location exists or was stated);
//   · a reply that names only a place ("TP.HCM") or only the company ("đi nhóm") is still vague → ask what (at most TWO questions in all);
//   · after two questions with no activity the turn searches with the assumption said out loud;
//   · an activity noun ("chơi game", "bida", "xem phim", "quán chay"), a budget, or any specific request searches at once and is never asked anything.
// Only the opener's thread counts: a reply is a SHORT answer (≤ 6 words, no question); anything else is a new topic and the gate steps aside.

import { cityInText } from '@/lib/ai/tools/vietnamCities'

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const words = (t: string): number => (t ? t.split(' ').length : 0)

const OPENER = /\b(?:co gi|co cai gi|lam gi|choi gi|di dau|di choi dau|co cho nao|co noi nao|co hoat dong nao)\b/
const FUN = /\b(?:dzui|zui|vui|choi|xoa|giai tri|thu gian|hay ho)\b/
/** An activity, venue type, product or topic: the user already said WHAT. Matched on folded text, whole words. */
const ACTIVITY = /\b(?:quan|nha hang|an uong|an gi|do an|mon|cafe|ca phe|tra sua|nhau|bar|pub|club|bia|nhac|live|phim|rap|cinema|cgv|galaxy|lotte|karaoke|bida|billiard|bi a|game|gaming|dien tu|bowling|escape|spa|massage|gym|the thao|bong da|cau long|pickleball|tennis|boi|cong vien|bao tang|trien lam|kich|san khau|show|concert|hoi cho|di dao|picnic|cau ca|trai nghiem|buffet|lau|nuong|shopping|mua sam|trung tam thuong mai|mall|sieu thi|sach|nail|toc|cho dem|pho di bo|karaoke|tiec|sinh nhat)\b/
const BUDGET = /\b\d+\s?(?:k|nghin|ngan|tr|trieu|d|dong|vnd|usd)\b|\b(?:duoi|khong qua|toi da|ngan sach|binh dan|re re|mien phi)\b/
/** A trip request is the trip flow's business (plannerGate.ts / the plan prompt), never this gate's. */
const TRIP = /\b(?:du lich|ke hoach|lich trinh|khach san|ve may bay|chuyen bay|tour|itinerary|trip|flight|hotel)\b/
/** "Where" the user lives is stated: a known city, a district / ward, or an explicit "ở …". */
const AREA = /\b(?:quan \d+|q\d+|huyen|thanh pho|tp|phuong|thu duc|binh thanh|phu nhuan|go vap|tan binh|tan phu|binh tan)\b/

const MAX_ASKS = 2

export type DiscoveryAction = 'ask' | 'assume'
export type DiscoveryKind = 'where_and_what' | 'what' | 'what_again'
export interface DiscoveryVerdict { action: DiscoveryAction; kind: DiscoveryKind | null; note: string; threadTurns: number }

function isSpecific(t: string): boolean { return ACTIVITY.test(t) || BUDGET.test(t) }
function isVagueOpener(raw: string): boolean {
  const t = fold(raw)
  if (!t || words(t) > 9) return false
  if (TRIP.test(t) || isSpecific(t)) return false
  return OPENER.test(t) && FUN.test(t)
}
const COMPANY = /\b(?:di voi|nhom|ban be|ban be|nguoi yeu|gia dinh|mot minh|di mot minh|hai nguoi|2 nguoi|3 nguoi|4 nguoi|\d+ nguoi|con nit|con nho|vo|chong|dong nghiep|cap doi)\b/
const ASSENT = /\b(?:gi cung duoc|cai gi cung duoc|sao cung duoc|tuy|tuy ban|ban chon|ban goi y|goi y di|ok|oke|okay|u|uh|duoc|chua biet|khong biet|ko biet|hok biet|chua nghi ra)\b/
function hasArea(raw: string): boolean {
  const t = fold(raw)
  return AREA.test(t) || !!cityInText(raw) || !!cityInText(t)
}
/** A reply to our own question: short, not itself a question, and it ANSWERS (a place, who is going, "anything", or an activity). "biết tesla ko" is none of those: a new topic. */
function isShortReply(raw: string): boolean {
  const t = fold(raw)
  if (!t || words(t) > 6 || /[?？]/.test(raw)) return false
  return hasArea(raw) || COMPANY.test(t) || ASSENT.test(t) || isSpecific(t)
}

const NOTE_COMMON_VI = 'KHÔNG đoán hay nhận xét sở thích của họ (không viết "chơi nhẹ", "xõa", "quậy", "chill" hay tương tự: họ chưa nói), không gợi ý địa điểm hay hoạt động cụ thể, không nhắc kết quả tra cứu nào. Xưng hô theo người dùng.'
const NOTE_COMMON_EN = 'Do NOT guess or comment on their tastes (nothing like "chill" or "lively": they have not said), do not suggest any place or activity, do not mention search results.'

function note(kind: DiscoveryKind | 'assume', lang: string): string {
  const en = lang === 'en'
  if (kind === 'assume') return en
    ? 'The user still has not said what they want after two questions. Do not ask again: offer a few DIFFERENT kinds of things (one place each) and say plainly that this is an assumption they can correct.'
    : 'Sau hai lần hỏi người dùng vẫn chưa nêu loại hoạt động. KHÔNG hỏi thêm: đưa vài hướng KHÁC NHAU (mỗi loại một chỗ) và nói rõ đây là giả định để họ chỉnh lại.'
  const head = en ? 'THIS TURN IS NOT LOOKED UP (system rule): the user\'s message is still vague. Call NO tool. Ask ONE short, natural question and stop.' : 'LƯỢT NÀY CHƯA ĐƯỢC TRA CỨU (quy tắc hệ thống): câu của người dùng còn mơ hồ. KHÔNG gọi công cụ nào. Chỉ hỏi lại MỘT câu ngắn, tự nhiên rồi dừng.'
  const ask = kind === 'where_and_what'
    ? (en ? 'In that one question ask both where they are and what kind of fun they want (e.g. a movie, games / pool, food and drinks, a walk).' : 'Trong MỘT câu đó hỏi cả họ đang ở khu vực nào lẫn họ muốn kiểu nào (vd xem phim, chơi game/bida, ăn uống, đi dạo).')
    : kind === 'what'
    ? (en ? 'Ask only what kind of thing they want and who is going (e.g. a movie, games / pool, food and drinks, a walk); you may use ask_user with 3–4 quick options.' : 'Chỉ hỏi họ muốn kiểu nào và đi với ai (vd xem phim, chơi game/bida, ăn uống, đi dạo); có thể dùng ask_user kèm 3–4 lựa chọn bấm nhanh.')
    : (en ? 'They did not say what they want yet: ask once more, plainly, what kind of thing (movie, games / pool, food, a walk). This is the last question.' : 'Họ chưa nói muốn làm gì: hỏi thêm một lần nữa, gọn, họ muốn kiểu nào (xem phim, chơi game/bida, ăn uống, đi dạo). Đây là câu hỏi cuối.')
  return `${head} ${ask} ${en ? NOTE_COMMON_EN : NOTE_COMMON_VI}`
}

/**
 * The gate's verdict for this turn, or null (the turn is not a vague discovery question, or it already says what it wants → search normally).
 * `userTexts`: the user's messages in order, the current one LAST.
 */
export function discoveryGate(o: { userTexts: readonly string[]; hasGps: boolean; planningIntent?: string | null; lang: string }): DiscoveryVerdict | null {
  const texts = o.userTexts.map(t => (typeof t === 'string' ? t : '')).filter(t => t.trim())
  if (!texts.length || o.planningIntent === 'trip') return null
  // the thread starts at the latest vague opener among the last three messages
  let start = -1
  for (let i = texts.length - 1; i >= Math.max(0, texts.length - 3); i--) if (isVagueOpener(texts[i])) { start = i; break }
  if (start < 0) return null
  const replies = texts.slice(start + 1)
  if (!replies.every(isShortReply)) return null // a longer message or a question = a new topic
  const thread = texts.slice(start).join(' ')
  if (isSpecific(fold(thread)) || TRIP.test(fold(thread))) return null // the user said WHAT (or it is a trip): search
  if (replies.length >= MAX_ASKS) return { action: 'assume', kind: null, note: note('assume', o.lang), threadTurns: replies.length + 1 }
  const placeKnown = o.hasGps || hasArea(thread)
  const kind: DiscoveryKind = replies.length === 0 ? (placeKnown ? 'what' : 'where_and_what') : 'what_again'
  return { action: 'ask', kind, note: note(kind, o.lang), threadTurns: replies.length + 1 }
}
