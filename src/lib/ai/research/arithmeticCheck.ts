// A report states a percentage next to the two numbers it was made from, or a growth next to the two levels it was measured between. Code recomputes it: when the stated figure and the
// recomputed one disagree, the sentence is wrong whatever its sources say (judges, 20/11: "429/434 = 90.70%" (it is 98.85%), "16,300 of 120,000 = 11.2%" (13.6%), "+3.0 points in a year").
// No model call, no list of topics: three arithmetic shapes, read from the sentence itself, in Vietnamese or English. Pure. Works on the folded sentence (no accents, lower case).

import { fold } from './researchSignals'

const N = String.raw`\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?`

/** A number as the text writes it, Vietnamese or English style ("16.300", "11,2", "1,655", "1.655,5"). Null when it is not a plain number. */
export function parseNumber(raw: string): number | null {
  const s = raw.replace(/\s+/g, '')
  if (!/^\d[\d.,]*$/.test(s)) return null
  const dots = (s.match(/\./g) ?? []).length, commas = (s.match(/,/g) ?? []).length
  let t: string
  if (dots && commas) t = s.lastIndexOf('.') > s.lastIndexOf(',') ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.') // the last separator is the decimal one
  else if (dots) t = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s
  else if (commas) t = /^\d{1,3}(,\d{3}){2,}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  else t = s
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

export interface ArithIssue { kind: 'ratio' | 'growth' | 'points'; said: number; computed: number }

const isYear = (v: number): boolean => Number.isInteger(v) && v >= 1900 && v <= 2100

/**
 * The arithmetic of one sentence that does not hold:
 *  - "a/b ... p%": p must be a/b in percent (a date such as 19/11 is not a ratio),
 *  - "from A to B ... +p%" (or "tang/giam p%"): p must be the change from A to B, in the direction the word says,
 *  - "from A% to B% ... p points": p must be B minus A.
 * A figure within rounding (half a point, or 1.5 % of itself) holds. Nothing else is judged.
 */
export function arithmeticIssues(sentence: string): ArithIssue[] {
  const f = fold(String(sentence ?? ''))
  const out: ArithIssue[] = []

  // a/b ... p%
  const ratio = new RegExp(String.raw`(${N})\s*/\s*(${N})([^.;\d\n%]{0,60}?)(${N})\s*%`, 'g')
  for (const m of f.matchAll(ratio)) {
    const a = parseNumber(m[1]), b = parseNumber(m[2]), p = parseNumber(m[4])
    if (a === null || b === null || p === null || b < 10 || a > b) continue
    if (a <= 31 && b <= 12) continue // a date
    if (a <= 12 && isYear(b)) continue // a month and a year (10/2024)
    if (/^\s*\/\s*(?:19|20)\d\d/.test(f.slice((m.index ?? 0) + m[1].length + 1 + m[2].length - 1, (m.index ?? 0) + m[0].length))) continue
    const c = a / b * 100
    if (Math.abs(c - p) > Math.max(0.51, c * 0.015)) out.push({ kind: 'ratio', said: p, computed: c })
  }

  // from A to B ... p%   /   from A% to B% ... p points
  const move = new RegExp(String.raw`\btu\s+(${N})(\s*%)?[^\d.;%\n]{0,25}?\b(len|xuong)\s+(${N})(\s*%)?`, 'g')
  for (const m of f.matchAll(move)) {
    const A = parseNumber(m[1]), B = parseNumber(m[4])
    if (A === null || B === null || A <= 0) continue
    if (isYear(A) && isYear(B)) continue
    const rest = f.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 90)
    if (m[2] && m[5]) {
      const pts = new RegExp(String.raw`^[^\d%;\n]{0,40}?(${N})\s*diem phan tram`).exec(rest)
      const said = pts ? parseNumber(pts[1]) : null
      if (said !== null && Math.abs(Math.abs(B - A) - said) > Math.max(0.15, Math.abs(B - A) * 0.03)) out.push({ kind: 'points', said, computed: Math.abs(B - A) })
      continue
    }
    const pct = new RegExp(String.raw`^([^\d%;\n]{0,40}?)(tang|giam|\+|-)?\s*(?:khoang\s*)?(${N})\s*%`).exec(rest)
    if (!pct) continue
    // with no rise/fall word the percentage must stand right after the two levels ("(20%)", ", tuc 20%"): any other percentage nearby is another figure ("chiem 15% thi phan"), not the growth rate
    if (!pct[2] && !/^[\s(,~:]*(?:tuc la|tuc|tuong duong|hay|khoang|dat)?[\s(~]*$/.test(pct[1])) continue
    const said = parseNumber(pct[3])
    if (said === null) continue
    const change = (B - A) / A * 100
    const word = pct[2] === 'tang' || pct[2] === '+' ? 'up' : pct[2] === 'giam' || pct[2] === '-' ? 'down' : null
    const wrongWay = (word === 'up' && change < 0) || (word === 'down' && change > 0)
    if (wrongWay || Math.abs(Math.abs(change) - said) > Math.max(1, Math.abs(change) * 0.03)) out.push({ kind: 'growth', said, computed: change })
  }
  return out
}
