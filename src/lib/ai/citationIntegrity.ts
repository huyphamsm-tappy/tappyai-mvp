// ── Phase 8 WS2 — citation integrity: every [S#] that reaches the user supports a surviving claim (TAPPY_AGENT=2, web) ───────────
//
// THE DEFECT (M3–M7 eval RS-C1, measured): Luna writes the marker AFTER the sentence's full stop — "Vé vào phố cổ 120.000đ. [S2]" — and
// every prose guard splits sentences at the full stop, so the marker is a fragment of its own. When a guard removed the price sentence,
// the "[S2]" fragment stayed: the reply opened with a bare source link, or the link hung off the NEXT sentence, which the source never
// stated ("Chỉ dạo phố. ([webdulichhoian.com](…))").
//
// TWO deterministic steps, both pure:
//   1. bindCitationMarkers — BEFORE the guards: a marker standing after a sentence's terminator is moved inside that sentence
//      ("… 120.000đ [S2]."), so a guard that removes the sentence removes its citation with it, and a guard that keeps it keeps both.
//      M4 already read such a fragment as belonging to the sentence before it; nothing about what is cited changes.
//   2. enforceCitationIntegrity — AFTER the guards, right before markers become links: a marker with no claim text before it in its
//      sentence (at the start of the reply or of a line, straight after a terminator, or after another marker) is an orphan and is
//      removed; ids repeated inside a group or in adjacent groups are merged. Unknown ids are removed downstream (citeSources).
// If a claim is removed, its citation is removed. If a citation survives, the sentence it sits in survived.

const GROUP = String.raw`\[(S\d{1,2}(?:\s*,\s*S\d{1,2})*)\]`
const TERMINATOR = '.!?…'

/** Step 1: "claim. [S1]" → "claim [S1]." (also "claim! [S1, S2]"). Text without markers is returned unchanged. */
export function bindCitationMarkers(text: string): string {
  if (!/\[S\d/.test(text)) return text
  return text.replace(new RegExp(String.raw`([^\s\[\]*_])([${TERMINATOR}]+)([ \t]*)${GROUP}`, 'g'), (_m, last: string, term: string, _sp: string, ids: string) => `${last} [${ids}]${term}`)
}

/** Step 2: removes orphan markers and merges duplicates. Returns the text and how many marker groups were removed. */
export function enforceCitationIntegrity(text: string): { text: string; removed: number } {
  if (!/\[S\d/.test(text)) return { text, removed: 0 }
  let removed = 0
  const norm = (ids: string) => [...new Set(ids.split(/\s*,\s*/))].join(', ')
  // Adjacent groups ("[S1] [S2]", "[S1][S1]") become one group with unique ids.
  let out = text.replace(new RegExp(String.raw`${GROUP}(?:[ \t]*${GROUP})+`, 'g'), m => {
    const ids = [...m.matchAll(new RegExp(GROUP, 'g'))].flatMap(x => x[1].split(/\s*,\s*/))
    return `[${[...new Set(ids)].join(', ')}]`
  })
  out = out.replace(new RegExp(GROUP, 'g'), (_m, ids: string) => `[${norm(ids)}]`)
  // Orphans: nothing claim-like before the marker in its sentence.
  out = out.replace(new RegExp(String.raw`(^|\n)([ \t]*(?:[-*+>]|\d+[.)])?[ \t]*)${GROUP}[ \t]*`, 'g'), (_m, nl: string, lead: string) => { removed++; return `${nl}${lead}` })
  out = out.replace(new RegExp(String.raw`([${TERMINATOR}])([ \t]*)${GROUP}`, 'g'), (_m, term: string) => { removed++; return term })
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  // A line that held only an orphan marker is gone entirely.
  out = out.split('\n').filter((l, i, a) => !(l.trim() === '' && i > 0 && a[i - 1].trim() === '' )).join('\n').replace(/^\s+/, '')
  return { text: out, removed }
}
