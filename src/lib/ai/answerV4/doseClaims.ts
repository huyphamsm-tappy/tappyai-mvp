// TAPPY_ANSWER_V4 layer 3 — a medicine dose with no source is changed at CLAIM level (owner 19/10/2026, u27 option (a)).
//
// The No-Fabrication Gate finds dose figures ("500 mg", "3.000 mg/24 giờ") that no tool result or page states and, off the flag, deletes the
// whole sentence — which was also the only sentence naming the medicine, so the answer opened mid-thought. Here the medicine and the advice
// stay; only the unsourced figures go, and the sentence says once where the dose comes from (the label, a pharmacist or a doctor). A clause
// that held nothing but the figure ("tối đa 3.000 mg/24 giờ" → "tối đa") goes with it. Pure; the figures come from the gate's own claims.

const NOTE: Record<string, string> = {
  vi: 'liều dùng theo hướng dẫn trên nhãn hoặc hỏi dược sĩ',
  en: 'dose as on the label or as a pharmacist advises',
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function softenSentence(sentence: string, re: RegExp, values: readonly string[], note: string): string {
  const punct = sentence.match(/[.!?…]*$/)![0]
  const body = sentence.slice(0, sentence.length - punct.length)
  // clauses split at ", " / "; " (a decimal comma "2,5 mg" has no space after it)
  const clauses = body.split(/\s*[,;]\s+/)
  // the FIRST clause that states a figure names the medicine ("người lớn có thể uống paracetamol 500 mg"): only its figure goes; a later one
  // ("tối đa 3.000 mg/24 giờ", "max 3 g a day") is about the dose alone and goes whole. Clauses without a figure stay as written.
  let named = false
  const kept = clauses.flatMap(c => {
    if (!values.some(v => c.includes(v))) return [c]
    if (named) return []
    named = true
    const left = c.replace(re, '').trim()
    return left ? [left] : []
  })
  const joined = kept.join(', ').replace(/\s{2,}/g, ' ').replace(/\s+([,;:])/g, '$1').replace(/[,;:\s]+$/, '')
  return `${joined} (${note})${punct}`
}

const UNVERIFIED: Record<string, string> = { vi: 'chưa xác minh', en: 'unverified' }

/**
 * Any other figure the gate found in no evidence (a price, an hour, a rating…): the sentence stays and the figure carries "(chưa xác minh)"
 * right after it — the claim-level counterpart of the gate's own "(ước tính)" label. First occurrence of each value only; a value already
 * followed by a parenthesis is left as is.
 */
export function markUnverifiedClaims(text: string, values: readonly string[], lang: string, o: { sentenceEnd?: boolean } = {}): { text: string; marked: number } {
  const label = UNVERIFIED[lang] ?? UNVERIFIED.en
  if (o.sentenceEnd) return markAtSentenceEnd(text, values, label)
  let out = text
  let marked = 0
  for (const v of [...new Set(values.map(x => x.trim()).filter(Boolean))].sort((a, b) => b.length - a.length)) {
    const at = out.indexOf(v)
    if (at < 0 || /^\s*\(/.test(out.slice(at + v.length))) continue
    out = `${out.slice(0, at + v.length)} (${label})${out.slice(at + v.length)}`
    marked++
  }
  return { text: out, marked }
}

/**
 * RETRIEVAL_V5 lần 2c (B3): the label goes ONCE at the END of each sentence that holds an unverified figure — before its final punctuation and
 * any trailing source markers / links — never between a number and its unit or inside a range (Cổng 1: "1,25–2,2 triệu (chưa xác minh) đồng",
 * "21:30 (chưa xác minh)–22:00 (chưa xác minh)"). A sentence already carrying the label is left as is. Lines are kept. Pure.
 */
function markAtSentenceEnd(text: string, values: readonly string[], label: string): { text: string; marked: number } {
  const vs = [...new Set(values.map(x => x.trim()).filter(Boolean))]
  if (!vs.length) return { text, marked: 0 }
  let marked = 0
  const out = text.split('\n').map(line => line.split(/(?<=[.!?…])(\s+)/).map(piece => {
    if (!piece.trim() || !vs.some(v => piece.includes(v)) || piece.includes(`(${label})`)) return piece
    // the tail: final punctuation, then source markers / markdown links / closing marks after it or before it
    const tail = piece.match(/(?:\s*(?:\[S\d{1,2}\]|\(\[[^\]]*\]\([^)]*\)\)|\[[^\]]*\]\([^)]*\)))*\s*[.!?…:;]*\s*(?:\[S\d{1,2}\])*\s*$/)![0]
    const body = piece.slice(0, piece.length - tail.length)
    if (!body.trim()) return piece
    marked++
    return `${body} (${label})${tail}`
  }).join('')).join('\n')
  return { text: out, marked }
}

export function softenDoseClaims(text: string, doseValues: readonly string[], lang: string): { text: string; softened: number } {
  const values = [...new Set(doseValues.map(v => v.trim()).filter(Boolean))].sort((a, b) => b.length - a.length)
  if (!values.length) return { text, softened: 0 }
  const re = new RegExp(`\\s*(?:${values.map(escapeRe).join('|')})`, 'g')
  const note = NOTE[lang] ?? NOTE.en
  let softened = 0
  // sentence = up to . ! ? … followed by a space or the end of the line (a "3.000" inside a figure is not an end)
  const out = text.split('\n').map(line => line.split(/(?<=[.!?…])(\s+)/).map(piece => {
    if (!piece.trim() || !values.some(v => piece.includes(v))) return piece
    softened++
    const lead = piece.match(/^\s*(?:[-*•+]\s+|\d{1,3}[.)]\s+)?/)![0]
    return lead + softenSentence(piece.slice(lead.length), re, values, note)
  }).join('')).join('\n')
  return { text: out, softened }
}
