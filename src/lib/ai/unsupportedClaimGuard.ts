// ── UNSUPPORTED CLAIMS — the four measured shapes, rewritten, never whole-sentence cuts ──────────
//
// Owner 2026-09-28, after the round-5 blind grading on 526129a. Each shape was measured verbatim:
//   R1 absolute negation of an asked feature — golden T2: "Mình vừa tìm lại và xác nhận TP HCM hiện
//      không có rạp IMAX"; "CGV, Galaxy và BHD không cung cấp công nghệ IMAX". Nothing retrieved
//      says so; absence of evidence is not evidence of absence.
//   R2 a price ceiling asserted from a band — c40 F2: "… và giá dưới 80k" for a venue whose only
//      price is "1-100.000 ₫". The number is the USER's, so every price guard lets it through.
//   R3 "in budget" about an unpriced venue — c40 T1: "M Hotel … giá hợp lý trong ngân sách" with the
//      hotel's price "chưa có giá".
//   R4 an asked-for service the venue's own data never mentions — c40 P6: "có dịch vụ massage couple
//      chuyên nghiệp với đánh giá rất cao".
// Every rule rewrites the CLAIM into a conditional ("chưa xác nhận được …", "giá tham khảo …") or drops
// only the claim's phrase; the sentence, and the venue it names, stay. Deterministic; no model call.

import { sentenceSpans } from './moneyGuard'
import type { PriceBand } from '@/lib/recommendation/priceBand'

export interface ClaimVenue { name: string; band: PriceBand | null; texts: string[] }
export interface ClaimEvidence {
  venues: ClaimVenue[]
  /** Every retrieved text of the turn (snippets, types, reviews). */
  sharedTexts: string[]
  /** What the user asked, across the thread — a feature is judged only when the user asked for it. */
  userTexts: string[]
}
export interface UnsupportedClaimResult { text: string; rewritten: Array<'negation' | 'price_ceiling' | 'budget_fit' | 'service'> }

/**
 * Lower-case and strip Vietnamese diacritics ONE UTF-16 unit for one, so an index found in the folded
 * text is the same index in the original (a precomposed NFC letter is one unit; "đ" → "d").
 */
export function foldAligned(s: string): string {
  let out = ''
  for (const ch of s) {
    const l = ch.toLowerCase()
    if (ch.length !== 1 || l.length !== 1) { out += ch.length === l.length ? l : ch; continue }
    const base = l === 'đ' ? 'd' : l.normalize('NFD')[0]
    out += base.length === 1 ? base : l
  }
  return out
}

/** The features users ask for and models like to assert. Folded patterns; the label is for rewrites. */
const FEATURES: ReadonlyArray<{ re: RegExp; label: string }> = [
  { re: /imax/, label: 'IMAX' },
  { re: /4dx/, label: '4DX' },
  { re: /couple|cap doi/, label: 'couple' },
  { re: /phong rieng|phong vip/, label: 'phòng riêng' },
  { re: /(?:dau|giu) xe|cho do xe|bai do xe/, label: 'chỗ đậu xe' },
  { re: /ho boi|be boi/, label: 'hồ bơi' },
  { re: /buffet/, label: 'buffet' },
  { re: /an sang|bua sang/, label: 'bữa sáng' },
  { re: /khu (?:vui choi )?(?:tre em|cho be)/, label: 'khu trẻ em' },
  { re: /nhac song/, label: 'nhạc sống' },
]

const NEG_RE = /(?:^|[\s,(*_])(khong|chua)\s+(co|cung cap|ho tro|phuc vu|kinh doanh)\s+((?:cong nghe|dich vu|phong|khu|cho|rap|phong chieu)\s+)?/g
const CONFIRMED_NEG_RE = /(?:da |vua )?xac nhan\s+(?:la |rang )?/
const CONDITIONAL_RE = /(?:^|[\s*_(])(?:neu|khi|hoi|xem|goi|kiem tra|chua (?:duoc )?xac nhan|khong chac)(?=\s)/
const FOLD_NUM = /(?:gia\s+)?(duoi|khong qua|chua toi|chua den|chi tu|chi|re hon)\s+(\d+(?:[.,]\d+)?)\s*(k|nghin|ngan|tr|trieu)(?![a-z])/
const FIT_UNPRICED = /(?:,\s*)?(?:gia\s+(?:hop ly|phai chang|vua phai)\s+)?(?:nam\s+)?(?:trong|vua|hop voi|phu hop voi)\s+(?:tam\s+)?(?:ngan sach|budget)(?:\s+(?:cua ban|cua minh))?/
const POSITIVE_SERVICE = /(?:^|[\s,*_])(co|cung cap|chuyen)\s+((?:dich vu|phong|khu|cho|goi)\s+)?/g

const vnd = (n: number) => n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}tr` : `${Math.round(n / 1000)}k`
const amount = (v: string, unit: string) => parseFloat(v.replace(',', '.')) * (/^(tr|trieu)$/.test(unit) ? 1_000_000 : 1000)

function venueIn(sentenceFolded: string, venues: ClaimVenue[]): ClaimVenue | null {
  let best: ClaimVenue | null = null
  let bestLen = 0
  for (const v of venues) {
    const head = foldAligned(v.name).split(/\s*[|(–—]\s*|\s+-\s+/)[0].trim()
    if (head.length >= 4 && sentenceFolded.includes(head) && head.length > bestLen) { best = v; bestLen = head.length }
  }
  return best
}

export function guardUnsupportedClaims(text: string, ev: ClaimEvidence): UnsupportedClaimResult {
  const asked = FEATURES.filter(f => ev.userTexts.some(t => f.re.test(foldAligned(t))))
  const allEvidence = [...ev.sharedTexts, ...ev.venues.flatMap(v => [v.name, ...v.texts])].map(foldAligned).join(' \n ')
  const rewritten: UnsupportedClaimResult['rewritten'] = []
  let out = ''
  let last = 0
  for (const [a, b] of sentenceSpans(text)) {
    let s = text.slice(a, b)
    // Machine blocks are not prose.
    if (/^\s*\[(?:TAPPY_|FOLLOWUPS|CTA_BUTTONS)/.test(s)) { out += text.slice(last, b); last = b; continue }
    let f = foldAligned(s)
    const venue = venueIn(f, ev.venues)

    // R1 — "không có / không cung cấp <asked feature>" and "xác nhận … không có …".
    for (const feat of asked) {
      NEG_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = NEG_RE.exec(f)) !== null) {
        // From the end of the VERB: the optional noun group ("phong ") must not swallow the feature's
        // first word ("phong rieng") — measured round 6, c40 F8.
        const verbEnd = m.index + m[0].indexOf(m[1]) + m[1].length + 1 + m[2].length
        const tail = f.slice(verbEnd, verbEnd + 40)
        const fm = tail.match(feat.re)
        if (!fm || fm.index! > 25) continue
        // The retrieved data itself says it is absent → a fact, kept.
        if (new RegExp(`(?:khong|chua)\\s+(?:co|cung cap|ho tro)\\s+(?:\\S+\\s+){0,3}${fm[0]}`).test(allEvidence)) continue
        const negStart = m.index + m[0].indexOf(m[1])
        const before = f.slice(0, negStart)
        const conf = before.match(new RegExp(`${CONFIRMED_NEG_RE.source}([^.!?]{0,60})$`))
        const verb = s.slice(negStart + m[1].length + 1, negStart + m[1].length + 1 + m[2].length)
        const verbPart = m[2] === 'co' ? 'có' : `có ${verb}`
        if (conf) {
          // "… xác nhận TP HCM hiện không có rạp IMAX" → "… chưa xác nhận được TP HCM có rạp IMAX"
          const cStart = negStart - conf[0].length
          const subject = s.slice(cStart + conf[0].length - conf[1].length, negStart).replace(/\s*(?:hiện|hiện tại|hiện nay)\s*$/u, ' ').replace(/\s+$/, ' ')
          s = `${s.slice(0, cStart)}chưa xác nhận được ${subject.trimStart()}${verbPart}${s.slice(negStart + m[1].length + 1 + m[2].length)}`
        } else {
          // "chưa được xác nhận là có …": the subject before it stays the subject (the cinemas are not
          // the ones confirming).
          s = `${s.slice(0, negStart)}chưa được xác nhận là ${verbPart}${s.slice(negStart + m[1].length + 1 + m[2].length)}`
        }
        rewritten.push('negation')
        f = foldAligned(s)
        NEG_RE.lastIndex = 0
      }
    }

    // R2 — a price ceiling asserted about a venue whose band does not bear it out.
    if (venue && !CONDITIONAL_RE.test(f.split(FOLD_NUM)[0] ?? '')) {
      const pm = f.match(FOLD_NUM)
      if (pm && pm.index !== undefined && !/\b(?:tim|kiem|ngan sach|budget)\b/.test(f.slice(Math.max(0, pm.index - 25), pm.index))) {
        const ceiling = amount(pm[2], pm[3])
        const band = venue.band
        if (!band || band.hi > ceiling) {
          const phrase = s.slice(pm.index, pm.index + pm[0].length)
          const repl = band && Number.isFinite(band.hi)
            ? `giá tham khảo ${band.lo < 10_000 ? `tới ${vnd(band.hi)}` : `${vnd(band.lo)}–${vnd(band.hi)}`} (chưa chắc ${phrase.replace(/^giá\s+/u, '')})`
            : `chưa có giá để xác nhận ${phrase.replace(/^giá\s+/u, '')}`
          s = s.slice(0, pm.index) + repl + s.slice(pm.index + pm[0].length)
          rewritten.push('price_ceiling')
          f = foldAligned(s)
        }
      }
    }

    // R3 — "trong ngân sách" about a venue with no price.
    if (venue && !venue.band) {
      const fm = f.match(FIT_UNPRICED)
      if (fm && fm.index !== undefined && !/(?:chua|khong)\s*$/.test(f.slice(0, fm.index))) {
        s = (s.slice(0, fm.index) + s.slice(fm.index + fm[0].length)).replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').replace(/,\s*(?=[.!?])/g, '')
        rewritten.push('budget_fit')
        f = foldAligned(s)
      }
    }

    // R4 — an asked-for service asserted, absent from the venue's own data.
    for (const feat of asked) {
      POSITIVE_SERVICE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = POSITIVE_SERVICE.exec(f)) !== null) {
        const verbStart = m.index + m[0].indexOf(m[1])
        let start = verbStart
        // From the end of the VERB (see R1): "co phong rieng" must still read "phong rieng".
        const verbEnd = verbStart + m[1].length
        const tail = f.slice(verbEnd, verbEnd + 45)
        const fm = tail.match(feat.re)
        if (!fm || fm.index! > 25) continue
        // The hedge must govern THIS claim (just before it) — measured round 6, c40 F8: "cũng có phòng
        // riêng nhưng chưa xác nhận được giá" hedges the PRICE; a sentence-wide check let the room pass.
        if (CONDITIONAL_RE.test(f.slice(Math.max(0, start - 40), start))) continue
        // "cũng có X" → "mình chưa xác nhận được có X" (not "cũng mình chưa …").
        if (f.slice(Math.max(0, start - 5), start) === 'cung ') start -= 5
        const own = venue ? [venue.name, ...venue.texts].map(foldAligned).join(' ') : allEvidence
        if (feat.re.test(own)) continue
        // Cut from the claim to the end of its clause; the conditional replaces it.
        const clauseEnd = (() => { const r = f.slice(start).search(/[,;.!?\n]|\s(?:va|nhung|hoac)\s/); return r === -1 ? f.length : start + r })()
        const claimed = s.slice(verbStart, verbEnd + fm.index! + fm[0].length)
        s = `${s.slice(0, start)}mình chưa xác nhận được ${claimed.replace(/^(?:có|cung cấp|chuyên)\s+/u, 'có ')}${s.slice(clauseEnd).replace(/^\s*(?:👍|🙂|😊)/u, '')}`
        rewritten.push('service')
        f = foldAligned(s)
        break
      }
    }
    out += text.slice(last, a) + s
    last = b
  }
  out += text.slice(last)
  return { text: out, rewritten }
}
