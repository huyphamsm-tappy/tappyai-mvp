// ── The clarification backstop ──────────────────────────────────────────────
//
// The rulebook says "ask only when the answer changes the recommendation, and
// never the reflex 'bạn muốn ăn loại gì?'". Measured 2026-09-15 on the lunch
// probe: with the decision frame stating the recommendation was possible — or
// that no search could improve the evidence — the model still closed 2 of 3
// replies with the cuisine question. A prompt rule does not stop a model; this
// does, deterministically, at the last point before the bytes leave.
//
// It removes only REFLEX questions — preference/taste/type questions the frame
// has already decided are not decision-critical — and never a question about
// something the decision genuinely needs (where, when, how many, budget, which
// item). With the policy `allow` nothing is touched. Whatever survives is capped
// at ONE question per reply, keeping the first, which is the rulebook's own cap.
//
// Prose only: machine blocks ([CTA_BUTTONS], [FOLLOWUPS], [TAPPY_PLAN]…) are left
// exactly as written, via the same protected-span reading the money guards use.

import { normalizeVN } from './intent'
import { sentenceSpans, protectedSpans } from './moneyGuard'

export type ClarificationPolicy = 'allow' | 'no_reflex'

/**
 * A question that asks the user to pick a kind, type, taste or style — the
 * "what would you like?" a consultant asks instead of consulting.
 */
const REFLEX_RE = /(?:\bthich\b|\bmuon\b|\bprefer\b|\bwant\b|\bkhoai\b|\bung\b)[^?]{0,60}?(?:loai (?:gi|nao)|kieu (?:gi|nao)|mon (?:gi|nao)|the loai|phong cach|huong vi|khau vi|hang (?:gi|nao)|thuong hieu|mau (?:gi|nao)|\b(?:an|uong|xem|choi|di) gi\b|kind of|type of|which (?:kind|type|style|cuisine)|what (?:kind|type|style|cuisine)|cuisine)|\b(?:an|uong|choi|xem) (?:loai|kieu|mon|the loai) (?:gi|nao)|\b(?:loai|kieu|mon|the loai|hang|mau) (?:gi|nao)\b[^?]{0,40}\?|\b(?:viet|au|a|nhat|han|thai|chay|hai san|pho|com|bun|lau|pizza|sushi)\b[^?]{0,24}\bhay\b[^?]{0,40}\b(?:gi|nao|khac)\b[^?]{0,20}\?/

/** Something the decision cannot proceed without — never removed. */
// 🚨 "quận" and "quán" both normalize to "quan": the district is critical ("ở quận
// nào", "quận 1"), the eatery is not ("quán nào bạn đã biết") — so only the
// district forms count, never the bare word.
const CRITICAL_RE = /khu vuc|\bo dau\b|\bo quan\b|\bquan \d|thanh pho|\bdau\b|\bwhere\b|\barea\b|\bdistrict\b|ngan sach|\bbudget\b|bao nhieu (?:tien|nguoi)|\bhow many\b|\bhow much\b|ngay nao|\bkhi nao\b|\bwhen\b|\bmay nguoi\b|\bmay gio\b|\bwhat time\b|\bten (?:quan|mon|san pham)\b|(?:mua|tim|can) (?:gi|cai gi)\b|\bwhich (?:one|item|product)\b/

function isQuestion(sentence: string): boolean {
  return /\?\s*$/.test(sentence.trim()) || /\?/.test(sentence)
}

/**
 * Apply the policy to the prose of a reply.
 *
 * `no_reflex`: reflex questions are removed; among the questions that remain
 * (decision-critical or unclassified) only the FIRST is kept. `allow`: only the
 * one-question cap applies, so a reply can never end in a form.
 */
export function guardClarifications(text: string, policy: ClarificationPolicy): { text: string; removed: number } {
  if (!text) return { text, removed: 0 }
  const prot = protectedSpans(text)
  const spans = sentenceSpans(text)
  const isMachine = (a: number, b: number) => prot.some(([pa, pb]) => pa === a && pb === b)
  const doomed = new Set<number>()
  let kept = 0
  spans.forEach(([a, b], i) => {
    if (isMachine(a, b)) return
    const s = text.slice(a, b)
    if (!isQuestion(s)) return
    const norm = normalizeVN(s.toLowerCase())
    const critical = CRITICAL_RE.test(norm)
    if (policy === 'no_reflex' && !critical && REFLEX_RE.test(norm)) { doomed.add(i); return }
    if (kept >= 1) { doomed.add(i); return }
    kept++
  })
  if (doomed.size === 0) return { text, removed: 0 }
  const out = spans.filter((_, i) => !doomed.has(i)).map(([a, b]) => text.slice(a, b)).join('')
  return { text: out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trimEnd(), removed: doomed.size }
}
