import { normalizeVN } from './intent'
import { districtRelation, type District } from './districts'

// ── "Never let the model justify a Quận 1 venue as being in Quận 3" ─────────────────────────────
//
// PRELAUNCH 5b. The rows are constrained by address (placeConstraintFilter), and the result tells
// the model which rows are outside the requested district. A prompt instruction is not enough on
// its own — measured twice on this codebase (food prose provenance): the model rewords the claim.
// So this guard is deterministic: in a sentence that names a venue whose ADDRESS puts it in a
// different district AND attaches the requested district to it, the requested district is replaced
// with the venue's real one. A sentence that already names the real district is left alone (the
// model is being explicit, e.g. "X không ở Quận 3 mà ở Quận 1").

export interface DistrictGuardPlace { name?: string | null; address?: string | null }

const fold = (s: string) => normalizeVN(s.toLowerCase())
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Every way a reply writes the district: "Quận 3", "quận 3", "Q3", "Q.3", "District 3", "Bình Thạnh". */
function mentionPattern(d: District): RegExp {
  const num = d.label.match(/^Quận (\d{1,2})$/)
  if (num) return new RegExp(`(?<!\\p{L})(?:[Qq]uận\\s?|QUẬN\\s?|[Qq]\\.?\\s?|[Dd]istrict\\s)${num[1]}(?!\\d)`, 'gu')
  return new RegExp(`(?<!\\p{L})(?:[Qq]uận\\s)?${esc(d.label)}(?!\\p{L})`, 'gu')
}

/** The distinctive part of a venue name a reply actually writes ("Phở Hòa" for "Phở Hòa - Pasteur"). */
function nameKeys(name: string): string[] {
  const full = name.trim()
  const head = full.split(/\s[-–|:(]\s?|,/)[0].trim()
  return [...new Set([full, head].filter(k => fold(k).length >= 4).map(fold))]
}

export function guardDistrictClaims(text: string, requested: District | null, places: readonly DistrictGuardPlace[]): { text: string; rewritten: number; venues: string[] } {
  if (!requested || !text) return { text, rewritten: 0, venues: [] }
  const outs = places
    .map(p => ({ p, rel: districtRelation(requested, p.address) }))
    .filter(x => x.rel.relation === 'out' && x.rel.actual && typeof x.p.name === 'string' && x.p.name.trim())
  if (outs.length === 0) return { text, rewritten: 0, venues: [] }

  const req = mentionPattern(requested)
  let rewritten = 0
  const venues: string[] = []
  // Sentences and list lines, delimiters kept, so the text is reassembled byte-for-byte.
  const pieces = text.split(/(?<=[.!?…])(\s+)|(\n)/)
  const out = pieces.map(piece => {
    if (!piece || /^\s+$/.test(piece)) return piece
    const f = fold(piece)
    let s = piece
    for (const { p, rel } of outs) {
      const actual = rel.actual!
      if (!nameKeys(p.name as string).some(k => f.includes(k))) continue
      if (mentionPattern(actual).test(s)) continue // already names its real district
      req.lastIndex = 0
      if (!req.test(s)) continue
      req.lastIndex = 0
      s = s.replace(req, actual.label)
      rewritten++
      venues.push(p.name as string)
    }
    return s
  })
  return { text: rewritten > 0 ? out.join('') : text, rewritten, venues }
}
