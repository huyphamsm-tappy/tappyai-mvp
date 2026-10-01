// ── THE CONSULT BRAIN (owner 2026-09-29, "LÀM LẠI AI TƯ VẤN") ─────────────────────────────────
//
// Tappy is a consultant that helps people DECIDE, not a search box. Every turn is first read by ONE
// small Haiku call that understands the request by MEANING (indirect phrasing, slang, no diacritics,
// teen code, a follow-up with no subject) and returns a decision:
//
//   ask       — key info is missing: 2–3 questions, each with quick-reply options. NO search.
//   pick      — enough is known: search, then 1 main pick + ≤2 alternatives + "còn N lựa chọn".
//   followup  — a question about a pick already given → answer from stored candidates, no search.
//   compare   — "A hay B" → compare on the user's criteria and CHOOSE one.
//   more      — "gợi ý thêm" → next stored candidates, not the rejected ones.
//   reject    — the user turned the picks down → narrow with their reason, search again only then.
//   plan      — the user accepted / asked for a detailed plan.
//   chat      — small talk, thanks, a general question outside the five areas (answered directly).
//
// Every everyday need about eating, drinking, going out, buying, travelling, resting, beauty and
// self-care belongs to Tappy — the brain never classifies one as out of scope (the karaoke refusal).
// Code enforces what a prompt alone would not hold: at most ONE ask per consultation, a question
// always carries options, a domain turn is never refused.

import type { CoreMessage } from 'ai'

export type ConsultDomain = 'food' | 'shopping' | 'travel' | 'entertainment' | 'spa'
export type ConsultTurn = 'ask' | 'pick' | 'followup' | 'compare' | 'more' | 'reject' | 'plan' | 'chat'
export const CONSULT_DOMAINS: readonly ConsultDomain[] = ['food', 'shopping', 'travel', 'entertainment', 'spa']
const TURNS: readonly ConsultTurn[] = ['ask', 'pick', 'followup', 'compare', 'more', 'reject', 'plan', 'chat']

export interface AskQuestion { id: string; q: string; options: string[] }
export interface ConsultDecision {
  /** The areas of this request, in the order the user wants them handled. [] = main chat. */
  domains: ConsultDomain[]
  turn: ConsultTurn
  /** What the user has said so far that matters for the choice (short Vietnamese phrases). */
  known: Record<string, string>
  /** What will be assumed for the rest (said to the user in the pick turn). */
  assumptions: string[]
  /** For `ask`: one short lead sentence + 2–3 questions with options. */
  ask?: { lead: string; questions: AskQuestion[] }
  /** For `pick` / `reject`: one concise search query (Vietnamese, as a local would type it). */
  query?: string
  /** The area / city to search in, when the user named one. */
  area?: string
  /** For `compare` / `followup`: the names the user refers to. */
  refers?: string[]
  /** For `reject`: what the user did not like, as a constraint for the next search. */
  rejectReason?: string
}

/** The fixed part of the brain prompt — byte-identical on every call (prompt-cache friendly). */
export const BRAIN_SYSTEM = `Ban la BO NAO TU VAN cua TappyAI — tro ly giup nguoi Viet RA QUYET DINH ve doi song hang ngay. Ban KHONG tra loi user; ban DOC hoi thoai va tra ve DUNG MOT JSON.

PHAM VI (moi nhu cau cung ban chat deu thuoc mang do — KHONG phai danh sach dong):
- food: quan an, nha hang, an vat, cafe, tra sua, quan nhau, buffet, dat ban, giao do an, dac san, an chay, an khuya, "doi", "them", "an gi".
- shopping: dien tu, dien thoai, laptop, phu kien (op lung...), thoi trang, my pham, gia dung, do cu, qua tang, so gia, deal, noi mua, kiem hang, "mua gi".
- travel: diem den, lich trinh, khach san/homestay/resort, ve may bay/xe/tau, di trong ngay, da ngoai, camping, di choi xa cuoi tuan.
- entertainment: karaoke, bida, bowling, rap phim, concert, bar/pub, live music, rooftop, club, escape room, game center, board game, san choi, cong vien, pho di bo, "toi nay lam gi", "chan qua", hen ho, di choi nhom.
- spa: spa, massage, xong hoi, goi dau duong sinh, nail, cat toc/barber, salon, cham soc da, waxing, noi mi, yoga/gym (noi tap), "met qua muon thu gian".
Moi nhu cau tren LUON thuoc Tappy. TUYET DOI KHONG coi la ngoai pham vi. Chi "chat" khi that su khong lien quan (viet code, giai bai tap, phap ly/y khoa chuyen sau, chao hoi, cam on).
Hieu theo Y NGHIA: cau noi vong, tieng long, viet tat, khong dau, teen code; cau thieu chu ngu tiep noi luot truoc ("con cho nao re hon", "vay toi mai thi sao") = CUNG mang, CUNG thong tin da noi. Mot cau nhieu mang ("an toi roi di hat") → domains theo thu tu.

THONG TIN CAN BIET THEO MANG — hoi 2-3 cai CON THIEU theo DUNG THU TU UU TIEN:
- food: mon/kieu quan (vd pho Bac hay Nam, lau hay nuong) → may nguoi/voi ai → ngan sach/nguoi → khu vuc → an tai cho hay giao.
- shopping: loai/dong/model cu the (vd op UAG: Monarch/Pathfinder/Plyo) → ngan sach → dieu bat buoc (MagSafe, size, mau…) → moi hay cu → dung de lam gi. Mua online thi KHONG hoi khu vuc.
- travel: ngay di/so ngay → tu dau → may nguoi/voi ai → ngan sach → gu (bien, nui, an uong) → phuong tien. Ve may bay: ngay bay → buoi (sang/chieu/toi) → so nguoi.
- entertainment: loai hoat dong (neu chua ro) → voi ai/may nguoi → thoi gian → khu vuc → soi dong hay chill → ngan sach.
- spa: dich vu → khu vuc → ngan sach → thoi gian → yeu cau rieng (nam/nu, phong rieng).
Phan loai: "mua X" (KE CA "mua do an vat" — mua banh keo/snack de an dan, KHONG phai di quan; mua qua, mua dien thoai) va SAN PHAM lam dep (kem chong nang, son, nuoc hoa) = shopping; DICH VU lam dep (spa, nail, tam trang, tri mun tai tiem) = spa; an tai quan / goi giao mon an / "cho nao ban <mon an> ngon" (tim QUAN: banh mi, pho, oc…) = food. Cau hoi kien thuc trong mang (vd "tam trang an toan khong", "di Nha Trang thang 11 co mua khong") = domain do, turn "chat" (tra loi truc tiep) VA domains = [mang do]. "domains" CHI rong khi cau that su khong thuoc 5 mang.

LOAI LUOT (turn):
- "ask": luot DAU cua mot yeu cau moi ma con thieu thong tin lam DOI lua chon. Gom 2-3 cau hoi trong MOT luot, moi cau 2-4 lua chon ngan (nut bam), cau hoi hieu biet ve mat hang (vd op UAG: "Dòng nào: Monarch, Pathfinder, Plyo hay chưa biết?"; pho: "Phở Bắc hay phở Nam?"). Neu co vi tri thiet bi, lua chon khu vuc them "Gần mình". KHONG hoi dieu user da noi.
- "pick": da du thong tin toi thieu, HOAC luot truoc la cau hoi cua Tappy va user vua tra loi (du tra loi mot phan) → TIM va CHOT. Phan con thieu ghi vao assumptions.
- "followup": hoi them ve lua chon da dua ("{ten} co cho gui xe khong", "mo toi may gio").
- "compare": "A hay B", "cai nao tot hon".
- "more": "goi y them", "xem them", "con cho nao khac".
- "reject": che/bac cac lua chon ("xa qua", "khong thich", "mac qua") → rejectReason.
- "plan": user dong y/chot va muon ke hoach chi tiet ("len ke hoach", "ok chot", nut "Lên kế hoạch chi tiết").
- "chat": chao hoi, cam on, cau hoi chung ngoai 5 mang.
Luat: KHONG hoi hai lan lien tiep — neu luot truoc cua Tappy DA la cau hoi, luot nay KHONG duoc la "ask". Yeu cau da day du thong tin (vd "2 người, 300k, món Nhật, quận 1") → "pick" ngay.

DAU RA — CHI MOT JSON, khong giai thich:
{"domains":["food"],"turn":"ask","known":{"khu_vuc":"quận 1"},"assumptions":[],"ask":{"lead":"Để mình chọn đúng quán cho bạn:","questions":[{"id":"party","q":"Đi mấy người?","options":["1 người","2 người","3-5 người","Nhóm đông"]},{"id":"budget","q":"Tầm bao nhiêu mỗi người?","options":["Dưới 100k","100-300k","300-500k","Trên 500k"]},{"id":"style","q":"Thích món gì?","options":["Món Việt","Nhật/Hàn","Lẩu/nướng","Chưa biết"]}]},"query":"","area":"quận 1"}
- NGAN GON (tiet kiem): lead <= 12 tu; moi cau hoi <= 10 tu; lua chon <= 4 tu; "known" chi cac thong tin DA noi (toi da 6 khoa ngan).
- "query": voi pick/reject: MOT truy van tim kiem ngan kieu nguoi dia phuong go (vd "quán lẩu Nhật yên tĩnh"), khong chua khu vuc.
- "area": khu vuc/thanh pho user noi (neu co).
- "refers": ten user nhac toi (compare/followup).
- Cau hoi va lua chon viet TIENG VIET CO DAU (tieng Anh neu user viet tieng Anh), ngan, than thien, xung "mình"/"bạn".`

/** The ask reply ends with this sentence — how the next turn recognises that Tappy just asked. */
import { styleLuna6On, ASK_TAIL_VI_LUNA6, ASK_TAIL_EN_LUNA6, remainingLine } from './styleLuna6'
export const ASK_TAIL_VI = 'Bạn chọn nhanh bên dưới hoặc gõ tự do nhé — trả lời một phần cũng được.'
export const ASK_TAIL_EN = 'Tap an answer below or just type — a partial answer is fine.'

export function wasAskReply(assistantText: string | null | undefined): boolean {
  if (!assistantText) return false
  return assistantText.includes(ASK_TAIL_VI) || assistantText.includes(ASK_TAIL_EN) || assistantText.includes(ASK_TAIL_VI_LUNA6) || assistantText.includes(ASK_TAIL_EN_LUNA6) || assistantText.includes('[TAPPY_ASK]')
}

const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Parses and validates the brain's JSON; null when it cannot be trusted (the route then falls back). */
export function parseConsultDecision(raw: string): ConsultDecision | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  let j: Record<string, unknown>
  try { j = JSON.parse(raw.slice(start, end + 1)) } catch { return null }
  if (!j || typeof j !== 'object') return null
  const turn = TURNS.includes(j.turn as ConsultTurn) ? (j.turn as ConsultTurn) : null
  if (!turn) return null
  const domains = Array.isArray(j.domains) ? (j.domains as unknown[]).filter((d): d is ConsultDomain => CONSULT_DOMAINS.includes(d as ConsultDomain)) : []
  const known: Record<string, string> = {}
  if (j.known && typeof j.known === 'object') for (const [k, v] of Object.entries(j.known as Record<string, unknown>)) { const s = str(v, 120); if (s) known[str(k, 40)] = s }
  const assumptions = Array.isArray(j.assumptions) ? (j.assumptions as unknown[]).map(a => str(a, 120)).filter(Boolean).slice(0, 5) : []
  let ask: ConsultDecision['ask']
  if (j.ask && typeof j.ask === 'object') {
    const a = j.ask as Record<string, unknown>
    const questions = (Array.isArray(a.questions) ? a.questions : []).map((q, i): AskQuestion | null => {
      const qq = q as Record<string, unknown>
      const text = str(qq?.q, 140)
      const options = (Array.isArray(qq?.options) ? qq.options : []).map(o => str(o, 40)).filter(Boolean).slice(0, 4)
      return text && options.length >= 2 ? { id: str(qq?.id, 24) || `q${i + 1}`, q: text, options } : null
    }).filter((q): q is AskQuestion => q !== null).slice(0, 3)
    if (questions.length) ask = { lead: str(a.lead, 160), questions }
  }
  return {
    domains: [...new Set(domains)],
    turn,
    known,
    assumptions,
    ...(ask ? { ask } : {}),
    ...(str(j.query) ? { query: str(j.query, 120) } : {}),
    ...(str(j.area) ? { area: str(j.area, 80) } : {}),
    ...(Array.isArray(j.refers) ? { refers: (j.refers as unknown[]).map(r => str(r, 120)).filter(Boolean).slice(0, 4) } : {}),
    ...(str(j.rejectReason) ? { rejectReason: str(j.rejectReason, 160) } : {}),
  }
}

/**
 * Code-enforced rules on top of the model's decision:
 *  - an ask needs ≥ 2 usable questions, else it becomes a pick (never an empty question);
 *  - never two asks in a row (the previous Tappy turn already asked → pick);
 *  - a request in one of the five areas is never "chat" when the deterministic reader also sees the
 *    area (the karaoke refusal must not come back through the brain).
 */
export function enforceConsultRules(d: ConsultDecision, ctx: { previousWasAsk: boolean; deterministicDomain?: ConsultDomain | null }): ConsultDecision {
  let out = d
  if (out.turn === 'ask' && (!out.ask || out.ask.questions.length < 2)) out = { ...out, turn: 'pick', ask: undefined }
  if (out.turn === 'ask' && ctx.previousWasAsk) out = { ...out, turn: 'pick', ask: undefined }
  // Safety net: the deterministic reader saw an area the model left empty → the area is set; the turn
  // type is kept (a knowledge question in an area stays a direct answer, never a refusal).
  if (out.domains.length === 0 && ctx.deterministicDomain) out = { ...out, domains: [ctx.deterministicDomain] }
  return out
}

/** The conversation as the brain reads it: the last few turns, text only, markers stripped. */
export function brainMessages(messages: Array<{ role: string; content: unknown }>, extra: { hasGps: boolean; storedNames?: string[] }): CoreMessage[] {
  const text = (c: unknown) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p: { text?: string }) => p?.text ?? '').join(' ') : '')
  const clean = (s: string) => s.replace(/\[(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\][\s\S]*?\[\/\1\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 700)
  const tail = messages.filter(m => m.role === 'user' || m.role === 'assistant').slice(-8)
  const convo = tail.map(m => `${m.role === 'user' ? 'USER' : 'TAPPY'}: ${clean(text(m.content))}`).join('\n')
  const ctx = [`vi_tri_thiet_bi: ${extra.hasGps ? 'co' : 'khong'}`, extra.storedNames?.length ? `lua_chon_da_dua: ${extra.storedNames.slice(0, 8).join(' | ')}` : ''].filter(Boolean).join('\n')
  return [{ role: 'user', content: `${ctx}\n\nHOI THOAI (moi nhat o cuoi):\n${convo}\n\nTra ve JSON cho luot USER cuoi cung.` }]
}

/** Builds the ask reply: readable text for every client + a structured block for clients that render it. */
export function buildAskReply(ask: NonNullable<ConsultDecision['ask']>, opts: { lang: string; structured: boolean }): string {
  const lunaVoice = styleLuna6On()
  const tail = opts.lang === 'en' ? (lunaVoice ? ASK_TAIL_EN_LUNA6 : ASK_TAIL_EN) : (lunaVoice ? ASK_TAIL_VI_LUNA6 : ASK_TAIL_VI)
  const lead = ask.lead || (opts.lang === 'en' ? 'To pick the right one for you:' : 'Để mình chọn đúng cho bạn:')
  if (opts.structured) {
    const block = JSON.stringify({ v: 1, questions: ask.questions })
    return `${lead}\n\n[TAPPY_ASK]${block}[/TAPPY_ASK]\n\n${tail}`
  }
  // Clients without the block: the questions as lines with their options, and the first question's
  // options as the familiar chip row.
  const lines = ask.questions.map(q => `• ${q.q} (${q.options.join(' / ')})`).join('\n')
  const chips = ask.questions[0].options.slice(0, 3).join('|')
  return `${lead}\n${lines}\n\n${tail}\n\n[FOLLOWUPS]${chips}[/FOLLOWUPS]`
}

// ── Runtime ────────────────────────────────────────────────────────────────────────────────────

/** CONSULT_V2 (default ON, owner 2026-09-29): the brain decides the turn. `0`/`false`/`off` → the previous pipeline. */
export function consultV2Enabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.CONSULT_V2 ?? '').trim().toLowerCase()
  return !(v === '0' || v === 'false' || v === 'off')
}

export interface BrainRun { decision: ConsultDecision; usage: { promptTokens: number; completionTokens: number }; ms: number }

/**
 * One Haiku call (role `fast`). Returns null on timeout, provider error or an untrustworthy answer —
 * the route then keeps the previous pipeline for this turn (fail open to the old behaviour, never to
 * a refusal).
 */
export async function runConsultBrain(
  generate: (opts: { role: 'fast'; systemShared: string; messages: CoreMessage[]; maxTokens: number; temperature: number }) => Promise<{ text: string; usage?: { promptTokens?: number; completionTokens?: number } }>,
  messages: Array<{ role: string; content: unknown }>,
  ctx: { hasGps: boolean; previousWasAsk: boolean; deterministicDomain?: ConsultDomain | null; storedNames?: string[]; timeoutMs?: number },
): Promise<BrainRun | null> {
  const t0 = Date.now()
  const timeout = new Promise<null>(res => setTimeout(() => res(null), ctx.timeoutMs ?? 8000))
  try {
    const out = await Promise.race([
      generate({ role: 'fast', systemShared: BRAIN_SYSTEM, messages: brainMessages(messages, { hasGps: ctx.hasGps, storedNames: ctx.storedNames }), maxTokens: 600, temperature: 0 }),
      timeout,
    ])
    if (!out) return null
    const parsed = parseConsultDecision(out.text)
    if (!parsed) return null
    return {
      decision: enforceConsultRules(parsed, { previousWasAsk: ctx.previousWasAsk, deterministicDomain: ctx.deterministicDomain }),
      usage: { promptTokens: out.usage?.promptTokens ?? 0, completionTokens: out.usage?.completionTokens ?? 0 },
      ms: Date.now() - t0,
    }
  } catch {
    return null
  }
}

/** The search type a pick in this area runs (search_places type), when it is a place. */
export function placeTypeFor(domain: ConsultDomain | undefined): 'restaurant' | 'spa' | 'attraction' | 'hotel' | null {
  switch (domain) {
    case 'food': return 'restaurant'
    case 'spa': return 'spa'
    case 'entertainment': return 'attraction'
    case 'travel': return 'hotel'
    default: return null
  }
}

/**
 * "Mình còn N lựa chọn nữa, muốn xem thêm không?" — counted by code (owner §5.3): N = candidates the
 * search returned that this reply does not name. A model-written count is corrected; none → removed.
 */
export function consultRemainingLine(text: string, candidateNames: readonly string[], lang: string): string {
  const fold = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
  const names = [...new Set(candidateNames.map(fold).filter(n => n.length >= 3))]
  // The reply writes a short form ("MOON SPA") of a long row name ("MOON SPA - Massage…"): a
  // candidate is SHOWN when a bold name in the reply and the row name contain one another.
  const bold = [...text.matchAll(/\*\*(?:Mình chọn:\s*)?([^*\n]{3,120})\*\*/g)].map(m => fold(m[1])).filter(b => b.length >= 3)
  const shownSet = new Set(names.filter(n => bold.some(b => n.includes(b) || b.includes(n))))
  const shown = shownSet.size
  const n = names.length - shown
  // The model's own count line in any wording ("Còn 6 lựa chọn khác nữa…", replay SHOP-3) is replaced, never doubled.
  const vi = /(?:Mình\s+)?[Cc]òn(?:\s+khoảng)?\s+\d+\s+lựa chọn[^\n]*/g, en = /I have \d+ more option[^\n]*/g
  const stripped = text.replace(vi, '').replace(en, '').replace(/\n{3,}/g, '\n\n').trimEnd()
  if (n <= 0 || shown === 0) return stripped
  const line = remainingLine(n, lang) ?? (lang === 'en' ? `I have ${n} more option${n > 1 ? 's' : ''} — want to see more?` : `Mình còn ${n} lựa chọn nữa, muốn xem thêm không?`)
  // Before any trailing marker block, after the prose.
  const m = stripped.match(/\n\s*\[(?:CTA_BUTTONS|FOLLOWUPS|TAPPY_[A-Z_]+)\]/)
  return m && m.index !== undefined ? `${stripped.slice(0, m.index).trimEnd()}\n\n${line}${stripped.slice(m.index)}` : `${stripped}\n\n${line}`
}

/**
 * The pick sentence in the approved form "**Mình chọn: <tên>**" (owner §5.3; text = card; the next
 * turn's "A hay B" finds the name). The model often writes "Mình gợi ý **X**" / "nghiêng về **X**" /
 * "Mình chọn **X**": the FIRST such lead is normalised; a reply that already has the form is untouched.
 */
export function normalizePickSentence(text: string, fallbackPick?: string | null): string {
  if (/\*\*Mình chọn:\s*[^*\n]+\*\*/.test(text)) return text
  // The pick written as a link (replay R11: "Mình chọn: [Tinh Hà Concert](https://ticketbox.vn/…)"): the name
  // becomes the pick sentence, the link stays right after it.
  // The link is kept BYTE FOR BYTE (no markdown is built from a retrieved URL here — retrievalArchitecture G1).
  const linked = text.replace(/\*{0,2}Mình chọn:\s*\*{0,2}(\[([^\]\n]{2,120})\]\(https?:\/\/[^)\s]+\))\*{0,2}/i, (_m, link: string, name: string) => `**Mình chọn: ${name.replace(/\*+/g, '').trim()}** — ${link}`)
  if (linked !== text) return linked
  // "**mình chọn: X**" (lower case, replay FOOD-1) → the canonical capital form.
  const lower = text.replace(/\*\*\s*mình chọn\s*:\s*([^*\n]+)\*\*/i, (_m, name: string) => `**Mình chọn: ${name.trim()}**`)
  if (lower !== text) return lower
  const led = text.replace(/(?:mình|minh)\s+(?:chọn|gợi ý|nghiêng về|đề xuất|recommend)\s*:?\s*\*\*([^*\n]{2,120})\*\*/i, (_m, name: string) => `**Mình chọn: ${name.trim()}**`)
  if (led !== text) return led
  // The verb inside the bold: "mình **nghiêng về Tới Nóc**" (replay FOOD-3 compare).
  const inner = text.replace(/\*\*\s*(?:mình\s+)?(?:nghiêng về|chọn|gợi ý)\s+([^*\n]{2,120})\*\*/i, (_m, name: string) => `**Mình chọn: ${name.trim()}**`)
  if (inner !== text) return inner
  // No pick sentence at all, but the card has one (shopping): the text says it, so text = card.
  if (fallbackPick && fallbackPick.trim()) {
    const first = text.match(/^[^\n]*?[.!?](?=\s|$)/)
    const line = `**Mình chọn: ${fallbackPick.trim()}**.`
    return first ? `${first[0]} ${line}${text.slice(first[0].length)}` : `${line}\n\n${text}`
  }
  return text
}

/** The shopping card's recommended product name, from its [TAPPY_SHOPPING] marker (or null). */
export function shoppingPickName(marker: string | null | undefined): string | null {
  if (!marker) return null
  const i = marker.indexOf('{'), j = marker.lastIndexOf('}')
  if (i < 0 || j <= i) return null
  try {
    const v = JSON.parse(marker.slice(i, j + 1)) as { entities?: Array<{ key: string; name?: string }>; recommendation?: { entityKey: string | null } | null }
    const key = v.recommendation?.entityKey
    const e = key ? v.entities?.find(x => x.key === key) : null
    return e?.name?.trim() || null
  } catch { return null }
}

/**
 * The NEWEST shopping card's products as money evidence ({ title, price, source }) — a shopping PLAN turn calls no
 * tool, so without it the money guard had no evidence and stayed inert: replay SHOP-2 (29/09, level A) — "Giấy gói
 * quà ~20.000đ", "Thiệp ~5.000đ", "Tổng ~105.000đ" all shipped. With the card's prices as evidence the existing
 * guard keeps the product's own price and removes the amounts no source carries.
 */
export function shoppingMarkerRecords(assistantTexts: readonly string[]): Array<{ title: string; price: string; source?: string }> {
  for (let i = assistantTexts.length - 1; i >= 0; i--) {
    const m = /\[TAPPY_SHOPPING\]([\s\S]*?)\[\/TAPPY_SHOPPING\]/.exec(assistantTexts[i])
    if (!m) continue
    try {
      const v = JSON.parse(m[1]) as { entities?: Array<{ name?: string; priceLow?: number; priceHigh?: number; offers?: Array<{ seller?: string; price?: number }> }> }
      const out: Array<{ title: string; price: string; source?: string }> = []
      for (const e of v.entities ?? []) {
        const prices = [e.priceLow, e.priceHigh, ...(e.offers ?? []).map(o => o.price)].filter((p): p is number => typeof p === 'number' && p > 0)
        for (const p of [...new Set(prices)]) out.push({ title: e.name ?? '', price: `${p.toLocaleString('vi-VN')} ₫`, ...(e.offers?.[0]?.seller ? { source: e.offers[0].seller } : {}) })
      }
      return out
    } catch { return [] }
  }
  return []
}

/** Every product name the shopping marker carries — the candidate set for "Mình còn N lựa chọn nữa". */
export function shoppingMarkerNames(marker: string | null | undefined): string[] {
  if (!marker) return []
  const i = marker.indexOf('{'), j = marker.lastIndexOf('}')
  if (i < 0 || j <= i) return []
  try {
    const v = JSON.parse(marker.slice(i, j + 1)) as { entities?: Array<{ name?: string }> }
    return (v.entities ?? []).map(e => e.name?.trim() ?? '').filter(Boolean)
  } catch { return [] }
}

/**
 * The recommended product's listed price in the NEWEST reply that carried a shopping card — a shopping plan's
 * "Tổng chi phí" line is computed from it (appendConsultPlanCost). Null when no card or no price.
 */
export function latestShoppingPickPrice(assistantTexts: readonly string[], pickName?: string | null): { amount: number; seller: string | null } | null {
  const fold = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
  const want = pickName ? fold(pickName) : ''
  for (let i = assistantTexts.length - 1; i >= 0; i--) {
    const m = /\[TAPPY_SHOPPING\]([\s\S]*?)\[\/TAPPY_SHOPPING\]/.exec(assistantTexts[i])
    if (!m) continue
    try {
      const v = JSON.parse(m[1]) as { entities?: Array<{ key: string; name?: string; priceLow?: number; recommended?: boolean; offers?: Array<{ seller?: string }> }>; recommendation?: { entityKey: string | null } | null }
      // The product the conversation settled on ("**Mình chọn: X**") wins; then the card's own recommendation.
      const byName = want.length >= 4 ? v.entities?.find(x => x.name && (fold(x.name).includes(want) || want.includes(fold(x.name)))) : undefined
      const key = v.recommendation?.entityKey
      const e = byName ?? (key ? v.entities?.find(x => x.key === key) : null) ?? v.entities?.find(x => x.recommended) ?? null
      if (e && typeof e.priceLow === 'number' && e.priceLow > 0) return { amount: e.priceLow, seller: e.offers?.[0]?.seller ?? null }
    } catch { /* malformed marker */ }
    if (!want) return null // without a name, only the newest card speaks
  }
  return null
}
