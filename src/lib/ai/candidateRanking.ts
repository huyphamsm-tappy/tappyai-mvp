import { isRejected, type Candidate, type ConversationState, type HardConstraint } from './conversationState'
import { normalizeVN } from './intent'

/**
 * Filter + rank candidates for THIS user (Task 3F).
 *
 * Deterministic and inspectable on purpose: every exclusion carries the
 * requirement it failed, and every point of score carries the evidence that
 * earned it. Nothing here asks the model to score anything — the model receives
 * an ordered set with reasons and writes the recommendation from it.
 *
 * THE CENTRAL HONESTY PROBLEM. Candidate evidence has no spec fields: a place
 * carries address/rating/hours, a product carries price/snippet. There is no
 * `ram_gb` anywhere. So a requirement like "RAM >= 32GB" can be
 *   - SATISFIED  — the tool's own title/snippet states it,
 *   - VIOLATED   — the tool's text states a conflicting value, or
 *   - UNKNOWN    — the evidence simply does not say.
 * Only VIOLATED is filtered. UNKNOWN is kept and reported as unverified, because
 * discarding it would hide real options and asserting it would invent a fact.
 */

export type Verdict = 'satisfied' | 'violated' | 'unknown'

export interface ConstraintCheck {
  key: string
  verdict: Verdict
  /** The exact evidence this verdict was read from — never a paraphrase. */
  evidence?: string
}

export interface RankedCandidate {
  candidate: Candidate
  checks: ConstraintCheck[]
  score: number
  /** Evidence-backed, ready for the model to quote. Never speculative. */
  reasons: string[]
  unverified: string[]
}

export interface RankingResult {
  ranked: RankedCandidate[]
  excluded: Array<{ name: string; failed: string; evidence?: string }>
  /** True when nothing satisfies every hard requirement outright. */
  noFullMatch: boolean
}

// ── Scoring weights ─────────────────────────────────────────────────────────
// Small integers, each justified. Hard-constraint evidence dominates soft
// preference matching by design: a verified requirement is worth more than any
// number of nice-to-haves, and no combination of soft matches can outrank it.
const W_HARD_SATISFIED = 5   // verified to meet a stated requirement
const W_HARD_UNKNOWN = -1    // cannot verify — ranks below a verified peer, never excluded
const W_SOFT_MATCH = 2       // per matched preference, times its stated weight
const W_BUDGET_NEAR = 3      // at the soft target; decays with distance
const W_USE_CASE = 1         // evidence that speaks to the stated use case

/** Everything the tool told us about this candidate, as one searchable string. */
function evidenceText(c: Candidate): string {
  return normalizeVN([c.name, ...Object.values(c.facts).map(String)].join(' ').toLowerCase())
}

/** Parse a VND figure out of a price string the tool returned ("25.800.000 ₫"). */
export function parseVnd(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '')
  if (digits.length < 4) return null
  const n = parseInt(digits, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Check one hard constraint against one candidate's evidence.
 *
 * Spec constraints are read out of the tool's own text. That is weaker than a
 * structured field but it IS traceable — the matched substring is returned as
 * `evidence`, so a claim can always be pointed back at the listing that made it.
 */
export function checkConstraint(c: Candidate, hc: HardConstraint): ConstraintCheck {
  const text = evidenceText(c)

  if (hc.key === 'budget_max') {
    const priceRaw = c.facts.price
    if (priceRaw == null) return { key: hc.key, verdict: 'unknown' }
    const price = typeof priceRaw === 'number' ? priceRaw : parseVnd(String(priceRaw))
    if (price == null) return { key: hc.key, verdict: 'unknown' }
    return price <= Number(hc.value)
      ? { key: hc.key, verdict: 'satisfied', evidence: `price ${priceRaw}` }
      : { key: hc.key, verdict: 'violated', evidence: `price ${priceRaw}` }
  }

  if (hc.key === 'ram_gb' || hc.key === 'storage_gb') {
    // A parsed spec beats a text scan. Shopping listings now carry `ram_gb` /
    // `storage_gb` read from the seller's own title, with `spec_source` holding
    // that title — so the verdict points at the words that justify it. Two
    // measured mismatches this removes: "32G, 512G" (no B) scanned as UNKNOWN
    // although the seller stated it, and a listing with no spec at all reported
    // SATISFIED because some other "32gb" appeared elsewhere in its facts.
    const structured = c.facts[hc.key]
    if (typeof structured === 'number') {
      const want = Number(hc.value)
      const ok = hc.op === '>=' ? structured >= want : structured === want
      const src = c.facts.spec_source ? ` ("${String(c.facts.spec_source).slice(0, 90)}")` : ''
      return ok
        ? { key: hc.key, verdict: 'satisfied', evidence: `${hc.key}=${structured}${src}` }
        : { key: hc.key, verdict: 'violated', evidence: `${hc.key}=${structured}${src}` }
    }

    const unit = hc.key === 'ram_gb' ? 'gb' : 'gb'
    // Every "<n>gb" the listing mentions. Storage figures are the large ones,
    // RAM the small ones — the same listing usually states both.
    // GB and TB are matched separately: "1TB" is a single digit, so one shared
    // \d{2,4} pattern silently skipped every terabyte listing.
    const found = [
      ...[...text.matchAll(/(\d{2,4})\s*gb/g)].map(m => ({ n: parseInt(m[1], 10), raw: m[0] })),
      ...[...text.matchAll(/(\d{1,2})\s*tb/g)].map(m => ({ n: parseInt(m[1], 10) * 1024, raw: m[0] })),
    ]
    const pool = hc.key === 'ram_gb' ? found.filter(f => f.n <= 256) : found.filter(f => f.n >= 128)
    if (pool.length === 0) return { key: hc.key, verdict: 'unknown' }
    const want = Number(hc.value)
    const ok = pool.some(f => (hc.op === '>=' ? f.n >= want : f.n === want))
    const best = pool.reduce((a, b) => (Math.abs(a.n - want) <= Math.abs(b.n - want) ? a : b))
    return ok
      ? { key: hc.key, verdict: 'satisfied', evidence: `${unit} figure "${best.raw}"` }
      : { key: hc.key, verdict: 'violated', evidence: `only "${best.raw}"` }
  }

  if (hc.key === 'condition') {
    // Same rule: the parsed condition, carrying the seller's own label, wins
    // over scanning the blob for the word "cũ".
    const structured = c.facts.condition
    if (structured === 'used' || structured === 'new') {
      const label = c.facts.condition_label ? ` ("${c.facts.condition_label}")` : ''
      return structured === hc.value
        ? { key: hc.key, verdict: 'satisfied', evidence: `listing says ${structured}${label}` }
        : { key: hc.key, verdict: 'violated', evidence: `listing says ${structured}${label}` }
    }

    const wantUsed = hc.value === 'used'
    const saysUsed = /\b(cu|second ?hand|used|like new|qua su dung|refurb)\b/.test(text)
    const saysNew = /\b(moi 100|brand ?new|hang moi|new seal|full box|nguyen seal)\b/.test(text)
    if (!saysUsed && !saysNew) return { key: hc.key, verdict: 'unknown' }
    const ok = wantUsed ? saysUsed : saysNew
    return ok
      ? { key: hc.key, verdict: 'satisfied', evidence: wantUsed ? 'listing says used' : 'listing says new' }
      : { key: hc.key, verdict: 'violated', evidence: saysNew ? 'listing says new' : 'listing says used' }
  }

  return { key: hc.key, verdict: 'unknown' }
}

/** Soft-preference keywords, matched against the tool's own text. */
const SOFT_EVIDENCE: Record<string, RegExp> = {
  quiet: /\b(yen tinh|quiet|calm|peaceful|thu gian)\b/,
  wifi: /\b(wifi|wi-fi)\b/,
  'near-beach': /\b(bien|beach|sea ?view|ven bien|my khe|an bang)\b/,
  cheaper: /\b(re|budget|binh dan|affordable|cheap|gia tot|khuyen mai)\b/,
  battery: /\b(pin|battery|chu ky|cycle)\b/,
  newer: /\b(2023|2024|2025|moi|new)\b/,
  lighter: /\b(nhe|light|portable|mong)\b/,
  bigger: /\b(rong|lon|spacious|big)\b/,
  closer: /\b(gan|near|close|trung tam|center)\b/,
  nicer: /\b(sang trong|luxury|cao cap|premium|dep)\b/,
}

/** Evidence that speaks to a stated use case. */
const USE_CASE_EVIDENCE: Record<string, RegExp> = {
  coding: /\b(pro|m1 pro|m1 max|m2|32gb|64gb|ssd|ram)\b/,
  work: /\b(wifi|yen tinh|quiet|o cam|desk|lam viec|work)\b/,
  study: /\b(wifi|yen tinh|quiet|study|hoc)\b/,
  family: /\b(gia dinh|family|tre em|kids|rong|playground)\b/,
  'video-editing': /\b(m1 max|m1 pro|32gb|64gb|1tb|render)\b/,
  gaming: /\b(gaming|rtx|gpu|144hz)\b/,
}

/**
 * Rank `candidates` for the consultation in `state`.
 *
 * Order of operations matters: reject → hard-filter → score. A rejected or
 * disqualified candidate is never scored, so it can never surface through a
 * strong soft match.
 */
export function rankCandidates(candidates: Candidate[], state: ConversationState): RankingResult {
  const excluded: RankingResult['excluded'] = []
  const ranked: RankedCandidate[] = []

  for (const c of candidates) {
    // Phase 12: the user already turned these down. Re-ranking them is how a
    // rejection turns into "here is the same list again". Matched on canonical
    // identity, so a shared display name cannot take an innocent listing down
    // with it.
    if (isRejected(c, state)) {
      excluded.push({ name: c.name, failed: 'previously rejected by the user' })
      continue
    }

    const checks = state.hardConstraints.map(hc => checkConstraint(c, hc))
    const violated = checks.find(ch => ch.verdict === 'violated')
    if (violated) {
      excluded.push({ name: c.name, failed: violated.key, evidence: violated.evidence })
      continue
    }

    const text = evidenceText(c)
    let score = 0
    const reasons: string[] = []
    const unverified: string[] = []

    for (const ch of checks) {
      if (ch.verdict === 'satisfied') {
        score += W_HARD_SATISFIED
        reasons.push(`meets ${ch.key} (${ch.evidence})`)
      } else {
        score += W_HARD_UNKNOWN
        unverified.push(ch.key)
      }
    }

    for (const pref of state.softPreferences) {
      // A soft budget target ranks by closeness rather than keyword.
      if (pref.key.startsWith('budget~')) {
        const target = Number(pref.key.slice('budget~'.length))
        const priceRaw = c.facts.price
        const price = priceRaw == null ? null
          : typeof priceRaw === 'number' ? priceRaw : parseVnd(String(priceRaw))
        if (price != null && target > 0) {
          const off = Math.abs(price - target) / target
          if (off <= 0.5) {
            const pts = Math.round(W_BUDGET_NEAR * (1 - off / 0.5))
            score += pts
            if (pts > 0) reasons.push(`close to your ~${Math.round(target / 1e6)}M target (${priceRaw})`)
          }
        }
        continue
      }
      const re = SOFT_EVIDENCE[pref.key]
      if (re && re.test(text)) {
        score += W_SOFT_MATCH * pref.weight
        reasons.push(`matches "${pref.key}"`)
      }
    }

    if (state.useCase) {
      const re = USE_CASE_EVIDENCE[state.useCase]
      if (re && re.test(text)) {
        score += W_USE_CASE
        reasons.push(`relevant to ${state.useCase}`)
      }
    }

    ranked.push({ candidate: c, checks, score, reasons, unverified })
  }

  // Stable: equal scores keep the order the search returned them in.
  ranked.sort((a, b) => b.score - a.score)

  const hasHard = state.hardConstraints.length > 0
  const noFullMatch = hasHard && !ranked.some(r => r.checks.every(ch => ch.verdict === 'satisfied'))

  return { ranked, excluded, noFullMatch }
}

/**
 * Render the ranked set for the model.
 *
 * Caps at THREE with distinct roles (best fit / alternative / value) — the
 * product rule is a recommendation, not a catalogue. Unverified requirements
 * are named per candidate so the reply can say "couldn't confirm X" instead of
 * quietly implying it was met.
 */
export function buildRankingBlock(result: RankingResult, state: ConversationState): string {
  if (result.ranked.length === 0 && result.excluded.length === 0) return ''

  const lines: string[] = []
  const top = result.ranked.slice(0, 3)
  const ROLE = ['PHU HOP NHAT', 'LUA CHON THAY THE', 'PHUONG AN TIET KIEM']

  if (top.length > 0) {
    lines.push('XEP HANG (da loc theo yeu cau bat buoc cua user — thu tu nay la ket qua tinh toan, HAY DUNG NO):')
    top.forEach((r, i) => {
      lines.push(`${i + 1}. [${ROLE[i]}] ${r.candidate.name} (diem ${r.score})`)
      if (r.reasons.length) lines.push(`   VI SAO: ${r.reasons.join('; ')}`)
      if (r.unverified.length) {
        lines.push(`   CHUA XAC MINH DUOC: ${r.unverified.join(', ')} — PHAI noi ro la chua kiem chung duoc, KHONG duoc khang dinh la dat.`)
      }
    })
  }

  if (result.excluded.length > 0) {
    const shown = result.excluded.slice(0, 4)
      .map(e => `${e.name} (khong dat: ${e.failed}${e.evidence ? `, ${e.evidence}` : ''})`)
      .join('; ')
    lines.push(`DA LOAI: ${shown}. KHONG goi y lai nhung cai nay.`)
  }

  if (result.noFullMatch) {
    lines.push(
      'KHONG CO LUA CHON NAO DAT DU MOI YEU CAU BAT BUOC. PHAI noi thang dieu do truoc, ' +
      'roi neu phuong an gan nhat va thieu dung yeu cau nao. TUYET DOI KHONG lang le ha tieu chuan.',
    )
  }

  lines.push(
    'CACH TRA LOI: chon MOT phuong an chinh + toi da 1-2 phuong an co vai tro KHAC NHAU. ' +
    'Moi cai kem ly do lay tu VI SAO o tren. Neu tat ca deu ngang nhau, noi ro dieu do. ' +
    'KHONG liet ke lai toan bo danh sach.',
  )

  return `\n\n===== KET QUA XEP HANG (SYSTEM — tinh toan tu bang chung) =====\n${lines.join('\n')}\n===============================================================`
}
