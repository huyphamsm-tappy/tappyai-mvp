// Release gate (UAT-15): a comparative proximity claim about the pick ("gần vị trí của bạn hơn các lựa chọn khác", "quán gần nhất") is a CLAIM ABOUT THE SET,
// and the only evidence for it is the rows' own `distance_km`. The place-claim guard checks a stated number ("1,3 km") but not a comparison, and the model
// wrote the comparison from the "near me" frame line even though the pick (1.3 km) was farther than another row it had been handed (0.7 km).
//
// Deletes ONLY the clause that makes the comparison, ONLY when the rows contradict it or cannot support it. It never writes a word, never changes the pick,
// and leaves the claim alone when the pick really is the nearest row (a tie counts as nearest).

export interface DistanceRow { name: string; distanceKm: number | null }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim()

/** "gần … hơn / nhất" inside ONE clause (no comma between), "closest", "nearer". A plain "gần trung tâm" is not a comparison. */
const PROXIMITY_COMPARATIVE = /\bgan\b[^.,;!?\n]{0,40}?\b(?:nhat|hon)\b|\b(?:nearest|closest|closer|nearer)\b/

/** The venue a reply picks: "**Mình chọn: X**" (or the engine's pick name). */
export function pickedNameIn(text: string, fallback: string | null): string | null {
  const m = /\*\*\s*Mình chọn:\s*([^*\n]+?)\s*\*\*/.exec(text)
  return (m ? m[1] : fallback)?.trim() || null
}

export function dropUnsupportedProximityClaim(text: string, pickName: string | null, rows: DistanceRow[]): { text: string; removed: number } {
  if (!text || !pickName) return { text, removed: 0 }
  const key = fold(pickName)
  const row = rows.find(r => { const n = fold(r.name); return n.length >= 3 && (n === key || n.includes(key) || key.includes(n)) })
  if (!row) return { text, removed: 0 }
  const others = rows.filter(r => r !== row && r.distanceKm !== null).map(r => r.distanceKm as number)
  // Supported: the pick has a distance and no other row is nearer.
  if (row.distanceKm !== null && others.every(d => d >= row.distanceKm! - 1e-9)) return { text, removed: 0 }
  // Not a comparison against anything: nothing to contradict.
  if (row.distanceKm === null && others.length === 0) return { text, removed: 0 }
  let removed = 0
  // A clause that names ANOTHER row is about that row ("Ẩm Thực Ăn Ngon gần hơn nhưng …" is true and stays).
  const otherNames = rows.filter(r => r !== row).map(r => fold(r.name)).filter(n => n.length >= 4)
  const aboutOther = (t: string) => { const f = fold(t); return otherNames.some(n => f.includes(n)) }
  const unbold = (t: string) => t.replace(/\*\*[^*\n]+\*\*/g, ' ')
  const out = text.replace(/[^.!?\n]+(?:[.!?]+|$)/g, sentence => {
    if (!PROXIMITY_COMPARATIVE.test(fold(unbold(sentence)))) return sentence
    const tail = /([.!?]*)$/.exec(sentence)?.[1] ?? ''
    const core = sentence.slice(0, sentence.length - tail.length)
    const lead = /^\s*/.exec(core)?.[0] ?? ''
    const clauses = core.slice(lead.length).split(/(\s*[,;—–]\s*|\s+và\s+)/)
    const kept: string[] = []
    for (let i = 0; i < clauses.length; i += 2) {
      if (PROXIMITY_COMPARATIVE.test(fold(unbold(clauses[i]))) && !aboutOther(clauses[i])) { removed++; continue }
      kept.push(kept.length === 0 ? clauses[i] : (clauses[i - 1] ?? '') + clauses[i])
    }
    return kept.length === 0 ? '' : lead + kept.join('') + tail
  })
  return removed === 0 ? { text, removed: 0 } : { text: out, removed }
}
