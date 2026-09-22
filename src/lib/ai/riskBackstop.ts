import { normalizeVN } from './intent'

// ── RISK-FIRST BACKSTOP FOR HIGH-VALUE SECOND-HAND PURCHASE ADVICE (F-043) ────
//
// Safety rule 5 in the prompt asks every second-hand / high-value purchase answer to lead with
// the risks that lose the money or the goods (ownership, locks and liens, transaction fraud,
// safe payment) and to point at "Cảnh báo lừa đảo". Measured across four full golden replays
// (2026-09-22) the rule held on three and slipped on one: T4 t2 came back cosmetic-first with
// "dưới 70%" and ">20%". A prompt rule is an instruction, not a guarantee — the same lesson the
// spec and money guards were built on.
//
// This module is the deterministic half. No model call: it reads the FINAL reply, checks whether
// each of the four risk topics is covered, and when one is not it appends the fixed line(s) for
// the missing topic(s) plus the fixed scam-checker pointer. Every appended character is fixed
// text written here; nothing is generated, nothing of the model's text is removed. The pointer
// names ONLY what the checker takes — a message, a link, a QR code — never a phone number or a
// bank account (F-022 / F-047).
//
// The threshold half is separate and cheaper: a parenthetical that carries an unsourced numeric
// threshold ("(dưới 70% giá mới)", "(nên ≥50%)", "(chênh >30% là cần nghi)") is removed whole — a
// parenthetical is an aside, so the sentence reads without it — and a threshold that sits inline
// gets one fixed hedge line instead of surgery.

/** Second-hand / high-value purchase cues in the user's own words. */
const SECOND_HAND_RE = /\b(?:cu|cũ)\b|second ?hand|da qua su dung|\bused\b|refurbish|like ?new|\b2nd\b|hang bai|xach tay/
const PURCHASE_RE = /\bmua\b|\bsam\b|\bbuy(?:ing)?\b|\bpurchase\b|nen (?:lay|chon|mua)|\bchot\b|\bdat coc\b|\bcoc\b/
/** Categories where a bad buy costs real money even without the word "cũ". */
const HIGH_VALUE_RE = /\bmacbook\b|\blaptop\b|\biphone\b|\bipad\b|dien thoai|\bxe may\b|\bo to\b|\bxe hoi\b|\bxe\b.{0,12}\b(?:honda|yamaha|vinfast|toyota|hyundai|kia|mazda|ford)\b|\bcamera\b|\bmay anh\b|\bdong ho\b|\bwatch\b|\bps5\b|\bconsole\b|\bcar\b|\bmotorbike\b/
/** A stranger-to-stranger marketplace is a fraud vector on its own. */
const MARKETPLACE_RE = /group facebook|facebook marketplace|cho tot|chotot|nguoi la|\bstranger\b|\bmarketplace\b/
/** The question is about what to check / whether to buy / the risks — advice, not a product search. */
const ADVICE_RE = /can (?:check|kiem tra|luu y|xem|de y|chu y)|check (?:gi|cai gi|nhung gi)|kiem tra gi|luu y gi|rui ro|\bnen mua\b|co nen|\bmua .{0,40}(?:duoc khong|khong)\b|what to check|should i buy|red flags?|worth (?:it|buying)/

/**
 * Is this thread a high-value second-hand purchase question? Reads the user turns only — the
 * thread, because "muốn mua macbook pro m1" → "mua máy cũ thì cần check cái gì" carries the
 * category on one turn and the second-hand cue on the next.
 */
export function isSecondHandPurchaseAdvice(userTexts: readonly string[]): boolean {
  const all = normalizeVN(userTexts.map(t => String(t ?? '')).join('\n').toLowerCase())
  const last = normalizeVN(String(userTexts[userTexts.length - 1] ?? '').toLowerCase())
  const secondHand = SECOND_HAND_RE.test(all) || MARKETPLACE_RE.test(all)
  const purchase = PURCHASE_RE.test(all)
  const highValue = HIGH_VALUE_RE.test(all) || MARKETPLACE_RE.test(all)
  const advice = ADVICE_RE.test(last) || ADVICE_RE.test(all)
  return secondHand && purchase && highValue && advice
}

export type RiskTopic = 'ownership' | 'lock' | 'fraud' | 'payment'

/** What counts as covering each topic. Diacritics folded (normalizeVN) so either spelling matches. */
const TOPIC_RE: Record<RiskTopic, RegExp> = {
  ownership: /so huu|nguon goc|chinh chu|sang ten|giay to|hoa don|\btrom\b|an cap|bao mat|\bimei\b|so khung|so may|ca vet|dang ky xe|\bserial\b|ownership|provenance|stolen|\btitle\b|registration/,
  lock: /\bkhoa\b|icloud|activation lock|tai khoan (?:apple|google|samsung|icloud|id)|apple id|\bfrp\b|\bmdm\b|tra gop|\bno\b.{0,15}(?:ngan hang|tra gop)|cam co|the chap|khoa tu xa|\blocked\b|\blien\b|financ(?:e|ing)|installment/,
  fraud: /lua dao|\bscam\b|\bcoc\b|dat coc|link la|link gia|nguoi la|bien mat|gia mao|re bat thuong|\bgia re\b.{0,20}(?:nghi|canh giac)|\bfraud\b|\bdeposit\b|too good to be true|\bfake\b/,
  // "gặp trực tiếp" alone is a section header on a cosmetic checklist ("Khi gặp trực tiếp: màn
  // hình, bàn phím…"); it counts only next to the act of paying.
  payment: /kiem tra .{0,25}xong moi (?:tra|thanh toan|chuyen|giao)|kiem tra .{0,30}truoc khi (?:tra|thanh toan|chuyen)|xem .{0,20}xong moi (?:tra|thanh toan)|tranh chuyen (?:tien|khoan) truoc|chuyen tien sau khi|chi chuyen (?:tien |khoan )?khi|thanh toan an toan|khong chuyen (?:tien|khoan) truoc|khong tra tien truoc|khong coc truoc|giu (?:lai )?(?:hoa don|bang chung|bien lai|tin nhan)|\bcod\b|tra tien (?:sau|khi|tai cho)|(?:gap truc tiep|gap mat).{0,50}(?:tra tien|thanh toan|chuyen tien|chuyen khoan)|(?:tra tien|thanh toan).{0,50}(?:gap truc tiep|gap mat)|meet in person.{0,60}pay|pay (?:only )?(?:after|when|once)|payment protection|don'?t pay upfront|escrow/,
}

export const SCAM_CHECKER_POINTER_RE = /Cảnh báo lừa đảo|Canh bao lua dao|Scam Shield/i

/**
 * THE FIXED BLOCK. One header, one line per risk topic, one pointer. The lines a reply already
 * covers are left out (so a reply that covered three topics gets one line, not four), and the
 * pointer is appended whenever the reply has no pointer of its own. Text is fixed and reviewed
 * (owner approval 2026-09-22); it names no product, no number, no threshold, and no phone
 * number or bank account.
 */
export const RISK_BLOCK = {
  vi: {
    header: '⚠️ Trước khi trả tiền, kiểm tra mấy điều này trước — tình trạng máy/xe/hàng xét sau:',
    lines: {
      ownership: '- **Quyền sở hữu & nguồn gốc:** hỏi giấy tờ / hóa đơn gốc, số serial hoặc số khung–số máy có khớp giấy tờ không, có sang tên / chuyển quyền được không. Không rõ nguồn gốc thì không mua.',
      lock: '- **Ràng buộc với chủ cũ:** tài khoản (Apple ID / Google / ứng dụng xe) phải được thoát và xóa ngay trước mặt bạn; hỏi thẳng có đang trả góp, cầm cố hay thế chấp không.',
      fraud: '- **Lừa đảo trong giao dịch:** không cọc trước cho người lạ, không bấm link thanh toán người bán gửi, cảnh giác giá rẻ bất thường và người bán hối chốt nhanh.',
      payment: '- **Cách trả tiền an toàn:** gặp trực tiếp, kiểm tra xong mới trả tiền, giữ lại hóa đơn / tin nhắn thỏa thuận làm bằng chứng.',
    } satisfies Record<RiskTopic, string>,
    pointer: 'Nếu mua từ người lạ hoặc qua group/chợ online: dán tin nhắn, link hoặc mã QR của người bán vào **Cảnh báo lừa đảo** trong TappyAI để kiểm tra trước khi chuyển tiền.',
    thresholdHedge: 'Các con số phần trăm / mốc nêu trên là kinh nghiệm chung, không phải số liệu từ nguồn đã tìm — dùng làm gợi ý, không phải ngưỡng cứng.',
  },
  en: {
    header: '⚠️ Before you pay, check these first — the condition of the item comes after:',
    lines: {
      ownership: '- **Ownership & provenance:** ask for the original receipt / papers, confirm the serial or frame/engine numbers match them, and that ownership can actually be transferred to you. No clear provenance, no purchase.',
      lock: '- **Ties to the previous owner:** every account (Apple ID / Google / vehicle app) must be signed out and removed in front of you; ask outright whether it is on instalments, pawned or used as collateral.',
      fraud: '- **Transaction fraud:** no deposit to a stranger, no tapping a payment link the seller sends, and be wary of an unusually low price or a seller pushing you to close fast.',
      payment: '- **Paying safely:** meet in person, pay only after you have checked everything, and keep the receipt / the chat as evidence.',
    } satisfies Record<RiskTopic, string>,
    pointer: 'Buying from a stranger or through a group / online marketplace? Paste the seller\'s message, link or QR code into **Cảnh báo lừa đảo** (Scam Shield) in TappyAI before you send any money.',
    thresholdHedge: 'The percentages / cut-offs above are general experience, not figures from a fetched source — treat them as guidance, not hard thresholds.',
  },
} as const

export interface RiskBackstopResult {
  text: string
  /** Topics the reply did not cover and that were appended. Empty when nothing was appended. */
  appended: RiskTopic[]
  pointerAppended: boolean
  /** Parentheticals carrying an unsourced numeric threshold that were removed. */
  thresholdsRemoved: number
  /** An inline threshold remained and the hedge line was appended. */
  thresholdHedged: boolean
}

/** Which of the four topics the reply covers. Reads prose only (markers stripped). */
export function coveredRiskTopics(reply: string): Set<RiskTopic> {
  const prose = normalizeVN(stripMarkers(reply).toLowerCase())
  const out = new Set<RiskTopic>()
  for (const topic of Object.keys(TOPIC_RE) as RiskTopic[]) if (TOPIC_RE[topic].test(prose)) out.add(topic)
  return out
}

function stripMarkers(t: string): string {
  return t
    .replace(/\[(CTA_BUTTONS|FOLLOWUPS|TAPPY_PLACES|TAPPY_PLAN|TAPPY_SHOPPING)\][\s\S]*?\[\/\1\]/g, '')
    .replace(/\[FOLLOWUPS\][^\n]*/g, '')
}

/**
 * A numeric threshold the model made up: a percentage or star cut-off with a comparator, a
 * "trở lên / ít nhất / tối thiểu" floor, or an "N-M tháng" warranty span. A percentage that merely
 * REPORTS ("46% khả năng mưa") is not a threshold; the comparator or floor word is what makes it one.
 */
const THRESHOLD_RE = /(?:[≥≤><]=?|tren|trên|duoi|dưới|hon|hơn|chenh|chênh|it nhat|ít nhất|toi thieu|tối thiểu|tu|từ)\s*\d+(?:[.,]\d+)?\s*(?:%|⭐|★|sao\b|stars?\b)|\d+(?:[.,]\d+)?\s*(?:%|⭐|★|sao)\s*(?:tro len|trở lên|or (?:more|higher|above))|(?:it nhat|ít nhất|toi thieu|tối thiểu|at least)\s*\d+\s*(?:danh gia|đánh giá|reviews?|thang|tháng|months?)|\d+\s*[-–]\s*\d+\s*(?:thang|tháng|months?)\s*(?:bao hanh|bảo hành|warranty)|(?:bao hanh|bảo hành|warranty)\s*(?:it nhat|ít nhất|at least)?\s*\d+\s*[-–]?\s*\d*\s*(?:thang|tháng|months?)/iu
const PAREN_WITH_THRESHOLD_RE = /\s*\((?:[^()\n]*?)(?:[≥≤><]=?|tren|trên|duoi|dưới|hon|hơn|chenh|chênh|it nhat|ít nhất|toi thieu|tối thiểu)\s*\d+(?:[.,]\d+)?\s*(?:%|⭐|★|sao\b|stars?\b)[^()\n]*\)|\s*\((?:[^()\n]*?)\d+(?:[.,]\d+)?\s*(?:%|⭐|★|sao)\s*(?:tro len|trở lên)[^()\n]*\)|\s*\((?:nen |nên )?[≥≤><]=?\s*\d+(?:[.,]\d+)?\s*%?\)/giu

/** The threshold half: drop threshold parentheticals; hedge whatever threshold remains inline. */
export function guardNumericThresholds(reply: string, lang: string, opts: { live?: boolean } = {}): { text: string; removed: number; hedged: boolean } {
  let removed = 0
  const prose = stripMarkers(reply)
  if (!THRESHOLD_RE.test(prose)) return { text: reply, removed: 0, hedged: false }
  // Live path: the text is already on the client, so nothing can be removed — hedge only.
  let text = opts.live ? reply : reply.replace(PAREN_WITH_THRESHOLD_RE, () => { removed++; return '' })
  const hedged = THRESHOLD_RE.test(stripMarkers(text))
  if (hedged) text = appendProse(text, (lang === 'en' ? RISK_BLOCK.en : RISK_BLOCK.vi).thresholdHedge, opts.live)
  return { text, removed, hedged }
}

/**
 * Append prose before the first structured block, so the client still finds its markers — or, on
 * the live path (the blocks are already on the wire), at the very end: the client's parsers find
 * a marker anywhere in the message, and prose after it is rendered as prose.
 */
function appendProse(text: string, extra: string, atEnd = false): string {
  const m = atEnd ? null : text.match(/\n*\[(?:CTA_BUTTONS|FOLLOWUPS|TAPPY_PLACES|TAPPY_PLAN|TAPPY_SHOPPING)\]/)
  const at = m && m.index !== undefined ? m.index : text.length
  const head = text.slice(0, at).replace(/\s+$/, '')
  const tail = text.slice(at)
  return `${head}\n\n${extra}${tail}`
}

/**
 * The backstop. Inert unless the thread is a second-hand purchase question. Appends only what is
 * missing, before the structured blocks; never removes model prose (the threshold half removes
 * parentheticals only).
 */
export function applyRiskBackstop(reply: string, userTexts: readonly string[], lang: string, opts: { thresholds?: boolean; live?: boolean } = {}): RiskBackstopResult {
  const none: RiskBackstopResult = { text: reply, appended: [], pointerAppended: false, thresholdsRemoved: 0, thresholdHedged: false }
  if (!reply || !isSecondHandPurchaseAdvice(userTexts)) return none
  const block = lang === 'en' ? RISK_BLOCK.en : RISK_BLOCK.vi
  let text = reply
  let thresholdsRemoved = 0
  let thresholdHedged = false
  if (opts.thresholds !== false) {
    const t = guardNumericThresholds(text, lang, { live: opts.live })
    text = t.text; thresholdsRemoved = t.removed; thresholdHedged = t.hedged
  }
  const covered = coveredRiskTopics(text)
  const missing = (Object.keys(block.lines) as RiskTopic[]).filter(t => !covered.has(t))
  const pointerAppended = !SCAM_CHECKER_POINTER_RE.test(stripMarkers(text))
  if (missing.length === 0 && !pointerAppended) return { ...none, text, thresholdsRemoved, thresholdHedged }
  const parts: string[] = []
  if (missing.length > 0) parts.push(block.header, ...missing.map(t => block.lines[t]))
  if (pointerAppended) parts.push(block.pointer)
  return { text: appendProse(text, parts.join('\n'), opts.live), appended: missing, pointerAppended, thresholdsRemoved, thresholdHedged }
}
