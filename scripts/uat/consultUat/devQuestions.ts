/**
 * Round 3c · the DEVELOPMENT question set (not the acceptance set). A plain UTF-8 file, one turn per line:
 *   id|conversation|turn|text
 * `|` is never part of a question. Turns of one conversation run in file order; the caller runs them in one process.
 * This file never reads the benchmark questions for tuning: it only COMPARES a dev question with them, to refuse a copy or a near-copy.
 * Pure: the caller reads the file and passes the text in.
 */
import { createHash } from 'node:crypto'
import { normalizeQuestion } from './liveTrial'
import { UAT_TURNS } from './questions'
import type { UatTurn } from './questions'

/** The share of the SMALLER word set that two questions must share before the dev question is refused as a near-copy. */
export const NEAR_COPY_SHARE = 0.7

/** NFKC first, so fullwidth and other compatibility forms of the same letters are one letter; then the project's normalizeQuestion. */
const fold = (s: string): string => normalizeQuestion(s.normalize('NFKC'))
/** The key of an exact copy: the folded text with everything that is not a letter or a digit removed (punctuation, spacing). */
const copyKey = (s: string): string => fold(s).replace(/[^\p{L}\p{N}]/gu, '')
const words = (s: string): Set<string> => new Set(fold(s).replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(w => w.length > 0))

/** Two questions are near-copies when they share at least NEAR_COPY_SHARE of the smaller one's words (after normalizeQuestion). */
export function isNearCopy(a: string, b: string): boolean {
  const A = words(a), B = words(b)
  if (A.size === 0 || B.size === 0) return false
  let shared = 0
  for (const w of A) if (B.has(w)) shared++
  return shared / Math.min(A.size, B.size) >= NEAR_COPY_SHARE
}

/** A judge's note: kept apart from the question, never sent to the model. */
export interface DevQuestionNote { id: string; conversation: string; turn: number; note: string }
export type DevQuestionsResult =
  | { ok: true; turns: UatTurn[]; notes: DevQuestionNote[]; formatVersion: 1 | 2 }
  | { ok: false; reasons: string[] }

/** SHA-256 (hex, lower case) of the UTF-8 bytes of the text: for a file read as UTF-8 text it is the SHA-256 of the file. */
export function sha256OfText(text: string): string { return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex') }

/**
 * FORMAT v2 (Wave 2B). A file whose FIRST non-empty line is exactly `@format|2` may also carry three kinds of directive line. A directive line is recognised by its first field
 * (the text before the first `|`) being exactly `@format`, `@doc` or `@note` - by structure, never by what the text says.
 *   @format|2                              first line only; declares the format.
 *   @doc|<free text>                       documentation, ignored.
 *   @note|<conversation>|<turn>|<text>     the judge's note for the question line DIRECTLY ABOVE (conversation and turn are a check that it is that line). At most one note per
 *                                          question, text not empty, `|` never inside it. The note is NOT part of the question: it never reaches the model, and the 70% / near-copy
 *                                          rule judges the question text only.
 * A file without `@format|2` is format v1 and is read exactly as before (a directive line in it is refused rather than read as a question).
 */
const DIRECTIVES = new Set(['@format', '@doc', '@note'])

/** Parses the file text. Refuses: empty, malformed line, bad turn number, duplicate (id, turn), a copy or near-copy of a benchmark question, a badly formed directive line. */
export function parseDevQuestions(raw: string, benchTexts: readonly string[] = UAT_TURNS.map(t => t.text)): DevQuestionsResult {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  const lines = text.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim() !== '')
  if (lines.length === 0) return { ok: false, reasons: ['the dev question file is empty'] }
  const reasons: string[] = []
  const turns: UatTurn[] = []
  const notes: DevQuestionNote[] = []
  const seen = new Set<string>()
  // an id names ONE conversation: several turns of that conversation share its id (D6 has two turns); a second conversation under the same id is refused
  const idOwner = new Map<string, string>()
  const firstField = (l: string): string => l.split('|', 1)[0]
  const v2 = lines[0].trim() === '@format|2'
  /** The question line directly above (set by each accepted question line, cleared by a note), so a note can only follow its own question. */
  let lastQuestion: { id: string; conversation: string; turn: number } | null = null
  lines.forEach((line, i) => {
    const head = firstField(line)
    if (DIRECTIVES.has(head)) {
      if (!v2) { reasons.push(`line ${i + 1}: a ${head} line needs the file to start with @format|2 (the first line)`); return }
      if (head === '@format') {
        if (!(i === 0 && line.trim() === '@format|2')) reasons.push(`line ${i + 1}: @format|2 must be the first line, and only once`)
        return
      }
      if (head === '@doc') return
      // @note|conversation|turn|text
      const np = line.split('|')
      if (np.length !== 4) { reasons.push(`line ${i + 1}: a note line must be @note|conversation|turn|text (no | inside the text)`); return }
      const [, nconv, nturnText, ntext] = np
      if (ntext.trim() === '') { reasons.push(`line ${i + 1}: the note text is empty`); return }
      const nturn = Number(nturnText)
      if (lastQuestion === null || lastQuestion.conversation !== nconv.trim() || lastQuestion.turn !== nturn) {
        reasons.push(lastQuestion === null && notes.length === 0 && turns.length === 0
          ? `line ${i + 1}: a note comes before any question`
          : `line ${i + 1}: the note names ${nconv.trim()} turn ${nturnText.trim()}, which is not the question line above it (or it already has a note: at most one note per question)`)
        return
      }
      notes.push({ id: lastQuestion.id, conversation: lastQuestion.conversation, turn: lastQuestion.turn, note: ntext.trim() })
      lastQuestion = null
      return
    }
    if (v2 && head.startsWith('@')) { reasons.push(`line ${i + 1}: unknown directive ${head}`); return }
    const parts = line.split('|')
    if (parts.length !== 4) { reasons.push(`line ${i + 1}: expected id|conversation|turn|text`); return }
    const [id, conversation, turnText, body] = parts
    const turn = Number(turnText)
    if (!id.trim() || !conversation.trim()) { reasons.push(`line ${i + 1}: id and conversation must not be empty`); return }
    if (!Number.isInteger(turn) || turn < 1) { reasons.push(`line ${i + 1}: turn must be a whole number from 1`); return }
    if (body.trim() === '') { reasons.push(`line ${i + 1}: the question text is empty`); return }
    if (seen.has(`${conversation.trim()}#${turn}`)) { reasons.push(`line ${i + 1}: ${conversation.trim()} turn ${turn} appears twice`); return }
    const owner = idOwner.get(id.trim())
    if (owner !== undefined && owner !== conversation.trim()) { reasons.push(`line ${i + 1}: the id ${id.trim()} belongs to two conversations`); return }
    seen.add(`${conversation.trim()}#${turn}`)
    idOwner.set(id.trim(), conversation.trim())
    const key = copyKey(body)
    if (benchTexts.some(b => copyKey(b) === key)) { reasons.push(`line ${i + 1}: the question is a copy of a benchmark question`); return }
    if (benchTexts.some(b => isNearCopy(body, b))) { reasons.push(`line ${i + 1}: the question shares ${NEAR_COPY_SHARE * 100}% of its words with a benchmark question (near-copy)`); return }
    turns.push({ id: id.trim(), conversation: conversation.trim(), turn, text: body.trim() })
    lastQuestion = { id: id.trim(), conversation: conversation.trim(), turn }
  })
  if (reasons.length) return { ok: false, reasons }
  return { ok: true, turns, notes, formatVersion: v2 ? 2 : 1 }
}
