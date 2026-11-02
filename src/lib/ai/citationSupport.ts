// ── CONSULT_V3 (UAT 17/10, the "bát – đũa – bật lửa" trend): a source chip only where the page says it ────────────────────────────────
//
// Measured live: the reply explained a Chinese pun ("碗上筷火" → "晚上快活") and cited a Yahoo page the evidence step had read — but that
// page's extracted passages stated none of it (evidence fact 0 / unknown 1). The citation step only checks that a marker names a page that
// was READ, so the chip made an unverified reading look sourced. Under CONSULT_V3 each cited sentence is checked against its page:
//   · the sentence's DISTINCTIVE tokens — Han-character runs (≥ 2), numbers with ≥ 2 digits, quoted terms — must appear in that page's
//     passages (at least two of them, or the only one there is);
//   · a sentence with no distinctive token cannot be judged here: its marker is kept (as before);
//   · a source with no passages (a news article, a Maps link) is not judged here either.
// An unsupported marker is removed; when the reply cited anything, only the sources still cited may appear as buttons (so the "Nguồn:"
// fallback line cannot bring the unsupported page — or an unrelated page read along the way — back). Pure.

export interface SupportSource { id: string; passages: readonly string[] }

const fold = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s.,·]/g, '')

/** The tokens of a sentence that a supporting page must contain. */
export function distinctiveTokens(sentence: string): string[] {
  const plain = sentence.replace(/\[S\d{1,2}(?:\s*,\s*S\d{1,2})*\]/g, ' ').replace(/\]\([^)]*\)/g, ']')
  const out = new Set<string>()
  for (const m of plain.matchAll(/\p{Script=Han}{2,}/gu)) out.add(m[0])
  for (const m of plain.matchAll(/\d[\d.,]*\d/g)) if (m[0].replace(/\D/g, '').length >= 2) out.add(m[0])
  for (const m of plain.matchAll(/[“"«]([^”"»\n]{2,40})[”"»]/g)) if (!/\p{Script=Han}/u.test(m[1])) out.add(m[1].trim())
  return [...out]
}

export function supportedBy(sentence: string, passages: readonly string[]): boolean {
  if (!passages.length) return true
  const tokens = distinctiveTokens(sentence)
  if (!tokens.length) return true
  const hay = fold(passages.join(' '))
  const found = tokens.filter(t => hay.includes(fold(t))).length
  return found >= Math.min(2, tokens.length)
}

export function checkCitationSupport(text: string, sources: readonly SupportSource[]): { text: string; keepIds: Set<string>; dropped: Array<{ id: string; tokens: number }>; hadMarkers: boolean } {
  const byId = new Map(sources.map(s => [s.id, s]))
  const keepIds = new Set<string>()
  const dropped: Array<{ id: string; tokens: number }> = []
  let hadMarkers = false
  // sentence by sentence (a marker belongs to the sentence it closes)
  const out = text.replace(/[^.!?…\n]*?\s?\[(S\d{1,2}(?:\s*,\s*S\d{1,2})*)\][^.!?…\n]*[.!?…]*/g, (sentence: string) => {
    return sentence.replace(/\s?\[(S\d{1,2}(?:\s*,\s*S\d{1,2})*)\]/g, (_m, ids: string) => {
      hadMarkers = true
      const keep = ids.split(/\s*,\s*/).filter(id => {
        const src = byId.get(id)
        if (!src) return true // not ours to judge (the citation step drops unknown ids)
        const ok = supportedBy(sentence, src.passages)
        if (!ok) dropped.push({ id, tokens: distinctiveTokens(sentence).length })
        return ok
      })
      for (const id of keep) keepIds.add(id)
      return keep.length ? ` [${keep.join(', ')}]` : ''
    })
  })
  return { text: out, keepIds, dropped, hadMarkers }
}
