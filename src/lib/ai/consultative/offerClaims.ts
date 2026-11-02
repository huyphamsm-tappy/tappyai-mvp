// ── CONSULTATIVE_IN_AGENT — the reply only points at prices and buttons the FINAL output really has (Round 32, defect 2) ───────────────────────────────────
//
// Live 2026-10-12 (hotel, Đà Nẵng): the tool returned ten hotel rows with no price and no booking link; the engine's eight preliminary cards were then cleared (`luna_none`);
// and the reply still said "các mức tham khảo đi kèm danh sách khách sạn không xác nhận đúng ngày" and "xem giá theo ngày trên nút đặt phòng bên dưới". Nothing it pointed at existed.
//
// The check is made on what the user is actually given, not on a list of phrases the model once used:
//   · PRICE POINTER   a clause that presupposes reference prices / a price list are present ("mức giá tham khảo đi kèm", "bảng giá bên dưới", "the listed prices") while the final
//                     output states no price figure and no card carries a price → the clause goes. A clause that says there is NONE ("chưa có mức giá nào") stays.
//   · ACTION POINTER  a clause that sends the user to a button / link / card ("nút đặt phòng bên dưới", "bấm vào liên kết", "click the button below") while the final output has no card,
//                     no marker block and no link other than source lines → the clause goes.
// Only the offending CLAUSE (split at ; and dashes) is removed; nothing is written in its place unless the whole reply would be empty. Pure: no model, no I/O, no links are made.

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

const MARKER_BLOCK = /\[(FOLLOWUPS|CTA_BUTTONS|TAPPY_[A-Z_]+)\][\s\S]*?\[\/\1\]/g

// an element the reply can point at. "nút / thẻ / button / card" alone are ambiguous (quick-reply chips, "the"), so they need a transactional word too.
const LINK_NOUN = /(?<![\p{L}])(?:liên kết|đường dẫn|link|đường link|trang đặt)(?![\p{L}])|\b(?:lien ket|duong dan|duong link|link)\b/u
const UI_NOUN = /(?<![\p{L}])(?:nút|nút bấm|thẻ|button|card)(?![\p{L}])|\b(?:nut|button)\b/u
const TRANSACT = /\b(?:dat phong|dat ve|dat cho|dat xe|dat ban|dat ngay|booking|book|reserve|xem gia|gia phong|gia ve|gia|mua|thanh toan|price|prices|fare|fares|rate|rates)\b/
// "look at / use it" or "it is right here"
const ACTION_CUE = /\b(?:bam|nhan|click|tap|chon|mo|xem|dung|su dung|truy cap|vao|press|use|open|see|check|go to)\b/
const LOCATION_CUE = /\b(?:ben duoi|phia duoi|duoi day|o duoi|ngay duoi|ben canh|di kem|dinh kem|kem theo|ben tren|phia tren|o tren|below|underneath|attached|enclosed|above|here)\b/

const PRICE_TERM = /\b(?:muc gia|cac muc|nhung muc|muc tham khao|gia tham khao|bang gia|gia niem yet|gia phong|gia da ghi|nhung gia|cac gia|price list|reference prices?|listed prices?|the prices|prices listed|rates listed)\b/
const PRICE_ATTACH = /\b(?:di kem|kem theo|ben duoi|phia duoi|duoi day|o duoi|trong danh sach|tren the|trong ket qua|duoc liet ke|liet ke|ben tren|o tren|phia tren|nhu tren|da neu|dang hien thi|hien thi|co san|enclosed|attached|listed|below|above|shown|included)\b/
const PRICE_EXISTS = /\bco (?:cac |nhung |vai |mot so |it nhat mot )?(?:muc gia|muc tham khao|gia tham khao|bang gia)\b/
const NEGATOR = /\b(?:chua|khong|chang|thieu|ko|chua co|no|not|without|lack|lacks|missing)\b/

export interface OfferClaimContext {
  /** The final output states a price figure (text) or a card carries one. */
  hasPriceData: boolean
  /** The final output has something to press: a card, a marker block, a system / appendix link, or a link in the prose that is not a source line. */
  hasAction: boolean
  lang: string
}
export interface OfferClaimResult { text: string; removed: Array<{ kind: 'price' | 'action'; clause: string }> }

const SOURCE_LINE = /^\s*(?:nguồn|sources?|giá theo kết quả tìm kiếm của|prices as listed in the search results of)\b/i
const MD_LINK = /\]\(https?:\/\/[^)\s]+\)/

/** Does the prose itself carry a link the user can press that is not a "Nguồn:" style line? */
export function hasPressableLink(text: string): boolean {
  return text.replace(MARKER_BLOCK, '').split('\n').some(l => MD_LINK.test(l) && !SOURCE_LINE.test(l))
}

/** A card carries a price only through a snippet price or the provider's own price band (a level 1–4 is not a price statement). */
export function viewHasPrice(view: unknown): boolean {
  const items = (view as { items?: unknown } | null | undefined)?.items
  if (!Array.isArray(items)) return false
  return items.some(i => !!i && typeof i === 'object' && (!!(i as { priceSignal?: unknown }).priceSignal || !!(i as { priceRangeText?: unknown }).priceRangeText))
}

function classify(clause: string, ctx: OfferClaimContext): 'price' | 'action' | null {
  if (MD_LINK.test(clause)) return null // the clause carries a real link: it points at something that exists
  const o = clause.toLowerCase().normalize('NFC')
  const f = fold(clause)
  if (!ctx.hasAction) {
    const link = LINK_NOUN.test(o) || LINK_NOUN.test(f)
    const ui = UI_NOUN.test(o) || UI_NOUN.test(f)
    if ((link || (ui && TRANSACT.test(f))) && (LOCATION_CUE.test(f) || ACTION_CUE.test(f))) return 'action'
  }
  if (!ctx.hasPriceData) {
    const m = PRICE_TERM.exec(f)
    if (m) {
      const before = f.slice(Math.max(0, m.index - 40), m.index)
      const after = f.slice(m.index)
      if (!NEGATOR.test(before) && PRICE_ATTACH.test(after.slice(0, 90))) return 'price'
    }
    const e = PRICE_EXISTS.exec(f)
    if (e && !NEGATOR.test(f.slice(Math.max(0, e.index - 25), e.index + 3))) return 'price'
  }
  return null
}

/** Removes the clauses that point at a price or a button the final output does not have. */
export function dropUnbackedOfferClaims(text: string, ctx: OfferClaimContext): OfferClaimResult {
  if (!text || (ctx.hasAction && ctx.hasPriceData)) return { text, removed: [] }
  const blocks: string[] = []
  const masked = text.replace(MARKER_BLOCK, m => { blocks.push(m); return `⟦M${blocks.length - 1}⟧` })
  const removed: OfferClaimResult['removed'] = []
  const lines = masked.split('\n').map(line => {
    if (!line.trim() || SOURCE_LINE.test(line) || MD_LINK.test(line)) return line
    const parts = line.split(/(?<=[.!?…])(\s+)/) // sentence, separator, sentence …
    const out: string[] = []
    for (let i = 0; i < parts.length; i += 2) {
      const sentence = parts[i]
      const sep = parts[i + 1] ?? ''
      const m = /^(\s*)([\s\S]*?)([.!?…]*)(\s*)$/.exec(sentence)
      const lead = m?.[1] ?? '', body = m?.[2] ?? sentence, tail = m?.[3] ?? ''
      const clauses = body.split(/(\s*;\s*|\s+[—–]\s+)/) // clause, delimiter, clause …
      const keep: string[] = []
      let droppedFirst = false
      for (let c = 0; c < clauses.length; c += 2) {
        const kind = classify(clauses[c], ctx)
        if (kind) { removed.push({ kind, clause: clauses[c].trim() }); if (c === 0) droppedFirst = true; continue }
        keep.push(keep.length === 0 ? clauses[c] : (clauses[c - 1] ?? '') + clauses[c])
      }
      if (keep.length === 0) { out.push(''); continue } // whole sentence gone (and its separator)
      let joined = keep.join('')
      if (droppedFirst) joined = joined.replace(/^\s+/, '').replace(/^\p{Ll}/u, ch => ch.toUpperCase())
      out.push(`${lead}${joined}${tail}${sep}`)
    }
    return out.join('').replace(/\s+$/, '')
  })
  let result = lines.join('\n').replace(/⟦M(\d+)⟧/g, (_m, n: string) => blocks[Number(n)] ?? '')
  if (!removed.length) return { text, removed: [] }
  result = result.replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '')
  if (!/[\p{L}\p{N}]/u.test(result.replace(MARKER_BLOCK, ''))) {
    const note = ctx.lang === 'en' ? 'I don\'t have a verified price or booking link for this request.' : 'Mình chưa có giá hoặc liên kết đã kiểm chứng cho yêu cầu này.'
    result = result.trim() ? `${note}\n\n${result.trim()}` : note
  }
  return { text: result, removed }
}

