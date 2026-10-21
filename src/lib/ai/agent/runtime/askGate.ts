// ── CONSULTATIVE_IN_AGENT — a question the owner's rule says is never asked first ─────────────────────────────────────────────────────
//
// The prompt and the ask_user description both say: a trip plan whose destination, length, party and budget are known is built at once; a month
// without a year means the nearest coming one; where the trip starts and by which vehicle are assumptions, not questions; "chỉ đường tới X"
// is answered from the user's current location. Measured live (2026-10-11, Lý Sơn plan, two runs): the model still asked "xuất phát từ đâu"
// and "năm nào" through ask_user, so the instruction alone is not enough. This is the deterministic backstop: such a question is REFUSED once
// or twice with a note telling the model to proceed on stated assumptions. Nothing else is gated — any other question passes untouched, and a
// later attempt is accepted (the loop never traps the user in a silent turn).

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const PLAN_REQUEST = /(?:^| )(?:lap ke hoach|ke hoach|lich trinh|len lich|plan|itinerary|trip)(?: |$)/
const DURATION = /(?:^| )(?:\d{1,2} ngay|\d{1,2} dem|mot tuan|cuoi tuan|\d{1,2} days?|\d{1,2} nights?|weekend)(?: |$)/
const PARTY_OR_BUDGET = /(?:^| )(?:\d{1,2} (?:nguoi|khach|pax|people)|hai nguoi|ba nguoi|bon nguoi|minh va|ca nha|gia dinh|cap doi|\d+ ?(?:trieu|tr|k|nghin|ty|usd|vnd)(?: |$)|ngan sach|budget)/
const DIRECTIONS = /(?:^| )(?:chi duong|chi giup duong|duong di|tim duong|dan duong|how (?:do i|to) get to|directions? to|route to)(?: |$)/

/** What the asked question is about: where from / by what, which year, which exact day. */
const ORIGIN_OR_VEHICLE_Q = /xuat phat|di tu dau|bay tu dau|tu dau|khoi hanh|phuong tien|bang gi|bay hay|xe hay|leaving from|flying from|departing|starting from|which vehicle|how will you (?:travel|get)|coming from/
const YEAR_OR_DAY_Q = /(?:^| )nam (?:nao|khac|2\d{3})|(?:^| )20\d\d(?: |$)|ngay (?:nao|cu the|di)|ngay bat dau|which year|what year|exact (?:date|day)|which day|what date/

/**
 * EXEMPTIONS — the user's own words say the open point is real, so the question is a genuine one and is never gated:
 *   · the destination itself is undecided ("chưa biết đi đâu", "đi đâu cũng được", "tùy bạn chọn nơi");
 *   · the user asks to CHOOSE or COMPARE ("chọn giúp", "nên đi … hay …", "so sánh", "A hay B").
 * (A question that asks WHERE to go is exempt separately, below, whatever the user wrote.)
 */
const OPEN_DESTINATION = /(?:^| )(?:chua biet|khong biet|chua ro|chua quyet|phan van|dang phan van)(?: \S+){0,3} (?:di|den) (?:dau|noi nao)|(?:^| )(?:di )?dau cung duoc|(?:^| )noi nao cung duoc|(?:^| )(?:goi y|de xuat) (?:cho minh )?(?:diem den|noi (?:de )?di)/
const CHOOSE_OR_COMPARE = /(?:^| )(?:chon giup|chon gium|chon ho|giup minh chon|giup toi chon|nen chon|nen di|so sanh|which (?:one )?should|help me choose|compare)(?: |$)|(?:^| )hay (?:la )?(?!khong)\S+/

export type AskGateKind = 'plan_full_info' | 'directions_origin' | 'trip_open'
export interface AskGateVerdict { kind: AskGateKind; note: string }

/**
 * CONSULT_ASK_GATE: `block` (default — unset or any other value), `shadow` (never blocks; logs every question the gate WOULD have blocked, kind
 * only), `off` / `0` / `false` / `no` (the gate does nothing at once; the flag itself is unchanged).
 */
export type AskGateMode = 'block' | 'shadow' | 'off'
export const askGateMode = (env: Record<string, string | undefined> = process.env): AskGateMode => {
  const v = (env.CONSULT_ASK_GATE ?? '').trim().toLowerCase()
  return /^(?:off|0|false|no)$/.test(v) ? 'off' : v === 'shadow' ? 'shadow' : 'block'
}
/** Kept for callers that only ask "is the gate doing anything" (block or shadow). */
export const askGateEnabled = (env: Record<string, string | undefined> = process.env): boolean => askGateMode(env) !== 'off'

/** A verdict for the model when the question must not be asked first (null = let it through). */
export function askRefusal(userText: string, question: string, lang: string): string | null {
  return askVerdict(userText, question, lang)?.note ?? null
}

/** An open-ended "somewhere to travel" ask: trip wording ("du lịch", "đi chơi xa", "nghỉ dưỡng") — a destination or length may be missing. */
const TRAVEL_OPEN = /(?:^| )(?:du lich|di choi xa|di nghi|nghi duong|di tron|getaway|vacation|trip)(?: |$)|(?:^| )(?:chua biet|khong biet) (?:di|den) (?:dau|noi nao)/
const TRIP_OPEN_NOTE_VI = 'Không hỏi lại: người dùng đã nói muốn đi chơi/du lịch và nhờ gợi ý hoặc chưa quyết. Nếu chưa có cả điểm đến lẫn số ngày: nêu 2–3 điểm đến hợp (theo thời gian, mùa, đi từ TP.HCM, ngân sách), chọn MỘT kèm lý do, nói ngắn giả định. Nếu đã có thời gian và số người (kể cả "chưa biết đi đâu"): chọn luôn một điểm đến hợp và lập đầy đủ kế hoạch theo từng ngày, nêu giả định. Một dòng về phương án khác; không kết bằng lời mời hay câu hỏi.'
const TRIP_OPEN_NOTE_EN = 'Do not ask: the user wants a trip and asked for suggestions or has not decided. With neither destination nor length: name 2–3 fitting destinations (timing, season, from the likely origin, budget), pick ONE with a reason and state the assumptions briefly. With timing and party known (even "not sure where"): pick a fitting destination and build the full day-by-day plan with stated assumptions. One line about an alternative; no closing invitation or question.'

export function askVerdict(userText: string, question: string, lang: string, recentTripText?: string): AskGateVerdict | null {
  const u = ` ${fold(userText)} `
  const q = ` ${fold(question)} `
  // CONSULTATIVE_IN_AGENT round 19: an open "where should I travel" ask is answered with a chosen destination, not a question back (live 2026-10-11:
  // "cuối tuần sau tui muốn đi du lịch có gợi ý gì ko" → "bạn muốn đi mấy ngày…?"). `recentTripText` = the last few user texts together.
  if (recentTripText !== undefined && TRAVEL_OPEN.test(` ${fold(recentTripText)} `)) return { kind: 'trip_open', note: lang === 'en' ? TRIP_OPEN_NOTE_EN : TRIP_OPEN_NOTE_VI }
  const planKnown = PLAN_REQUEST.test(u) && DURATION.test(u) && PARTY_OR_BUDGET.test(u) && !OPEN_DESTINATION.test(u) && !CHOOSE_OR_COMPARE.test(u)
  const dir = DIRECTIONS.test(u)
  // A request that states destination, length, party and budget is complete: ANY question is refused (live 2026-10-11: after origin and year
  // were refused the model asked "cuối tháng 12 hay mùa biển êm hơn" — a risk to say inside the plan, not a reason to hold the plan back).
  // Directions: only where-from / vehicle.
  // asking WHERE to go (the destination is what is missing) is never refused; "đổi điểm đến nếu biển xấu" is a different question
  const aboutDestination = /(?:^| )(?:di dau|den dau|di noi nao|noi nao|vung nao|tinh nao|diem den (?:nao|cua ban|la gi))(?: |$)|where (?:do you|would you) want to go|which destination/.test(q)
  const kind: AskGateKind | null = planKnown && !aboutDestination ? 'plan_full_info' : dir && ORIGIN_OR_VEHICLE_Q.test(q) ? 'directions_origin' : null
  if (!kind) return null
  const note = lang === 'en'
    ? 'Do not ask this: the request already has what the plan needs. Assume the nearest coming date for a month without a year, assume a sensible way to get there from the main hub, say each assumption in one short line, and answer now. If the timing is risky (rough sea, weather, holidays) say so inside the plan and offer the alternative there. Invite the user to give the starting point or exact date at the END to adjust.'
    : 'Không hỏi câu này: yêu cầu đã đủ để làm. Tháng chưa nói năm thì lấy lần gần nhất sắp tới; chưa biết xuất phát hay phương tiện thì giả định hợp lý (vd từ đầu mối giao thông chính), nêu mỗi giả định trong một dòng ngắn rồi làm luôn. Nếu thời điểm có rủi ro (biển động, thời tiết, dịp lễ) thì nói rõ ngay trong kế hoạch và nêu phương án thay thế ở đó. Chỉ mời người dùng cho biết nơi xuất phát hoặc ngày cụ thể ở CUỐI câu trả lời để chỉnh lại. Với chỉ đường: dùng vị trí hiện tại của người dùng.'
  return { kind, note }
}
