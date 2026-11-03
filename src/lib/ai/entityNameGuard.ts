// ── Phase 8 — ENTITY NAME GROUNDING (UAT-10 defect: a bold product name that no evidence of the turn supports) ───────────────
//
// Measured (uat10-e2e-answer-first-2026-10-09): the reply set "Galaxy S26 Ultra" (in a retrieved snippet) beside "iPhone 18 Pro Max" (the
// results only had "iPhone 18 Pro"), hedged as a "representative pair". The No-Fabrication Gate judges numbers and claims, not names, so
// the model name passed. This is the deterministic name check, the same family as the gate: pure, no model, no network.
//
// WHAT IT CHECKS — a bold run (the reply's convention for naming an option) that LOOKS LIKE A MODEL NAME: 2–6 words, at least one word
// with a digit, at least one real word; money amounts, units, ordinals/labels ("Ngày 2", "Top 3", "Bước 1") and anything with a colon
// are not names. Brand-only or digit-free names are out of scope (places have their own guards; precision over recall: a false hit would
// annotate a legitimate name).
// WHAT COUNTS AS EVIDENCE — the turn's tool results, pages read, the DATA context Luna was given, earlier replies and the user's own
// words, compared as folded word sequences (diacritics/case/punctuation ignored). A name is supported when its word sequence occurs
// there, also without a leading brand word ("Samsung Galaxy S26 Ultra" ← "Galaxy S26 Ultra") and without trailing capacity words
// ("… 256GB"). It is NOT supported by a longer/shorter different model ("iPhone 18 Pro Max" ≠ "iPhone 18 Pro", "iPhone 17 Pro Max").
// WHAT IT DOES — never deletes advice: the unsupported name is un-bolded and followed by one short disclosure. Nothing is checked
// when the turn had no tool result (nothing to check against), so stable-knowledge answers are untouched.

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
const words = (s: string) => fold(s).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
const decode = (t: string) => (t.includes('\\u') ? t.replace(/\\u([0-9a-fA-F]{4})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16))) : t)

const UNIT = /^(?:\d+)?(?:mah|gb|tb|mb|mp|hz|mm|cm|kg|inch|in|w|wh|v|k|tr|trieu|ty|vnd|usd|d|do|nam|thang|ngay|tuan|gio|phut|giay|lan|nguoi|sao|km|m)$/
const LABEL_FIRST = new Set(['ngay', 'buoc', 'top', 'phan', 'muc', 'option', 'step', 'day', 'tuan', 'thang', 'nam', 'quy', 'goi', 'loai', 'luu', 'y', 'cach', 'diem', 'hang', 'dem', 'khoang', 'tu', 'den', 'trong'])

/** True when a bold run reads as a product/model name worth grounding. */
export function looksLikeModelName(bold: string): boolean {
  const raw = bold.trim()
  if (raw.length < 5 || raw.length > 60 || /[:：]/.test(raw)) return false
  const w = words(raw)
  if (w.length < 2 || w.length > 6) return false
  if (LABEL_FIRST.has(w[0])) return false
  if (!w.some(x => /\d/.test(x))) return false
  const real = w.filter(x => /[a-z]{3,}/.test(x) && !UNIT.test(x))
  if (real.length < 1) return false
  // a number plus a unit or currency word is an amount, not a model: "20 triệu", "5000mAh", "12 tháng"
  if (w.every(x => /\d/.test(x) || UNIT.test(x))) return false
  return true
}

// ── CONSULT_LUNA_ONE (`strictModelNames`): a POSITIVE definition of a model name ─────────────────────────────────────────────────
//
// 🚨 Measured (live baseline 2026-10-14, fixtures P1 / S2.1): "**Thứ tư 21/10**" and "**SSD từ 512 GB**" were labelled "(mình chưa thấy tên này
// trong nguồn đã tra)". The root cause is the SHAPE of `looksLikeModelName`: any bold run with a digit and one real word is a "name", and
// only the shapes someone already met are excluded (amounts, units, a few labels). Every new shape — a date, a spec, a time range, a
// district — becomes a false "name" and gets a nonsense annotation. Under the flag a run is a model name only when it HAS a model number:
//   · a token that mixes letters and digits and is not a quantity ("S26", "WH-1000XM5", "HD9200", "i7" — not "512GB", "5L", "21h"), or
//   · a stand-alone number right after a name word: a capitalised / camel-case word that is not a calendar, address or label noun
//     ("iPhone 17", "Pixel 10 Pro", "SJC 9999", "Aspire Lite 14" — not "Quận 3", "Thứ 2", "Tầng 5"), and not followed by a unit ("RAM 16 GB").
// Dates, times and numeric ranges are never names. Everything `looksLikeModelName` rejects stays rejected.
const DATE_TIME_RANGE = /(?<![\p{L}\d])\d{1,2}\s*[/.]\s*\d{1,2}(?:\s*[/.]\s*\d{2,4})?(?![\p{L}\d])|(?<![\p{L}\d])\d{1,2}\s*[:h]\s*\d{2}(?!\d)|\d\s*[–—-]\s*\d/u
const QUANTITY_TOKEN = /^\d+(?:[.,]\d+)?(?:gb|tb|mb|mah|wh|w|v|hz|khz|mhz|ghz|mm|cm|km|m|kg|g|l|ml|inch|in|k|tr|d|đ|h|p|x|%|mp)$/i
const NOUN_BEFORE_NUMBER = new Set(['quan', 'phuong', 'thu', 'thang', 'nam', 'ngay', 'tang', 'lau', 'phong', 'so', 'hem', 'kiet', 'duong', 'chuong', 'phan', 'bai', 'lop', 'khoi', 'tuan', 'gio', 'phut', 'ban', 'toa', 'block', 'cong', 'ga', 'ben', 'khu', 'hang', 'top', 'buoc', 'muc', 'day', 'step', 'week', 'room', 'floor', 'level', 'district', 'ward', 'no', 'part', 'chapter', 'tap', 'season', 'mua', 'version', 'phien', 'ban'])
const UNIT_WORD = new Set(['gb', 'tb', 'mb', 'mah', 'w', 'wh', 'hz', 'mm', 'cm', 'kg', 'g', 'l', 'lit', 'ml', 'inch', 'in', 'nguoi', 'ngay', 'dem', 'trieu', 'k', 'd', 'dong', 'vnd', 'usd', 'gio', 'phut', 'km', 'm', 'sao', 'lan'])

export function looksLikeModelNameStrict(bold: string): boolean {
  if (!looksLikeModelName(bold)) return false
  if (DATE_TIME_RANGE.test(bold)) return false
  const toks = bold.trim().split(/\s+/).map(t => t.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '')).filter(Boolean)
  const mixed = toks.some(t => /\p{L}/u.test(t) && /\d/.test(t) && !QUANTITY_TOKEN.test(t))
  const numberAfterName = toks.some((t, i) => {
    if (i === 0 || !/^\d+$/.test(t)) return false
    const prev = toks[i - 1]
    const nameWord = /^\p{Lu}/u.test(prev) || /^\p{Ll}+\p{Lu}/u.test(prev)
    const next = toks[i + 1]
    return nameWord && !NOUN_BEFORE_NUMBER.has(fold(prev)) && !(next && UNIT_WORD.has(fold(next)))
  })
  return mixed || numberAfterName
}

// ── CONSULT_V3: ORDER-FREE name matching (A/B eval 17/10) ───────────────────────────────────────────────────────────────────────────
//
// 🚨 Measured: "Tefal EY245310 5L" was labelled "(mình chưa thấy tên này trong nguồn đã tra)" beside its own product card, whose listing
// reads "nồi chiên không dầu tefal 5L ey245310"; "Toshiba RC-18MSLVN 1.8L" ← "Nồi cơm điện Toshiba 1.8 lít RC-18MSLVN"; "Mình nghiêng
// về Acer Aspire 5" (a whole bold sentence) ← "laptop acer aspire 5 a515-58p-351n". A word SEQUENCE is the wrong test for a model name:
// the model writes brand, series and model number in its own order. The test here is a set: every IDENTIFYING token of the name — the
// model numbers (any token with a digit that is not a quantity: "EY245310", "RC-18MSLVN", "5") and the capitalised words that are not
// Vietnamese function words or category nouns ("Tefal", "Aspire") — occurs in ONE evidence segment (a listing / a line), lower-case
// words and quantities ("5L", "1.8L", "256GB") are not identity. A leading brand word may be absent (the listing omits it); any other
// token may not: "iPhone 18 Pro Max" is NOT supported by "iPhone 18 Pro", "Galaxy S26 Ultra" not by "Galaxy S26". Two identifying
// tokens at least, else the caller keeps its own test.
const PICK_PHRASE = /^(?:ca nhan\s+)?(?:minh|toi|em|tappy)\s+(?:se\s+)?(?:chon|nghieng ve|uu tien|chot|de xuat|goi y|thich|khuyen)\s+/
const NOT_IDENTITY = new Set(['minh', 'toi', 'ban', 'em', 'ca', 'nhan', 'chon', 'neu', 'voi', 'cho', 'va', 'la', 'gia', 'may', 'laptop', 'noi', 'tai', 'nghe', 'dien', 'thoai', 'chiec', 'mau', 'dong', 'ban', 'loai', 'combo', 'bo', 'hang', 'chinh', 'new', 'moi', 'the', 'and', 'or', 'with', 'for', 'nhung', 'con', 'neu'])
const QUANTITY_FOLDED = /^\d+(?:gb|tb|mb|mah|wh|w|v|hz|khz|mhz|ghz|mm|cm|km|m|kg|g|l|ml|inch|in|k|tr|d|h|p|x|mp|lit)$/

/** The name without a leading pick phrase ("Cá nhân mình chọn Huawei FreeBuds SE 4" → "Huawei FreeBuds SE 4"). */
export function stripPickPhrase(name: string): string {
  const raw = name.trim()
  const lead = fold(raw).match(PICK_PHRASE)?.[0]
  return lead ? raw.split(/\s+/).slice(lead.trim().split(/\s+/).length).join(' ') : raw
}

/** The identifying tokens of a displayed name (folded), in order; a leading "Cá nhân mình chọn …" is not part of it. */
export function nameIdentityTokens(name: string): string[] {
  // A/B rerun 17/10 (sh-2): "Philips NA130/00 6,2 lít" — a decimal capacity split into "6" + "2" and read as model numbers; quantities go first
  const raw = stripPickPhrase(name).replace(/\d+(?:[.,]\d+)?\s*(?:lít|lit|l|ml|kg|g|gb|tb|mb|mah|w|inch|in|cm|mm|m2|m²)(?![\p{L}\p{N}])/giu, ' ')
  const out: string[] = []
  for (const t of raw.match(/[\p{L}\p{N}]+/gu) ?? []) {
    const f = fold(t)
    if (QUANTITY_FOLDED.test(f) || UNIT.test(f) && !/^\d+$/.test(f)) continue
    if (/\d/.test(f)) { out.push(f); continue }
    if ((/^\p{Lu}/u.test(t) || /\p{Ll}\p{Lu}/u.test(t)) && !NOT_IDENTITY.has(f) && f.length >= 2) out.push(f)
  }
  return out
}

/** The folded word list of a text (diacritics, case and punctuation ignored) — the unit every match here compares on. */
export const foldedWords = words

/** Evidence text cut into segments a listing cannot span: lines, JSON objects, " · " / " | " joins. */
export function evidenceSegments(texts: readonly string[]): string[][] {
  return texts.flatMap(t => decode(t).split(/[\n{}]|\s[·|]\s/)).map(s => words(s)).filter(w => w.length > 0)
}

/** True when every identifying token of `name` occurs in one segment (the first token may be missing: the brand). Null: too few tokens to judge. */
export function namedInSegments(name: string, segments: readonly string[][]): boolean | null {
  const id = nameIdentityTokens(name)
  if (id.length < 2) return null
  return segments.some(seg => {
    const has = (t: string) => seg.includes(t)
    if (id.every(has)) return true
    return id.length >= 3 && id.slice(1).every(has)
  })
}

/** The accepted spellings of a name for lookup: full, without a leading brand word, without trailing capacity words. */
export function nameVariants(name: string): string[] {
  const w = words(name)
  const noCap = (xs: string[]) => { const o = [...xs]; for (;;) { const l = o[o.length - 1]; if (o.length > 2 && l && /^\d+(?:gb|tb)$/.test(l)) { o.pop(); continue } if (o.length > 3 && /^(?:gb|tb)$/.test(l) && /^\d+$/.test(o[o.length - 2])) { o.pop(); o.pop(); continue } break } return o }
  const out = new Set<string>()
  for (const base of [w, noCap(w)]) {
    out.add(base.join(' '))
    if (base.length >= 3) out.add(base.slice(1).join(' '))
  }
  return [...out].filter(v => v.split(' ').length >= 2)
}

export interface EntityEvidence { corpus: readonly string[]; userTexts: readonly string[] }
export interface EntityGuardResult { text: string; ungrounded: string[]; checked: number }

const DISCLOSURE = (lang: string) => (lang === 'en' ? '(not found in the sources I checked)' : '(mình chưa thấy tên này trong nguồn đã tra)')

// ── CONSULTATIVE_IN_AGENT (`skipAmounts`): a bold amount / quantity phrase is not a name ─────────────────────────────────────────
//
// 🚨 Measured (UAT 2026-10-10): "**4 triệu cho hai người**" and "**3 triệu đồng/lượng**" were labelled "(mình chưa thấy tên này trong nguồn đã
// tra)". `looksLikeModelName` only rules out a run made ONLY of digits and unit words (`w.every(digit || UNIT)`); the words "cho", "hai",
// "đồng", "lượng", "đêm" are in no unit list, so a number + unit + one ordinary word passed as "a model name with a digit". An amount or
// quantity phrase (a number followed by a money / quantity word, or any money amount inside the run) names nothing and is left alone; a
// proper name that the evidence lacks ("**Galaxy S26 Ultra**") is still labelled.
const QUANTITY_WORD = new Set(['trieu', 'ty', 'ti', 'nghin', 'ngan', 'k', 'tr', 'dong', 'vnd', 'usd', 'nguoi', 'ngay', 'dem', 'thang', 'nam', 'tuan', 'gio', 'phut', 'luong', 'chi', 'cay', 'kg', 'g', 'km', 'm', 'lit', 'phan', 'suat', 'lan', 'khach', 'phong'])
const MONEY_AMOUNT = /\d[\d.,]*\s?(?:tr|k|triệu|tỷ|tỉ|nghìn|ngàn|đồng|vnđ|vnd|usd|₫|đ)(?![\p{L}\d])/iu
/** True when a bold run is an amount or a quantity ("4 triệu cho hai người", "3 triệu đồng/lượng", "2 ngày 1 đêm"), not a name. */
export function isAmountPhrase(bold: string): boolean {
  const w = words(bold)
  if (w.length === 0) return false
  if (/^\d+$/.test(w[0]) && w.length > 1 && QUANTITY_WORD.has(w[1])) return true
  if (MONEY_AMOUNT.test(bold)) return true
  // Live 2026-10-11 (Tesla): "**116 bằng sáng chế cơ bản**" and "**125 phát minh**" were labelled as names. A number followed only by lower-case words
  // counts something ("116 bằng sáng chế", "2 phòng ngủ"); a proper name starts with a capital or a letter ("Galaxy S26", "3 Sao Vàng").
  if (/^\s*\d[\d.,]*\s+\p{Ll}[\p{Ll}\s]*$/u.test(bold)) return true
  // Live 2026-10-11: "**3,45 chỉ**" (a decimal comma splits into "3" "45" "chi") was labelled as a name. A run whose words, once the numbers are
  // taken out, are all quantity / filler words ("3,45 chỉ", "khoảng 50 triệu", "2 ngày 1 đêm") names nothing.
  const rest = fold(bold).replace(/\d[\d.,]*/g, ' ').split(/[^a-z]+/).filter(Boolean)
  return rest.length > 0 && rest.length < w.length && rest.every(x => QUANTITY_WORD.has(x) || AMOUNT_FILLER.has(x))
}
/** The language of a REPLY's prose: 'vi' (three or more words with Vietnamese letters), 'en' (none, and common English words), else null. */
const EN_REPLY_WORDS = new Set(['the', 'and', 'to', 'of', 'is', 'are', 'for', 'you', 'with', 'that', 'this', 'can', 'be', 'it', 'on', 'in', 'a', 'if', 'but', 'would', 'because', 'before', 'your'])
function replyLanguage(prose: string): 'vi' | 'en' | null {
  const ws = prose.split(/\s+/).filter(w => /\p{L}/u.test(w))
  if (ws.length < 8) return null
  const viWords = ws.filter(w => /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/iu.test(w)).length
  if (viWords >= 3) return 'vi'
  const en = ws.filter(w => EN_REPLY_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, ''))).length
  return viWords === 0 && en >= 3 ? 'en' : null
}

const AMOUNT_FILLER =new Set(['cho', 'khoang', 'hon', 'gan', 'duoi', 'tren', 'moi', 'tu', 'den', 'toi', 'va', 'hai', 'ba', 'bon', 'khoang', 'tuong', 'duong', 'lam', 'viec'])

/** A line that starts a new block, never a list item's continuation: a heading, a bold line of its own, a table row, a marker block. */
export function isBlockStart(line: string): boolean {
  return /^\s*(?:#{1,4}\s|\*\*[^*\n]+\*\*\s*[:：]?\s*$|\||\[(?:TAPPY_|FOLLOWUPS|CTA_BUTTONS))/.test(line)
}

// a private-use code point built at run time: a literal one in the source is a hidden character (sourceInvisibleChars.test.ts)
const DROP_MARK = String.fromCharCode(0xe001)

/**
 * CONSULT_V3 (`dropUnsupported`): an unsupported name is not annotated — the grader read "(mình chưa thấy tên này trong nguồn đã tra)" beside
 * the recommended product as leaked machine text (A/B eval 17/10: sh-2, sh-3, sw-10). The LIST ITEM that names it goes whole; in prose, the
 * sentence that names it goes. Never the line's neighbours; a reply reduced to nothing keeps its text (the caller's annotation path).
 */
function dropMarked(text: string): string {
  const lines = text.split('\n')
  const kept: string[] = []
  // A/B rerun 17/10 (sh-2): an item's own continuation lines ("Đánh đổi: …" right under "- **Tên**") go with it — they describe nothing else.
  let inDroppedItem = false
  for (const line of lines) {
    const isItem = /^\s*(?:[-*•+]|\d+[.)])\s/.test(line)
    if (inDroppedItem && line.trim() && !isItem && !isBlockStart(line)) continue
    inDroppedItem = false
    if (!line.includes(DROP_MARK)) { kept.push(line); continue }
    if (isItem) { inDroppedItem = true; continue }
    const sentences = line.split(/(?<=[.!?…])\s+/)
    const rest = sentences.filter(s => !s.includes(DROP_MARK)).join(' ').trim()
    if (rest) kept.push(rest)
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function groundEntityNames(text: string, ev: EntityEvidence, lang = 'vi', opts: { skipAmounts?: boolean; labelFromText?: boolean; strictModelNames?: boolean; orderFree?: boolean; dropUnsupported?: boolean } = {}): EntityGuardResult {
  if (!text || ev.corpus.length === 0) return { text, ungrounded: [], checked: 0 }
  // CONSULTATIVE_IN_AGENT: the label is written in the language of the REPLY, not of the UI setting (an English answer got "(mình chưa thấy tên này…)", live
  // 2026-10-11). Only a confident English / Vietnamese reading of the prose (names and figures removed) changes it; anything else keeps `lang`.
  if (opts.labelFromText) {
    const seen = replyLanguage(text.replace(/\*\*[^*\n]*\*\*|https?:\/\/\S+|\[[^\]\n]*\]\([^)]*\)/g, ' '))
    if (seen === 'en' || seen === 'vi') lang = seen
  }
  const hay = ` ${words([...ev.corpus.map(decode), ...ev.userTexts].join('\n').slice(0, 2_000_000)).join(' ')} `
  const segments = opts.orderFree ? evidenceSegments([...ev.corpus, ...ev.userTexts].map(s => s.slice(0, 2_000_000))) : []
  const ungrounded: string[] = []
  let checked = 0
  const out = text.replace(/\*\*([^*\n]{3,80})\*\*/g, (whole, inner: string) => {
    if (!(opts.strictModelNames ? looksLikeModelNameStrict(inner) : looksLikeModelName(inner))) return whole
    if (opts.skipAmounts && isAmountPhrase(inner)) return whole
    checked++
    const shown = inner.trim().replace(/[.,;]+$/, '')
    if (nameVariants(shown).some(v => hay.includes(` ${v} `))) return whole
    if (opts.orderFree && namedInSegments(shown, segments) === true) return whole
    if (!ungrounded.includes(shown)) ungrounded.push(shown)
    return opts.dropUnsupported ? `${DROP_MARK}${shown}${DROP_MARK}` : `${shown} ${DISCLOSURE(lang)}`
  })
  if (opts.dropUnsupported && out.includes(DROP_MARK)) {
    const dropped = dropMarked(out)
    return { text: dropped || out.split(DROP_MARK).join(''), ungrounded, checked }
  }
  return { text: out, ungrounded, checked }
}
