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

export function groundEntityNames(text: string, ev: EntityEvidence, lang = 'vi'): EntityGuardResult {
  if (!text || ev.corpus.length === 0) return { text, ungrounded: [], checked: 0 }
  const hay = ` ${words([...ev.corpus.map(decode), ...ev.userTexts].join('\n').slice(0, 2_000_000)).join(' ')} `
  const ungrounded: string[] = []
  let checked = 0
  const out = text.replace(/\*\*([^*\n]{3,80})\*\*/g, (whole, inner: string) => {
    if (!looksLikeModelName(inner)) return whole
    checked++
    const shown = inner.trim().replace(/[.,;]+$/, '')
    if (nameVariants(shown).some(v => hay.includes(` ${v} `))) return whole
    if (!ungrounded.includes(shown)) ungrounded.push(shown)
    return `${shown} ${DISCLOSURE(lang)}`
  })
  return { text: out, ungrounded, checked }
}
