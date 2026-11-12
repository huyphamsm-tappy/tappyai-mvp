// R13 9.5 "Progressive Section Verification & Streaming", inside the held-text design of thesisReport.ts (RESEARCH_STREAM_VERIFY, deepResearchState.ts).
//
// What R13 asks: buffer each finished section on the server, verify it, show only what passed, go on to the next. What the engine already did: hold ALL the text and release it after the last
// section (releaseText). This file does the first without giving up the second: a section is complete when the next heading starts; it is read by the same verifier (filterVerified, the
// sentence check of releaseText) and handed out at once; the model's own token stream never reaches the person.
//
// Equivalence (tested): the sections handed out, joined, are exactly what releaseText gives for the whole text. The verifier judges one sentence against the sources it cites, so a section
// is judged the same alone as inside the report; citations are renumbered in order of first use across sections with a running map, so a section already shown is never renumbered later.
//
// What this does NOT do (R13 names it; the engine cannot): there are no claim ids or fact versions here (the verifier is sentence-level), so a section carries counts, not
// verifiedClaimIds / factVersionIds; and SECTION_AMENDED / SECTION_RETRACTED need a contradiction found AFTER a section was shown, which a sentence-local check can never find.
// Pure, no model call.

import { filterVerified } from './thesisReport'
import type { VerifierSource } from './claimVerifier'

type Source = VerifierSource & { url?: string; site?: string; published?: string }

export type SectionStatus = 'PASS' | 'PARTIAL' | 'REJECTED'
export interface ReleasedSection {
  sectionId: string
  title?: string
  /** the text that may be shown (already clean, citations already in their final numbers) */
  text: string
  /** sentences the verifier refused in this section */
  dropped: number
  /** PASS: nothing refused; PARTIAL: something refused; REJECTED: it had a body and not one sentence of it survived */
  status: SectionStatus
}
export interface SectionTotals {
  /** everything handed out so far, joined: equals releaseText of the same text */
  text: string
  dropped: number
  /** the sources the shown text cites, numbered 1..n in order of first citation */
  used: Array<Source>
  /** old source number to the number it has in the shown text */
  renumbered: Map<number, number>
  /** sections handed out so far */
  shown: number
}

const CITE = /\[(\d{1,3})\]/g
const BOUNDARY = /\n(?=#{1,2} )/
const HEADING = /^\s*#{1,6}\s/
const bodyLines = (t: string): string[] => t.split('\n').filter(l => l.trim() && !HEADING.test(l))
const titleOf = (t: string): string | undefined => {
  const h = t.split('\n').find(l => HEADING.test(l))
  return h ? h.replace(/^\s*#{1,6}\s+/, '').trim() || undefined : undefined
}

export interface SectionRelease {
  /** more text from the writer: the sections it completes, verified, in order (usually none or one) */
  push(delta: string): ReleasedSection[]
  /** the writer finished: the last section is verified too */
  end(): SectionTotals & { last: ReleasedSection | null }
  /** the writer failed or was cut: what was already handed out stays, the unfinished section is dropped unread */
  abandon(): SectionTotals & { last: null }
}

export function createSectionRelease(sources: readonly Source[], trusted = ''): SectionRelease {
  let buffer = ''
  let text = ''
  let dropped = 0
  let index = 0
  /** sections handed out that have a body (a heading alone is not content worth keeping a report for) */
  let shown = 0
  const map = new Map<number, number>()
  const byId = new Map(sources.map(s => [s.id, s]))
  const renumber = (kept: string) => kept.replace(CITE, (_m, d: string) => {
    const id = Number(d)
    let n = map.get(id)
    if (n === undefined) { n = map.size + 1; map.set(id, n) }
    return `[${n}]`
  })
  const release = (raw: string): ReleasedSection => {
    const { kept, dropped: d } = filterVerified(raw, sources, trusted)
    const out = renumber(kept)
    index++
    if (bodyLines(kept).length > 0) shown++
    dropped += d
    text += out
    const status: SectionStatus = bodyLines(raw).length > 0 && bodyLines(kept).length === 0 ? 'REJECTED' : d > 0 ? 'PARTIAL' : 'PASS'
    const title = titleOf(raw)
    return { sectionId: `s${index}`, ...(title ? { title } : {}), text: out, dropped: d, status }
  }
  const totals = (): SectionTotals => {
    const order = [...map].sort((a, b) => a[1] - b[1]).map(([id]) => id)
    return { text, dropped, used: order.flatMap(id => { const s = byId.get(id); return s ? [{ ...s, id: map.get(id)! }] : [] }), renumbered: new Map(map), shown }
  }
  return {
    push(delta) {
      buffer += delta
      const done: ReleasedSection[] = []
      for (;;) {
        const m = BOUNDARY.exec(buffer)
        if (!m) break
        const cut = m.index + 1
        const raw = buffer.slice(0, cut)
        buffer = buffer.slice(cut)
        done.push(release(raw))
      }
      return done
    },
    end() {
      const raw = buffer
      buffer = ''
      const last = raw.length ? release(raw) : null
      return { ...totals(), last }
    },
    abandon() {
      buffer = ''
      return { ...totals(), last: null }
    },
  }
}

/** A section as the progress event of R13 9.5 (names as in the design; without claim or fact ids, see the top of this file). REJECTED carries no text, only a reason code. Pure. */
export type SectionEvent =
  | { type: 'SECTION_VERIFIED'; reportId: string; sectionId: string; verificationStatus: 'PASS' | 'PARTIAL'; sectionRevision: 1; section: { sectionId: string; title?: string; text: string; droppedSentences: number; verificationVersion: string } }
  | { type: 'SECTION_REJECTED'; reportId: string; sectionId: string; reasonCode: 'NO_VERIFIED_CONTENT' }

export const SECTION_VERIFICATION_VERSION = 'sentence-verifier.v1'

export function sectionEventOf(reportId: string, s: ReleasedSection): SectionEvent {
  if (s.status === 'REJECTED') return { type: 'SECTION_REJECTED', reportId, sectionId: s.sectionId, reasonCode: 'NO_VERIFIED_CONTENT' }
  return { type: 'SECTION_VERIFIED', reportId, sectionId: s.sectionId, verificationStatus: s.status, sectionRevision: 1, section: { sectionId: s.sectionId, ...(s.title ? { title: s.title } : {}), text: s.text, droppedSentences: s.dropped, verificationVersion: SECTION_VERIFICATION_VERSION } }
}
