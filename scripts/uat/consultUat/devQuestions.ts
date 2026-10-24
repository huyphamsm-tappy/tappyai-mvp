/**
 * Round 3c · the DEVELOPMENT question set (not the acceptance set). A plain UTF-8 file, one turn per line:
 *   id|conversation|turn|text
 * `|` is never part of a question. Turns of one conversation run in file order; the caller runs them in one process.
 * This file never reads the benchmark questions for tuning: it only COMPARES a dev question with them, to refuse a copy or a near-copy.
 * Pure: the caller reads the file and passes the text in.
 */
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

export type DevQuestionsResult = { ok: true; turns: UatTurn[] } | { ok: false; reasons: string[] }

/** Parses the file text. Refuses: empty, malformed line, bad turn number, duplicate (id, turn), a copy or near-copy of a benchmark question. */
export function parseDevQuestions(raw: string, benchTexts: readonly string[] = UAT_TURNS.map(t => t.text)): DevQuestionsResult {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  const lines = text.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim() !== '')
  if (lines.length === 0) return { ok: false, reasons: ['the dev question file is empty'] }
  const reasons: string[] = []
  const turns: UatTurn[] = []
  const seen = new Set<string>()
  // an id names ONE conversation: several turns of that conversation share its id (D6 has two turns); a second conversation under the same id is refused
  const idOwner = new Map<string, string>()
  lines.forEach((line, i) => {
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
  })
  if (reasons.length) return { ok: false, reasons }
  return { ok: true, turns }
}
