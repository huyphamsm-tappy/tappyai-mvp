// ── What a trip still needs before anything in it can be booked (UAT 2026-09-28) ─────────────
//
// A trip is answered first (answer-first, ask-after), but a fare or a dated room needs WHEN, FROM
// WHERE and HOW. The owner's UAT trip ("3 ngày 2 người, đang có 20 triệu") never asked any of them.
// This reads the user's own words in the thread (folded, no diacritics) and returns the ONE question
// that names only what is still missing — or null when nothing is.
//
// 🚨 A DURATION is not a date: "3 ngày 2 đêm" contains "ngay 2", which SPECIFIC_DATE reads as the
// 2nd of the month. Durations are removed before the date test.

import { SPECIFIC_DATE } from './searchNow'
import type { ClarifyQuestion } from './actionability'

export type TripFact = 'date' | 'origin' | 'transport'

const DURATION = /\b\d{1,2}\s*(?:n|ngay|ngay dem|day|days)\s*\d{0,2}\s*(?:d|dem|night|nights)?\b|\b(?:mot|hai|ba|bon|nam)\s+ngay(?:\s+\w+\s+dem)?\b/g
const OTHER_DATE = /\bthang\s+\d{1,2}\b|\bcuoi tuan\b|\btuan\s+(?:sau|toi)\b|\bthang\s+(?:sau|toi)\b|\b(?:le|dip)\s+(?:2\/9|30\/4|tet)\b|\btet\b|\bnext (?:week|month|weekend)\b|\bthis weekend\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/
const ORIGIN = /\b(?:tu|xuat phat(?:\s+tu)?|khoi hanh(?:\s+tu)?|from|leaving)\s+(?!nay\b|do\b|luc\b|gio\b|\d)[a-z]{2,}|\bo\s+[a-z]{2,}(?:\s+[a-z]{2,})?\s+(?:di|ra|vao|len|xuong)\b/
const TRANSPORT = /\b(?:may bay|bay|chuyen bay|ve may bay|xe khach|xe giuong nam|limousine|xe buyt|tau hoa|tau lua|tau|tu lai|lai xe|o to|oto|xe may|phuot|flight|fly|plane|bus|coach|train|drive|driving|motorbike)\b/

/** The trip facts the user has NOT given yet, in asking order. `threadUser` is folded (normalizeVN, lowercase). */
export function missingTripFacts(threadUser: string): TripFact[] {
  const t = ` ${threadUser} `
  const noDuration = t.replace(DURATION, ' ')
  const out: TripFact[] = []
  if (!SPECIFIC_DATE.test(noDuration) && !OTHER_DATE.test(noDuration)) out.push('date')
  if (!ORIGIN.test(t)) out.push('origin')
  if (!TRANSPORT.test(t)) out.push('transport')
  return out
}

const VI: Record<TripFact, string> = { date: 'đi ngày nào', origin: 'xuất phát từ đâu', transport: 'muốn bay hay đi xe/tàu' }
const EN: Record<TripFact, string> = { date: 'which dates', origin: 'where you are leaving from', transport: 'whether you would rather fly, take the bus or the train' }

function list(parts: string[], and: string): string {
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} ${and} ${parts[parts.length - 1]}`
}

/** One closing question naming exactly the missing facts, or null. The text IS the question (askAfterSentence passes it through). */
export function tripAskAfter(threadUser: string, lang: string): ClarifyQuestion | null {
  const missing = missingTripFacts(threadUser)
  if (missing.length === 0) return null
  if (lang === 'en') {
    return { q: `Tell me ${list(missing.map(f => EN[f]), 'and')}, and I will find tickets and rooms for those exact days.`, options: [] }
  }
  return { q: `Bạn cho mình biết ${list(missing.map(f => VI[f]), 'và')} nhé — mình sẽ tìm vé và phòng đúng ngày cho bạn.`, options: [] }
}
