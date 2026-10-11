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

export function groundEntityNames(text: string, ev: EntityEvidence, lang = 'vi', opts: { skipAmounts?: boolean; labelFromText?: boolean } = {}): EntityGuardResult {
  if (!text || ev.corpus.length === 0) return { text, ungrounded: [], checked: 0 }
  // CONSULTATIVE_IN_AGENT: the label is written in the language of the REPLY, not of the UI setting (an English answer got "(mình chưa thấy tên này…)", live
  // 2026-10-11). Only a confident English / Vietnamese reading of the prose (names and figures removed) changes it; anything else keeps `lang`.
  if (opts.labelFromText) {
    const seen = replyLanguage(text.replace(/\*\*[^*\n]*\*\*|https?:\/\/\S+|\[[^\]\n]*\]\([^)]*\)/g, ' '))
    if (seen === 'en' || seen === 'vi') lang = seen
  }
  const hay = ` ${words([...ev.corpus.map(decode), ...ev.userTexts].join('\n').slice(0, 2_000_000)).join(' ')} `
  const ungrounded: string[] = []
  let checked = 0
  const out = text.replace(/\*\*([^*\n]{3,80})\*\*/g, (whole, inner: string) => {
    if (!looksLikeModelName(inner)) return whole
    if (opts.skipAmounts && isAmountPhrase(inner)) return whole
    checked++
    const shown = inner.trim().replace(/[.,;]+$/, '')
    if (nameVariants(shown).some(v => hay.includes(` ${v} `))) return whole
    if (!ungrounded.includes(shown)) ungrounded.push(shown)
    return `${shown} ${DISCLOSURE(lang)}`
  })
  return { text: out, ungrounded, checked }
}
