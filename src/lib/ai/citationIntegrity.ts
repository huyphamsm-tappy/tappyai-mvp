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

/**
 * POST-UAT B3: a lead-in whose content a guard removed ("Chia ngân sách tham khảo như sau:" with nothing after it, an empty
 * "**Chi phí:**" heading) goes too. A lead-in is a line ending in ":" (or a bold / # heading line); it is orphaned when the next
 * non-empty line is another ":" lead-in or heading, a machine block, or the end of the reply — or, for a lead-in that ANNOUNCES a
 * list ("như sau:", "dưới đây:", "gồm:"), when what follows is not a list, table or code block. Other lead-ins followed by content stay.
 */
export function dropOrphanLeadIns(text: string): { text: string; removed: number } {
  const lines = text.split('\n')
  const colonLead = (l: string) => /:\s*(?:\*\*)?\s*$/.test(l.trim())
  const announcesList = (l: string) => /(?<!\p{L})(như sau|sau đây|dưới đây|bao gồm|gồm|các khoản|cụ thể|as follows|below|the following)(?!\p{L})[^:\n]*:\s*(?:\*\*)?\s*$/iu.test(l.trim())
  // A bold line that ends in "?" is a question to the user ("**Ngân sách tối nay khoảng bao nhiêu?**"), not a section heading: it is never an orphan.
  const heading = (l: string) => (/^\s*#{1,4}\s+\S/.test(l) || /^\s*\*\*[^*\n]{2,80}\*\*\s*:?\s*$/.test(l)) && !/[?？]\s*(?:\*\*)?\s*:?\s*$/.test(l.trim())
  // structure that answers an announcing lead-in: a list, a table, code, or section headings ("**1. Chi phí mở quán**", "## …")
  const listLike = (l: string) => /^\s*(?:[-*•+]|\d{1,2}[.)])\s|^\s*\||^\s*```|^\s*\*\*\s*\d{1,2}[.)]/.test(l) || (heading(l) && !colonLead(l))
  // a short label line ("**Chi phí:**", "Lưu ý:") — only such a line is dropped for being followed by another lead-in
  const shortLabel = (l: string) => l.trim().replace(/\*\*/g, '').length <= 40
  const isMachine = (l: string) => /\[\/?(?:TAPPY_[A-Z]+|CTA_BUTTONS|FOLLOWUPS)\]/.test(l)
  const drop = new Set<number>()
  let inBlock = false
  for (let i = lines.length - 1; i >= 0; i--) {
    // walk backwards so a chain of empty lead-ins ("**Chi phí:**" → "Chia như sau:" → end) all go
    const l = lines[i]
    const opens = (l.match(/\[(TAPPY_[A-Z]+|CTA_BUTTONS|FOLLOWUPS)\]/g) ?? []).length
    const closes = (l.match(/\[\/(TAPPY_[A-Z]+|CTA_BUTTONS|FOLLOWUPS)\]/g) ?? []).length
    if (closes > opens) { inBlock = true; continue }
    if (opens > closes) { inBlock = false; continue }
    if (inBlock || opens || closes || !l.trim()) continue
    if (!colonLead(l) && !heading(l)) continue
    let j = i + 1
    while (j < lines.length && (!lines[j].trim() || drop.has(j))) j++
    const next = j < lines.length ? lines[j] : null
    if (next === null || isMachine(next) || (colonLead(l) && shortLabel(l) && colonLead(next) && !listLike(next)) || (announcesList(l) && !listLike(next))) drop.add(i)
  }
  if (!drop.size) return { text, removed: 0 }
  // Only the lead-in SENTENCE goes: "Để ước tính vốn, mình tách hai nhóm. Các khoản chính gồm:" keeps its first sentence.
  const kept = lines.map((l, i) => {
    if (!drop.has(i)) return l
    const cut = l.search(/[.!?…](?:\*\*)?\s+(?=[^.!?…]*:\s*(?:\*\*)?\s*$)/)
    return cut >= 0 ? l.slice(0, cut + 1).replace(/\s+$/, '') : null
  }).filter((l): l is string => l !== null)
  return { text: kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\s*\n/, '').replace(/\s+$/, ''), removed: drop.size }
}

/**
 * WS2 final (Bug 2) — a list marker with nothing after it ("2.", "3)", "-") is what remains when a guard removed the item's only
 * sentence (measured M5 SR-T1: "1. **Mỹ Khê 2** …\n2.\n3. **Bella Merry** …"). Such a line is dropped; a numbered item that still has
 * content is never touched (Markdown keeps rendering the list), nothing is renumbered, no text is written. Lines inside a machine block
 * ([TAPPY_PLAN] / [TAPPY_SHOPPING] / … JSON) are left alone.
 */
export function dropBareListMarkers(text: string): { text: string; removed: number } {
  let removed = 0
  let inBlock = false
  const lines = text.split('\n').filter(l => {
    const opens = (l.match(/\[(TAPPY_[A-Z]+|CTA_BUTTONS|FOLLOWUPS)\]/g) ?? []).length
    const closes = (l.match(/\[\/(TAPPY_[A-Z]+|CTA_BUTTONS|FOLLOWUPS)\]/g) ?? []).length
    const was = inBlock
    if (opens > closes) inBlock = true
    if (closes > opens) inBlock = false
    if (was || opens || closes) return true
    if (/^\s*(?:\d{1,2}[.)]|[-*+•])\s*[.,;:–—-]?\s*$/.test(l)) { removed++; return false }
    return true
  })
  return { text: removed ? lines.join('\n').replace(/\n{3,}/g, '\n\n') : text, removed }
}
